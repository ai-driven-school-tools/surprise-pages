"""Existing decks: keep the compared revision; upload immutable images via the edit API.

Only URL spans are patched in the temporary publication copy. The authored file,
other HTML bytes, and existing remote assets are left intact.
"""
import json
import os
import re
import subprocess
from html import escape, unescape
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote


def call(cli, args):
    result = subprocess.run([cli] + args, capture_output=True, text=True,
                            stdin=subprocess.DEVNULL, timeout=600, check=False)
    if result.returncode:
        raise ValueError((result.stderr or result.stdout).strip() or "投稿先へ接続できませんでした")
    try:
        return json.loads(result.stdout)
    except ValueError as error:
        raise ValueError("投稿コマンドの応答を読めません。道具を最新版にしてから再実行してください") from error


def read_current(cli, slug, public, allow_missing=False):
    args = ["get", "--slug", slug, "--json"]
    if public:
        args.append("--public")
    if allow_missing:
        args.append("--allow-missing")
    result = call(cli, args)
    if result is None and allow_missing:
        return None
    if not isinstance(result, dict) or not isinstance(result.get("html"), str) or not re.fullmatch(r"[0-9a-f]{40}", result.get("versionId", "")):
        raise ValueError("現在の本文と完全な版番号を取得できませんでした")
    return result


ATTR = re.compile(r'''([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))''')
CSS_URL = re.compile(r'''url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)'";]+))\s*\)''', re.I)


class ImageReferences(HTMLParser):
    def __init__(self, html, paths):
        super().__init__(convert_charrefs=False)
        self.html = html
        self.paths = set(paths)
        self.spans = []
        self.lines = [0]
        self.lines.extend(match.end() for match in re.finditer('\n', html))
        self.in_style = False
        self.feed(html)
        self.close()

    def source_offset(self):
        line, column = self.getpos()
        return self.lines[line - 1] + column

    def url(self, value, offset, html_attribute=True):
        decoded = unescape(value) if html_attribute else value
        parts = urlsplit(decoded)
        if parts.scheme or parts.netloc or parts.path.startswith('/'):
            return
        rel = os.path.normpath(unquote(parts.path)).replace(os.sep, '/')
        if rel not in self.paths:
            return
        suffix = decoded[len(parts.path):]
        self.spans.append((offset, offset + len(value), rel, suffix, html_attribute))

    def css(self, text, offset, html_attribute=False):
        # Decode entities for CSS parsing, retaining offsets into the original HTML.
        decoded, positions = '', [0]
        cursor = 0
        for entity in re.finditer(r'&(?:\#x[0-9a-fA-F]+|\#[0-9]+|[A-Za-z][A-Za-z0-9]+);', text) if html_attribute else []:
            for index in range(cursor, entity.start()):
                decoded += text[index]
                positions.append(index + 1)
            value = unescape(entity.group())
            decoded += value
            positions.extend([entity.end()] * len(value))
            cursor = entity.end()
        for index in range(cursor, len(text)):
            decoded += text[index]
            positions.append(index + 1)
        for match in CSS_URL.finditer(decoded):
            group = next(i for i in (1, 2, 3) if match.group(i) is not None)
            start, end = positions[match.start(group)], positions[match.end(group)]
            self.url(text[start:end], offset + start, html_attribute)

    def handle_starttag(self, tag, attrs):
        self.in_style = tag == 'style'
        raw = self.get_starttag_text()
        for match in ATTR.finditer(raw):
            name = match.group(1).lower()
            group = next(i for i in (2, 3, 4) if match.group(i) is not None)
            value, offset = match.group(group), self.source_offset() + match.start(group)
            if name in ('src', 'poster', 'href', 'xlink:href'):
                self.url(value, offset)
            elif name == 'srcset':
                for entry in re.finditer(r'(?:^|,)\s*([^\s,]+)', value):
                    self.url(entry.group(1), offset + entry.start(1))
            elif name == 'style':
                self.css(value, offset, True)

    def handle_endtag(self, tag):
        if tag == 'style':
            self.in_style = False

    def handle_data(self, data):
        if self.in_style:
            self.css(data, self.source_offset())

    def rewrite(self, mapping):
        result = self.html
        for start, end, rel, suffix, attribute in sorted(self.spans, reverse=True):
            value = mapping[rel] + suffix
            if attribute:
                value = escape(value, quote=True)
            result = result[:start] + value + result[end:]
        return result


def prepare_images(root, html):
    files = {}
    for current, _, names in os.walk(os.path.join(root, 'assets')):
        for name in names:
            local = os.path.join(current, name)
            rel = os.path.relpath(local, root).replace(os.sep, '/')
            if not re.search(r'\.(png|jpe?g|webp|gif|avif)$', name, re.I) or os.path.getsize(local) > 10 * 1024 * 1024:
                raise ValueError("既存スライドに追加できる画像はPNG・JPEG・WebP・GIF・AVIF、10MBまでです: " + rel)
            files[rel] = local
    refs = ImageReferences(html, files)
    used = {span[2] for span in refs.spans}
    if used != set(files):
        raise ValueError("画像の参照を確認してください。通常の画像属性かCSSのurlで参照されていない素材: " + ', '.join(sorted(set(files) - used)))
    return files, refs


def upload_images(cli, root, html, slug, public, base_version):
    files, refs = prepare_images(root, html)
    mapping = {}
    # Validate every image/reference before the first mutation.
    for rel, local in sorted(files.items()):
        args = ['upload-image', '--file', local, '--slug', slug, '--base-version', base_version]
        if public:
            args.append('--public')
        result = call(cli, args)
        src = result.get('src') if isinstance(result, dict) else None
        if not isinstance(src, str) or not re.fullmatch(r'_deck/media-[0-9a-f-]+\.(png|jpg|webp|gif|avif)', src):
            raise ValueError("編集用の画像保存先を取得できませんでした。本文は更新していません")
        mapping[rel] = src
    return refs.rewrite(mapping), mapping
