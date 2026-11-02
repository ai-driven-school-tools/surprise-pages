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

# Previously shipped runtimes remain valid only as exact blocks. Republishing an
# authored file must not require replacing its runtime or rewriting its source.
KNOWN_LEGACY_RUNTIME_SHA256 = {
    # Font geometry remeasurement, before native video key handling.
    "feaf9a6f34b0f3b32eab1fdb0a5a11cf8a2611325ae8957da13d3357374f613e",
    # Named slide links, before font-driven geometry remeasurement.
    "aa80cec2a19f6dbb340a9b52128f73549519c29d2061b8db417d901eec86953f",
    # Step controls and stable paper spacing, before named slide links.
    "8bea229e5e14799418cc2f3c2350f5e03aa451ac485b2077e41baf8dd86999bb",
    # Before guided focus.
    "2038e00f3ae44ce5afd6a4aa859b1a85201f3b0d41310553623265917b6652b5",
    # Guided focus before the overview/step controls and flow redesign.
    "99ae27bdf76c441a305913e79b3991b00cf1ebb203b2b2ef5681748d0e5250e8",
}

FONT_SIZE = re.compile(r"font-size:\s*(\d+(?:\.\d+)?)px", re.I)
VIEWPORT = re.compile(r"\d(?:vw|vh|dvh|svh|lvh)\b", re.I)
FIXED = re.compile(r"position:\s*(?:fixed|sticky)\b", re.I)
ADS_DECL = re.compile(r"--ads-[a-z0-9-]+:\s*[\d ]+;")
RAW_COLOR = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d")
BASE_TAG = re.compile(r"<base\s", re.I)
STYLE_BLOCK = re.compile(r"<style\b[^>]*>(.*?)</style\s*>", re.I | re.S)
CSS_COMMENT = re.compile(r"/\*.*?\*/", re.S)
MAIN_BLOCK = re.compile(r"<main\b[^>]*>.*?</main\s*>", re.I | re.S)
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


def embedded_runtime_block(html):
    """Cut only the deck runtime around its unique function name, ignoring author styles."""
    signature = "(function deck()"
    signature_at = html.find(signature)
    if signature_at < 0:
        return ""
    script_at = html.rfind("<script", 0, signature_at)
    style_at = html.rfind("<style", 0, script_at)
    end = html.find("</script>", signature_at)
    if script_at < 0 or style_at < 0 or end < signature_at:
        return ""
    return html[style_at : end + len("</script>")]


def has_known_legacy_runtime(html):
    runtime = embedded_runtime_block(html)
    if not runtime:
        return False
    digest = hashlib.sha256(runtime.encode("utf-8")).hexdigest()
    return digest in KNOWN_LEGACY_RUNTIME_SHA256


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
    rest = html.replace(embed, "", 1) if embed else html
    if has_known_legacy_runtime(rest):
        rest = rest.replace(embedded_runtime_block(rest), "", 1)
    for shared in shared_blocks:
        if shared:
            rest = rest.replace(shared, "", 1)
    blocks = STYLE_BLOCK.findall(rest)
    return "\n".join(CSS_COMMENT.sub("", block) for block in blocks)


def _line_of(html, needle):
    at = html.find(needle)
    if at < 0:
        return 1
    return html.count("\n", 0, at) + 1


def check_html(html, template_html, shared_blocks=()):
    """(findings, title) を返す。"""
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
    elif embed not in html and not has_known_legacy_runtime(html):
        after_main = html.lower().find("</main>")
        has_runtime = after_main >= 0 and ("<style" in html[after_main:].lower() or "<script" in html[after_main:].lower())
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
    for name in ("deck-design.html", "mermaid.html"):
        companion_path = os.path.join(template_dir, name)
        if os.path.isfile(companion_path):
            companion_blocks.append(shared_embed_block(read_text(companion_path)))
    findings, title = check_html(html, template_html, companion_blocks)

    # 新形式の設定は Pages 側の共通の検査を呼ぶ。型・範囲・目印を Python に書き写さない。
    if "data-deck-design" in html:
        checker = os.path.join(os.path.dirname(template_path), "..", "bin", "deck-design-check.mjs")
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
