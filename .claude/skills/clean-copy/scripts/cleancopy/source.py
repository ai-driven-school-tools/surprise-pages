# -*- coding: utf-8 -*-
"""原本の読み取り。validate も fix も convert も、ここの目でしか原本を見ない。

3 つが別々の目で読むと、validate が「表」と思った並びを convert が段落として出す、
という食い違いが起きる。だから囲み（コードフェンス）の見つけ方・見出しの数え方・
表の切り出し方は、このファイル 1 つだけが知っている。

数え方（`count_chars` と `find_numbers`）も手引きの照合コマンドと 1 対 1 で対応させてある。
コマンド側を直すときは、こちらの注記も一緒に直す。
"""

import re

#: 囲みの開き。字下げは 3 つまで（4 つ以上は字下げコードなので囲みではない）
FENCE_OPEN = re.compile(r"^( {0,3})(`{3,}|~{3,})[ \t]*(.*)$")

#: 見出し（ATX）。`#` の後ろに空白が要る（`#見出し` は見出しではない）
HEADING = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$")

#: 表の区切り行。マスが全部 `:---:` の形をしていること
TABLE_DELIM_CELL = re.compile(r"^:?-+:?$")

#: 手引きの照合 1 と同じ落とし方（`sed -e 's/[][`*|#>~_-]//g'`）
STRIP_SYMBOLS = re.compile(r"[\]\[`*|#>~_\-]")

#: 手引きの照合 1 と同じ空白の落とし方（`tr -d '[:space:]'`。C ロケールの空白だけ）
STRIP_SPACES = re.compile(r"[ \t\n\r\f\v]")

#: 手引きの照合 2 と同じ拾い方（`grep -o '[0-9][0-9,.]*'`）
NUMBER = re.compile(r"[0-9][0-9,.]*")


class SourceError(Exception):
    """原本そのものが読めないときだけ投げる。"""


def read_source(path):
    """原本を読み、改行を `\\n` にそろえて返す。読めなければ SourceError。"""
    try:
        raw = open(path, "rb").read()
    except FileNotFoundError:
        raise SourceError("ファイルが見つかりません: %s" % path)
    except IsADirectoryError:
        raise SourceError("フォルダを渡されました（ファイルを渡してください）: %s" % path)
    except PermissionError:
        raise SourceError("読む許可がありません: %s" % path)
    except OSError as err:
        raise SourceError("読めませんでした（%s）: %s" % (err.strerror or err, path))
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise SourceError(
            "文字の並びが UTF-8 として読めません（別の文字コードで保存されている見込み）: %s" % path
        )
    if text.startswith("\ufeff"):
        text = text[1:]
    return text.replace("\r\n", "\n").replace("\r", "\n")


def split_lines(text):
    """本文を行に切る。末尾の改行で空行が 1 つ増えないようにする。"""
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return lines


QUOTE_PREFIX = re.compile(r"^ {0,3}>[ \t]?")


def split_quote_prefix(line, max_depth=None):
    """Remove only quote markers, never code indentation or escaped >."""
    prefix = ""
    depth = 0
    while max_depth is None or depth < max_depth:
        matched = QUOTE_PREFIX.match(line)
        if not matched:
            break
        prefix += matched.group(0)
        line = line[matched.end():]
        depth += 1
    return prefix, line


def heading_slug(text):
    """Stable Unicode heading slug compatible with the manuscript's anchors."""
    import html
    text = re.sub(r"<[^>]*>", "", text)
    text = re.sub(r"!?\[([^]]*)\]\([^)]*\)", r"\1", text)
    text = html.unescape(text).lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    return re.sub(r"\s", "-", text)


class Fence(object):
    """囲み 1 つ分。`closed` が False なら閉じられていない。"""

    __slots__ = ("start", "end", "marker", "info", "indent", "closed", "lines", "quote_prefix", "quote_depth")

    def __init__(self, start, marker, info, indent):
        self.start = start
        self.end = None
        self.marker = marker
        self.info = info
        self.indent = indent
        self.closed = False
        self.lines = []
        self.quote_prefix = ""
        self.quote_depth = 0

    @property
    def language(self):
        """囲みに書かれた種類（```mermaid の mermaid）。空なら空文字。"""
        return self.info.strip().split()[0] if self.info.strip() else ""


def find_fences(lines):
    """囲みを上から順に拾う。閉じていないものも 1 つの囲みとして返す。"""
    fences = []
    open_fence = None
    for index, line in enumerate(lines):
        prefix, content = split_quote_prefix(line, open_fence.quote_depth if open_fence else None)
        if open_fence and prefix.count(">") < open_fence.quote_depth:
            open_fence.end = index - 1
            open_fence = None
            prefix, content = split_quote_prefix(line)
        matched = FENCE_OPEN.match(content)
        if open_fence is None:
            if matched:
                indent, marker, info = matched.groups()
                # 開きの情報欄にバッククォートは書けない（GFM の決め）
                if marker[0] == "`" and "`" in info:
                    continue
                open_fence = Fence(index, marker, info, len(indent))
                open_fence.quote_prefix = prefix
                open_fence.quote_depth = prefix.count(">")
                fences.append(open_fence)
            continue
        # 閉じは、同じ字で、開きと同じ数以上で、後ろに文字が無いもの
        if matched:
            _, marker, info = matched.groups()
            if marker[0] == open_fence.marker[0] and len(marker) >= len(open_fence.marker) and not info.strip():
                open_fence.end = index
                open_fence.closed = True
                open_fence = None
                continue
        open_fence.lines.append(content)
    return fences


def fence_mask(lines):
    """行ごとに「囲みの中か」を返す。開きと閉じの行そのものも中として扱う。"""
    mask = [False] * len(lines)
    for fence in find_fences(lines):
        last = fence.end if fence.end is not None else len(lines) - 1
        for index in range(fence.start, last + 1):
            if 0 <= index < len(mask):
                mask[index] = True
    return mask


def find_headings(lines, mask=None):
    """囲みの外にある見出しを (行番号, 段, 文言) で返す。"""
    if mask is None:
        mask = fence_mask(lines)
    found = []
    for index, line in enumerate(lines):
        if mask[index]:
            continue
        matched = HEADING.match(split_quote_prefix(line)[1])
        if matched:
            found.append((index, len(matched.group(1)), matched.group(2)))
    return found


def split_cells(line):
    """表の 1 行をマスに切る。`\\|` は区切りではなく文字の `|`。"""
    body = line.strip()
    if body.startswith("|"):
        body = body[1:]
    if body.endswith("|") and not body.endswith("\\|"):
        body = body[:-1]
    cells = []
    current = []
    index = 0
    while index < len(body):
        char = body[index]
        if char == "\\" and index + 1 < len(body):
            current.append(char)
            current.append(body[index + 1])
            index += 2
            continue
        if char == "|":
            cells.append("".join(current).strip())
            current = []
            index += 1
            continue
        current.append(char)
        index += 1
    cells.append("".join(current).strip())
    return cells


def is_table_row(line):
    """表の行になりうるか（区切られていない `|` を持っているか）。"""
    stripped = line.strip()
    if not stripped:
        return False
    if line[:4] == "    ":
        return False
    unescaped = re.sub(r"\\.", "", stripped)
    return "|" in unescaped


def is_delim_row(line):
    """区切り行か。マスが全部 `---` `:---` `---:` `:---:` のどれかであること。"""
    if not is_table_row(line):
        return False
    cells = split_cells(line)
    return bool(cells) and all(TABLE_DELIM_CELL.match(cell) for cell in cells)


class Table(object):
    """表 1 つ分。行番号は原本の行（0 から数える）。"""

    __slots__ = ("header_at", "delim_at", "rows", "header", "delim")

    def __init__(self, header_at, header, delim_at, delim):
        self.header_at = header_at
        self.header = header
        self.delim_at = delim_at
        self.delim = delim
        self.rows = []  # [(行番号, マスの並び)]


def find_tables(lines, mask=None):
    """囲みの外にある表を上から順に拾う。"""
    if mask is None:
        mask = fence_mask(lines)
    depths = [split_quote_prefix(line)[0].count(">") for line in lines]
    lines = [split_quote_prefix(line)[1] for line in lines]
    tables = []
    index = 0
    while index < len(lines) - 1:
        if mask[index] or mask[index + 1]:
            index += 1
            continue
        if depths[index] == depths[index + 1] and is_table_row(lines[index]) and not is_delim_row(lines[index]) and is_delim_row(lines[index + 1]):
            table = Table(index, split_cells(lines[index]), index + 1, split_cells(lines[index + 1]))
            cursor = index + 2
            while cursor < len(lines) and depths[cursor] == depths[index] and not mask[cursor] and is_table_row(lines[cursor]):
                table.rows.append((cursor, split_cells(lines[cursor])))
                cursor += 1
            tables.append(table)
            index = cursor
            continue
        index += 1
    return tables


def count_chars(text):
    """手引きの照合 1 と同じ数え方。飾り記号と空白を落としてから文字を数える。"""
    return len(STRIP_SPACES.sub("", STRIP_SYMBOLS.sub("", text)))


def find_numbers(text):
    """手引きの照合 2 と同じ拾い方。数の並びを出てきた順に返す。"""
    return NUMBER.findall(text)


def first_non_empty_line(lines):
    """先頭の空でない行を (行番号, 中身) で返す。全部空なら (None, "")。"""
    for index, line in enumerate(lines):
        if line.strip():
            return index, line.strip()
    return None, ""
