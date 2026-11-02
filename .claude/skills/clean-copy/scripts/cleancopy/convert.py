# -*- coding: utf-8 -*-
"""マークダウンを、額縁に差し込む本文の HTML に組み直す。

**ここが変換表の正本。** 手引きには表を書き写さない（写した瞬間に、どちらかが古くなる）。
人が表を読みたいときは `run.py mapping` を打つと、下の `STYLE` から作った一覧が出る。

組み立ての順番に 1 つだけ約束がある。**囲み（コードフェンス）を最初に退避する。**
図（```mermaid）の中には `-->` や `  actor 書く人` のような行が並んでいて、
先に退避しないと段落や箇条書きの処理に巻き込まれ、図が「読めない空の四角」で出る。
退避 → 残りを組む → 戻す、の順を崩さない。

台帳（Ledger）も同じくらい大事。**原本にあって HTML に出さなかった文字**（リンクの行き先・
表の区切り行・囲みの種類名・生タグそのもの）を 1 つずつ控える。照合はこの控えを引き算して
突き合わせるので、控え漏れは「要約した」と同じ見え方で赤くなる。控えを水増しすれば検査は
ゆるくなるが、照合側が「控えは原本の中に本当にある文字列か」を毎回確かめている。
"""

import collections
import hashlib
import html as html_module
import json
import os
import re

from . import codes
from . import provenance as provenance_mod
from .source import (
    HEADING,
    count_chars,
    find_fences,
    find_headings,
    is_delim_row,
    is_table_row,
    split_cells,
    split_lines,
    split_quote_prefix,
    heading_slug,
)

# --------------------------------------------------------------- 変換表（正本）

#: 出力に使うクラス。`デザイン規則.md` の目盛りの中だけで組む。ここに無い値を発明しない。
#:
#: 地の文（p・箇条書き）に色を書かない。濃さは額縁の body が持つ（デザイン規則の「地の文に
#: 色を書かない」）。薄くするのは注記・出典・補足だけ。見出しは上の余白を自分で持つ
#: （下より上を広く取るのが、見出しが「次のまとまりの頭」に見える条件）。
STYLE = {
    "h1": "text-3xl md:text-4xl font-black text-ads-text tracking-tight mb-10",
    "h2": "text-xl md:text-2xl font-bold text-ads-text mb-6",
    "h3": "text-lg font-bold text-ads-text mt-10 mb-3",
    "h4": "text-base font-bold text-ads-text mt-8 mb-2",
    "section": "mb-20 md:mb-24",
    "p": "mb-6",
    "note": "text-sm text-ads-muted mb-6",
    "strong": "font-bold text-ads-text",
    "em": "not-italic font-bold text-ads-muted",
    "ul": "list-disc pl-5 marker:text-ads-line space-y-2 mb-6",
    "ol": "list-decimal pl-5 marker:text-ads-line space-y-2 mb-6",
    "task_ul": "space-y-2 mb-6",
    "task_icon": "w-4 h-4 text-ads-line",
    "table": "w-full text-sm border-collapse mb-6",
    "th": "border border-ads-border px-3 py-2 text-ads-muted font-bold text-left",
    "td": "border border-ads-border px-3 py-2",
    "quote_box": "bg-ads-surface rounded-2xl p-8 md:p-10 mb-6",
    "quote_short": "inline-block text-left text-lg md:text-xl font-bold text-ads-text",
    "quote_long": "text-sm text-ads-muted space-y-4",
    "pre": "bg-ads-surface rounded-xl p-5 overflow-x-auto mb-6",
    "code_block": "font-mono text-sm text-ads-text",
    "code_inline": "font-mono text-sm bg-ads-bg border border-ads-border rounded px-1.5 py-0.5 text-ads-text",
    "img": "w-full rounded-xl border border-ads-border mb-6",
    "sup": "text-xs text-ads-muted",
    "footnote": "text-xs text-ads-muted mb-6",
    "source_note": "text-xs text-ads-muted mt-20",
}

#: 表示形式。既定と講義原稿（manuscript）は同じ変換表。台本（script）だけ差分を持つ。
#:
#: 台本は「1 行 1 息」で書かれた原稿（読む行が 1 つずつ段落になっている）。
#:   ・読む行 … 濃い字（text-ads-text）で、行と行の間は段落ほど空けない
#:   ・※ の注記 … 編集や撮影への指示なので、読む行より小さく薄く。字下げはしない（※ 自体が印）
#:   ・見出しに密着した段落（空行を挟まず続く段落）… 状態・尺などの添え書き。小さく薄く
#:   ・原本の改行をそのまま出す（whitespace-pre-line）。1 行 1 息の形を崩さない
LAYOUTS = ("default", "manuscript", "script")
STYLES = {
    "default": STYLE,
    "manuscript": STYLE,
    "script": dict(
        STYLE,
        h2="text-2xl md:text-3xl font-bold text-ads-text mb-6",
        h3="text-lg md:text-xl font-bold text-ads-text mt-12 mb-3",
        p="text-ads-text whitespace-pre-line mb-3",
        note="text-sm text-ads-muted whitespace-pre-line mb-5",
        attached="text-sm text-ads-muted whitespace-pre-line tabular-nums mb-10",
    ),
}

#: 注記の印。日本語の文書で、段落の頭に置かれたこの字は「本文ではなく注」を意味する
NOTE_MARK = "※"

#: 始め括弧。段落の頭に来たら半字ぶら下げ、字の縦の線をそろえる（日本語組版の慣習）
HANGING_OPENERS = "「『（【〈《〔［"

#: `run.py mapping` が出す一覧。左が原本の書き方、右が出るもの。
MAPPING = [
    ("# 見出し", "本文の先頭の h1（`%s`）と、額縁のタイトル枠の両方" % STYLE["h1"]),
    ("## 見出し", "h2（`%s`）。節ごと `%s` の器に入れて間を空ける" % (STYLE["h2"], STYLE["section"])),
    ("### 見出し", "h3（`%s`）" % STYLE["h3"]),
    ("#### 以下の見出し", "h4（`%s`）に潰す。目盛りの外に段を作らない" % STYLE["h4"]),
    ("段落", "p（`%s`）。色は書かない（濃さは額縁の body が持つ）" % STYLE["p"]),
    ("※ で始まる段落", "注記（`%s`）。小さく薄く。字は 1 文字も変えない" % STYLE["note"]),
    ("「 （ などで始まる段落", "始め括弧を半字ぶら下げる印（data-clean-copy-hang）を付ける。字は変えない"),
    ("**強い強調**", "strong（`%s`）。色は付けない" % STYLE["strong"]),
    ("太字だけの 1 行", "**見出しに昇格させない。** 段落の中の strong として出す"),
    ("*弱い強調*", "em（`%s`）。日本語に斜体は効かないので濃さで出す" % STYLE["em"]),
    ("- の箇条書き", "ul（`%s`）" % STYLE["ul"]),
    ("1. の箇条書き", "ol（`%s`）" % STYLE["ol"]),
    ("- [ ] / - [x]", "Lucide の square / check（`%s`）を行頭に置く。文字は消さない" % STYLE["task_icon"]),
    ("表", "table（`%s`）＋ th/td に `%s`。外枠ありの格子で、行数によらず縦横とも引く" % (STYLE["table"], STYLE["td"])),
    ("> 引用（短い一句）", "面を敷いた箱ごと中央、中の字は左揃え（`%s`）" % STYLE["quote_short"]),
    ("> 引用（1 文より長い）", "同じ面で全幅・左揃え（`%s`）" % STYLE["quote_long"]),
    ("``` のコード", "pre + code（`%s` / `%s`）。色を振らない" % (STYLE["pre"], STYLE["code_block"])),
    ("```mermaid", "図として `<pre class=\"mermaid\">` に移し、貼る一式を </head> の直前に足す"),
    ("`インラインコード`", "code（`%s`）" % STYLE["code_inline"]),
    ("[text](url)", "a（額縁が色と下線を持つので class を足さない）"),
    ("<https://…>", "自動リンク。a にして、山括弧 2 文字だけ控える"),
    ("--- の水平線", "捨てて余白に落とす"),
    ("![](path)", "img（`%s`）。同じフォルダに置いて相対パスで参照する" % STYLE["img"]),
    ("脚注 [^1]", "本文側は sup（`%s`）、注記はその場に `%s`" % (STYLE["sup"], STYLE["footnote"])),
    ("生の HTML", "そのまま通す。style / script / 外部読み込み / 焼き込んだ色は落として報告する"),
    (
        "--layout script（台本）",
        "読む行は `%s`。※ の注記は `%s`。見出しに空行を挟まず続く段落（状態・尺の添え書き）は `%s`。原本の改行をそのまま出す"
        % (STYLES["script"]["p"], STYLES["script"]["note"], STYLES["script"]["attached"]),
    ),
]

# ------------------------------------------------------------------- 下ごしらえ

PLACEHOLDER = re.compile(r"^\x00F(\d+)\x00$")
UL_ITEM = re.compile(r"^([ \t]*)([-*+])[ \t]+(.*)$")
OL_ITEM = re.compile(r"^([ \t]*)(\d+)([.)])[ \t]+(.*)$")
TASK_MARK = re.compile(r"^\[([ xX])\][ \t]+(.*)$")
HR = re.compile(r"^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$")
#: `<https://…>` の自動リンクは生 HTML の塊ではない（先に読むと丸ごと「タグ」になって消える）
HTML_BLOCK_START = re.compile(r"^ {0,3}<(?!(?:https?|mailto):)(?:[a-zA-Z!/])")
FOOTNOTE_DEF = re.compile(r"^ {0,3}\[\^([^\]]+)\]:[ \t]*(.*)$")
ANY_TAG = re.compile(r"<[^>]*>", re.DOTALL)
STYLE_BLOCK = re.compile(r"<style\b[^>]*>.*?</style\s*>", re.I | re.S)
SCRIPT_BLOCK = re.compile(r"<script\b[^>]*>.*?</script\s*>", re.I | re.S)
STYLE_ATTR = re.compile(r"""\s+style\s*=\s*(["'])(.*?)\1""", re.S)
CLASS_ATTR = re.compile(r"""(\s+class\s*=\s*)(["'])(.*?)\2""", re.S)

#: 行の中の並び。**`code` を強調より前に置く。** 後ろに置くと、コード片をまたいだ
#: `**強い強調**` を拾えず、`**` が字のまま残る（実際の社内文書で起きた）。
#: 逆に前に置けば、コード片の中の `**` は強調として読まれない（両方とも CommonMark と同じ）。
INLINE_TOKEN = re.compile(
    r"(?P<esc>\\[\\`*_{}\[\]()#+\-.!|<>~])"
    r"|(?P<code>(?P<ticks>`+)(?P<ctext>.+?)(?P=ticks))"
    r"|(?P<image>!\[(?P<alt>[^\]]*)\]\((?P<isrc>[^)\s]+)(?:[ \t]+\"[^\"]*\")?\))"
    r"|(?P<fnref>\[\^(?P<fnid>[^\]]+)\])"
    r"|(?P<link>\[(?P<ltext>[^\]]*)\](?P<lparen>\((?P<lhref>[^)\s]*)(?:[ \t]+\"[^\"]*\")?\)))"
    r"|(?P<strong>\*\*(?P<stext>.+?)\*\*)"
    r"|(?P<em>\*(?P<etext>[^*\n]+?)\*)"
    r"|(?P<comment><!--.*?-->)"
    r"|(?P<auto><(?P<ahref>(?:https?|mailto):[^\s<>]+)>)"
    r"|(?P<tag></?[a-zA-Z][^<>]*>)",
    re.DOTALL,
)


class ConvertError(Exception):
    """変換を続けられないときだけ投げる。"""


def esc(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def esc_attr(text):
    return esc(text).replace('"', "&quot;")


def indent_of(line):
    width = 0
    for char in line:
        if char == " ":
            width += 1
        elif char == "\t":
            width += 4
        else:
            break
    return width


class Ledger(object):
    """原本と HTML の食い違いのうち、**変換が意図して作ったもの**の控え。"""

    def __init__(self):
        self.layout = "default"
        self.heading_prefix = None
        self.heading_ids = set()
        self.removed = []  # 原本にあって HTML に出さなかった文字列
        self.added = []  # 原本に無いのに HTML に出した文字列
        self.notes = []  # 完了報告に載せる気づき

    def drop(self, text):
        if text:
            self.removed.append(text)

    def add(self, text):
        if text:
            self.added.append(text)

    def note(self, code, detail):
        self.notes.append({"code": code, "severity": codes.severity(code), "detail": detail})

    def style(self, key):
        """いまの表示形式の変換表を引く。無い名前は発明しない（KeyError で止める）。"""
        return STYLES[self.layout][key]


# ------------------------------------------------------------- 生 HTML の後始末


def _scrub_raw_html(text, ledger):
    """生 HTML から、落とす決まりのものを外す。

    **原本に書かれたタグは、残すものも落とすものも 1 回だけ控える。** 照合の 1 本目は
    HTML からタグを剥がしてから数えるので、通したタグも「字としては消える」ため。
    控えを 2 回積むと、そのぶん原本が短く見積もられて、要約を見逃す側に倒れる。
    """
    for match in STYLE_BLOCK.finditer(text):
        ledger.drop(match.group(0))
        ledger.note("RAW_STYLE", "落としました: %s" % _shorten(match.group(0)))
    text = STYLE_BLOCK.sub("", text)
    for match in SCRIPT_BLOCK.finditer(text):
        ledger.drop(match.group(0))
        ledger.note("RAW_SCRIPT", "落としました: %s" % _shorten(match.group(0)))
    text = SCRIPT_BLOCK.sub("", text)

    def _tag(match):
        tag = match.group(0)
        ledger.drop(tag)
        name_match = re.match(r"</?([a-zA-Z][a-zA-Z0-9-]*)", tag)
        name = name_match.group(1).lower() if name_match else ""
        if name in ("style", "script"):
            ledger.note("RAW_%s" % name.upper(), "落としました: %s" % _shorten(tag))
            return ""
        if name in codes.EXTERNAL_TAGS and re.search(
            r"""\b(?:src|href|data|srcset)\s*=\s*["']?\s*(?:https?:)?//""", tag, re.I
        ):
            ledger.note("RAW_EXTERNAL", "落としました: %s" % _shorten(tag))
            return ""
        cleaned = tag
        for attr in STYLE_ATTR.finditer(tag):
            if re.search(
                r"(?:^|[;\s])(?:color|background|background-color|fill|stroke|border-color)\s*:",
                attr.group(2),
                re.I,
            ):
                cleaned = cleaned.replace(attr.group(0), "")
                ledger.note("RAW_COLOR", "色の指定を落としました: %s" % _shorten(attr.group(0).strip()))
        class_match = CLASS_ATTR.search(cleaned)
        if class_match:
            kept = [word for word in class_match.group(3).split() if not _RAW_COLOR_CLASS.match(word)]
            dropped = [word for word in class_match.group(3).split() if _RAW_COLOR_CLASS.match(word)]
            if dropped:
                ledger.note("RAW_COLOR", "生の色名クラスを落としました: %s" % " ".join(dropped))
                replacement = "%s%s%s%s" % (
                    class_match.group(1),
                    class_match.group(2),
                    " ".join(kept),
                    class_match.group(2),
                )
                cleaned = cleaned.replace(class_match.group(0), replacement)
        return cleaned

    return ANY_TAG.sub(_tag, text)


_RAW_COLOR_CLASS = re.compile(
    r"^(?:bg|text|border|fill|stroke|from|to|via|ring|divide)"
    r"-(?:slate|gray|zinc|neutral|stone|white|black|blue|indigo|violet|purple|emerald|green|red|rose|"
    r"amber|orange|yellow|teal|cyan|sky|pink|fuchsia|lime)(?:-\d+)?(?:/\d+)?$"
)


def _shorten(text, width=60):
    flat = " ".join(text.split())
    return flat if len(flat) <= width else flat[: width - 1] + "…"


# ----------------------------------------------------------------- 行の中の変換


def _inline(text, ledger):
    """1 かたまりの文を HTML に直す。囲み（コードフェンス）はすでに退避済み。"""
    out = []
    cursor = 0
    for match in INLINE_TOKEN.finditer(text):
        out.append(esc(text[cursor : match.start()]))
        cursor = match.end()
        if match.group("esc"):
            out.append(esc(match.group("esc")[1]))
            ledger.drop("\\")
        elif match.group("code"):
            body = match.group("ctext")
            if body.startswith(" ") and body.endswith(" ") and body.strip():
                body = body[1:-1]
            out.append('<code class="%s">%s</code>' % (ledger.style("code_inline"), esc(body)))
        elif match.group("image"):
            src = match.group("isrc")
            alt = match.group("alt")
            ledger.drop(match.group("image"))
            out.append(
                '<img src="%s" alt="%s" class="%s">' % (esc_attr(src), esc_attr(alt), ledger.style("img"))
            )
        elif match.group("fnref"):
            ledger.drop("^")
            out.append('<sup class="%s">%s</sup>' % (ledger.style("sup"), esc(match.group("fnid"))))
        elif match.group("link"):
            ledger.drop(match.group("lparen"))
            inner = _inline(match.group("ltext"), ledger)
            out.append('<a href="%s">%s</a>' % (esc_attr(match.group("lhref")), inner))
        elif match.group("strong"):
            out.append(
                '<strong class="%s">%s</strong>'
                % (ledger.style("strong"), _inline(match.group("stext"), ledger))
            )
        elif match.group("em"):
            out.append(
                '<em class="%s">%s</em>' % (ledger.style("em"), _inline(match.group("etext"), ledger))
            )
        elif match.group("comment"):
            ledger.drop(match.group("comment"))
        elif match.group("auto"):
            # 山括弧だけ落とし、行き先の文字はそのまま見せる（メールは mailto: を見せない）
            href = match.group("ahref")
            ledger.drop("<")
            ledger.drop(">")
            shown = href
            if href.startswith("mailto:"):
                shown = href[len("mailto:"):]
                ledger.drop("mailto:")
            out.append('<a href="%s">%s</a>' % (esc_attr(href), esc(shown)))
        elif match.group("tag"):
            out.append(_scrub_raw_html(match.group("tag"), ledger))
        else:  # pragma: no cover - 上で全部拾っている
            out.append(esc(match.group(0)))
    out.append(esc(text[cursor:]))
    return "".join(out)


# ------------------------------------------------------------------- かたまり分け


def _extract_fences(lines, ledger):
    """囲みを先に退避して、置き換えの目印だけ残す。"""
    fences = find_fences(lines)
    if not fences:
        return lines, [], False
    blocks = []
    needs_mermaid = False
    result = []
    cursor = 0
    for fence in fences:
        result.extend(lines[cursor : fence.start])
        last = fence.end if fence.end is not None else len(lines) - 1
        body = "\n".join(fence.lines)
        if fence.info.strip():
            ledger.drop(fence.info.strip())
        if fence.language.lower() == "mermaid":
            needs_mermaid = True
            blocks.append('<pre class="mermaid">\n%s\n</pre>' % esc(body))
        else:
            blocks.append(
                '<pre class="%s"><code class="%s">%s</code></pre>'
                % (ledger.style("pre"), ledger.style("code_block"), esc(body))
            )
        result.append(fence.quote_prefix + "\x00F%d\x00" % (len(blocks) - 1))
        cursor = last + 1
    result.extend(lines[cursor:])
    return result, blocks, needs_mermaid


def _strip_front_matter(lines, ledger):
    """先頭の `---` で囲まれた覚え書きは、本文ではないので落とす。"""
    if not lines or lines[0].strip() != "---":
        return lines
    for index in range(1, len(lines)):
        if lines[index].strip() in ("---", "..."):
            ledger.drop("\n".join(lines[: index + 1]))
            ledger.note("RAW_STYLE", "先頭の覚え書き（--- で囲まれた部分）は本文に出しません")
            return lines[index + 1 :]
    return lines


def _starts_block(lines, index):
    line = lines[index]
    if not line.strip():
        return True
    if PLACEHOLDER.match(line):
        return True
    if HEADING.match(line):
        return True
    if HR.match(line):
        return True
    if split_quote_prefix(line, 1)[0]:
        return True
    if UL_ITEM.match(line) or OL_ITEM.match(line):
        return True
    if HTML_BLOCK_START.match(line):
        return True
    if FOOTNOTE_DEF.match(line):
        return True
    if (
        index + 1 < len(lines)
        and is_table_row(line)
        and not is_delim_row(line)
        and is_delim_row(lines[index + 1])
    ):
        return True
    return False


def _blocks_to_html(lines, blocks, ledger, depth=0):
    """かたまりごとに HTML を作り、(種類, HTML) の並びで返す。"""
    out = []
    index = 0
    #: 見出しの次の行。空行を挟まずに段落が続いたら、その段落は見出しの添え書き
    attach_at = None
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue

        placeholder = PLACEHOLDER.match(line)
        if placeholder:
            out.append(("block", blocks[int(placeholder.group(1))]))
            index += 1
            continue

        heading = HEADING.match(line)
        if heading:
            level = len(heading.group(1))
            text = heading.group(2)
            shown = min(level, 4)
            if level >= 5:
                ledger.note("HEADING_FLATTEN", "%s %s → h4" % ("#" * level, text))
            anchor = ""
            if ledger.heading_prefix is not None:
                root = ledger.heading_prefix + "-" + heading_slug(text)
                candidate = root
                suffix = 0
                while candidate in ledger.heading_ids:
                    suffix += 1
                    candidate = root + "-" + str(suffix)
                ledger.heading_ids.add(candidate)
                anchor = ' id="%s"' % esc_attr(candidate)
            out.append(
                ("h%d" % shown, '<h%d%s class="%s">%s</h%d>' % (shown, anchor, ledger.style("h%d" % shown), _inline(text, ledger), shown))
            )
            index += 1
            attach_at = index
            continue

        if HR.match(line):
            index += 1
            continue

        if split_quote_prefix(line, 1)[0]:
            html, index = _quote(lines, index, blocks, ledger, depth)
            out.append(("block", html))
            continue

        footnote = FOOTNOTE_DEF.match(line)
        if footnote:
            ledger.drop("^")
            ledger.drop(":")
            out.append(
                (
                    "block",
                    '<p class="%s"><sup class="%s">%s</sup> %s</p>'
                    % (
                        ledger.style("footnote"),
                        ledger.style("sup"),
                        esc(footnote.group(1)),
                        _inline(footnote.group(2), ledger),
                    ),
                )
            )
            index += 1
            continue

        if (
            index + 1 < len(lines)
            and is_table_row(line)
            and not is_delim_row(line)
            and is_delim_row(lines[index + 1])
        ):
            html, index = _table(lines, index, ledger)
            out.append(("block", html))
            continue

        if UL_ITEM.match(line) or OL_ITEM.match(line):
            html, index = _list(lines, index, blocks, ledger, depth)
            out.append(("block", html))
            continue

        if HTML_BLOCK_START.match(line):
            html, index = _html_block(lines, index, ledger)
            if html:
                out.append(("block", html))
            continue

        html, index = _paragraph(lines, index, ledger, attached=(index == attach_at))
        if html:
            out.append(("block", html))
    return out


def _paragraph(lines, index, ledger, attached=False):
    """段落。字は 1 文字も変えず、**入れ物の種類だけ**を頭の字と置き場所から決める。

      ・※ で始まる … 注記
      ・見出しに空行を挟まず続く（attached）… 見出しの添え書き（台本だけ。他の形式では普通の段落）
      ・「 などで始まる … 普通の段落に、括弧をぶら下げる印を足す
    """
    collected = [lines[index].strip()]
    cursor = index + 1
    while cursor < len(lines) and not _starts_block(lines, cursor):
        collected.append(lines[cursor].strip())
        cursor += 1
    body = _inline("\n".join(collected), ledger)
    if not body.strip():
        return "", cursor
    head = collected[0]
    attrs = []
    if head.startswith(NOTE_MARK):
        cls = ledger.style("note")
        attrs.append('data-clean-copy-note=""')
    elif attached and ledger.layout == "script":
        cls = ledger.style("attached")
        attrs.append('data-clean-copy-attached=""')
    else:
        cls = ledger.style("p")
    if head[:1] in HANGING_OPENERS:
        attrs.append('data-clean-copy-hang=""')
    return '<p class="%s"%s>%s</p>' % (cls, "".join(" " + attr for attr in attrs), body), cursor


def _quote(lines, index, blocks, ledger, depth):
    collected = []
    cursor = index
    while cursor < len(lines):
        line = lines[cursor]
        prefix, inner = split_quote_prefix(line, 1)
        if prefix:
            collected.append(inner)
            ledger.drop(">")
            cursor += 1
            continue
        if not line.strip():
            break
        if _starts_block(lines, cursor):
            break
        collected.append(line.strip())
        cursor += 1

    body = "\n".join(collected).strip("\n")
    structured = any(_starts_block(collected, i) for i, item in enumerate(collected) if item.strip())
    if ledger.layout in ("default", "script") and not structured and _is_short_quote(body):
        html = (
            '<figure class="%s text-center">\n<blockquote class="%s">%s</blockquote>\n</figure>'
            % (ledger.style("quote_box"), ledger.style("quote_short"), _inline(body, ledger))
        )
        return html, cursor

    if structured or ledger.layout == "manuscript":
        inner = "\n".join(chunk for _, chunk in _blocks_to_html(collected, blocks, ledger, depth + 1))
    else:
        paragraphs = [chunk for chunk in re.split(r"\n[ \t]*\n", body) if chunk.strip()]
        inner = "\n".join("<p>%s</p>" % _inline(chunk.strip(), ledger) for chunk in paragraphs)
    if ledger.layout == "manuscript":
        return '<blockquote class="lecture-cue">\n%s\n</blockquote>' % inner, cursor
    html = '<figure class="%s">\n<blockquote class="%s">\n%s\n</blockquote>\n</figure>' % (
        ledger.style("quote_box"),
        ledger.style("quote_long"),
        inner,
    )
    return html, cursor


#: 中央に置いてよい引用の上限。狭い画面で中央寄せが崩れないのは 1 文まで、という
#: デザイン規則の読み替え。字数は「全角 120 字＝スマホでおよそ 6 行」を目安にした保険。
SHORT_QUOTE_CHARS = 120


def _is_short_quote(text):
    body = text.strip()
    if not body or "\n" in body:
        return False
    core = re.sub(r"[。．\.!！?？]+$", "", body)
    if re.search(r"[。！？]", core) or re.search(r"[.!?][ \t]", core):
        return False
    return len(core) <= SHORT_QUOTE_CHARS


def _table(lines, index, ledger):
    header = split_cells(lines[index])
    ledger.drop(lines[index + 1].strip())
    rows = []
    cursor = index + 2
    while cursor < len(lines) and not PLACEHOLDER.match(lines[cursor]) and not lines[cursor].lstrip().startswith(">") and is_table_row(lines[cursor]):
        rows.append(split_cells(lines[cursor]))
        cursor += 1

    width = len(header)
    head_cells = "\n".join(
        '<th class="%s">%s</th>' % (ledger.style("th"), _inline(cell, ledger)) for cell in header
    )
    body_rows = []
    for cells in rows:
        padded = cells + [""] * (width - len(cells)) if len(cells) < width else cells
        body_rows.append(
            "<tr>\n%s\n</tr>"
            % "\n".join('<td class="%s">%s</td>' % (ledger.style("td"), _inline(cell, ledger)) for cell in padded)
        )
    html = '<table class="%s">\n<thead>\n<tr>\n%s\n</tr>\n</thead>' % (ledger.style("table"), head_cells)
    if body_rows:
        html += "\n<tbody>\n%s\n</tbody>" % "\n".join(body_rows)
    html += "\n</table>"
    if ledger.layout == "manuscript":
        html = '<div class="lecture-table">%s</div>' % html
    return html, cursor


def _list(lines, index, blocks, ledger, depth):
    base = indent_of(lines[index])
    ordered = OL_ITEM.match(lines[index]) is not None
    items = []
    cursor = index

    while cursor < len(lines):
        line = lines[cursor]
        if not line.strip():
            look = cursor + 1
            while look < len(lines) and not lines[look].strip():
                look += 1
            if look >= len(lines):
                break
            following = lines[look]
            if indent_of(following) > base or (
                indent_of(following) == base and (UL_ITEM.match(following) or OL_ITEM.match(following))
            ):
                cursor = look
                continue
            break

        item_ul = UL_ITEM.match(line)
        item_ol = OL_ITEM.match(line)
        current_indent = indent_of(line)

        if (item_ul or item_ol) and current_indent == base:
            if (item_ol is not None) != ordered:
                break
            if item_ol:
                ledger.drop("%s%s" % (item_ol.group(2), item_ol.group(3)))
                items.append([item_ol.group(4)])
            else:
                ledger.drop(item_ul.group(2))
                items.append([item_ul.group(3)])
            cursor += 1
            continue

        if (item_ul or item_ol) and current_indent < base:
            break
        if not items:
            break
        if current_indent <= base and _starts_block(lines, cursor):
            break
        items[-1].append(line)
        cursor += 1

    rendered = [_list_item(item, blocks, ledger, depth) for item in items]
    if not ordered and all(TASK_MARK.match(item[0]) for item in items) and items:
        html = '<ul class="%s">\n%s\n</ul>' % (ledger.style("task_ul"), "\n".join(rendered))
    else:
        tag = "ol" if ordered else "ul"
        html = '<%s class="%s">\n%s\n</%s>' % (tag, ledger.style(tag), "\n".join(rendered), tag)
    return html, cursor


def _list_item(item_lines, blocks, ledger, depth):
    first = item_lines[0]
    rest = item_lines[1:]
    task = TASK_MARK.match(first)
    icon = ""
    if task:
        if task.group(1) in ("x", "X"):
            ledger.drop("[%s]" % task.group(1))
            icon = '<i data-lucide="check" class="%s"></i>' % ledger.style("task_icon")
        else:
            icon = '<i data-lucide="square" class="%s"></i>' % ledger.style("task_icon")
        first = task.group(2)

    continuation = []
    nested = []
    for line in rest:
        if nested or UL_ITEM.match(line) or OL_ITEM.match(line):
            nested.append(line)
        else:
            continuation.append(line.strip())

    text = "\n".join([first] + continuation).strip()
    body = _inline(text, ledger)
    if icon:
        body = '<span class="flex items-center gap-2">%s<span>%s</span></span>' % (icon, body)
    if nested:
        shift = min(indent_of(line) for line in nested if line.strip())
        dedented = [line[shift:] if len(line) >= shift else line.lstrip() for line in nested]
        inner = _blocks_to_html(dedented, blocks, ledger, depth + 1)
        body += "\n" + "\n".join(chunk for _, chunk in inner)
    return "<li>%s</li>" % body


def _html_block(lines, index, ledger):
    if lines[index].lstrip().startswith("<!--"):
        cursor = index
        collected = []
        while cursor < len(lines):
            collected.append(lines[cursor])
            cursor += 1
            if "-->" in collected[-1]:
                break
        for line in collected:
            ledger.drop(line)
        return "", cursor
    collected = []
    cursor = index
    while cursor < len(lines) and lines[cursor].strip():
        collected.append(lines[cursor])
        cursor += 1
    cleaned = _scrub_raw_html("\n".join(collected), ledger)
    return cleaned.strip(), cursor


# ------------------------------------------------------------------ 組み上げ


def _wrap_sections(pieces, ledger):
    """h2 ごとに器へ入れて、節と節の間を空ける。"""
    out = []
    section = None
    for kind, html in pieces:
        if kind == "h2":
            if section is not None:
                out.append('<section class="%s">\n%s\n</section>' % (ledger.style("section"), "\n".join(section)))
            section = [html]
            continue
        if section is None:
            out.append(html)
        else:
            section.append(html)
    if section is not None:
        out.append('<section class="%s">\n%s\n</section>' % (ledger.style("section"), "\n".join(section)))
    return "\n".join(out)


def _promote_first_line(lines, ledger):
    """見出しがまったく無い長い原本は、先頭の 1 行をそのまま表題に立てる（作文しない）。"""
    for index, line in enumerate(lines):
        if not line.strip():
            continue
        if PLACEHOLDER.match(line) or HTML_BLOCK_START.match(line):
            return lines, None
        title = line.strip()
        promoted = list(lines)
        promoted[index] = "# %s" % title
        ledger.note("NO_HEADING_LONG", "先頭の 1 行「%s」を表題にしました" % _shorten(title))
        return promoted, title
    return lines, None


def convert_text(text, original_text=None, title=None, layout="default", heading_prefix=None):
    """本文の HTML と、照合に渡す控えを作る。"""
    if layout not in LAYOUTS:
        raise ConvertError("未知の表示形式: %s" % layout)
    ledger = Ledger()
    ledger.layout = layout
    ledger.heading_prefix = heading_prefix
    lines = split_lines(text)
    lines = _strip_front_matter(lines, ledger)
    lines, blocks, needs_mermaid = _extract_fences(lines, ledger)

    extra_headings = 0
    promoted = None
    if not find_headings(lines):
        lines, promoted = _promote_first_line(lines, ledger)
        if promoted is None:
            raise ConvertError(
                "見出しが 1 つも無く、表題にできる行も見つかりません。"
                "`fix --apply-defaults --title <表題>` で表題を立ててから変換してください。"
            )
        extra_headings += 1

    pieces = _blocks_to_html(lines, blocks, ledger, 0)
    body = _wrap_sections(pieces, ledger)

    headings = find_headings(lines)
    resolved_title = title or (headings[0][2] if headings else "")
    if not resolved_title:
        raise ConvertError("表題が決まりません。`--title` で渡してください。")

    # 原本には無い見出し（`fix --apply-defaults` が立てた表題）を数える。
    # 「原本のどこかに同じ語があるか」で見ない——たまたま本文に出てくる語をファイル名に
    # 持つ原本で、立てた表題を見落とすため。**見出しの並びどうし**で突き合わせる。
    headings_not_in_original = 0
    if original_text is not None:
        remaining = collections.Counter(
            text.strip() for _, _, text in find_headings(split_lines(original_text))
        )
        # 先頭の 1 行を表題に立てた分は、原本にある文をそのまま持ち上げただけ。
        # 「原本に無い見出し」に数えると、上の extra_headings と二重に数えることになる
        if promoted:
            remaining[promoted.strip()] += 1
        for _, _, heading_text in headings:
            plain = heading_text.strip()
            if remaining.get(plain, 0) > 0:
                remaining[plain] -= 1
                continue
            ledger.add(plain)
            headings_not_in_original += 1

    # 台帳に、原本のどこにも無い文字列を積めないようにする。
    # ここが素通しだと、照合は「控えたことにする」だけで何でも緑にできてしまう。
    missing = [entry for entry in ledger.removed if entry and entry not in text]
    if missing:
        raise ConvertError(
            "控えた文字列が作業ファイルの中に見つかりません（変換の作りが壊れています）: %s"
            % _shorten(missing[0])
        )

    heading_count = len(re.findall(r"<h[1-6]\b", body))
    return {
        "body": body,
        "title": resolved_title,
        "needs_mermaid": needs_mermaid,
        "removed_text": ledger.removed,
        "added_text": ledger.added,
        "notes": ledger.notes,
        "extra_headings": extra_headings,
        "headings_not_in_original": headings_not_in_original,
        "heading_count_html": heading_count,
        "heading_count_source": len(headings),
    }


# --------------------------------------------------------------------- 額縁


def source_note(chars, source_name, public=False, provenance=None):
    """ページの末尾に添える 1 行。必ず 1 行で書く（照合が行の単位で外すため）。

    `public` のときはパスも GitHub リンクも出さない（社外に社内の置き場を見せない）。
    git の出典は `provenance` が持つ。コマンド側が拾い、ここは組むだけ。
    """
    counted = esc("{:,}".format(chars))
    cls = STYLE["source_note"]
    if public:
        return '<p data-source-note class="%s">本文 %s 字</p>' % (cls, counted)

    info = provenance or {}
    url = info.get("url")
    path = info.get("path") or source_name
    commit = info.get("commit")
    committed_at = info.get("committed_at")
    repo = info.get("repo")
    dirty = bool(info.get("dirty"))

    attrs = ['data-source-note', 'class="%s"' % cls]
    bits = []
    if url and commit and not dirty:
        if repo:
            attrs.append('data-source-repo="%s"' % esc_attr(repo))
        attrs.append('data-source-path="%s"' % esc_attr(path))
        attrs.append('data-source-commit="%s"' % esc_attr(commit))
        if committed_at:
            attrs.append('data-source-committed-at="%s"' % esc_attr(committed_at))
        bits.append(
            '<a href="%s" class="text-ads-muted hover:text-ads-text">%s</a>'
            % (esc_attr(url), esc(path))
        )
        day = provenance_mod.display_date(committed_at)
        if day:
            bits.append('<time datetime="%s">%s</time>' % (esc_attr(day), esc(day)))
    elif dirty:
        bits.append(esc(path))
        bits.append("作業中の内容")
    else:
        bits.append(esc(source_name or path))
    bits.append("本文 %s 字" % counted)
    return "<p %s>%s</p>" % (" ".join(attrs), " · ".join(bits))


HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)


def mermaid_snippet(path):
    """図の「貼る一式」を取り出す。最初の `<script` から最後の `</script>` まで。

    説明書きの HTML コメントの中の字（「下の <script> / <style> / <script> の 3 つを…」）は数えない。
    数えると説明の切れ端が仕掛けとしてページに混ざり、サーバーの保存時の検査で断られる。
    一式の中身は 1 文字も変えない（許可表は雛形の字のままの仕掛けしか通さない）。
    """
    if not os.path.exists(path):
        raise ConvertError(
            "図（mermaid）があるのに、貼る一式が見つかりません: %s\n"
            "投稿コマンドの一式を先に用意してください（投稿の手順.md の「投稿の下ごしらえ」）。" % path
        )
    text = open(path, encoding="utf-8").read()
    comments = [match.span() for match in HTML_COMMENT.finditer(text)]

    def outside(at):
        return not any(begin <= at < finish for begin, finish in comments)

    starts = [match.start() for match in re.finditer(r"<script", text) if outside(match.start())]
    ends = [match.start() for match in re.finditer(r"</script>", text) if outside(match.start())]
    start = starts[0] if starts else -1
    end = ends[-1] if ends else -1
    if start < 0 or end < 0:
        raise ConvertError("貼る一式の形が読み取れません: %s" % path)
    return text[start : end + len("</script>")]


def build_page(frame, title, description, body, snippet=None, layout="default"):
    """額縁に差し込んで 1 枚の HTML にする。額縁の構造は変えない。"""
    for marker in ("<!-- TITLE -->", "<!-- DESCRIPTION -->", "<!-- CONTENT_START -->", "<!-- CONTENT_END -->"):
        if marker not in frame:
            raise ConvertError("額縁に差し込み位置がありません: %s" % marker)
    page = frame.replace("<!-- TITLE -->", esc_attr(title))
    page = page.replace("<!-- DESCRIPTION -->", esc_attr(description))
    start = page.index("<!-- CONTENT_START -->") + len("<!-- CONTENT_START -->")
    end = page.index("<!-- CONTENT_END -->")
    page = page[:start] + "\n" + body + "\n" + page[end:]
    # 閲覧側が清書だけに共通目次を付ける印。目次本文は保存せず、その時点の見出しから読む。
    # どの見た目の一式で組んだかの印。配信側（Pages）は開いたときにこの印から元の変換表を引き、
    # その時点の最新の見た目へ付け替える（字は 1 文字も変えない）。印は見た目が変わると変わる
    page = re.sub(r"<main\b", '<main data-clean-copy-document="" data-clean-copy-look="%s"' % look_stamp(), page, count=1)
    # 配信側と同じ配置設定を使う。前章の出典を次章の題へ貼り付けない。
    from . import pipeline
    try:
        with open(pipeline.reading_layout_path(), encoding='utf-8') as source:
            reading = json.load(source)
    except FileNotFoundError:
        # コマンド3本だけを持つクラウドの正規環境も清書できる。
        # この場合は配信側が同じ共通設定から余白を付ける（対象の印は必ず残す）。
        reading = None
    except (OSError, ValueError) as error:
        raise ConvertError('清書の配置設定を読めません。投稿コマンドの一式を更新してください。') from error
    if reading is not None:
        if not isinstance(reading, dict) or any(type(reading.get(key)) is not int or reading[key] <= 0 for key in ('chapterGap', 'chapterGapNarrow', 'narrowWidth')):
            raise ConvertError('清書の配置設定が正しくありません。投稿コマンドの一式を確認してください。')
        selector = 'main[data-clean-copy-document]:has(article[data-clean-copy-source-id]) > :is(section,details) + :is(section,details)'
        spacing = '<style data-clean-copy-style="reading">@media screen{%s{margin-block-start:%dpx}}@media screen and (max-width:%dpx){%s{margin-block-start:%dpx}}</style>' % (selector, reading['chapterGap'], reading['narrowWidth'], selector, reading['chapterGapNarrow'])
        page = page.replace('</head>', spacing + '\n</head>', 1)
    # 清書の文字組み。額縁（explain-page とも共用）は触らず、清書の本文にだけ当てる
    page = page.replace("</head>", TYPOGRAPHY_CSS + "\n</head>", 1)
    if layout == "manuscript":
        page = page.replace("</head>", MANUSCRIPT_CSS + "\n</head>", 1)
        page = re.sub(r"<main\b", '<main data-clean-copy-layout="manuscript"', page, count=1)
    elif layout == "script":
        page = page.replace("</head>", SCRIPT_CSS + "\n</head>", 1)
        page = re.sub(r"<main\b", '<main data-clean-copy-layout="script"', page, count=1)
    elif layout != "default":
        raise ConvertError("未知の表示形式: %s" % layout)
    if snippet:
        page = page.replace("</head>", snippet + "\n</head>", 1)
    return page


def html_to_text(html):
    """HTML から、読者が字として見る部分だけを取り出す（照合が使う）。"""
    stripped = ANY_TAG.sub("", html)
    return html_module.unescape(stripped)


def count_page_chars(body_html):
    return count_chars(html_to_text(body_html))


#: 清書の文字組み。**クラスで書けない指定だけ**をここに置く（隣との関係・字の機能）。
#:
#:   ・行送り 1.8 と字間 0.02em … 日本語の本文の読みやすさ。額縁の leading-relaxed（1.625）は
#:     図解向けの詰まり方なので、読む文書ではここで広げる
#:   ・見出しは palt（詰め組み）と字間 0、行送り 1.35、行の均し（text-wrap: balance）、
#:     文節で折り返す（word-break: auto-phrase。対応する環境でだけ効く）
#:   ・見出しが続くときは上の余白を詰める（h2 の直後の h3 など。余白が二重に出ない）
#:   ・始め括弧のぶら下げ（data-clean-copy-hang）
#:   ・行末の句読点のぶら下げ・長い URL の折り返し
#:   ・注記・添え書きの中のリンクは、周りの薄い字の色のまま（下線だけで押せると分かる）
TYPOGRAPHY_CSS = """<style data-clean-copy-style="typography">
main[data-clean-copy-document]{line-height:1.8;letter-spacing:.02em;line-break:strict;overflow-wrap:anywhere;hanging-punctuation:allow-end}
main[data-clean-copy-document] :is(h1,h2,h3,h4){line-height:1.35;letter-spacing:0;font-feature-settings:"palt";text-wrap:balance;word-break:auto-phrase}
main[data-clean-copy-document] :is(h1,h2,h3,h4)+:is(h2,h3,h4){margin-top:0}
main[data-clean-copy-document] p{text-wrap:pretty}
main[data-clean-copy-document] p[data-clean-copy-hang]{text-indent:-.5em}
main[data-clean-copy-document] :is([data-clean-copy-note],[data-clean-copy-attached]) a{color:inherit}
main[data-clean-copy-document] :is(pre,code,table,th,td){letter-spacing:0;line-height:1.6}
</style>"""

#: 台本（1 行 1 息の原稿）。隣との関係で決まる余白だけをここに置く。
#:
#:   ・広い画面では読む字を 1 段大きく（18px）。注記・出典は絶対値（text-sm / text-xs）なのでそのまま
#:   ・見出しに添え書き（状態・尺）が密着しているときは、見出しの下を詰めて 1 組に見せる
#:   ・※ の注記は、直前の読む行に寄せる（注記はその行への指示なので、上に付き下に離れる）
#:   ・表題の添え書きの下は、章と章の間に近い広さを空ける（表題の組と最初の章を分ける）
SCRIPT_CSS = """<style data-clean-copy-style="script">
@media (min-width:768px){main[data-clean-copy-layout="script"]{font-size:1.125rem}}
main[data-clean-copy-layout="script"] :is(h1,h2,h3,h4):has(+p[data-clean-copy-attached]){margin-bottom:.5rem}
main[data-clean-copy-layout="script"] p:not([data-clean-copy-attached]):has(+p[data-clean-copy-note]){margin-bottom:.25rem}
main[data-clean-copy-layout="script"] p[data-clean-copy-attached]{line-height:1.7}
main[data-clean-copy-layout="script"] h1+p[data-clean-copy-attached]{margin-bottom:4rem}
</style>"""

MANUSCRIPT_CSS = """<style data-clean-copy-style="manuscript">
main[data-clean-copy-layout="manuscript"]{max-width:1080px;font-size:18px;line-height:1.95;color:rgb(var(--ads-text))}
main[data-clean-copy-layout="manuscript"] p,main[data-clean-copy-layout="manuscript"] ul,main[data-clean-copy-layout="manuscript"] ol,main[data-clean-copy-layout="manuscript"] table{color:rgb(var(--ads-text))}
main[data-clean-copy-layout="manuscript"] [data-source-note]{color:rgb(var(--ads-muted));font-size:13px}
main[data-clean-copy-layout="manuscript"] .lecture-cue{min-width:0;font-size:16px;line-height:1.9;padding:24px 28px;border:1px solid rgb(var(--ads-border));border-left-width:4px;border-radius:12px;background:rgb(var(--ads-surface));margin:1.5rem 0 2rem}
main[data-clean-copy-layout="manuscript"] .lecture-cue p{font-size:inherit;font-weight:400}
main[data-clean-copy-layout="manuscript"] .lecture-cue>:last-child{margin-bottom:0}
main[data-clean-copy-layout="manuscript"] .lecture-table{overflow-x:auto;margin-bottom:24px}
main[data-clean-copy-layout="manuscript"] table{font-size:16px;width:100%;margin-bottom:0;line-height:1.7}
main[data-clean-copy-layout="manuscript"] th,main[data-clean-copy-layout="manuscript"] td{padding:12px 14px;vertical-align:top;border:1px solid rgb(var(--ads-border))}
main[data-clean-copy-layout="manuscript"] th{background:rgb(var(--ads-surface-2));color:rgb(var(--ads-text))}
main[data-clean-copy-layout="manuscript"] pre,main[data-clean-copy-layout="manuscript"] pre code{font-size:16px;white-space:pre;line-height:1.8}
main[data-clean-copy-layout="manuscript"] pre{padding:24px;background:rgb(var(--ads-bg));border:1px solid rgb(var(--ads-border));border-radius:8px;overflow-x:auto}
@media(max-width:640px){main[data-clean-copy-layout="manuscript"]{font-size:17px}main[data-clean-copy-layout="manuscript"] .lecture-cue{padding:16px 14px;font-size:16px}main[data-clean-copy-layout="manuscript"] table,main[data-clean-copy-layout="manuscript"] pre,main[data-clean-copy-layout="manuscript"] pre code{font-size:15px}}
@media print{main[data-clean-copy-layout="manuscript"] pre,main[data-clean-copy-layout="manuscript"] pre code{white-space:pre-wrap;overflow-wrap:anywhere}main[data-clean-copy-layout="manuscript"] .lecture-table{overflow:visible}}
</style>"""


# ------------------------------------------------------------- 見た目の一式


def look():
    """清書の見た目の一式（要素ごとのクラス・文字組みと表示形式の指定）。

    **本文の字と見た目を分けるための窓口。** 清書のページは保存したあと書き換えないので、
    見た目をここで変えても過去のページには届かない。そこで配信側（Pages）は、この一式を
    版ごとに写して持ち、ページの印（data-clean-copy-look）から元の一式を引いて、開いたときに
    最新の一式へ付け替える。ここに無い値をページに書かない（付け替えの対象から漏れる）。
    """
    return {
        "styles": STYLES,
        "css": {"typography": TYPOGRAPHY_CSS, "script": SCRIPT_CSS, "manuscript": MANUSCRIPT_CSS},
    }


def look_stamp():
    """見た目の一式の印（12 桁）。一式の中身だけから決まる。"""
    text = json.dumps(look(), sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]
