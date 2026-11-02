# -*- coding: utf-8 -*-
"""小さな原本を並べて、変換で問題が起きないことを毎回確かめる。

1 件ごとに 5 つ見る。

  1. validate の判定が、置いてある期待どおりか
  2. fix が語・数字・順番を 1 文字も動かしていないか（記号と空白を落とした文字列が一致するか）
  3. convert の本文が、置いてある期待どおりか
  4. 照合 3 本が、期待どおり緑（または赤）になるか
  5. 同じ入力を 2 回組んで、HTML がバイト単位で同じか

そのあと、一気通貫（`run.py publish`）を偽の投稿コマンドで通す。あちらは「止まる判定を
聞かずに当てて投稿まで進む」ので、**どこで止まり／どこで止まらないか**が壊れると被害が
大きい。ここで通る道と止まる道の両方を見る。

期待値を作り直すときは `run.py test-fixtures --update`。**作り直したら目で見てから commit する**
（期待値が壊れた状態で緑になるのが、この手の検査でいちばん怖い）。
"""

import collections
import json
import os
import re
import shutil
import stat
import tempfile

from . import convert as convert_mod
from . import fix as fix_mod
from . import pipeline as pipeline_mod
from . import provenance as provenance_mod
from . import validate as validate_mod
from . import verify as verify_mod
from .source import STRIP_SPACES, STRIP_SYMBOLS, count_chars, find_numbers, read_source

STUB_DIR = "_stub"


def normalize_words(text):
    """飾り記号と空白を落とした素の文字列。語・数字・順番の見張りに使う。"""
    return STRIP_SPACES.sub("", STRIP_SYMBOLS.sub("", text))


class Result(object):
    def __init__(self, name):
        self.name = name
        self.failures = []

    def check(self, label, ok, detail=""):
        if not ok:
            self.failures.append("%s%s" % (label, ("： " + detail) if detail else ""))
        return ok


PARAGRAPH = re.compile(r"<p class=\"[^\"]*\">.*?</p>", re.S)
DIGIT = re.compile(r"(?<![0-9])[0-9](?![0-9])")

PRE = re.compile(r"<pre\b.*?</pre>", re.S)
CODE_TAG = re.compile(r"<code\b.*?</code>", re.S)

#: 変換し損ねたマークダウンの記法。読者にはただの記号として見える
LEFTOVER_MARKUP = re.compile(r"\*\*|^ {0,3}#{1,6} |^ {0,3}\|", re.M)

#: 廃番になった色の名前
DEPRECATED_NAMES = re.compile(r"ads-(?:dim|hover|accent-light|warning)\b")

#: 生の色名。額縁の外に書くと暗い側で割れる
RAW_COLOR = re.compile(
    r"\b(?:bg|text|border|fill|stroke|from|to|via|ring|divide)"
    r"-(?:slate|gray|zinc|neutral|stone|white|black|blue|indigo|violet|purple|emerald|green|red|rose|"
    r"amber|orange|yellow|teal|cyan|sky|pink|fuchsia|lime)(?:-\d+)?(?:/\d+)?\b"
)


def _mutations(page):
    """出来上がったページをわざと壊した写しを返す。照合が赤くなるかを見るため。"""
    body_start = page.find(verify_mod.CONTENT_START)
    body_end = page.find(verify_mod.CONTENT_END)
    if body_start < 0 or body_end < 0:
        return []
    head, body, tail = page[:body_end], page[body_start:body_end], page[body_end:]
    head = page[:body_start]

    out = []

    # 落とすのは**いちばん長い段落**。先頭の段落だと数文字しかないことがあり、
    # ±3% の幅に収まって「赤くならないのが正しい」になってしまう
    paragraphs = PARAGRAPH.findall(body)
    longest = max(paragraphs, key=len) if paragraphs else None
    dropped = body.replace(longest, "", 1) if longest else body
    out.append(("いちばん長い段落を落とす", head + dropped + tail if dropped != body else None))

    swapped = DIGIT.sub(lambda m: "9" if m.group(0) != "9" else "8", body, count=1)
    out.append(("数字を 1 つ書き換える", head + swapped + tail if swapped != body else None))

    return out


def _load_case(path):
    case_path = os.path.join(path, "case.json")
    case = {
        "note": "",
        "apply_defaults": False,
        "convert": True,
        "title": None,
        "description": None,
        "expect_verify_ok": True,
        "expect_body_contains": [],
        "expect_body_missing": [],
        "public": False,
        "provenance": None,
        "layout": "default",
    }
    if os.path.exists(case_path):
        case.update(json.load(open(case_path, encoding="utf-8")))
    return case


def _findings_only(report):
    """期待値に残すのは判定だけ（行数や字数はフィクスチャを直すたびに動くので置かない）。"""
    return {"findings": report["findings"], "summary": report["summary"]}


def _run_one(name, path, frame, mermaid_template, update):
    result = Result(name)
    case = _load_case(path)
    source_path = os.path.join(path, "in.md")
    original = read_source(source_path)

    # --- 1. 検査 --------------------------------------------------------
    report = validate_mod.validate_text(original, path, "in.md")
    expect_path = os.path.join(path, "expect-validate.json")
    actual = _findings_only(report)
    if update:
        with open(expect_path, "w", encoding="utf-8") as handle:
            json.dump(actual, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
    elif not os.path.exists(expect_path):
        result.check("validate の期待値が置かれていない", False, expect_path)
    else:
        expected = json.load(open(expect_path, encoding="utf-8"))
        result.check(
            "validate の判定が期待どおり",
            expected == actual,
            "期待 %s / 実際 %s"
            % (
                [item["code"] for item in expected["findings"]],
                [item["code"] for item in actual["findings"]],
            ),
        )

    # --- 2. 直しても中身が動かない --------------------------------------
    title = case["title"]
    if case["apply_defaults"] and not title:
        title = os.path.splitext(os.path.basename(source_path))[0]
    work, applied = fix_mod.fix_text(original, apply_defaults=case["apply_defaults"], title=title)
    added_title = "".join(
        normalize_words(item["detail"].split("「", 1)[1].rsplit("」", 1)[0])
        for item in applied
        if item["code"] == "NO_HEADING_SHORT"
    )
    result.check(
        "fix が語・数字・順番を変えていない",
        normalize_words(work) == added_title + normalize_words(original),
        "作業ファイル %d 字 / 原本 %d 字" % (count_chars(work), count_chars(original)),
    )
    result.check(
        "fix が数字を動かしていない",
        collections.Counter(find_numbers(work))
        == collections.Counter(find_numbers(original)) + collections.Counter(find_numbers(title or "")),
        "",
    )

    if not case["convert"]:
        return result

    # --- 3. 組み上げ ----------------------------------------------------
    check = validate_mod.validate_text(work, path, "work.md")
    if validate_mod.has_error(check):
        result.check(
            "組む前に、止まる判定が残っていない",
            False,
            ", ".join(item["code"] for item in check["findings"] if item["severity"] == "error"),
        )
        return result

    built = convert_mod.convert_text(work, original_text=original, title=case["title"], layout=case["layout"])
    snippet = convert_mod.mermaid_snippet(mermaid_template) if built["needs_mermaid"] else None
    note = convert_mod.source_note(
        count_chars(original),
        "in.md",
        public=case.get("public", False),
        provenance=case.get("provenance"),
    )
    body = built["body"] + "\n" + note
    page = convert_mod.build_page(
        frame, built["title"], case["description"] or built["title"], body, snippet, layout=case["layout"]
    )

    body_path = os.path.join(path, "expect-content.html")
    if update:
        with open(body_path, "w", encoding="utf-8") as handle:
            handle.write(body + "\n")
    elif not os.path.exists(body_path):
        result.check("本文の期待値が置かれていない", False, body_path)
    else:
        expected_body = open(body_path, encoding="utf-8").read()
        result.check("本文が期待どおり", expected_body == body + "\n", "expect-content.html と食い違い")

    # コードの外にマークダウンの記法が字のまま残っていないか。
    # コード片をまたいだ `**強調**` を取りこぼすと、ここに ** が残って読者に見える
    outside_code = PRE.sub("", CODE_TAG.sub("", body))
    leftovers = sorted(set(LEFTOVER_MARKUP.findall(outside_code)))
    result.check(
        "コードの外にマークダウンの記法が残っていない",
        not leftovers,
        " ".join(leftovers),
    )

    result.check(
        "本文に廃番の色名が無い",
        not DEPRECATED_NAMES.search(body),
        ", ".join(sorted(set(DEPRECATED_NAMES.findall(body)))),
    )
    result.check(
        "本文に生の色名が無い",
        not RAW_COLOR.search(body),
        ", ".join(sorted(set(RAW_COLOR.findall(body)))),
    )
    result.check("額縁に先頭へ戻るがある", 'id="sp-to-top"' in page)
    result.check("先頭へ戻るが本文に混ざっていない", 'id="sp-to-top"' not in body)

    for needle in case["expect_body_contains"]:
        result.check("本文に「%s」がそのまま残っている" % needle, needle in body)
    for needle in case["expect_body_missing"]:
        result.check("本文に「%s」が出ていない" % needle, needle not in body)

    # --- 4. 照合 --------------------------------------------------------
    verify_report = {
        "removed_text": built["removed_text"],
        "added_text": built["added_text"],
        "extra_headings": built["extra_headings"],
        "headings_not_in_original": built["headings_not_in_original"],
        "notes": built["notes"],
    }
    outcome = verify_mod.verify(original, page, verify_report, work_text=work)
    result.check(
        "照合が期待どおり（%s）" % ("緑" if case["expect_verify_ok"] else "赤"),
        outcome["ok"] == case["expect_verify_ok"],
        json.dumps(
            [item for item in outcome["checks"] if not item["ok"]] or outcome["ledger"],
            ensure_ascii=False,
        ),
    )

    # --- 5. わざと壊すと、ちゃんと赤くなるか ------------------------------
    # ここが無いと「全部緑」は何も証明しない。照合を素通しに書いてしまっても気づけない。
    for label, broken in _mutations(page):
        if broken is None:
            continue
        broken_outcome = verify_mod.verify(original, broken, verify_report, work_text=work)
        result.check("わざと%sと照合が赤くなる" % label, not broken_outcome["ok"])

    # --- 6. 2 回組んで同じもの -------------------------------------------
    again = convert_mod.convert_text(work, original_text=original, title=case["title"], layout=case["layout"])
    again_body = again["body"] + "\n" + convert_mod.source_note(
        count_chars(original),
        "in.md",
        public=case.get("public", False),
        provenance=case.get("provenance"),
    )
    again_page = convert_mod.build_page(
        frame,
        again["title"],
        case["description"] or again["title"],
        again_body,
        convert_mod.mermaid_snippet(mermaid_template) if again["needs_mermaid"] else None,
        layout=case["layout"],
    )
    result.check(
        "2 回組んでも同じ HTML（バイト単位）",
        page.encode("utf-8") == again_page.encode("utf-8"),
    )
    return result


# --------------------------------------------------------- 一気通貫の検査

#: 偽の投稿コマンド。渡されたスラッグをそのまま URL にして返す
STUB_CLI = """#!/usr/bin/env python3
import sys

args = sys.argv[1:]
slug = args[args.index("--slug") + 1] if "--slug" in args else ""
print("投稿しました（偽）")
print("https://pages.example.com/internal/%s" % slug)
"""

#: 投稿が失敗する偽の投稿コマンド
STUB_CLI_FAIL = """#!/usr/bin/env python3
import sys

sys.stderr.write("まだ投稿できません\\n")
sys.exit(1)
"""

#: 一気通貫で通す見本。止まる判定（既定案つき）を含むものを選んである
PIPELINE_CASES = ("01-basic", "02-mermaid", "07-unclosed-fence", "08a-table-header-mismatch", "10a-no-heading-short")

#: 既定案を当てたことが `applied` に出るはずの見本
PIPELINE_APPLIES = {
    "07-unclosed-fence": "UNCLOSED_FENCE",
    "08a-table-header-mismatch": "TABLE_HEADER_SEP_MISMATCH",
    "10a-no-heading-short": "NO_HEADING_SHORT",
}


def _stub_cli(holder, body=STUB_CLI):
    """偽の投稿コマンドを置き、その置き場（SURPRISE_PAGES_DIR に渡す形）を返す。"""
    binder = os.path.join(holder, "bin")
    os.makedirs(binder, exist_ok=True)
    path = os.path.join(binder, "pages-publish")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(body)
    os.chmod(path, os.stat(path).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return holder


class _Stage(object):
    """偽の投稿先を 1 式そろえた作業場。環境変数は抜けるときに必ず戻す。"""

    def __init__(self, logged_in=True, cli_body=STUB_CLI):
        self.root = tempfile.mkdtemp(prefix="clean-copy-pipeline-")
        self.work = os.path.join(self.root, "work")
        self.trash = os.path.join(self.root, "trash")
        os.makedirs(self.work)
        os.makedirs(self.trash)
        self.pages = os.path.join(self.root, "pages")
        templates = os.path.join(self.pages, 'src', 'templates')
        os.makedirs(templates)
        if os.path.isfile(pipeline_mod.reading_layout_path()):
            shutil.copyfile(pipeline_mod.reading_layout_path(), os.path.join(templates, 'reading-layout.json'))
        if cli_body is not None:
            _stub_cli(self.pages, cli_body)
        config = os.path.join(self.root, "config")
        os.makedirs(config)
        if logged_in:
            with open(os.path.join(config, "token"), "w", encoding="utf-8") as handle:
                handle.write("偽の控え\n")
        self._saved = {}
        for name, value in (
            ("SURPRISE_PAGES_TRASH", self.trash),
            ("PAGES_TOKEN", None),
            ("PAGES_TOKEN_ORIGIN", None),
        ):
            self._saved[name] = os.environ.get(name)
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        # 投稿先と控えの置き場は、本物の投稿コマンドの設定から引く（環境変数では差し替わらない）。
        # ここでは偽の作業場を指すよう差し替え、抜けるときに戻す
        environment = pipeline_mod._distribution
        token = os.path.join(config, "token")
        self._replaced = {}
        for name, value in (
            ("pages_dir", lambda: self.pages),
            ("config_dir", lambda: config),
            ("token_path", lambda: token),
            ("origin", lambda: "https://pages.example.test"),
        ):
            self._replaced[name] = getattr(environment, name)
            setattr(environment, name, value)

    def close(self):
        for name, value in self._replaced.items():
            setattr(pipeline_mod._distribution, name, value)
        for name, value in self._saved.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        shutil.rmtree(self.root, ignore_errors=True)

    def place(self, source_path, name="原本.md"):
        target = os.path.join(self.work, name)
        shutil.copyfile(source_path, target)
        return target

    def out(self):
        return os.path.join(self.work, "page-out")


def _pipeline_one(name, path, frame_path, mermaid_template, fails):
    """1 件を一気通貫で通し、投稿と片付けまで進むことを見る。"""
    stage = _Stage()
    try:
        source = stage.place(os.path.join(path, "in.md"))
        before = open(source, "rb").read()
        code, payload = pipeline_mod.run(
            source,
            slug="test/%s" % name,
            out=stage.out(),
            description="検査用の 1 文",
            frame_path=frame_path,
            mermaid_template=mermaid_template,
        )
        label = "一気通貫 %s" % name

        if code != pipeline_mod.OK or not payload["ok"]:
            fails.append("%s: 止まりました（%s / %s）" % (label, payload.get("stage"), payload.get("error")))
            return
        if payload["done"] != ["preflight", "validate", "fix", "convert", "verify", "publish", "cleanup"]:
            fails.append("%s: 通った区間が足りません（%s）" % (label, payload["done"]))
        if not payload["verify"]["ok"]:
            fails.append("%s: 照合が赤いのに進みました" % label)
        if payload.get("url") != "https://pages.example.com/internal/test/%s" % name:
            fails.append("%s: URL を読み取れていません（%s）" % (label, payload.get("url")))
        if open(source, "rb").read() != before:
            fails.append("%s: 原本が書き換わりました" % label)
        for leftover in (stage.out(), payload["work"], payload["report"]):
            if os.path.exists(leftover):
                fails.append("%s: 片付いていません（%s）" % (label, leftover))
        if len(os.listdir(stage.trash)) != 3:
            fails.append("%s: ゴミ箱に 3 つ入っていません（%s）" % (label, os.listdir(stage.trash)))

        draft = payload.get("report_draft") or ""
        for needle in ("文章・数字・順序は原本のままです", "直したところ:", payload["url"]):
            if needle not in draft:
                fails.append("%s: 報告の下書きに「%s」がありません" % (label, needle))

        expected = PIPELINE_APPLIES.get(name)
        if expected and expected not in [item["code"] for item in payload["applied"]]:
            fails.append(
                "%s: 既定案を当てた記録がありません（期待 %s / 実際 %s）"
                % (label, expected, [item["code"] for item in payload["applied"]])
            )
        if not expected and payload["applied"]:
            fails.append("%s: 直すところが無いのに直しました（%s）" % (label, payload["applied"]))
    finally:
        stage.close()


def _pipeline_stops(fixtures_dir, frame_path, mermaid_template, fails):
    """止まるべきところで止まるか。ここが緑でも、上の「通る道」だけでは何も証明しない。"""
    basic = os.path.join(fixtures_dir, "01-basic", "in.md")

    # 1. 空の原本（既定案が無い判定）は、組む前に止まる
    stage = _Stage()
    try:
        source = os.path.join(stage.work, "空.md")
        open(source, "w", encoding="utf-8").close()
        code, payload = pipeline_mod.run(
            source, slug="test/empty", out=stage.out(), frame_path=frame_path, mermaid_template=mermaid_template
        )
        if code != pipeline_mod.STOP or payload["stage"] != "validate":
            fails.append("空の原本で止まりません（%s / %s）" % (code, payload.get("stage")))
        if os.path.exists(stage.out()):
            fails.append("空の原本なのに組み上げました")
    finally:
        stage.close()

    # 2. ログインの控えが無ければ、組む前に止めて案内を返す
    stage = _Stage(logged_in=False)
    try:
        source = stage.place(basic)
        code, payload = pipeline_mod.run(
            source, slug="test/login", out=stage.out(), frame_path=frame_path, mermaid_template=mermaid_template
        )
        if code != pipeline_mod.STOP or payload["stage"] != "preflight":
            fails.append("未ログインで止まりません（%s / %s）" % (code, payload.get("stage")))
        if not any("login" in line for line in payload.get("next", [])):
            fails.append("未ログインの案内に login がありません（%s）" % payload.get("next"))
    finally:
        stage.close()

    # 3. 投稿コマンドが無く、取り寄せもできないなら止まる（通信はしない）
    stage = _Stage(cli_body=None)
    try:
        source = stage.place(basic)
        code, payload = pipeline_mod.run(
            source,
            slug="test/nocli",
            out=stage.out(),
            frame_path=frame_path,
            mermaid_template=mermaid_template,
            ensure_script=os.path.join(stage.root, "存在しない.sh"),
        )
        if code != pipeline_mod.STOP or payload["stage"] != "preflight":
            fails.append("投稿コマンドが無いのに進みます（%s / %s）" % (code, payload.get("stage")))
    finally:
        stage.close()

    # 4. 投稿が失敗したら、片付けずに残す（もう一度投稿するのに要る）
    stage = _Stage(cli_body=STUB_CLI_FAIL)
    try:
        source = stage.place(basic)
        code, payload = pipeline_mod.run(
            source, slug="test/fail", out=stage.out(), frame_path=frame_path, mermaid_template=mermaid_template
        )
        if code != pipeline_mod.STOP or payload["stage"] != "publish":
            fails.append("投稿が失敗しても止まりません（%s / %s）" % (code, payload.get("stage")))
        if not os.path.exists(os.path.join(stage.out(), "index.html")):
            fails.append("投稿が失敗したのに片付けました")
        if "まだ投稿できません" not in (payload.get("publish_output") or ""):
            fails.append("投稿コマンドの出力を持ち帰っていません（%s）" % payload.get("publish_output"))
    finally:
        stage.close()

    # 5. --public は --yes-public が無ければ走らない（勝手に社外へ出さない）
    stage = _Stage()
    try:
        source = stage.place(basic)
        code, payload = pipeline_mod.run(
            source,
            slug="test/public",
            out=stage.out(),
            public=True,
            frame_path=frame_path,
            mermaid_template=mermaid_template,
        )
        if code != pipeline_mod.CANNOT_RUN:
            fails.append("--public だけで走ってしまいます（%s）" % code)
    finally:
        stage.close()

    # 6. --dry-run は投稿も片付けもしない（組み上がりは残す）
    stage = _Stage()
    try:
        source = stage.place(basic)
        code, payload = pipeline_mod.run(
            source,
            slug="test/dry",
            out=stage.out(),
            dry_run=True,
            frame_path=frame_path,
            mermaid_template=mermaid_template,
        )
        if code != pipeline_mod.OK or payload["stage"] != "verify":
            fails.append("--dry-run が照合で止まりません（%s / %s）" % (code, payload.get("stage")))
        if "publish" in payload["done"]:
            fails.append("--dry-run なのに投稿しました")
        if not os.path.exists(os.path.join(stage.out(), "index.html")):
            fails.append("--dry-run で組み上げが残っていません")
    finally:
        stage.close()


def pipeline_self_test(fixtures_dir, frame_path):
    """一気通貫の検査を回して、不合格の一覧を返す。"""
    fails = []
    mermaid_template = os.path.join(fixtures_dir, STUB_DIR, "mermaid.html")
    for name in PIPELINE_CASES:
        path = os.path.join(fixtures_dir, name)
        if not os.path.isdir(path):
            fails.append("一気通貫の見本がありません: %s" % name)
            continue
        try:
            _pipeline_one(name, path, frame_path, mermaid_template, fails)
        except Exception as err:
            fails.append("一気通貫 %s: 途中で落ちました（%s: %s）" % (name, type(err).__name__, err))
    try:
        _pipeline_stops(fixtures_dir, frame_path, mermaid_template, fails)
    except Exception as err:
        fails.append("止まる道: 途中で落ちました（%s: %s）" % (type(err).__name__, err))
    return fails


def run(fixtures_dir, frame_path, update=False, only=None):
    if not os.path.isdir(fixtures_dir):
        print("フィクスチャのフォルダがありません: %s" % fixtures_dir)
        return 2
    if not os.path.exists(frame_path):
        print("額縁が見つかりません: %s" % frame_path)
        return 2
    frame = open(frame_path, encoding="utf-8").read()
    mermaid_template = os.path.join(fixtures_dir, STUB_DIR, "mermaid.html")

    names = sorted(
        name
        for name in os.listdir(fixtures_dir)
        if os.path.isdir(os.path.join(fixtures_dir, name)) and not name.startswith("_")
    )
    if only:
        names = [name for name in names if only in name]
    if not names:
        print("走らせるフィクスチャがありません")
        return 2

    failed = 0
    prov_fails = provenance_mod.self_test()
    if prov_fails:
        failed += 1
        print("NG  provenance")
        for line in prov_fails:
            print("      %s" % line)
    else:
        print("OK  provenance")

    for name in names:
        path = os.path.join(fixtures_dir, name)
        try:
            result = _run_one(name, path, frame, mermaid_template, update)
        except Exception as err:  # 落ちたことも 1 件の不合格として並べる
            print("NG  %s: 途中で落ちました（%s: %s）" % (name, type(err).__name__, err))
            failed += 1
            continue
        if result.failures:
            failed += 1
            print("NG  %s" % name)
            for line in result.failures:
                print("      %s" % line)
        else:
            print("OK  %s" % name)

    extra = 1  # provenance
    if not only:
        extra += 1
        pipe_fails = pipeline_self_test(fixtures_dir, frame_path)
        if pipe_fails:
            failed += 1
            print("NG  pipeline")
            for line in pipe_fails:
                print("      %s" % line)
        else:
            print("OK  pipeline")

    print("\n不合格 %d 件 / 全 %d 件" % (failed, len(names) + extra))
    if update:
        print("期待値を作り直しました。中身を目で見てから commit してください。")
    return 0 if failed == 0 else 1
