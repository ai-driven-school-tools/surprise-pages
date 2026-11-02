# -*- coding: utf-8 -*-
"""検査から投稿・片付けまでを 1 本に通す。

清書の手順は、途中に人の判断が入らない区間が長い。検査 → 既定案の適用 → 組み立て →
照合 → 投稿 → 片付けは、どれも同じ入力なら同じ結果になる。そこを 1 回の呼び出しに
束ね、人（AI）が手を出すのは次の 3 つだけにする。

  ・原本の所在を確かめる（と、個人情報・見せてはいけない記述が無いかを目で見る）
  ・この 1 本を呼ぶ
  ・止まったら、返ってきた `next` のとおりに動く

**止まるのは人にしか決められないときだけ。** 既定案のある判定（囲みの閉じ・表のマスの
数・表題が無い）は聞かずに当て、当てた全件を報告の下書きに載せる。聞かずに当ててよい
根拠は、fix.py に語・数字・順番を触る道具が 1 つも無いこと（fixtures.py の
「fix が語・数字・順番を変えていない」が毎回それを見張っている）。

**原本には 1 バイトも書かない。** 直しは作業ファイルへ、組み上げは `--out` へ出す。

検査用の逃げ道は環境変数 1 つ。ふだんは触らない。

  SURPRISE_PAGES_TRASH    片付け先（既定 ~/.Trash）
"""

import datetime
import json
import os
from . import distribution_environment as _distribution
import re
import shutil
import subprocess

from . import codes
from . import convert as convert_mod
from . import fix as fix_mod
from . import provenance as provenance_mod
from . import validate as validate_mod
from . import verify as verify_mod
from .source import SourceError, count_chars, read_source

OK = 0
STOP = 1
CANNOT_RUN = 2

#: 変換の控えと作業ファイルの名前。**`--out` の中に置かない**
#: （投稿はフォルダごと送るので、中に置くと控えまで相手に配られる）。
REPORT_NAME = "clean-copy-report.json"
WORK_NAME = "clean-copy-work.md"

HERE = os.path.dirname(os.path.realpath(__file__))
SCRIPTS_DIR = os.path.dirname(HERE)
SKILL_DIR = os.path.dirname(SCRIPTS_DIR)
SKILLS_DIR = os.path.dirname(SKILL_DIR)
PLUGIN_DIR = os.path.dirname(SKILLS_DIR)

#: 額縁と取り寄せの脚本は、この置き場から**自分で**たどる。呼ぶ側にパスを探させない。
DEFAULT_FRAME = os.path.normpath(os.path.join(SKILLS_DIR, "_shared", "references", "base.html"))
DEFAULT_ENSURE = os.path.normpath(os.path.join(PLUGIN_DIR, "scripts", "ensure-pages-cli.sh"))

#: 投稿コマンドが出す URL。行のどこにあっても拾えるようにする
URL = re.compile(r"https?://[^\s\"'<>）」]+")

#: 末尾に付いてくることのある句読点（URL の一部ではない）
URL_TAIL = "。、．，）」』>,.;:"

PUBLISH_TIMEOUT = 600
ENSURE_TIMEOUT = 120


# ------------------------------------------------------------------ 置き場


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


def mermaid_path():
    return os.path.join(pages_dir(), "src", "templates", "mermaid.html")


def reading_layout_path():
    return os.path.join(pages_dir(), "src", "templates", "reading-layout.json")


def is_cloud():
    """自分でブラウザを開けない席か（印は ensure-pages-cli.sh が置く）。"""
    return os.path.exists(os.path.join(config_dir(), "cloud"))


# ------------------------------------------------------------------ 前提確認


def preflight(ensure_script=DEFAULT_ENSURE):
    """投稿コマンドとログインの控えを確かめる。無い投稿コマンドは自分で取り寄せる。

    ここで人に頼むのはログインだけ（ブラウザを開くのは人のパソコン）。
    投稿コマンドの用意は取り寄せの脚本に任せるので、呼ぶ側は何も打たない。
    """
    found = {
        "cli": None,
        "logged_in": _distribution.publish_token() is not None,
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

    # 取り寄せると、席の印とログインの控えが置かれることがある。もう一度見る
    found["logged_in"] = _distribution.publish_token() is not None
    found["cloud"] = is_cloud()
    return found


def login_hint(pre):
    """ログインが済んでいないときに、次にやること 1 つを返す。"""
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


# ------------------------------------------------------------------ 片付け


def _stamp():
    return datetime.datetime.now().strftime("%Y%m%d-%H%M%S")


def to_trash(paths):
    """自分が作ったものだけをゴミ箱へ移す。**消さない**（戻せる状態を残す）。"""
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
        # 同じ名前が既にあると中へ潜り込むので、時刻を挟む
        target = os.path.join(holder, "%s-%s%s" % (root, stamp, ext))
        try:
            shutil.move(path, target)
        except (OSError, shutil.Error) as err:
            failed.append({"path": path, "detail": str(err)})
        else:
            moved.append(path)
    return moved, failed


# ------------------------------------------------------------------ 報告の下書き


def _fixed_lines(applied, notes):
    """「直したところ」に並べる行。入れ物の直しは全件出す（1 件も畳まない）。"""
    lines = []
    for item in applied:
        lines.append("%s 行目: %s" % (item.get("line", "?"), item.get("detail", "")))
    for note in notes or []:
        # 判定コードは JSON の `notes` に残っている。人に見せる文へは持ち込まない
        lines.append(note.get("detail", ""))
    return lines


def _watched_lines(findings, notes):
    """機械が見つけた「直していないが気になったところ」。warn だけを並べる。

    変換が手を打ったもの（`<style>` を落とした等）は「直したところ」に出るので、
    ここには出さない。同じ 1 件を 2 つの節に並べると、読む人が二度対応を考える。
    """
    handled = {note.get("code") for note in notes or []}
    lines = []
    for item in findings or []:
        if item.get("severity") != codes.WARN or item["code"] in handled:
            continue
        lines.append(
            "%s 行目: %s（%s）" % (item.get("line", "?"), codes.describe(item["code"]), item.get("detail", ""))
        )
    return lines


HUMAN_LINE = "（ほかに気づいたことがあれば足す。無ければこの行を消して「無し」と書く）"


def report_draft(title, url, fixed, watched, cleanup_done, public=False, dry_run=False):
    """完了報告の下書き。機械に書けるところは全部埋めて返す。

    埋まらないのは「直していないが気になったところ」の人が気づいた分だけ。
    見出しごと残しておくのは、節が消えるより残るほうが直しやすいため。
    """
    lines = ["完成・公開完了: %s" % title, ""]
    lines.append("公開 URL:" if public else "URL（招待した人だけ）:")
    if url:
        lines.append(url)
    elif dry_run:
        lines.append("（--dry-run なので、まだ投稿していません）")
    else:
        lines.append("（投稿コマンドの出力から URL を読み取れませんでした。出力をそのまま見せる）")
    lines += ["", "直したところ:"]
    lines += ["- %s" % line for line in fixed] if fixed else ["- 無し"]
    lines += ["", "直していないが気になったところ:"]
    lines += ["- %s" % line for line in watched]
    lines.append("- %s" % HUMAN_LINE)
    lines += ["", "変えていないこと:", "- 文章・数字・順序は原本のままです"]
    lines += [
        "",
        "手元の作業ファイル: %s" % ("ゴミ箱に入れました" if cleanup_done else "残してあります"),
    ]
    return "\n".join(lines)


# ------------------------------------------------------------------ 一気通貫


def pick_url(text, slug=None):
    """投稿コマンドの出力から URL を 1 本選ぶ。スラッグを含むものを優先する。"""
    found = [candidate.rstrip(URL_TAIL) for candidate in URL.findall(text or "")]
    if not found:
        return None
    if slug:
        for candidate in found:
            if slug in candidate:
                return candidate
    return found[-1]


class _Stop(Exception):
    """止める。payload はそのまま人に見せられる形で持つ。"""

    def __init__(self, code, payload):
        Exception.__init__(self, payload.get("error", ""))
        self.code = code
        self.payload = payload


def run(
    source,
    slug=None,
    out="page-out",
    description=None,
    title=None,
    message=None,
    public=False,
    yes_public=False,
    dry_run=False,
    frame_path=None,
    mermaid_template=None,
    report_path=None,
    work_path=None,
    no_git=False,
    keep=False,
    ensure_script=DEFAULT_ENSURE,
    layout="default",
):
    """(終了コード, 返す値) を返す。0 = 投稿まで済んだ / 1 = 止まった / 2 = そもそも走れない。"""
    out_dir = os.path.abspath(out)
    holder = os.path.dirname(out_dir)
    work = os.path.abspath(work_path or os.path.join(holder, WORK_NAME))
    report = os.path.abspath(report_path or os.path.join(holder, REPORT_NAME))
    frame_path = frame_path or DEFAULT_FRAME

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
            out_dir=out_dir,
            work=work,
            report=report,
            description=description,
            title=title,
            message=message,
            public=public,
            yes_public=yes_public,
            dry_run=dry_run,
            frame_path=frame_path,
            mermaid_template=mermaid_template or mermaid_path(),
            no_git=no_git,
            keep=keep,
            ensure_script=ensure_script,
            layout=layout,
        )
    except _Stop as halt:
        return halt.code, halt.payload


def _walk(
    payload,
    stop,
    cannot_run,
    source,
    slug,
    out_dir,
    work,
    report,
    description,
    title,
    message,
    public,
    yes_public,
    dry_run,
    frame_path,
    mermaid_template,
    no_git,
    keep,
    ensure_script,
    layout,
):
    done = payload["done"]

    # --- 0. 前提確認 ------------------------------------------------------
    if not dry_run and not slug:
        raise cannot_run(
            "--slug を渡してください（そのまま URL になります。英小文字・数字・- _ . / だけ）",
            "スラッグを決めて打ち直す。組み上がりだけ見たいなら --dry-run",
        )
    if public and not yes_public:
        raise cannot_run(
            "公開はユーザーが明示したときだけです。--public には --yes-public を添えてください",
            "公開の指示が本当にあるなら --yes-public を足して打ち直す。無ければ --public を外す（招待した人だけの設定で出し、あとから画面で社外に切り替えられる）",
        )

    # ファイルだけを受け取る通常チャットでも使う。検証だけなら、投稿の
    # 道具の取得・ログイン情報の確認を含め、投稿の準備には一切入らない。
    pre = ({"cli": None, "logged_in": False, "cloud": False, "ensured": False}
           if dry_run else preflight(ensure_script))
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

    # --- 1. 検査 ----------------------------------------------------------
    try:
        original = read_source(source)
    except SourceError as err:
        raise stop(
            "validate",
            "原本が読めません: %s" % err,
            "原本の所在をユーザーに確かめる（機械には直しようがない）",
            findings=[
                {
                    "code": "UNREADABLE",
                    "severity": codes.ERROR,
                    "line": 1,
                    "detail": str(err),
                    "default": "",
                }
            ],
        )

    base_dir = os.path.dirname(os.path.abspath(source))
    checked = validate_mod.validate_text(original, base_dir, source)
    payload["validate"] = checked["summary"]
    done.append("validate")

    blockers = [
        item
        for item in checked["findings"]
        if item["severity"] == codes.ERROR and not item["default"]
    ]
    if blockers:
        raise stop(
            "validate",
            "機械には直しようがない判定が残っています",
            "この判定をユーザーに見せて指示を仰ぐ（原本を直せるのは書いた人だけ。こちらで書き換えない）",
            findings=blockers,
        )

    # --- 2. 入れ物を直す（既定案は聞かずに当てる）-------------------------
    if os.path.realpath(work) == os.path.realpath(source):
        raise cannot_run("作業ファイルが原本と同じ場所です: %s" % work)

    # 表題を立てるのは「見出しが無くて短い」ときだけ。長い原本（NO_HEADING_LONG）は
    # 既定が「先頭の 1 行をそのまま表題にする」で、そちらは convert が受け持つ
    short_without_heading = any(
        item["code"] == "NO_HEADING_SHORT" for item in checked["findings"]
    )
    fix_title = None
    if short_without_heading:
        fix_title = title or os.path.splitext(os.path.basename(source))[0]
    fixed_text, applied = fix_mod.fix_text(original, apply_defaults=True, title=fix_title)
    work_holder = os.path.dirname(work)
    if work_holder:
        os.makedirs(work_holder, exist_ok=True)
    with open(work, "w", encoding="utf-8") as handle:
        handle.write(fixed_text)
    payload["applied"] = applied
    payload["work"] = work
    done.append("fix")

    after = validate_mod.validate_text(fixed_text, base_dir, work)
    payload["warnings"] = [item for item in after["findings"] if item["severity"] == codes.WARN]
    remaining = [item for item in after["findings"] if item["severity"] == codes.ERROR]
    if remaining:
        raise stop(
            "fix",
            "既定案を当てても、止まる判定が残りました",
            "この判定をそのままユーザーに見せる（コマンド側の異常なので、手で直さない）",
            findings=remaining,
        )

    # --- 3. 組む ----------------------------------------------------------
    try:
        built = convert_mod.convert_text(fixed_text, original_text=original, title=title, layout=layout)
        if not os.path.exists(frame_path):
            raise convert_mod.ConvertError("額縁が見つかりません: %s" % frame_path)
        frame = open(frame_path, encoding="utf-8").read()
        snippet = convert_mod.mermaid_snippet(mermaid_template) if built["needs_mermaid"] else None
        found = None if (public or no_git) else provenance_mod.inspect(source)
        display_name = (found or {}).get("path") or os.path.basename(source)
        note = convert_mod.source_note(
            count_chars(original),
            display_name,
            public=public,
            provenance=None if public else found,
        )
        page = convert_mod.build_page(
            frame,
            built["title"],
            description or built["title"],
            built["body"] + "\n" + note,
            snippet,
            layout=layout,
        )
    except convert_mod.ConvertError as err:
        raise cannot_run(
            str(err),
            "この文をそのままユーザーに見せて指示を仰ぐ（手で HTML を書いて回避しない）",
        )

    os.makedirs(out_dir, exist_ok=True)
    page_path = os.path.join(out_dir, "index.html")
    with open(page_path, "w", encoding="utf-8") as handle:
        handle.write(page)

    convert_report = {
        "source": work,
        "original": source,
        "page": page_path,
        "title": built["title"],
        "description": description or built["title"],
        "public": bool(public),
        "mermaid": built["needs_mermaid"],
        "extra_headings": built["extra_headings"],
        "headings_not_in_original": built["headings_not_in_original"],
        "heading_count_html": built["heading_count_html"],
        "removed_text": built["removed_text"],
        "added_text": built["added_text"],
        "notes": built["notes"],
        "provenance": None if public else provenance_mod.reportable(found),
    }
    with open(report, "w", encoding="utf-8") as handle:
        json.dump(convert_report, handle, ensure_ascii=False, indent=2, sort_keys=False)
        handle.write("\n")

    payload["page"] = page_path
    payload["report"] = report
    payload["title"] = built["title"]
    payload["mermaid"] = built["needs_mermaid"]
    payload["notes"] = built["notes"]
    payload["provenance"] = None if public else provenance_mod.reportable(found)
    done.append("convert")

    # --- 4. 照合 ----------------------------------------------------------
    outcome = verify_mod.verify(original, page, convert_report, work_text=fixed_text)
    payload["verify"] = outcome
    done.append("verify")
    if not outcome["ok"]:
        raise stop(
            "verify",
            "原本と出来上がったページが合いません。投稿していません",
            "赤い検査をそのままユーザーに見せて指示を仰ぐ（「たぶん誤差」で通さない）。page-out は片付けずに残してある",
        )

    fixed_lines = _fixed_lines(applied, built["notes"])
    watched_lines = _watched_lines(payload["warnings"], built["notes"])

    # --- 5. 投稿 ----------------------------------------------------------
    if dry_run:
        payload["ok"] = True
        payload["stage"] = "verify"
        payload["would_publish"] = _publish_cmd(pre.get("cli") or cli_path(), out_dir, slug, public, message)
        payload["report_draft"] = report_draft(
            built["title"], None, fixed_lines, watched_lines, False, public=public, dry_run=True
        )
        payload["next"] = ["--dry-run を外して打ち直すと、投稿と片付けまで進む"]
        return OK, payload

    command = _publish_cmd(pre["cli"], out_dir, slug, public, message)
    payload["command"] = command
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
            "エラーの内容をユーザーに見せて指示を仰ぐ。page-out は残してある",
        )

    output = ((published.stdout or "") + (published.stderr or "")).strip()
    payload["publish_output"] = output
    if published.returncode != 0:
        raise stop(
            "publish",
            "投稿できませんでした（終了コード %d）" % published.returncode,
            "この出力をそのままユーザーに見せて指示を仰ぐ。手順書ではなく手元の投稿コマンドが古いことがある。"
            "page-out は片付けずに残してある",
        )
    done.append("publish")

    url = pick_url(output, slug)
    payload["url"] = url

    # --- 6. 片付け --------------------------------------------------------
    cleanup = {"moved": [], "failed": [], "kept": bool(keep)}
    if not keep:
        moved, failed = to_trash([out_dir, work, report])
        cleanup["moved"] = moved
        cleanup["failed"] = failed
        done.append("cleanup")
    payload["cleanup"] = cleanup

    payload["ok"] = True
    payload["stage"] = "done"
    payload["report_draft"] = report_draft(
        built["title"],
        url,
        fixed_lines,
        watched_lines,
        bool(cleanup["moved"]) and not cleanup["failed"],
        public=public,
    )
    payload["next"] = [
        "report_draft をそのまま完了報告に使う（URL は加工しない）",
        "「直していないが気になったところ」に、自分の目で気づいた分だけ足す",
    ]
    return OK, payload


def _publish_cmd(cli, out_dir, slug, public, message):
    command = [cli, "--dir", out_dir, "--slug", slug or ""]
    if public:
        # 対話できない席なので、確認は --yes-public で人から取ってある
        command += ["--public", "--yes"]
    if message:
        command += ["--message", message]
    return command
