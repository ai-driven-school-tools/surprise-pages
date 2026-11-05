# -*- coding: utf-8 -*-
"""deck の契約を確かめる。原本には 1 バイトも書かない。"""

import os
from . import distribution_environment as _distribution
import json
import subprocess
import re
import hashlib
from html.parser import HTMLParser

from . import codes
from .note import has_source_note

MIN_FONT_PX = 20
PLACEHOLDER = "<!--DECK_EMBED-->"

# Previously shipped runtimes remain valid only as exact scripts. Their digests live in one
# place: src/templates/deck-preview-compat.json next to the template (scripts/build/deck-design.mjs keeps it).
# Republishing an authored file must not require replacing its runtime or rewriting its source.
COMPAT_NAME = "deck-preview-compat.json"
COMPANION_NAMES = ("deck-design.html", "mermaid.html")

FONT_SIZE = re.compile(r"font-size:\s*(\d+(?:\.\d+)?)px", re.I)
VIEWPORT = re.compile(r"\d(?:vw|vh|dvh|svh|lvh)\b", re.I)
FIXED = re.compile(r"position:\s*(?:fixed|sticky)\b", re.I)
ADS_DECL = re.compile(r"--ads-[a-z0-9-]+:\s*[\d ]+;")
RAW_COLOR = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d")
BASE_TAG = re.compile(r"<base\s", re.I)
STYLE_BLOCK = re.compile(r"<style\b[^>]*>(.*?)</style\s*>", re.I | re.S)
CSS_COMMENT = re.compile(r"/\*.*?\*/", re.S)
MAIN_BLOCK = re.compile(r"<main\b[^>]*>.*?</main\s*>", re.I | re.S)
SCRIPT_BLOCK = re.compile(r"<script\b[^>]*>.*?</script\s*>", re.I | re.S)
SCRIPT_OR_COMMENT = re.compile(r"<!--.*?-->|<script\b[^>]*>.*?</script>", re.S)
DESIGN_STYLE_BLOCK = re.compile(r"<style\b[^>]*\bdata-deck-design-style=[^>]*>.*?</style\s*>", re.I | re.S)
DESIGN_RUNTIME_BLOCK = re.compile(r"<script\b[^>]*\bdata-deck-design-runtime=[^>]*>.*?</script>", re.S)
# 絵文字。標準ライブラリの re に \p{Extended_Pictographic} は無いので範囲で見る
EMOJI = re.compile(
    "["
    "\U0001F300-\U0001F5FF"
    "\U0001F600-\U0001F64F"
    "\U0001F680-\U0001F6FF"
    "\U0001F700-\U0001F77F"
    "\U0001F780-\U0001F7FF"
    "\U0001F800-\U0001F8FF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FAFF"
    "\U0001FB00-\U0001FBFF"
    "\u2600-\u26FF"
    "\u2700-\u27BF"
    "]"
)
LUCIDE_TAG = re.compile(r"<i\b[^>]*\bdata-lucide\b", re.I)
TITLE = re.compile(r"<title\b[^>]*>(.*?)</title\s*>", re.I | re.S)


def embed_block(template_html):
    """雛形からページに貼る一式を切り出す（check-deck の embedBlock と同じ）。"""
    if not template_html:
        return ""
    after_note = html_after_comment(template_html)
    start = template_html.find("<style", after_note)
    end = template_html.rfind("</script>")
    if start < 0 or end < start:
        return ""
    return template_html[start : end + len("</script>")]


def _sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_compat(template_path):
    """The compatibility list beside the template. A missing or broken list recognises nothing."""
    path = os.path.join(os.path.dirname(template_path or ""), COMPAT_NAME)
    try:
        value = json.loads(read_text(path))
        return {"navigation": set(value["navigation"]), "design": set(value["design"])}
    except (OSError, ValueError, KeyError, TypeError):
        return {"navigation": set(), "design": set()}


def navigation_span(html):
    """(start, end) of the stock navigation script, found the way src/widget/deck/preview.ts finds it."""
    for matched in SCRIPT_OR_COMMENT.finditer(html):
        text = matched.group(0)
        if text.startswith("<script>") and "var WIDTH = 1280;" in text and "data-deck-ready" in text:
            at = text.rfind("<script>")
            return matched.start() + at, matched.end()
    return None


def navigation_style_span(html, script_start):
    """The stock style directly before the script. The template always pastes the two together."""
    close = html.rfind("</style>", 0, script_start)
    if close < 0 or html[close + len("</style>") : script_start].strip():
        return None
    start = html.rfind("<style>", 0, close)
    if start < 0:
        return None
    block = html[start : close + len("</style>")]
    if "--deck-k" not in block or "data-deck-frame" not in block or "<style" in block[1:]:
        return None
    return start, close + len("</style>")


def has_known_runtime(html, compat):
    """A stock navigation runtime, and the design runtime if the deck has one, are both listed."""
    script = navigation_span(html)
    if script is None or navigation_style_span(html, script[0]) is None:
        return False
    if _sha256(html[script[0] : script[1]]) not in compat["navigation"]:
        return False
    design = DESIGN_RUNTIME_BLOCK.search(html)
    return design is None or _sha256(design.group(0)) in compat["design"]


def upgrade_runtime(html, template_html, design_html, compat):
    """Swap listed stock runtimes for the current ones in a copy. Returns (html, replaced names).

    Only design version 3 moves, as in src/widget/deck/preview.ts: older settings are not guaranteed
    to mean the same to the current design runtime, so those decks keep what they were written with.
    """
    edits = []
    replaced = []
    embed = embed_block(template_html)
    script = navigation_span(html)
    if embed and script is not None and _sha256(html[script[0] : script[1]]) in compat["navigation"]:
        style = navigation_style_span(html, script[0])
        if style is not None and html[style[0] : script[1]] != embed:
            edits.append((style[0], script[1], embed))
            replaced.append("navigation")
    runtime = DESIGN_RUNTIME_BLOCK.search(html)
    style = DESIGN_STYLE_BLOCK.search(html)
    next_runtime = DESIGN_RUNTIME_BLOCK.search(design_html or "")
    next_style = DESIGN_STYLE_BLOCK.search(design_html or "")
    if (
        runtime is not None
        and style is not None
        and next_runtime is not None
        and next_style is not None
        and 'data-deck-design-runtime="3"' in runtime.group(0).split(">", 1)[0]
        and 'data-deck-design-style="3"' in style.group(0).split(">", 1)[0]
        and _sha256(runtime.group(0)) in compat["design"]
    ):
        if runtime.group(0) != next_runtime.group(0) or style.group(0) != next_style.group(0):
            edits.append((runtime.start(), runtime.end(), next_runtime.group(0)))
            edits.append((style.start(), style.end(), next_style.group(0)))
            replaced.append("design")
    for start, end, value in sorted(edits, reverse=True):
        html = html[:start] + value + html[end:]
    return html, replaced


def html_after_comment(html):
    at = html.find("-->")
    if at < 0:
        return 0
    return at + 3


def read_text(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def title_of(html):
    matched = TITLE.search(html)
    if matched is None:
        return ""
    return re.sub(r"<[^>]+>", "", matched.group(1)).strip()


def _finding(code, detail, line=1):
    return {
        "code": code,
        "severity": codes.ERROR,
        "line": line,
        "detail": detail,
        "default": "",
    }


def _has_attr(attrs, name):
    for key, _value in attrs:
        if key == name:
            return True
    return False


def _attr(attrs, name):
    for key, value in attrs:
        if key == name:
            return value
    return None


def _allowed_data_script(attrs):
    """Only inert, schema-checked format data may live inside a slide."""
    if (_attr(attrs, "type") or "").lower() != "application/json":
        return False
    if _has_attr(attrs, "src"):
        return False
    marks = [name for name in ("data-dd-chart-source", "data-dd-native-source") if _has_attr(attrs, name)]
    if len(marks) != 1:
        return False
    return set(key for key, _value in attrs) <= {"type", marks[0]}


class DeckParser(HTMLParser):
    """構造だけ見る。実行部の中身は見ない。"""

    def __init__(self):
        HTMLParser.__init__(self)
        self.stack = []
        self.has_body_deck = False
        self.main_is_body_direct = False
        self.slide_count = 0
        self.nested_slide = False
        self.notes_not_last = False
        self.notes_has_element = False
        self.script_in_main = False
        self.lucide_in_main = False
        self._slide_depth = 0
        self._in_main = 0
        self._in_aside = 0
        self._slide_children = []
        self._section_is_slide = []

    def handle_starttag(self, tag, attrs):
        parent = self.stack[-1] if self.stack else None
        if tag == "body" and _has_attr(attrs, "data-deck"):
            self.has_body_deck = True
        if tag == "main" and _has_attr(attrs, "data-deck-slides"):
            if parent == "body":
                self.main_is_body_direct = True
            self._in_main += 1
        if tag == "section":
            is_slide = _has_attr(attrs, "data-deck-slide")
            self._section_is_slide.append(is_slide)
            if is_slide:
                if self._slide_depth > 0:
                    self.nested_slide = True
                self._slide_depth += 1
                self.slide_count += 1
                self._slide_children.append([])
        elif self._slide_depth > 0 and self._in_aside == 0 and self._section_is_slide and self._section_is_slide[-1]:
            is_notes = tag == "aside" and _has_attr(attrs, "data-deck-notes")
            if self._slide_children:
                self._slide_children[-1].append((tag, is_notes))
        if tag == "aside" and _has_attr(attrs, "data-deck-notes"):
            self._in_aside += 1
        elif self._in_aside > 0:
            self.notes_has_element = True
        if self._in_main > 0 and tag == "script" and not _allowed_data_script(attrs):
            self.script_in_main = True
        if self._in_main > 0 and _has_attr(attrs, "data-lucide"):
            self.lucide_in_main = True
        self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag == "aside" and self._in_aside > 0:
            self._in_aside -= 1
        if tag == "section" and self._section_is_slide:
            was_slide = self._section_is_slide.pop()
            if was_slide:
                children = self._slide_children.pop() if self._slide_children else []
                notes = [item for item in children if item[1]]
                if notes:
                    last = children[-1] if children else None
                    if last is None or not last[1]:
                        self.notes_not_last = True
                if self._slide_depth > 0:
                    self._slide_depth -= 1
        if tag == "main" and self._in_main > 0:
            self._in_main -= 1
        if self.stack:
            if tag in self.stack:
                while self.stack:
                    popped = self.stack.pop()
                    if popped == tag:
                        break
            else:
                self.stack.pop()

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)


def shared_embed_block(template_html):
    """Cut the exact style/script payload from a Pages-owned companion template."""
    if not template_html:
        return ""
    after_note = html_after_comment(template_html)
    starts = [at for at in (template_html.find("<style", after_note), template_html.find("<script", after_note)) if at >= 0]
    if not starts:
        return ""
    start = min(starts)
    end = max(template_html.rfind("</style>"), template_html.rfind("</script>"))
    if end < start:
        return ""
    close = "</script>" if template_html.startswith("</script>", end) else "</style>"
    return template_html[start : end + len(close)]


def _author_css(html, embed, shared_blocks=()):
    """Styles the author wrote. Runtimes are not slide content, known or not.

    Everything after </main> is the runtime, and the stock style is recognised before it too:
    a deck may paste the runtime ahead of its slides. The design style is marked wherever it sits.
    Scripts go first: a runtime may spell "<style" inside its strings.
    """
    rest = html.replace(embed, "", 1) if embed else html
    for shared in shared_blocks:
        if shared:
            rest = rest.replace(shared, "", 1)
    script = navigation_span(rest)
    style = navigation_style_span(rest, script[0]) if script else None
    if style:
        rest = rest[: style[0]] + rest[style[1] :]
    after_main = rest.lower().find("</main>")
    if after_main >= 0:
        rest = rest[:after_main]
    rest = DESIGN_STYLE_BLOCK.sub("", SCRIPT_BLOCK.sub("", rest))
    blocks = STYLE_BLOCK.findall(rest)
    return "\n".join(CSS_COMMENT.sub("", block) for block in blocks)


def _line_of(html, needle):
    at = html.find(needle)
    if at < 0:
        return 1
    return html.count("\n", 0, at) + 1


def _unlisted_design(html, compat, shared_blocks):
    design = DESIGN_RUNTIME_BLOCK.search(html)
    if design is None or _sha256(design.group(0)) in compat["design"]:
        return False
    return not any(shared and design.group(0) in shared for shared in shared_blocks)


def check_html(html, template_html, shared_blocks=(), compat=None):
    """(findings, title) を返す。"""
    compat = compat or {"navigation": set(), "design": set()}
    findings = []

    if has_source_note(html):
        findings.append(_finding("HAS_SOURCE_NOTE", codes.describe("HAS_SOURCE_NOTE"), _line_of(html, "data-source-note")))

    if BASE_TAG.search(html):
        findings.append(_finding("HAS_BASE", codes.describe("HAS_BASE"), _line_of(html, "<base")))

    embed = embed_block(template_html)
    if not embed:
        findings.append(
            _finding(
                "TEMPLATE_MISSING",
                "実行部の雛形が読めません。投稿コマンド一式を先に用意してください",
            )
        )
    elif (embed not in html or _unlisted_design(html, compat, shared_blocks)) and not has_known_runtime(html, compat):
        after_main = html.lower().find("</main>")
        has_runtime = navigation_span(html) is not None or DESIGN_RUNTIME_BLOCK.search(html) is not None or (
            after_main >= 0 and ("<style" in html[after_main:].lower() or "<script" in html[after_main:].lower())
        )
        code = "TEMPLATE_MISMATCH" if has_runtime else "TEMPLATE_MISSING"
        findings.append(_finding(code, codes.describe(code)))

    parsed = DeckParser()
    try:
        parsed.feed(html)
        parsed.close()
    except Exception as err:
        findings.append(_finding("UNREADABLE", "HTML が読めません: %s" % err))
        return findings, title_of(html)

    if not parsed.has_body_deck:
        findings.append(_finding("NO_BODY_DECK", codes.describe("NO_BODY_DECK"), _line_of(html, "<body")))
    if not parsed.main_is_body_direct:
        findings.append(_finding("MAIN_NOT_DIRECT", codes.describe("MAIN_NOT_DIRECT"), _line_of(html, "<main")))
    if parsed.slide_count < 1:
        findings.append(_finding("NO_SLIDES", codes.describe("NO_SLIDES")))
    if parsed.nested_slide:
        findings.append(_finding("NESTED_SLIDE", codes.describe("NESTED_SLIDE")))
    if parsed.notes_not_last:
        findings.append(_finding("NOTES_NOT_LAST", codes.describe("NOTES_NOT_LAST")))
    if parsed.notes_has_element:
        findings.append(_finding("NOTES_HAS_ELEMENT", codes.describe("NOTES_HAS_ELEMENT")))
    if parsed.script_in_main:
        findings.append(_finding("SCRIPT_IN_MAIN", codes.describe("SCRIPT_IN_MAIN")))
    if parsed.lucide_in_main:
        findings.append(_finding("LUCIDE_TAG", codes.describe("LUCIDE_TAG"), _line_of(html, "data-lucide")))

    css = _author_css(html, embed, shared_blocks)
    sizes = [float(value) for value in FONT_SIZE.findall(css)]
    if sizes and min(sizes) < MIN_FONT_PX:
        findings.append(
            _finding(
                "FONT_TOO_SMALL",
                "枚の字が %spx です。20px 以上にしてください" % ("{:g}".format(min(sizes))),
            )
        )
    if VIEWPORT.search(css):
        findings.append(_finding("USES_VIEWPORT_UNITS", codes.describe("USES_VIEWPORT_UNITS")))
    if FIXED.search(css):
        findings.append(_finding("USES_FIXED", codes.describe("USES_FIXED")))
    stripped_css = ADS_DECL.sub("", css)
    if RAW_COLOR.search(stripped_css):
        findings.append(_finding("RAW_COLOR", codes.describe("RAW_COLOR")))

    main_html = MAIN_BLOCK.search(html)
    main_text = main_html.group(0) if main_html else ""
    if EMOJI.search(main_text):
        findings.append(_finding("EMOJI", codes.describe("EMOJI")))
    if LUCIDE_TAG.search(main_text):
        if not parsed.lucide_in_main:
            findings.append(_finding("LUCIDE_TAG", codes.describe("LUCIDE_TAG")))

    return findings, title_of(html)


def apply_embed_placeholder(html, embed):
    if PLACEHOLDER in html:
        return html.replace(PLACEHOLDER, embed, 1)
    return html


def default_template_path():
    from . import kit
    return str(kit.resolve() / "src" / "templates" / "deck.html")


def check_file(path, template_path=None, commit=None):
    """ファイルを読んで検査する。template_path が無ければ このリポジトリの雛形。"""
    from . import provenance as provenance_mod

    if not os.path.isfile(path):
        return {
            "ok": False,
            "source": path,
            "title": "",
            "findings": [_finding("UNREADABLE", "原本がありません: %s" % path)],
            "summary": {codes.ERROR: 1},
        }

    html = read_text(path)
    template_path = template_path or default_template_path()
    if template_path and os.path.isfile(template_path):
        template_html = read_text(template_path)
    else:
        template_html = ""

    embed = embed_block(template_html)
    html = apply_embed_placeholder(html, embed)
    companion_blocks = []
    template_dir = os.path.dirname(template_path)
    for name in COMPANION_NAMES:
        companion_path = os.path.join(template_dir, name)
        if os.path.isfile(companion_path):
            companion_blocks.append(shared_embed_block(read_text(companion_path)))
    findings, title = check_html(html, template_html, companion_blocks, load_compat(template_path))

    # 新形式の設定は Pages 側の共通の検査を呼ぶ。型・範囲・目印を Python に書き写さない。
    if "data-deck-design" in html:
        # 雛形は <リポジトリ>/src/templates/ にあり、検査はリポジトリ直下の bin/ にある
        checker = os.path.join(os.path.dirname(template_path), "..", "..", "bin", "deck-design-check.mjs")
        try:
            checked = subprocess.run(["node", checker, os.path.abspath(path)], capture_output=True, text=True, timeout=30, check=False)
            result = json.loads(checked.stdout)
            if checked.returncode != 0 or result.get("ok") is not True:
                findings.append(_finding("DESIGN_INVALID", result.get("message") or "デザイン設定を確認してください"))
        except (OSError, subprocess.SubprocessError, ValueError):
            findings.append(_finding("DESIGN_INVALID", "スライドのデザイン検査を用意できません。投稿コマンド一式を最新にしてから確認してください"))

    if commit:
        matched = provenance_mod.matches_commit(path, commit)
        if matched is False:
            findings.append(_finding("COMMIT_MISMATCH", codes.describe("COMMIT_MISMATCH")))
        elif matched is None:
            findings.append(
                _finding(
                    "COMMIT_MISMATCH",
                    "依頼のコミットと照合できませんでした（git が使えないか、そのパスがありません）",
                )
            )

    errors = [item for item in findings if item["severity"] == codes.ERROR]
    return {
        "ok": len(errors) == 0,
        "source": path,
        "title": title,
        "findings": findings,
        "summary": {codes.ERROR: len(errors)},
    }
