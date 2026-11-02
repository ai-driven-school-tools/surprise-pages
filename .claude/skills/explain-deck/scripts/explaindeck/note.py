# -*- coding: utf-8 -*-
"""出典の札 1 行。形は clean-copy の末尾行と同じ。人が書かない。"""

from . import provenance as provenance_mod

SOURCE_NOTE_CLASS = "text-xs text-ads-muted mt-20"
SOURCE_NOTE_ATTR = "data-source-note"
BODY_CLOSE = "</body"


def esc(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def esc_attr(text):
    return esc(text).replace('"', "&quot;")


def count_chars(html):
    """タグと空白を落としてから文字を数える。札の「本文 N 字」用。"""
    import re

    stripped = re.sub(r"<script\b[^>]*>.*?</script\s*>", "", html, flags=re.I | re.S)
    stripped = re.sub(r"<style\b[^>]*>.*?</style\s*>", "", stripped, flags=re.I | re.S)
    stripped = re.sub(r"<[^>]+>", "", stripped)
    return len(re.sub(r"\s+", "", stripped))


def source_note(chars, source_name, public=False, provenance=None):
    """`</body>` の直前に足す 1 行。必ず 1 行で書く。"""
    counted = esc("{:,}".format(chars))
    if public:
        return '<p data-source-note class="%s">本文 %s 字</p>' % (SOURCE_NOTE_CLASS, counted)

    info = provenance or {}
    url = info.get("url")
    path = info.get("path") or source_name
    commit = info.get("commit")
    committed_at = info.get("committed_at")
    repo = info.get("repo")
    dirty = bool(info.get("dirty"))

    attrs = ['data-source-note', 'class="%s"' % SOURCE_NOTE_CLASS]
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


def attach_note(html, note):
    """札を `</body>` の直前に 1 行足す。原本側は触らない（写しに対して呼ぶ）。"""
    lower = html.lower()
    at = lower.rfind(BODY_CLOSE)
    if at < 0:
        if html.endswith("\n"):
            return html + note + "\n"
        return html + "\n" + note + "\n"
    prefix = html[:at]
    if not prefix.endswith("\n"):
        prefix += "\n"
    return prefix + note + "\n" + html[at:]


def has_source_note(html):
    return SOURCE_NOTE_ATTR in html
