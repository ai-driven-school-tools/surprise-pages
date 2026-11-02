# -*- coding: utf-8 -*-
"""登録した原本を一度に組み、全件照合してから順に公開する。LLM呼出しなし。"""
import fcntl
import hashlib
import html
import json
import os
from . import distribution_environment as _distribution
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

from . import convert, fix, pipeline, provenance, validate, verify
from .source import SourceError, count_chars, read_source

IDENTIFIER = re.compile(r'^[a-z0-9][a-z0-9_-]*$')
SLUG = re.compile(r'^[a-z0-9_.-]+(?:/[a-z0-9_.-]+)*$')
MEDIA_SUFFIXES = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.ico', '.mp4', '.webm', '.mp3', '.wav', '.pdf')


class BundleError(Exception):
    pass


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def required(record, key):
    value = record.get(key)
    if not isinstance(value, str) or not value.strip():
        raise BundleError('%s は空でない文字列で指定してください' % key)
    return value


def known_fields(record, fields):
    unknown = set(record) - set(fields)
    if unknown:
        raise BundleError('公開設定に未知の項目があります: ' + ', '.join(sorted(unknown)))


def load_manifest(path):
    manifest_path = Path(path).resolve()
    data = json.loads(manifest_path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or type(data.get('version')) is not int or data['version'] != 1:
        raise BundleError('公開設定の version は 1 にしてください')
    known_fields(data, ('version', 'pages'))
    pages = data.get('pages')
    if not isinstance(pages, list) or not pages:
        raise BundleError('pages に公開するページを指定してください')
    page_ids, slugs, source_ids, source_paths = set(), set(), set(), set()
    resolved = []
    for page in pages:
        if not isinstance(page, dict):
            raise BundleError('ページの指定が正しくありません')
        known_fields(page, ('id', 'slug', 'title', 'description', 'label', 'layout', 'sources', 'visibility', 'restricted'))
        pid, slug, title = (required(page, k) for k in ('id', 'slug', 'title'))
        if not IDENTIFIER.fullmatch(pid) or pid in page_ids:
            raise BundleError('ページの id が重複しているか、使えない文字があります')
        if not SLUG.fullmatch(slug) or any(x in ('.', '..') for x in slug.split('/')) or slug in slugs:
            raise BundleError('公開先の slug が不正または重複しています')
        if any(slug.startswith(s + '/') or s.startswith(slug + '/') for s in slugs):
            raise BundleError('公開先は他のページの配下にせず、別々の名前にしてください')
        if page.get('visibility', 'internal') != 'internal':
            raise BundleError('一括公開は招待した人だけの設定でだけ行えます')
        if type(page.get('restricted', False)) is not bool:
            raise BundleError('restricted は true または false にしてください')
        layout = page.get('layout', 'default')
        if layout not in convert.LAYOUTS:
            raise BundleError('layout は default / manuscript / script のどれかを指定してください')
        entries = page.get('sources')
        if not isinstance(entries, list) or not entries:
            raise BundleError('sources に原本を指定してください')
        sources = []
        for entry in entries:
            if not isinstance(entry, dict):
                raise BundleError('原本の指定が正しくありません')
            known_fields(entry, ('id', 'path', 'label', 'collapsed', 'collapse_source_note'))
            sid, relative = required(entry, 'id'), required(entry, 'path')
            target = (manifest_path.parent / relative).resolve()
            if not IDENTIFIER.fullmatch(sid) or sid in source_ids or target in source_paths:
                raise BundleError('原本の id またはファイルが重複しています')
            if not target.is_file() or target.suffix.lower() not in ('.md', '.txt'):
                raise BundleError('原本が見つからないか、Markdown/テキストではありません: %s' % relative)
            collapsed = entry.get('collapsed', False)
            if type(collapsed) is not bool:
                raise BundleError('collapsed は true または false です')
            collapse_note = entry.get('collapse_source_note', False)
            if type(collapse_note) is not bool:
                raise BundleError('collapse_source_note は true または false です')
            label = entry.get('label')
            if label is not None and (not isinstance(label, str) or not label.strip()):
                raise BundleError('label は空でない文字列です')
            sources.append({'id': sid, 'path': target, 'label': label, 'collapsed': collapsed, 'collapse_source_note': collapse_note})
            source_ids.add(sid)
            source_paths.add(target)
        description, label = page.get('description', title), page.get('label', title)
        if not isinstance(description, str) or not isinstance(label, str) or not label.strip():
            raise BundleError('ページの description と label は文字列です')
        resolved.append({'id': pid, 'slug': slug, 'title': title, 'description': description,
                         'label': label, 'layout': layout, 'sources': sources, 'restricted': page.get('restricted', False)})
        page_ids.add(pid)
        slugs.add(slug)
    return manifest_path, resolved


class HtmlIndex(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.links, self.assets = [], [], []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get('id'):
            self.ids.append(values['id'])
        if tag == 'a' and values.get('href'):
            self.links.append(values['href'])
        if tag in ('img', 'video', 'audio', 'source') and values.get('src'):
            self.assets.append(values['src'])


def rewrite_links(body, source, targets, assets, origin, manifest_path=None):
    """表示文字を触らず、引用符付きの属性だけを置き換える。"""
    def replace(match):
        name, quote, encoded = match.group(1), match.group(2), match.group(3)
        value = html.unescape(encoded)
        parsed = urllib.parse.urlsplit(value)
        if parsed.scheme in ('http', 'https', 'mailto', 'tel') or value.startswith('//'):
            return match.group(0)
        if parsed.scheme:
            if name == 'src' and parsed.scheme == 'data':
                return match.group(0)
            raise BundleError('対応していない参照形式です: %s' % value)
        path = (source['path'].parent / urllib.parse.unquote(parsed.path)).resolve() if parsed.path else source['path']
        fragment = urllib.parse.unquote(parsed.fragment)
        if parsed.query:
            raise BundleError('ローカル参照のクエリは変換できません: %s' % value)
        current_manifest = (name == 'href' and manifest_path is not None
                            and path == Path(manifest_path).resolve() and path.suffix.lower() == '.json')
        if name == 'src' or (name == 'href' and (path.suffix.lower() in MEDIA_SUFFIXES or current_manifest)):
            if not path.is_file():
                raise BundleError('画像・素材が見つかりません: %s' % value)
            if path.suffix.lower() not in MEDIA_SUFFIXES and not current_manifest:
                raise BundleError('画像・音声・動画以外のファイルは素材として公開しません: %s' % value)
            raw = path.read_bytes()
            key = 'assets/%s/%s%s' % (source['id'], hashlib.sha256(raw).hexdigest()[:20], path.suffix.lower())
            if not re.fullmatch(r'[a-z0-9/_.-]+', key):
                raise BundleError('素材の拡張子を英数字にしてください: %s' % value)
            assets[key] = raw
            destination = key + ('#' + urllib.parse.quote(fragment, safe='-_.') if fragment else '')
        elif path in targets:
            target = targets[path]
            anchor = fragment if fragment in target['anchors'] else target['id'] + ('-' + fragment if fragment else '')
            if anchor not in target['anchors']:
                raise BundleError('原本の見出しが見つかりません: %s' % value)
            destination = '%s/internal/%s#%s' % (origin, target['slug'], urllib.parse.quote(anchor, safe='-_.'))
        else:
            if not path.is_file():
                raise BundleError('参照先が見つかりません: %s' % value)
            found = provenance.inspect(str(path))
            if not found.get('url') or found.get('dirty'):
                raise BundleError('未登録の参照先の出所を確定できません: %s' % value)
            destination = found['url'] + ('#' + urllib.parse.quote(fragment, safe='-_.') if fragment else '')
        return '%s=%s%s%s' % (name, quote, html.escape(destination, quote=True), quote)
    class Rewriter(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=False)
            self.parts = []

        def start(self, tag, attrs, closed=False):
            changed = False
            values = []
            for key, value in attrs:
                if key in ('srcset', 'poster') and value:
                    raise BundleError('未対応の素材指定です。公開せず停止します: ' + key)
                if key in ('href', 'src') and value is not None:
                    original = '%s="%s"' % (key, html.escape(value, quote=True))
                    matched = re.fullmatch(r'(href|src)=(["\'])(.*?)\2', original)
                    replacement = replace(matched)
                    if replacement != original:
                        value = html.unescape(replacement[len(key) + 2:-1])
                        changed = True
                values.append((key, value))
            if not changed:
                self.parts.append(self.get_starttag_text())
                return
            formatted = ''.join(' ' + k if v is None else ' %s="%s"' % (k, html.escape(v, quote=True)) for k, v in values)
            self.parts.append('<' + tag + formatted + (' />' if closed else '>'))

        def handle_starttag(self, tag, attrs): self.start(tag, attrs)
        def handle_startendtag(self, tag, attrs): self.start(tag, attrs, True)
        def handle_endtag(self, tag): self.parts.append('</%s>' % tag)
        def handle_data(self, data): self.parts.append(data)
        def handle_entityref(self, name): self.parts.append('&%s;' % name)
        def handle_charref(self, name): self.parts.append('&#%s;' % name)
        def handle_comment(self, text): self.parts.append('<!--%s-->' % text)
        def handle_decl(self, text): self.parts.append('<!%s>' % text)
    parser = Rewriter()
    parser.feed(body)
    parser.close()
    return ''.join(parser.parts)


def namespace_ids(body, prefix):
    """脚注や原本のHTMLの移動先も、別の原本と衝突しないようにする。"""
    class Namespacer(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=False)
            self.parts = []

        def handle_starttag(self, tag, attrs):
            current = self.get_starttag_text()
            identifier = dict(attrs).get('id')
            if identifier and not identifier.startswith(prefix + '-'):
                values = [(key, prefix + '-' + value if key == 'id' else value) for key, value in attrs]
                formatted = ''.join(' ' + k if v is None else ' %s="%s"' % (k, html.escape(v, quote=True)) for k, v in values)
                current = '<' + tag + formatted + (' />' if current.rstrip().endswith('/>') else '>')
            self.parts.append(current)

        def handle_startendtag(self, tag, attrs): self.handle_starttag(tag, attrs)
        def handle_endtag(self, tag): self.parts.append('</%s>' % tag)
        def handle_data(self, data): self.parts.append(data)
        def handle_entityref(self, name): self.parts.append('&%s;' % name)
        def handle_charref(self, name): self.parts.append('&#%s;' % name)
        def handle_comment(self, text): self.parts.append('<!--%s-->' % text)
        def handle_decl(self, text): self.parts.append('<!%s>' % text)
    parser = Namespacer()
    parser.feed(body)
    parser.close()
    return ''.join(parser.parts)


def build(pages, frame_path=None, mermaid_template=None, origin='', manifest_path=None):
    frame = Path(frame_path or pipeline.DEFAULT_FRAME).read_text(encoding='utf-8')
    targets, rendered, snapshots = {}, {}, {}
    if manifest_path is not None:
        manifest_path = Path(manifest_path).resolve()
        snapshots[str(manifest_path)] = manifest_path.read_bytes()
    for page in pages:
        for source in page['sources']:
            original = read_source(str(source['path']))
            snapshots[str(source['path'])] = source['path'].read_bytes()
            checked = validate.validate_text(original, str(source['path'].parent), str(source['path']))
            blockers = [v for v in checked['findings'] if v['severity'] == 'error' and not v['default']]
            if blockers:
                raise BundleError('原本を検査できません: %s: %s' % (source['path'], blockers))
            fixed, repairs = fix.fix_text(original, apply_defaults=True,
                                          title=source['label'] or source['path'].stem)
            built = convert.convert_text(fixed, original_text=original, layout=page['layout'], heading_prefix=source['id'])
            built['body'] = namespace_ids(built['body'], source['id'])
            checked = verify.verify(original, built['body'], built, work_text=fixed)
            if not checked['ok']:
                raise BundleError('原本との照合に失敗: %s: %s' % (source['path'], checked))
            index = HtmlIndex()
            index.feed(built['body'])
            anchors = set(index.ids) | {source['id']}
            targets[source['path']] = {'id': source['id'], 'slug': page['slug'], 'anchors': anchors}
            rendered[source['id']] = {'original': original, 'fixed': fixed, 'built': built, 'repairs': repairs}
    result = []
    for page in pages:
        assets, parts, reports = {}, [], []
        navigation = ['<a href="#%s">%s</a>' % (s['id'], html.escape(s['label'] or rendered[s['id']]['built']['title'])) for s in page['sources']]
        navigation += ['<a href="%s/internal/%s">%s</a>' % (origin, other['slug'], html.escape(other['label'])) for other in pages if other['id'] != page['id']]
        parts.append('<nav data-clean-copy-ui="navigation" aria-label="目次" class="mb-12">%s</nav>' % ' ／ '.join(navigation))
        for source in page['sources']:
            one = rendered[source['id']]
            body = rewrite_links(one['built']['body'], source, targets, assets, origin, manifest_path)
            verified = verify.verify(one['original'], body, one['built'], work_text=one['fixed'])
            if not verified['ok']:
                raise BundleError('参照先の変換後に原本と一致しません: %s' % source['path'])
            found = provenance.inspect(str(source['path']))
            note = convert.source_note(count_chars(one['original']), found.get('path') or source['path'].name, provenance=found)
            # 複数原本を既存の単一ファイル取り込み機能へ誤認させない。
            for attr in ('repo', 'path', 'commit'):
                note = note.replace('data-source-' + attr, 'data-clean-copy-' + attr)
            if source['collapse_source_note']:
                note = '<details data-source-note class="mt-6 text-xs text-ads-muted"><summary class="cursor-pointer">文書の情報</summary>%s</details>' % note
            label = ' data-clean-copy-label="%s"' % html.escape(source['label'], quote=True) if source['label'] else ''
            fragment = '<article data-clean-copy-source-id="%s"%s>%s\n%s</article>' % (source['id'], label, body, note)
            if source['collapsed']:
                parts.append('<details id="%s" class="my-6 border-t border-ads-border pt-6"><summary class="cursor-pointer font-bold text-ads-text">%s</summary>%s</details>' % (source['id'], html.escape(source['label'] or one['built']['title']), fragment))
            else:
                parts.append('<section id="%s">%s</section>' % (source['id'], fragment))
            reports.append({'id': source['id'], 'path': str(source['path']), 'sha256': hashlib.sha256(snapshots[str(source['path'])]).hexdigest(), 'repairs': one['repairs'], 'verified': True})
        needs_mermaid = any(rendered[s['id']]['built']['needs_mermaid'] for s in page['sources'])
        snippet = convert.mermaid_snippet(mermaid_template or pipeline.mermaid_path()) if needs_mermaid else None
        text = convert.build_page(frame, page['title'], page['description'], '\n'.join(parts), snippet, layout=page['layout'])
        index = HtmlIndex()
        index.feed(text)
        if len(index.ids) != len(set(index.ids)):
            raise BundleError('ページ内の移動先が重複しています: %s' % page['id'])
        if any(urllib.parse.unquote(link[1:]) not in index.ids for link in index.links if link.startswith('#')):
            raise BundleError('ページ内の移動先が見つかりません: %s' % page['id'])
        result.append({'id': page['id'], 'slug': page['slug'], 'html': text, 'assets': assets, 'sha256': digest(text), 'sources': reports, 'restricted': page.get('restricted', False)})
    for path, raw in snapshots.items():
        if Path(path).read_bytes() != raw:
            raise BundleError('処理中に原本が変わりました: %s' % path)
    return result


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Remote:
    def __init__(self):
        host = _distribution.origin().rstrip('/')
        self.origin = host if host.startswith(('https://', 'http://')) else 'https://' + host
        parsed = urllib.parse.urlsplit(self.origin)
        if parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
            raise BundleError('投稿先はサイトのURLだけを指定してください')
        self.token = _distribution.publish_token() or ''
        self.opener = urllib.request.build_opener(_NoRedirect)

    def _open(self, url):
        if urllib.parse.urlsplit(url).scheme + '://' + urllib.parse.urlsplit(url).netloc != self.origin:
            raise BundleError('保存内容の確認先が投稿先と異なります')
        headers = {'Authorization': 'Bearer ' + self.token}
        return self.opener.open(urllib.request.Request(url, headers=headers), timeout=30)

    def read(self, slug):
        url = self.origin + '/api/pages/source?' + urllib.parse.urlencode({'slug': 'internal/' + slug})
        try:
            with self._open(url) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            raise BundleError('保存内容を確認できません（HTTP %d）' % error.code)
        except (urllib.error.URLError, TimeoutError, ValueError):
            raise BundleError('保存内容の確認が完了しませんでした。再投稿せず停止します')

    def assets_match(self, slug, assets):
        for relative, expected in assets.items():
            url = self.origin + '/internal/' + slug + '/' + relative
            try:
                with self._open(url) as response:
                    if response.read(len(expected) + 1) != expected:
                        return False
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    return False
                raise BundleError('素材を確認できません（HTTP %d）' % error.code)
            except (urllib.error.URLError, TimeoutError):
                raise BundleError('素材の保存確認が完了しませんでした')
        return True

    def publish(self, page, directory, message):
        if page['assets']:
            command = [pipeline.cli_path(), '--dir', str(directory)]
        else:
            command = [pipeline.cli_path(), '--file', str(directory / 'index.html')]
        command += ['--slug', page['slug'], '--message', message, '--no-update-check']
        if page.get('restricted'):
            command.append('--restricted')
        try:
            process = subprocess.run(command, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=pipeline.PUBLISH_TIMEOUT)
            return process.returncode == 0
        except (OSError, subprocess.SubprocessError):
            return False


def run(path, out=None, dry_run=False, keep=False, frame_path=None, mermaid_template=None, transport=None, preserve_existing=False):
    """公開済みの本文も照合する。失敗した出力だけ残し、同じ呼出しで再開できる。"""
    payload = {'ok': False, 'stage': 'validate', 'pages': [], 'dry_run': dry_run}
    lock_handle = None
    state_path = None
    try:
        manifest, pages = load_manifest(path)
        directory = Path(out).resolve() if out else Path(tempfile.gettempdir()) / 'clean-copy-bundles' / digest(str(manifest))[:16]
        originals = [manifest] + [s['path'] for p in pages for s in p['sources']]
        if any(p == directory or directory in p.parents for p in originals):
            raise BundleError('出力先に原本や公開設定を含めることはできません')
        directory.parent.mkdir(parents=True, exist_ok=True)
        locks = Path(tempfile.gettempdir()) / 'clean-copy-bundles'
        locks.mkdir(parents=True, exist_ok=True)
        lock_handle = open(locks / (digest(str(manifest)) + '.lock'), 'w')
        try:
            fcntl.flock(lock_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise BundleError('同じ公開設定を処理中です。終了してから再実行してください')
        owner = directory / '.clean-copy-owner.json'
        if directory.exists() and any(directory.iterdir()):
            if not owner.is_file() or json.loads(owner.read_text(encoding='utf-8')).get('manifest') != str(manifest):
                raise BundleError('別の用途の出力先は上書きしません。空の場所を指定してください')
        remote = transport or Remote()
        payload['stage'] = 'build'
        built = build(pages, frame_path, mermaid_template, remote.origin, manifest)
        directory.mkdir(parents=True, exist_ok=True)
        owner.write_text(json.dumps({'manifest': str(manifest)}), encoding='utf-8')
        # 検証済みの出力だけで公開用のフォルダを作る。古い素材は混ぜない。
        for item in built:
            target = directory / item['id']
            if target.exists():
                shutil.rmtree(target)
            target.mkdir(parents=True)
            (target / 'index.html').write_text(item['html'], encoding='utf-8')
            for relative, raw in item['assets'].items():
                asset = target / relative
                asset.parent.mkdir(parents=True, exist_ok=True)
                asset.write_bytes(raw)
        state_path = directory / 'result.json'
        payload.update({'stage': 'verify', 'out': str(directory), 'verified_sources': sum(len(p['sources']) for p in built)})
        if dry_run:
            payload.update({'ok': True, 'pages': [{'id': p['id'], 'slug': p['slug'], 'sha256': p['sha256'], 'sources': p['sources']} for p in built]})
            state_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
            return 0, payload
        if transport is None:
            payload['stage'] = 'preflight'
            ready = pipeline.preflight()
            if not ready.get('cli') or not remote.token:
                raise BundleError('投稿コマンドまたはログインが必要です。ログイン後に同じ呼出しを再実行してください')
        payload['stage'] = 'publish'
        for item in built:
            existing = remote.read(item['slug'])
            if item.get('restricted') and existing is not None and existing.get('visibility') != 'restricted':
                raise BundleError('既存ページの閲覧権限が指定より広いため停止します')
            same = existing is not None and existing.get('html') == item['html']
            if preserve_existing and existing is not None and not same:
                raise BundleError('公開済みの本文が異なるため、上書きせず停止しました。編集内容を確認してください')
            # 本文だけでなく素材の実データも一致した場合にだけ省略する。
            if same and remote.assets_match(item['slug'], item['assets']):
                status = 'unchanged'
            else:
                remote.publish(item, directory / item['id'], '清書: ' + manifest.name)
                existing = remote.read(item['slug'])
                if existing is None or existing.get('html') != item['html'] or not remote.assets_match(item['slug'], item['assets']):
                    raise BundleError('保存内容を確認できませんでした: %s。成功済みは再投稿せず、同じ呼出しで再開できます' % item['id'])
                if item.get('restricted') and existing.get('visibility') != 'restricted':
                    raise BundleError('保存後の閲覧制限を確認できませんでした')
                status = 'verified'
            payload['pages'].append({'id': item['id'], 'status': status, 'url': remote.origin + '/internal/' + item['slug'], 'sha256': item['sha256'], 'version': existing.get('versionNumber'), 'sources': item['sources']})
            state_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
        payload.update({'ok': True, 'stage': 'done', 'cleanup': not keep})
        state_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
        if not keep:
            shutil.rmtree(directory)
        return 0, payload
    except (BundleError, OSError, ValueError, SourceError, convert.ConvertError) as error:
        payload.update({'error': str(error), 'next': ['表示された問題を確認し、同じ公開設定で再実行する。原本と生成HTMLは手で直さない']})
        if state_path is not None:
            try:
                state_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
            except OSError:
                pass
        return 1, payload
    finally:
        if lock_handle is not None:
            lock_handle.close()
