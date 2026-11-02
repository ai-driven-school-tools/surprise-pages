# -*- coding: utf-8 -*-
"""入れ物だけを直して、**作業ファイル**に出す。原本は絶対に書き換えない。

直すのは 3 つの形だけ。

  見出しの段の飛び … 深い側を 1 段ずつ浅くする（語は変えない）
  表のマスの数     … 足りないマスを空で足す（言葉は落とさない）
  囲みの閉じ       … 末尾に閉じを足す（`--apply-defaults` を付けたときだけ）

語・数字・順番を触る道具はこのファイルに 1 つも無い。誤字はそのまま通す。
"""

from . import codes
from .source import HEADING, find_fences, find_headings, find_tables, fence_mask, split_lines, split_quote_prefix


def _row(cells):
    """マスの並びを 1 行に戻す。中身は 1 文字も変えない。"""
    return "| " + " | ".join(cells) + " |"


def _delim_row(cells):
    """区切り行を作り直す。並びの指定（`:---`）は元のまま、足したマスは `---`。"""
    return "| " + " | ".join(cell if cell else "---" for cell in cells) + " |"


def _fix_tables(lines, applied, apply_defaults):
    for table in find_tables(lines):
        header_width = len(table.header)
        delim_width = len(table.delim)
        widest_row = max([len(cells) for _, cells in table.rows] or [0])
        mismatched = header_width != delim_width
        has_extra = widest_row > max(header_width, delim_width)

        # 止まる側の形（見出しと区切りの食い違い・はみ出した行）は、了承をもらうまで触らない
        if (mismatched or has_extra) and not apply_defaults:
            continue

        width = max(header_width, delim_width)
        if apply_defaults:
            width = max(width, widest_row)

        if header_width != width:
            lines[table.header_at] = split_quote_prefix(lines[table.header_at])[0] + _row(table.header + [""] * (width - header_width))
            applied.append(
                {
                    "code": "TABLE_HEADER_SEP_MISMATCH" if mismatched else "TABLE_ROW_EXTRA",
                    "line": table.header_at + 1,
                    "detail": "見出し行を %d マスへそろえました（足したマスは空）" % width,
                }
            )
        if delim_width != width:
            lines[table.delim_at] = split_quote_prefix(lines[table.delim_at])[0] + _delim_row(table.delim + [""] * (width - delim_width))
            applied.append(
                {
                    "code": "TABLE_HEADER_SEP_MISMATCH" if mismatched else "TABLE_ROW_EXTRA",
                    "line": table.delim_at + 1,
                    "detail": "区切り行を %d マスへそろえました" % width,
                }
            )
        for line_no, cells in table.rows:
            if len(cells) < width:
                lines[line_no] = split_quote_prefix(lines[line_no])[0] + _row(cells + [""] * (width - len(cells)))
                applied.append(
                    {
                        "code": "TABLE_ROW_SHORT",
                        "line": line_no + 1,
                        "detail": "%d マスへそろえました（足したマスは空）" % width,
                    }
                )


def _fix_heading_skips(lines, applied):
    """段の飛びを詰める。いちばん浅い段はそのまま（`##` 始まりの原本を `#` にしない）。"""
    headings = find_headings(lines)
    if not headings:
        return
    baseline = headings[0][1]
    stack = []  # [(元の段, 新しい段)]
    for line_no, level, text in headings:
        while stack and stack[-1][0] >= level:
            stack.pop()
        new_level = baseline if not stack else stack[-1][1] + 1
        if new_level > level:
            new_level = level
        stack.append((level, new_level))
        if new_level == level:
            continue
        prefix, content = split_quote_prefix(lines[line_no])
        matched = HEADING.match(content)
        lines[line_no] = prefix + "%s %s" % ("#" * new_level, matched.group(2))
        applied.append(
            {
                "code": "HEADING_SKIP",
                "line": line_no + 1,
                "detail": "%s → %s（%s）" % ("#" * level, "#" * new_level, text or ""),
            }
        )


def _close_fences(lines, applied):
    fences = find_fences(lines)
    for fence in reversed(fences):
        if fence.closed:
            continue
        marker = fence.marker
        insert_at = fence.end + 1 if fence.end is not None else len(lines)
        lines.insert(insert_at, fence.quote_prefix + marker)
        applied.append(
            {
                "code": "UNCLOSED_FENCE",
                "line": insert_at + 1,
                "detail": "囲みの末尾に %s を足して閉じました" % marker,
            }
        )


def _add_title(lines, applied, title):
    """見出しがまったく無い原本に、表題を 1 つだけ立てる。文言は作文しない。"""
    if find_headings(lines):
        return
    lines.insert(0, "# %s" % title)
    lines.insert(1, "")
    applied.append(
        {
            "code": "NO_HEADING_SHORT",
            "line": 1,
            "detail": "表題「%s」を先頭に立てました" % title,
        }
    )


def fix_text(text, apply_defaults=False, title=None):
    """直した本文と、直した一覧を返す。渡された本文そのものは変えない。"""
    lines = split_lines(text)
    applied = []

    _fix_tables(lines, applied, apply_defaults)
    _fix_heading_skips(lines, applied)
    if apply_defaults:
        _close_fences(lines, applied)
        if title:
            _add_title(lines, applied, title)

    applied.sort(key=lambda item: (item["line"], item["code"]))
    return "\n".join(lines) + "\n", applied
