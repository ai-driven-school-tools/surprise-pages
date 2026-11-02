# -*- coding: utf-8 -*-
"""原本を見て、判定コードを並べる。**原本には 1 文字も書かない。**

出すのは `codes.CATALOG` にあるコードだけ。ここで新しい合図を思いつきで足さない
（手引きは「コードの一覧は codes.py を見る」と書いてあるので、足すならあちらが先）。
"""

import os
import re

from . import codes
from .source import (
    HEADING,
    count_chars,
    fence_mask,
    find_fences,
    find_headings,
    find_tables,
    split_lines,
)

#: 行の中のインラインコード（`` `<script>` `` を生 HTML と見間違えないように外す）
INLINE_CODE = re.compile(r"(`+)(.+?)\1")

#: 生 HTML の開きタグ
OPEN_TAG = re.compile(r"<([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^<>]*)?)/?>")

#: 外から取ってくる指定（`//` 始まりも外部）
EXTERNAL_URL = re.compile(r"""\b(?:src|href|data|srcset)\s*=\s*["']?\s*(?:https?:)?//""", re.I)

#: 色を焼き込んだ style（暗い側で割れる）
COLOR_IN_STYLE = re.compile(r"(?:^|[;\s])(?:color|background|background-color|fill|stroke|border-color)\s*:", re.I)

#: 生の色名クラス
RAW_COLOR_CLASS = re.compile(
    r"\b(?:bg|text|border|fill|stroke|from|to|via|ring|divide)"
    r"-(?:slate|gray|zinc|neutral|stone|white|black|blue|indigo|violet|purple|emerald|green|red|rose|"
    r"amber|orange|yellow|teal|cyan|sky|pink|fuchsia|lime)(?:-\d+)?(?:/\d+)?\b"
)

#: 絵の貼り付け
IMAGE = re.compile(r"!\[[^\]]*\]\(\s*([^)\s]+)")


def strip_inline_code(line):
    """行からインラインコードの中身を抜く（見間違いを防ぐためだけの下ごしらえ）。"""
    return INLINE_CODE.sub(lambda m: " " * (len(m.group(0))), line)


def _finding(code, line, detail):
    return {
        "code": code,
        "severity": codes.severity(code),
        "line": line,
        "detail": detail,
        "default": codes.default_action(code),
    }


def _check_fences(lines, found):
    for fence in find_fences(lines):
        if not fence.closed:
            found.append(
                _finding(
                    "UNCLOSED_FENCE",
                    fence.start + 1,
                    "%s で開いた囲みが、最後まで閉じられていません" % fence.marker,
                )
            )


def _check_headings(lines, mask, found):
    headings = find_headings(lines, mask)
    if not headings:
        chars = count_chars("\n".join(lines))
        if chars >= codes.NO_HEADING_LONG_THRESHOLD:
            found.append(
                _finding("NO_HEADING_LONG", 1, "見出しが 1 つも無く、%d 字あります" % chars)
            )
        else:
            found.append(
                _finding("NO_HEADING_SHORT", 1, "見出しが 1 つも無く、%d 字しかありません" % chars)
            )
        return

    baseline = headings[0][1]
    previous = baseline
    for line_no, level, text in headings:
        if level > previous + 1:
            found.append(
                _finding(
                    "HEADING_SKIP",
                    line_no + 1,
                    "%s の次が %s（%s）" % ("#" * previous, "#" * level, text or "（文言なし）"),
                )
            )
        if level >= 5:
            found.append(
                _finding("HEADING_FLATTEN", line_no + 1, "%s %s" % ("#" * level, text or ""))
            )
        previous = level


def _check_tables(lines, mask, found):
    for table in find_tables(lines, mask):
        header_count = len(table.header)
        delim_count = len(table.delim)
        if header_count != delim_count:
            found.append(
                _finding(
                    "TABLE_HEADER_SEP_MISMATCH",
                    table.header_at + 1,
                    "見出し行 %d マス / 区切り行 %d マス" % (header_count, delim_count),
                )
            )
        width = max(header_count, delim_count)
        for line_no, cells in table.rows:
            if len(cells) > width:
                found.append(
                    _finding(
                        "TABLE_ROW_EXTRA",
                        line_no + 1,
                        "見出し %d マスに対して %d マス（余ったマス: %s）"
                        % (width, len(cells), " / ".join(cells[width:])),
                    )
                )
            elif len(cells) < width:
                found.append(
                    _finding(
                        "TABLE_ROW_SHORT",
                        line_no + 1,
                        "見出し %d マスに対して %d マス" % (width, len(cells)),
                    )
                )


def _check_raw_html(lines, mask, found):
    in_style = False
    in_script = False
    for index, line in enumerate(lines):
        if mask[index]:
            continue
        scan = strip_inline_code(line)
        lowered = scan.lower()

        if in_style:
            if "</style>" in lowered:
                in_style = False
            continue
        if in_script:
            if "</script>" in lowered:
                in_script = False
            continue

        if "<style" in lowered:
            found.append(_finding("RAW_STYLE", index + 1, "変換のときに丸ごと落とします"))
            if "</style>" not in lowered:
                in_style = True
        if "<script" in lowered:
            found.append(_finding("RAW_SCRIPT", index + 1, "変換のときに丸ごと落とします"))
            if "</script>" not in lowered:
                in_script = True

        for match in OPEN_TAG.finditer(scan):
            name = match.group(1).lower()
            attrs = match.group(2) or ""
            if name in codes.EXTERNAL_TAGS and EXTERNAL_URL.search(attrs):
                found.append(
                    _finding("RAW_EXTERNAL", index + 1, "<%s> の外部読み込みを落とします" % name)
                )
            if name in ("style", "script"):
                continue
            style_attr = re.search(r"""style\s*=\s*(["'])(.*?)\1""", attrs, re.S)
            if style_attr and COLOR_IN_STYLE.search(style_attr.group(2)):
                found.append(
                    _finding("RAW_COLOR", index + 1, "<%s> の style に色が書かれています" % name)
                )
            elif RAW_COLOR_CLASS.search(attrs):
                found.append(
                    _finding("RAW_COLOR", index + 1, "<%s> に生の色名クラスがあります" % name)
                )


def _check_images(lines, mask, found, base_dir):
    for index, line in enumerate(lines):
        if mask[index]:
            continue
        for match in IMAGE.finditer(strip_inline_code(line)):
            path = match.group(1)
            if re.match(r"^(?:[a-zA-Z][a-zA-Z0-9+.-]*:)?//", path) or path.startswith("data:"):
                continue
            if os.path.isabs(path):
                target = path
            else:
                target = os.path.join(base_dir, path)
            if not os.path.exists(target):
                found.append(_finding("IMAGE_MISSING", index + 1, path))


def validate_text(text, base_dir=".", source_name="原本"):
    """本文を見て、判定を並べて返す。原本には触らない。"""
    lines = split_lines(text)
    found = []

    if not text.strip():
        found.append(_finding("EMPTY_SOURCE", 1, "文字が 1 つもありません"))
        return _report(source_name, lines, found)

    mask = fence_mask(lines)
    _check_fences(lines, found)
    _check_headings(lines, mask, found)
    _check_tables(lines, mask, found)
    _check_raw_html(lines, mask, found)
    _check_images(lines, mask, found, base_dir)
    return _report(source_name, lines, found)


def _report(source_name, lines, found):
    found.sort(key=lambda item: (item["line"], item["code"], item["detail"]))
    summary = {codes.ERROR: 0, codes.FIXABLE: 0, codes.WARN: 0}
    for item in found:
        summary[item["severity"]] = summary.get(item["severity"], 0) + 1
    text = "\n".join(lines)
    return {
        "source": source_name,
        "counts": {
            "chars": count_chars(text),
            "headings": len(find_headings(lines)),
            "lines": len(lines),
        },
        "findings": found,
        "summary": summary,
    }


def has_error(report):
    """止まるべきかどうか。"""
    return report["summary"].get(codes.ERROR, 0) > 0
