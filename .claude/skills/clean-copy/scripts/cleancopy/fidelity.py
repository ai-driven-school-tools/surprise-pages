# -*- coding: utf-8 -*-
"""Independent source/content comparison; never trust a conversion removal ledger.

Markdown syntax definitions are shared, but expected content is read from the
original, not generated HTML or the repaired working copy. Outside preformatted
blocks only whitespace is ignored. Table boundaries and preformatted whitespace
are compared separately.
"""
import re
from html.parser import HTMLParser

from .convert import INLINE_TOKEN, HR, FOOTNOTE_DEF, HTML_BLOCK_START
from .source import HEADING, find_fences, find_tables, split_lines

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


def compact(text):
    return re.sub(r"\s+", "", text)


class ContentParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text = []
        self.tables = []
        self.codes = []
        self.headings = []
        self.table = None
        self.row = None
        self.cell = None
        self.pre = None
        self.mermaid = False
        self.heading = None
        self.suppressed = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if self.suppressed:
            if tag not in VOID:
                self.suppressed.append(tag)
            return
        if tag in ("script", "style"):
            self.suppressed.append(tag)
            return
        if tag == "table":
            self.table = []
        elif tag == "tr" and self.table is not None:
            self.row = []
        elif tag in ("th", "td") and self.row is not None:
            self.cell = []
        elif tag == "pre":
            self.pre = []
            self.mermaid = "mermaid" in attrs.get("class", "").split()
        elif re.fullmatch(r"h[1-6]", tag):
            self.heading = []

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if self.suppressed:
            if tag == self.suppressed[-1]:
                self.suppressed.pop()
            return
        if tag in ("th", "td") and self.cell is not None:
            self.row.append(compact("".join(self.cell)))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == "table" and self.table is not None:
            self.tables.append(self.table)
            self.table = None
        elif tag == "pre" and self.pre is not None:
            value = "".join(self.pre)
            # Mermaid renderer's one deliberate wrapper newline on each side.
            if self.mermaid and value.startswith("\n") and value.endswith("\n"):
                value = value[1:-1]
            self.codes.append(value)
            self.pre = None
        elif re.fullmatch(r"h[1-6]", tag) and self.heading is not None:
            self.headings.append(compact("".join(self.heading)))
            self.heading = None

    def handle_data(self, data):
        if self.suppressed:
            return
        self.text.append(data)
        for target in (self.cell, self.pre, self.heading):
            if target is not None:
                target.append(data)


def html_snapshot(body):
    parser = ContentParser()
    parser.feed(body)
    parser.close()
    return {"text": compact("".join(parser.text)), "tables": parser.tables,
            "codes": parser.codes, "headings": parser.headings}


def inline_text(text):
    """Read supported inline syntax without calling the HTML converter."""
    out = []
    cursor = 0
    for match in INLINE_TOKEN.finditer(text):
        out.append(text[cursor:match.start()])
        cursor = match.end()
        if match.group("esc"):
            out.append(match.group("esc")[1:])
        elif match.group("code"):
            out.append(match.group("ctext"))
        elif match.group("fnref"):
            out.append(match.group("fnid"))
        elif match.group("link"):
            out.append(inline_text(match.group("ltext")))
        elif match.group("strong"):
            out.append(inline_text(match.group("stext")))
        elif match.group("em"):
            out.append(inline_text(match.group("etext")))
        elif match.group("auto"):
            # 自動リンクは行き先の文字がそのまま見える（メールは mailto: を見せない）
            href = match.group("ahref")
            out.append(href[len("mailto:"):] if href.startswith("mailto:") else href)
        # Images, HTML tags, and comments have no visible text node.
    out.append(text[cursor:])
    return "".join(out)


def _unquote(line):
    while re.match(r"^ {0,3}>", line):
        line = re.sub(r"^ {0,3}> ?", "", line, count=1)
    return line


def source_snapshot(text):
    lines = split_lines(text)
    if lines and lines[0].strip() == "---":
        for index in range(1, len(lines)):
            if lines[index].strip() in ("---", "..."):
                lines = lines[index + 1:]
                break
    fences = {fence.start: fence for fence in find_fences(lines)}
    tables = {table.header_at: table for table in find_tables(lines)}
    chunks, cells, codes = [], [], []
    index = 0
    while index < len(lines):
        if index in fences:
            fence = fences[index]
            value = "\n".join(fence.lines)
            chunks.append(value)
            codes.append(value)
            index = (fence.end + 1) if fence.end is not None else len(lines)
            continue
        if index in tables:
            table = tables[index]
            rows = [table.header] + [row for _, row in table.rows]
            width = max([len(table.delim)] + [len(row) for row in rows])
            normalized = [[compact(inline_text(cell)) for cell in row] + [""] * (width - len(row)) for row in rows]
            cells.append(normalized)
            chunks.extend(cell for row in normalized for cell in row)
            index = (table.rows[-1][0] if table.rows else table.delim_at) + 1
            continue
        line = _unquote(lines[index])
        if line.lstrip().startswith("<!--"):
            # Template markers are comments, not an HTML block swallowing the
            # following Markdown table/heading without a blank separator.
            while index < len(lines):
                current = _unquote(lines[index])
                index += 1
                if "-->" in current:
                    chunks.append(inline_text(current.split("-->", 1)[1]))
                    break
            continue
        if HTML_BLOCK_START.match(line):
            raw = []
            while index < len(lines) and lines[index].strip():
                raw.append(_unquote(lines[index]))
                index += 1
            snap = html_snapshot("\n".join(raw))
            chunks.append(snap["text"])
            cells.extend(snap["tables"])
            codes.extend(snap["codes"])
            continue
        index += 1
        if HR.match(line):
            continue
        heading = HEADING.match(line)
        if heading:
            line = heading.group(2)
        else:
            line = re.sub(r"^\s*(?:[-*+]|\d+[.)])\s+", "", line)
            line = re.sub(r"^\[([ xX])\]\s+", "", line)
            footnote = FOOTNOTE_DEF.match(line)
            if footnote:
                line = footnote.group(1) + " " + footnote.group(2)
        chunks.append(inline_text(line))
    return {"text": compact("".join(chunks)), "tables": cells, "codes": codes}


def fidelity_checks(original, body, added):
    expected = source_snapshot(original)
    actual = html_snapshot(body)
    title_ok = True
    if added:
        title = compact(inline_text(added[0]))
        title_ok = len(added) == 1 and actual["headings"][:1] == [title] and actual["text"].startswith(title)
        if title_ok:
            actual["text"] = actual["text"][len(title):]
    return [
        {"name": "4. 本文の語・数字・順番", "ok": title_ok and expected["text"] == actual["text"],
         "source_length": len(expected["text"]), "page_length": len(actual["text"])},
        {"name": "5. 表の行・列・各マス", "ok": expected["tables"] == actual["tables"],
         "source_tables": len(expected["tables"]), "page_tables": len(actual["tables"])},
        {"name": "6. 図・コードの改行と字下げ", "ok": expected["codes"] == actual["codes"],
         "source_blocks": len(expected["codes"]), "page_blocks": len(actual["codes"])},
    ]
