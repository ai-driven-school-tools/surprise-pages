"""Offline contract tests using the real publishing CLI and a local HTTP service.

SURPRISE_PAGES_TEST_CLI=/path/to/bin/pages-publish python3 scripts/test_update.py
No production credentials or storage are used.
"""
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from urllib.parse import urlsplit

from explaindeck import pipeline, check
from explaindeck.update import ImageReferences, read_current

CLI = os.environ.get('SURPRISE_PAGES_TEST_CLI', str(Path(__file__).resolve().parents[4] / 'bin/pages-publish'))
STUB = Path(__file__).resolve().parents[1] / 'fixtures/_stub/deck.html'
GREEN = Path(__file__).resolve().parents[1] / 'fixtures/01-ok/in.html'
V1, V2 = 'a' * 40, 'b' * 40
SRC = '_deck/media-11111111-1111-4111-8111-111111111111.png'
PNG = bytes.fromhex('89504e470d0a1a0a')


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.state = {'version': V1, 'requests': [], 'image': None, 'published': None,
                      'race': None, 'read_status': None, 'upload_status': None}
        state = self.state

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def respond(self, status, body):
                self.send_response(status)
                self.send_header('content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(body).encode())

            def do_GET(self):
                state['requests'].append(('GET', self.path))
                if state['read_status']:
                    return self.respond(state['read_status'], {'error': '読めません'})
                if state['version'] is None:
                    return self.respond(404, {'error': 'ありません'})
                self.respond(200, {'versionId': state['version'], 'html': '<body data-deck><img src="old.png">元の本文</body>'})

            def do_POST(self):
                path = urlsplit(self.path).path
                data = self.rfile.read(int(self.headers.get('content-length', '0')))
                state['requests'].append(('POST', path))
                if path == '/api/pages/deck-edit/assets':
                    if state['upload_status']:
                        return self.respond(state['upload_status'], {'error': '編集できません'})
                    state['image'] = data
                    if state['race'] == 'upload':
                        state['version'] = V2
                    return self.respond(201, {'src': SRC, 'intrinsicWidth': 1, 'intrinsicHeight': 1})
                if path == '/api/pages/upload':
                    state['image'] = data
                    return self.respond(200, {})
                if path == '/api/pages/prepare':
                    if state['race'] == 'save':
                        state['version'] = V2
                    return self.respond(200, {'frozen': 0, 'versionId': state['version']})
                if path == '/api/pages':
                    body = json.loads(data)
                    if state['version'] and body.get('baseVersionId') != state['version']:
                        return self.respond(409, {'error': '別の編集が入りました'})
                    state['published'] = body
                    state['version'] = V2
                    return self.respond(200, {'versionNumber': 2, 'url': 'https://example.test/internal/decks/test'})
                self.respond(404, {})

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.env = patch.dict(os.environ, {'PAGES_HOST': 'http://127.0.0.1:%d' % self.server.server_port,
                                          'PAGES_TOKEN_ORIGIN': 'http://127.0.0.1:%d' % self.server.server_port,
                                          'PAGES_TOKEN': 'test-only', 'PAGES_NO_UPDATE_CHECK': '1',
                                          'SURPRISE_PAGES_CONFIG': str(self.root / 'no-credentials')})
        self.env.start()
        self.source = self.root / 'index.html'
        raw = check.apply_embed_placeholder(GREEN.read_text(), check.embed_block(STUB.read_text()))
        self.original = raw.replace('<aside', '<img src="assets/new.png"><img src="old.png"><aside', 1)
        self.source.write_text(self.original)
        (self.root / 'assets').mkdir()
        (self.root / 'assets/new.png').write_bytes(PNG)
        self.copies = []

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.env.stop()
        for copy in self.copies:
            import shutil
            shutil.rmtree(copy, ignore_errors=True)
        self.temp.cleanup()

    def run_publish(self, base=V1, **kwargs):
        code, result = pipeline.run(str(self.source), slug='decks/test', cli=CLI,
                                    base_version=base, template_path_override=str(STUB),
                                    no_git=True, keep=True, **kwargs)
        if result.get('copy'):
            self.copies.append(Path(result['copy']).parent)
        self.assertEqual(self.source.read_text(), self.original)
        return code, result

    def test_new_post_uses_original_asset_route(self):
        self.state['version'] = None
        code, result = self.run_publish(None)
        self.assertEqual(code, 0, result)
        self.assertIn(('POST', '/api/pages/upload'), self.state['requests'])
        self.assertIn('assets/new.png', self.state['published']['html'])
        self.assertEqual(self.state['published']['keep'], ['assets/new.png'])

    def test_read_then_image_update_preserves_old_assets(self):
        current = read_current(CLI, 'decks/test', False)
        self.assertEqual(current['versionId'], V1)
        self.assertIn('元の本文', current['html'])
        code, result = self.run_publish(current['versionId'])
        self.assertEqual(code, 0, result)
        self.assertEqual(self.state['image'], PNG)
        self.assertIn(SRC, self.state['published']['html'])
        self.assertIn('src="old.png"', self.state['published']['html'])
        self.assertNotIn('keep', self.state['published'])
        self.assertNotIn(('POST', '/api/pages/upload'), self.state['requests'])
        self.assertEqual(self.state['published']['baseVersionId'], V1)

    def test_missing_or_stale_base_stops_before_mutation(self):
        for base in (None, V2):
            code, _ = self.run_publish(base)
            self.assertEqual(code, 1)
        self.assertFalse(any(method == 'POST' for method, _ in self.state['requests']))

    def test_edit_during_image_upload_stops_before_body_update(self):
        self.state['race'] = 'upload'
        code, _ = self.run_publish()
        self.assertEqual(code, 1)
        self.assertIsNone(self.state['published'])
        self.assertNotIn(('POST', '/api/pages'), self.state['requests'])
        self.assertEqual(self.state['version'], V2)

    def test_edit_at_commit_is_not_retried(self):
        self.state['race'] = 'save'
        code, _ = self.run_publish()
        self.assertEqual(code, 1)
        self.assertIsNone(self.state['published'])
        self.assertEqual(self.state['requests'].count(('POST', '/api/pages')), 1)

    def test_forbidden_image_does_not_publish(self):
        self.state['upload_status'] = 404
        code, _ = self.run_publish()
        self.assertEqual(code, 1)
        self.assertIsNone(self.state['published'])

    def test_auth_failure_is_not_new_post(self):
        self.state['read_status'] = 401
        code, _ = self.run_publish(None)
        self.assertEqual(code, 1)
        self.assertFalse(any(method == 'POST' for method, _ in self.state['requests']))

    def test_non_image_and_unused_files_stop_before_upload(self):
        (self.root / 'assets/notes.pdf').write_bytes(b'pdf')
        code, _ = self.run_publish()
        self.assertEqual(code, 1)
        self.assertFalse(any(method == 'POST' for method, _ in self.state['requests']))

    def test_no_images_updates_body_only(self):
        (self.root / 'assets/new.png').unlink()
        (self.root / 'assets').rmdir()
        code, result = self.run_publish()
        self.assertEqual(code, 0, result)
        self.assertIsNone(self.state['image'])
        self.assertNotIn('keep', self.state['published'])

    def test_dry_run_never_contacts_server(self):
        code, result = self.run_publish(dry_run=True)
        self.assertEqual(code, 0, result)
        self.assertEqual(self.state['requests'], [])
        self.assertIn(V1, result['update_plan'][0])
        self.assertNotIn('command', result)
        self.assertNotIn('would_publish', result)

    def test_url_patches_preserve_unrelated_bytes(self):
        html = '''<!-- assets/new.png --><script>"assets/new.png"</script><p>assets/new.png</p>
<IMG data-x="a>b" SRC='./assets/new.png?q=1&amp;x=2#part'>
<source srcset="assets/new.png 1x, https://elsewhere/new.png 2x">
<style>.a{background:url("assets/new.png")}</style><div style="background:url('assets/new.png')"></div>'''
        changed = ImageReferences(html, ['assets/new.png']).rewrite({'assets/new.png': SRC})
        self.assertTrue(changed.startswith('<!-- assets/new.png --><script>"assets/new.png"</script><p>assets/new.png</p>'))
        self.assertIn("SRC='" + SRC + '?q=1&amp;x=2#part', changed)
        self.assertEqual(changed.count(SRC), 4)
        self.assertIn('https://elsewhere/new.png', changed)
        encoded = '<div style="background:url(&quot;assets/new.png?q=1&amp;x=2&quot;)"></div>'
        rewritten = ImageReferences(encoded, ['assets/new.png']).rewrite({'assets/new.png': SRC})
        self.assertEqual(rewritten, encoded.replace('assets/new.png', SRC))


if __name__ == '__main__':
    unittest.main()
