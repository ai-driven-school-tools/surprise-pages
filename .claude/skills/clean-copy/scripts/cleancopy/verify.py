# -*- coding: utf-8 -*-
"""原本とページを照合する。本文・表・図の一致を公開の条件にする。

文字数、数字、見出しの既存診断に加え、原本から独立して取り出した語順、
表の行とマス、図・コードの改行と字下げを比較する。削除台帳だけでは本文の
欠落を正当化できない。HTMLの文字参照などで生の文字数が変わる場合のみ、
見える本文が厳密に一致することを確認して診断を正規化する。
"""

import collections
import re
from html.parser import HTMLParser

from .convert import html_to_text
from .fidelity import VOID, fidelity_checks
from .source import count_chars, find_headings, find_numbers, split_lines

#: 手引きと同じ幅。語の詰め方で自然に出るぶんだけを許す
CHAR_TOLERANCE = 0.03

#: 清書で新しく立ててよい表題の数。これを超えたら「原本に無い構造を足した」
MAX_SYNTHESIZED_TITLES = 1

CONTENT_START = "<!-- CONTENT_START -->"
CONTENT_END = "<!-- CONTENT_END -->"
SOURCE_NOTE = "data-source-note"


class _RemoveSourceNotes(HTMLParser):
    """Remove declared metadata elements, never a whole line containing their name."""

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.parts = []
        self.skip = []

    def handle_starttag(self, tag, attrs):
        if self.skip or SOURCE_NOTE in dict(attrs):
            if tag not in VOID:
                self.skip.append(tag)
        else:
            self.parts.append(self.get_starttag_text())

    def handle_startendtag(self, tag, attrs):
        if not self.skip and SOURCE_NOTE not in dict(attrs):
            self.parts.append(self.get_starttag_text())

    def handle_endtag(self, tag):
        if self.skip:
            if tag == self.skip[-1]:
                self.skip.pop()
        else:
            self.parts.append("</%s>" % tag)

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)

    def handle_entityref(self, name):
        self.handle_data("&%s;" % name)

    def handle_charref(self, name):
        self.handle_data("&#%s;" % name)

    def handle_comment(self, data):
        if not self.skip:
            self.parts.append("<!--%s-->" % data)


def extract_body(page_html):
    """Extract the body and exclude only explicitly marked source-note elements."""
    if CONTENT_START in page_html and CONTENT_END in page_html:
        start = page_html.index(CONTENT_START) + len(CONTENT_START)
        body = page_html[start : page_html.index(CONTENT_END)]
    else:
        body = page_html
    parser = _RemoveSourceNotes()
    parser.feed(body)
    parser.close()
    return "".join(parser.parts)


def _digits(text):
    return collections.Counter(find_numbers(text))


def _sum_chars(entries):
    return sum(count_chars(entry) for entry in entries)


def _sum_digits(entries):
    total = collections.Counter()
    for entry in entries:
        total.update(find_numbers(entry))
    return total


def _counter_diff(left, right):
    """left から right を引いた差を、読める形に並べる。"""
    diff = []
    for key in sorted(set(left) | set(right)):
        gap = left.get(key, 0) - right.get(key, 0)
        if gap:
            diff.append({"number": key, "source": left.get(key, 0), "page": right.get(key, 0)})
    return diff


def verify(original_text, page_html, report, work_text=None):
    """文字数・数字・見出しと、本文・表・図の一致を検査する。"""
    body = extract_body(page_html)
    page_text = html_to_text(body)
    removed = list(report.get("removed_text", []))
    added = list(report.get("added_text", []))

    haystack = work_text if work_text is not None else original_text
    unknown = [entry for entry in removed if entry and entry not in haystack and entry not in original_text]
    too_many_added = len(added) > MAX_SYNTHESIZED_TITLES

    # --- 1. 文字数 -------------------------------------------------------
    source_chars = count_chars(original_text)
    expected = source_chars - _sum_chars(removed)
    actual = count_chars(page_text) - _sum_chars(added)
    gap = actual - expected
    allowed = max(1, int(round(abs(expected) * CHAR_TOLERANCE)))
    chars_ok = abs(gap) <= allowed

    # --- 2. 数字の集合 ---------------------------------------------------
    source_digits = _digits(original_text) - _sum_digits(removed)
    page_digits = _digits(page_text) - _sum_digits(added)
    digit_diff = _counter_diff(source_digits, page_digits)

    # --- 3. 見出しの数 ---------------------------------------------------
    source_headings = len(find_headings(split_lines(original_text)))
    synthesized = int(report.get("extra_headings", 0)) + int(report.get("headings_not_in_original", 0))
    page_headings = len(re.findall(r"<h[1-6]\b", body))
    headings_ok = page_headings == source_headings + synthesized and synthesized <= MAX_SYNTHESIZED_TITLES

    checks = [
        {
            "name": "1. 文字数",
            "ok": chars_ok,
            "source": source_chars,
            "page": count_chars(page_text),
            "expected_after_ledger": expected,
            "actual_after_ledger": actual,
            "gap": gap,
            "allowed": allowed,
        },
        {
            "name": "2. 数字の集合",
            "ok": not digit_diff,
            "diff": digit_diff,
        },
        {
            "name": "3. 見出しの数",
            "ok": headings_ok,
            "source": source_headings,
            "page": page_headings,
            "synthesized_titles": synthesized,
            "max_synthesized_titles": MAX_SYNTHESIZED_TITLES,
        },
    ]

    strict = fidelity_checks(original_text, body, added)
    # HTML character references legitimately change raw counts (&#65; -> A).
    # Exact visible-content equality is stronger than either aggregate check.
    if strict[0]["ok"]:
        for check in checks[:2]:
            if not check["ok"]:
                check["ok"] = True
                check["matched_after_markup_normalization"] = True
    checks.extend(strict)

    ledger = {
        "ok": not unknown and not too_many_added,
        "removed_entries": len(removed),
        "removed_chars": _sum_chars(removed),
        "added_entries": len(added),
        "added_chars": _sum_chars(added),
        "not_in_source": unknown[:10],
        "added_too_many": added[:10] if too_many_added else [],
    }

    return {
        "ok": all(check["ok"] for check in checks) and ledger["ok"],
        "checks": checks,
        "ledger": ledger,
        "notes": report.get("notes", []),
    }
