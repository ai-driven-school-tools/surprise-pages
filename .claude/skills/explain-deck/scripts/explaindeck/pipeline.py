# -*- coding: utf-8 -*-
"""検査から投稿・片付けまでを 1 本に通す。

**原本には 1 バイトも書かない。** 札は一時フォルダの写しにだけ足す。

検査用の逃げ道は環境変数 3 つ。ふだんは触らない。

  SURPRISE_PAGES_TRASH    片付け先（既定 ~/.Trash）
"""

import datetime
import os
from . import distribution_environment as _distribution
import re
import shutil
import subprocess
import tempfile

from . import check as check_mod
from . import note as note_mod
from . import provenance as provenance_mod
from . import update as update_mod
from . import quality as quality_mod

OK = 0
STOP = 1
CANNOT_RUN = 2

HERE = os.path.dirname(os.path.realpath(__file__))
SCRIPTS_DIR = os.path.dirname(HERE)
SKILL_DIR = os.path.dirname(SCRIPTS_DIR)
SKILLS_DIR = os.path.dirname(SKILL_DIR)
PLUGIN_DIR = os.path.dirname(SKILLS_DIR)
DEFAULT_ENSURE = os.path.normpath(os.path.join(PLUGIN_DIR, "scripts", "ensure-pages-cli.sh"))

URL = re.compile(r"https?://[^\s\"'<>）」]+")
URL_TAIL = "。、．，）」』>,.;:"
PUBLISH_TIMEOUT = 600
ENSURE_TIMEOUT = 120
SAFE_ASSET_NAME = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
DECK_ASSET_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico",
    ".mp4", ".webm", ".mov", ".mp3", ".wav", ".vtt", ".pdf", ".woff", ".woff2",
}
DECK_ASSET_MAX_FILES = 200
DECK_ASSET_MAX_TOTAL = 500 * 1024 * 1024


def pages_dir():
    return _distribution.pages_dir()


def config_dir():
    return _distribution.config_dir()


def trash_dir():
    return os.path.expanduser(os.environ.get("SURPRISE_PAGES_TRASH") or "~/.Trash")


def cli_path():
    return os.path.join(pages_dir(), "bin", "pages-publish")


def token_path():
    return _distribution.token_path()


def template_path():
    return check_mod.default_template_path()


def is_cloud():
    return os.path.exists(os.path.join(config_dir(), "cloud"))


def preflight(ensure_script=DEFAULT_ENSURE):
    found = {
        "cli": None,
        "logged_in": bool(os.environ.get("PAGES_TOKEN")) or os.path.exists(token_path()),
        "cloud": is_cloud(),
        "ensured": False,
        "detail": "",
    }

    cli = cli_path()
    if os.path.exists(cli):
        found["cli"] = cli
        return found

    if not ensure_script or not os.path.exists(ensure_script):
        found["detail"] = "投稿コマンドが無く、取り寄せの脚本も見つかりません: %s" % ensure_script
        return found

    found["ensured"] = True
    try:
        done = subprocess.run(
            ["bash", ensure_script],
            capture_output=True,
            text=True,
            stdin=subprocess.DEVNULL,
            timeout=ENSURE_TIMEOUT,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as err:
        found["detail"] = "取り寄せの脚本を動かせませんでした: %s" % err
        return found

    lines = [line.strip() for line in (done.stdout or "").splitlines() if line.strip()]
    if done.returncode == 0 and lines and os.path.exists(lines[-1]):
        found["cli"] = lines[-1]
    else:
        found["detail"] = ((done.stderr or "") + (done.stdout or "")).strip()

    found["logged_in"] = bool(os.environ.get("PAGES_TOKEN")) or os.path.exists(token_path())
    found["cloud"] = is_cloud()
    return found


def login_hint(pre):
    cli = pre.get("cli") or cli_path()
    if pre.get("cloud"):
        return (
            "`%s login --remote` を実行し、出てきた URL をユーザーに渡して許可されるのを待つ。"
            "許可されたら、このコマンドをそのまま打ち直す（同じ入力なら同じ結果になる）。" % cli
        )
    return (
        "ユーザーに `%s login` を実行してもらう（ブラウザが開くので、こちらからは実行しない）。"
        "済んだら、このコマンドをそのまま打ち直す。" % cli
    )


def _stamp():
    return datetime.datetime.now().strftime("%Y%m%d-%H%M%S")


def to_trash(paths):
    holder = trash_dir()
    moved = []
    failed = []
    stamp = _stamp()
    try:
        os.makedirs(holder, exist_ok=True)
    except OSError as err:
        return [], [{"path": holder, "detail": "ゴミ箱を用意できません: %s" % err}]

    for path in paths:
        if not path or not os.path.exists(path):
            continue
        name = os.path.basename(path.rstrip(os.sep))
        root, ext = os.path.splitext(name)
        target = os.path.join(holder, "%s-%s%s" % (root, stamp, ext))
        try:
            shutil.move(path, target)
        except (OSError, shutil.Error) as err:
            failed.append({"path": path, "detail": str(err)})
        else:
            moved.append(path)
    return moved, failed


def pick_url(text, slug=None):
    found = [candidate.rstrip(URL_TAIL) for candidate in URL.findall(text or "")]
    if not found:
        return None
    if slug:
        for candidate in found:
            if slug in candidate:
                return candidate
    return found[-1]


def copy_deck_assets(source, target_root):
    """Copy only an explicit sibling assets/ tree for an index.html deck.

    The caller publishes target_root with --dir. Hidden names, links, executable/data
    files and oversized collections stop instead of being silently included.
    """
    if os.path.basename(source) != "index.html":
        return None
    source_root = os.path.dirname(os.path.abspath(source))
    assets = os.path.join(source_root, "assets")
    if not os.path.lexists(assets):
        return None
    if os.path.islink(assets) or not os.path.isdir(assets):
        raise ValueError("assets は通常のフォルダにしてください（近道やファイルは使えません）")

    files = []
    total = 0
    for current, dirs, names in os.walk(assets, topdown=True, followlinks=False):
        for name in list(dirs):
            full = os.path.join(current, name)
            if os.path.islink(full) or not SAFE_ASSET_NAME.fullmatch(name) or name.startswith("."):
                raise ValueError("assets に近道・隠しファイル・URLに使えない名前を入れないでください: %s" % name)
        for name in names:
            full = os.path.join(current, name)
            rel = os.path.relpath(full, source_root).replace("\\", "/")
            if os.path.islink(full) or not os.path.isfile(full):
                raise ValueError("assets には通常のファイルだけを置いてください: %s" % rel)
            if name.startswith(".") or not SAFE_ASSET_NAME.fullmatch(name):
                raise ValueError("assets に隠しファイル・URLに使えない名前を入れないでください: %s" % rel)
            if os.path.splitext(name)[1].lower() not in DECK_ASSET_EXTENSIONS:
                raise ValueError("assets には画像・動画・音声・PDF・書体だけを置いてください: %s" % rel)
            size = os.path.getsize(full)
            total += size
            files.append((full, rel))
            if len(files) > DECK_ASSET_MAX_FILES or total > DECK_ASSET_MAX_TOTAL:
                raise ValueError("assets が多すぎます（200ファイル・合計500MBまで）")

    for source_path, rel in files:
        destination = os.path.join(target_root, *rel.split("/"))
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        shutil.copyfile(source_path, destination)
    return {"files": len(files), "bytes": total}


HUMAN_LINE = "（ほかに気づいたことがあれば足す。無ければこの行を消して「無し」と書く）"


def report_draft(title, url, cleanup_done, public=False, dry_run=False):
    lines = ["完成・公開完了: %s" % (title or "（無題）"), ""]
    lines.append("公開 URL:" if public else "URL（招待した人だけ）:")
    if url:
        lines.append(url)
    elif dry_run:
        lines.append("（--dry-run なので、まだ投稿していません）")
    else:
        lines.append("（投稿コマンドの出力から URL を読み取れませんでした。出力をそのまま見せる）")
    if public:
        lines += ["", "ノートは画面に出ません（プレゼン・印刷・公開ページでは出ない）。"]
    lines += [
        "",
        "直していないが気になったところ:",
        "- %s" % HUMAN_LINE,
        "",
        "手元の作業ファイル: %s" % ("ゴミ箱に入れました" if cleanup_done else "残してあります"),
    ]
    return "\n".join(lines)


class _Stop(Exception):
    def __init__(self, code, payload):
        Exception.__init__(self, payload.get("error", ""))
        self.code = code
        self.payload = payload


def run(
    source,
    slug=None,
    message=None,
    public=False,
    yes_public=False,
    dry_run=False,
    keep=False,
    no_git=False,
    commit=None,
    template_path_override=None,
    ensure_script=DEFAULT_ENSURE,
    cli=None,
    base_version=None,
):
    """(終了コード, 返す値)。0 = 投稿まで済んだ / 1 = 止まった / 2 = そもそも走れない。"""
    payload = {
        "ok": False,
        "stage": "preflight",
        "source": source,
        "slug": slug,
        "public": bool(public),
        "dry_run": bool(dry_run),
        "done": [],
    }

    def stop(stage, error, next_actions, **extra):
        payload.update(extra)
        payload["ok"] = False
        payload["stage"] = stage
        payload["error"] = error
        payload["next"] = next_actions if isinstance(next_actions, list) else [next_actions]
        return _Stop(STOP, payload)

    def cannot_run(error, next_actions=None):
        payload["ok"] = False
        payload["error"] = error
        if next_actions:
            payload["next"] = next_actions if isinstance(next_actions, list) else [next_actions]
        return _Stop(CANNOT_RUN, payload)

    try:
        return _walk(
            payload,
            stop,
            cannot_run,
            source=source,
            slug=slug,
            message=message,
            public=public,
            yes_public=yes_public,
            dry_run=dry_run,
            keep=keep,
            no_git=no_git,
            commit=commit,
            template_path_override=template_path_override,
            ensure_script=ensure_script,
            cli=cli,
            base_version=base_version,
        )
    except _Stop as halt:
        return halt.code, halt.payload


def _walk(
    payload,
    stop,
    cannot_run,
    source,
    slug,
    message,
    public,
    yes_public,
    dry_run,
    keep,
    no_git,
    commit,
    template_path_override,
    ensure_script,
    cli,
    base_version,
):
    done = payload["done"]
    original_bytes = None

    if not dry_run and not slug:
        raise cannot_run(
            "--slug を渡してください（そのまま URL になります。英小文字・数字・- _ . / だけ）",
            "スラッグを決めて打ち直す。検査だけなら check を打つ",
        )
    if public and not yes_public:
        raise cannot_run(
            "公開はユーザーが明示したときだけです。--public には --yes-public を添えてください",
            "公開の指示が本当にあるなら --yes-public を足して打ち直す。無ければ --public を外す（招待した人だけの設定で出し、あとから画面で社外に切り替えられる）",
        )

    pre = preflight(None if dry_run else ensure_script)
    if cli:
        pre["cli"] = cli
    payload["preflight"] = {
        "cli": pre["cli"],
        "logged_in": pre["logged_in"],
        "cloud": pre["cloud"],
        "ensured": pre["ensured"],
    }
    done.append("preflight")

    if not dry_run:
        if not pre["cli"]:
            raise stop(
                "preflight",
                "投稿コマンドを用意できませんでした",
                "画面に出ている案内をそのままユーザーに見せる（通信が塞がれている席なら、手元のパソコンから投稿してもらう）",
                detail=pre["detail"],
            )
        if not pre["logged_in"]:
            raise stop(
                "preflight",
                "この環境からまだ投稿できません（ログインの控えがありません）",
                login_hint(pre),
            )

    if not os.path.isfile(source):
        raise stop(
            "check",
            "原本がありません: %s" % source,
            "原本の所在をユーザーに確かめる",
        )

    with open(source, "rb") as handle:
        original_bytes = handle.read()

    checked = check_mod.check_file(source, template_path=template_path_override, commit=commit)
    payload["check"] = checked["summary"]
    payload["title"] = checked.get("title") or ""
    payload["findings"] = checked["findings"]
    done.append("check")
    if not checked["ok"]:
        raise stop(
            "check",
            "契約に合いません。投稿していません",
            "この判定をユーザーに見せて、原本を直してコミットしてから打ち直す（雛形の差分を黙って直さない）",
            findings=checked["findings"],
        )

    html = original_bytes.decode("utf-8")
    tpl_path = template_path_override or template_path()
    embed = ""
    if tpl_path and os.path.isfile(tpl_path):
        embed = check_mod.embed_block(check_mod.read_text(tpl_path))
    html = check_mod.apply_embed_placeholder(html, embed)

    found = None if (public or no_git) else provenance_mod.inspect(source)
    display_name = (found or {}).get("path") or os.path.basename(source)
    note = note_mod.source_note(
        note_mod.count_chars(html),
        display_name,
        public=public,
        provenance=None if public else found,
    )
    page = note_mod.attach_note(html, note)

    tmp = tempfile.mkdtemp(prefix="explain-deck-")
    page_path = os.path.join(tmp, os.path.basename(source) or "index.html")
    with open(page_path, "w", encoding="utf-8") as handle:
        handle.write(page)

    try:
        copied_assets = copy_deck_assets(source, tmp)
    except ValueError as error:
        shutil.rmtree(tmp, ignore_errors=True)
        raise stop(
            "stamp",
            str(error),
            "assets の中身を確認してから、同じコマンドを打ち直す。原本と素材は触っていません",
        )

    payload["copy"] = page_path
    payload["assets"] = copied_assets
    payload["provenance"] = None if public else provenance_mod.reportable(found)
    done.append("stamp")

    def verify_images(label, existing_page):
        try:
            report = quality_mod.check_file(page_path, page=("public/" if public else "internal/") + slug if existing_page else None)
        except quality_mod.QualityError as error:
            raise stop("quality", str(error), "prepare で検査道具を準備し直す。画質条件を弱めたり、別の投稿経路へ切り替えたりしない")
        payload.setdefault("quality", {})[label] = report
        if not report["ok"]:
            raise stop("quality", "画像の画質を確認できないため投稿していません", "大きい原画像へ差し替えるか構図を直し、原寸で確認してから再実行する", findings=report["issues"])
        done.append(label)

    existing = bool(base_version)
    if dry_run:
        payload["quality"] = {"status": "unverified", "reason": "dry-runは通信せず、画質検査・投稿は実行しません"}
    if dry_run and existing and copied_assets is not None:
        try:
            update_mod.prepare_images(tmp, page)
        except ValueError as error:
            raise stop("update", str(error), "画像の形式・参照を直してから再検査する")
    if not dry_run:
        try:
            current = update_mod.read_current(pre["cli"], slug, public, allow_missing=True)
            existing = current is not None
            if existing:
                if not base_version or current.get("versionId") != base_version:
                    raise ValueError("比較した版が未指定、または他の人が更新しています。現在の本文と変更案を比較し直してください")
                verify_images("quality_before_upload", True)
                if copied_assets is not None:
                    page, mapping = update_mod.upload_images(pre["cli"], tmp, page, slug, public, base_version)
                    with open(page_path, "w", encoding="utf-8") as handle:
                        handle.write(page)
                    payload["uploaded_images"] = mapping
                    if mapping:
                        verify_images("quality_after_upload", True)
            elif base_version:
                raise ValueError("更新するページを取得できません。別の場所へ新規投稿せず、URLと閲覧権限を確認してください")
            else:
                verify_images("quality_before_upload", False)
        except (ValueError, OSError, subprocess.SubprocessError) as error:
            raise stop("update", str(error),
                       "read --slug で最新版を取り寄せて変更案と比較する。採用する内容を確認した版を --base-version に渡す。版だけを差し替えて再送しない")

    command = _publish_cmd(
        pre.get("cli") or cli_path(),
        tmp if copied_assets is not None and not existing else page_path,
        slug,
        public,
        message,
        directory=copied_assets is not None and not existing,
        base_version=base_version,
    )
    payload["command"] = command

    if dry_run:
        payload["ok"] = True
        payload["stage"] = "stamp"
        if existing:
            payload.pop("command", None)
            payload["update_plan"] = [
                "現在の本文を取得し、比較済みの版 %s と照合する" % base_version,
                "追加画像を編集用の入口へ送り、投稿用の写しの参照を置き換える",
                "同じ版を指定して本文だけを更新する（既存素材を削除しない）",
            ]
        else:
            payload["would_publish"] = command
        payload["report_draft"] = report_draft(payload["title"], None, False, public=public, dry_run=True)
        payload["next"] = ["--dry-run を外して打ち直すと、投稿と片付けまで進む"]
        if not keep:
            shutil.rmtree(tmp, ignore_errors=True)
        return OK, payload

    try:
        published = subprocess.run(
            command,
            capture_output=True,
            text=True,
            stdin=subprocess.DEVNULL,
            timeout=PUBLISH_TIMEOUT,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as err:
        raise stop(
            "publish",
            "投稿コマンドを動かせませんでした: %s" % err,
            "エラーの内容をユーザーに見せて指示を仰ぐ。原本は触っていません",
        )

    output = ((published.stdout or "") + (published.stderr or "")).strip()
    payload["publish_output"] = output
    if published.returncode != 0:
        raise stop(
            "publish",
            "投稿できませんでした（終了コード %d）" % published.returncode,
            "この出力をそのままユーザーに見せて指示を仰ぐ。手順書ではなく手元の投稿コマンドが古いことがある。"
            "競合した場合は read で最新版と変更案を比較し直し、版だけを差し替えて再送しない。原本は触っていません",
        )
    done.append("publish")

    with open(source, "rb") as handle:
        after = handle.read()
    if after != original_bytes:
        raise stop(
            "publish",
            "投稿の途中で原本のバイトが変わりました。原本は触らない契約です",
            "この状態をユーザーに見せる。写しは残してある",
        )

    url = pick_url(output, slug)
    payload["url"] = url

    cleanup = {"moved": [], "failed": [], "kept": bool(keep)}
    if not keep:
        moved, failed = to_trash([tmp])
        cleanup["moved"] = moved
        cleanup["failed"] = failed
        done.append("cleanup")
    payload["cleanup"] = cleanup

    payload["ok"] = True
    payload["stage"] = "done"
    payload["report_draft"] = report_draft(
        payload["title"],
        url,
        bool(cleanup["moved"]) and not cleanup["failed"],
        public=public,
    )
    payload["next"] = [
        "report_draft をそのまま完了報告に使う（URL は加工しない）",
        "公開したときは「ノートは画面に出ない」が下書きに入っている",
    ]
    return OK, payload


def _publish_cmd(cli, publish_path, slug, public, message, directory=False, base_version=None):
    command = [cli, "--dir" if directory else "--file", publish_path, "--slug", slug or ""]
    if public:
        command += ["--public", "--yes"]
    if message:
        command += ["--message", message]
    if base_version:
        command += ["--base-version", base_version]
    return command
