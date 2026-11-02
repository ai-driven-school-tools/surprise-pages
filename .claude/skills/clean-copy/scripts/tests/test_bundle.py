"""Offline integration tests for deterministic multi-page publication."""
import json
import hashlib
import os
import http.server
import pathlib
import socketserver
import sys
import tempfile
import threading
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from cleancopy import bundle


class FakeRemote:
    origin = "https://pages.example.test"

    def __init__(self):
        self.saved = {}
        self.assets = {}
        self.calls = []
        self.fail_slug = None
        self.report_failure_after_save = False

    def read(self, slug):
        self.calls.append(("read", slug))
        return self.saved.get(slug)

    def assets_match(self, slug, assets):
        return all(self.assets.get((slug, path)) == raw for path, raw in assets.items())

    def publish(self, page, directory, message):
        self.calls.append(("publish", page["slug"]))
        if self.fail_slug == page["slug"]:
            return False
        # Read actual files, so a build with missing/stale assets cannot pass.
        self.saved[page["slug"]] = {
            "html": (directory / "index.html").read_text(encoding="utf-8"),
            "visibility": "restricted" if page.get("restricted") else "internal",
            "versionNumber": self.saved.get(page["slug"], {}).get("versionNumber", 0) + 1,
        }
        for relative in page["assets"]:
            self.assets[(page["slug"], relative)] = (directory / relative).read_bytes()
        return not self.report_failure_after_save

    @property
    def published(self):
        return [slug for action, slug in self.calls if action == "publish"]


class _Recorder(http.server.BaseHTTPRequestHandler):
    """受けた要求の道と鍵を控える架空のサイト。/start だけは別の場所へ回す。"""
    received = []

    def do_GET(self):
        self.received.append((self.path, self.headers.get('Authorization')))
        if self.path == '/start':
            self.send_response(302)
            self.send_header('Location', '/destination')
        else:
            self.send_response(200)
        self.end_headers()

    def log_message(self, *_args):
        pass


class RemoteTransportTests(unittest.TestCase):
    """保存内容の確認に使う鍵は、投稿コマンドと同じ決まりで選ぶ（環境変数 → 手元の控え）。"""

    def setUp(self):
        _Recorder.received = []
        self.server = socketserver.TCPServer(('127.0.0.1', 0), _Recorder)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 1)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.site = 'http://127.0.0.1:%d' % self.server.server_address[1]
        # 手元の本物の控えを読まないよう、控えの置き場を空の一時フォルダへ向ける
        holder = tempfile.TemporaryDirectory()
        self.addCleanup(holder.cleanup)
        self.credential = pathlib.Path(holder.name) / 'credential'
        patcher = mock.patch.object(bundle._distribution, 'token_path', return_value=str(self.credential))
        patcher.start()
        self.addCleanup(patcher.stop)

    def remote(self, extra):
        with mock.patch.dict('os.environ', {'PAGES_HOST': self.site, **extra}):
            return bundle.Remote()

    def test_authorized_read_does_not_follow_a_redirect(self):
        remote = self.remote({'PAGES_TOKEN': 'page-token', 'PAGES_TOKEN_ORIGIN': self.site})
        with self.assertRaises(urllib.error.HTTPError):
            remote._open(remote.origin + '/start')
        self.assertEqual(_Recorder.received, [('/start', 'Bearer page-token')])

    def test_environment_key_for_another_site_is_not_sent(self):
        self.credential.write_text('stored-token\n', encoding='utf-8')
        remote = self.remote({'PAGES_TOKEN': 'page-token', 'PAGES_TOKEN_ORIGIN': 'https://another.example.test'})
        remote._open(remote.origin + '/destination').close()
        self.assertEqual(_Recorder.received, [('/destination', 'Bearer stored-token')])

    def test_stored_key_is_used_without_environment(self):
        self.credential.write_text('stored-token\n', encoding='utf-8')
        with mock.patch.dict('os.environ', {'PAGES_HOST': self.site}):
            os.environ.pop('PAGES_TOKEN', None)
            os.environ.pop('PAGES_TOKEN_ORIGIN', None)
            remote = bundle.Remote()
        remote._open(remote.origin + '/destination').close()
        self.assertEqual(_Recorder.received, [('/destination', 'Bearer stored-token')])


class PreflightTests(unittest.TestCase):
    """手元に控えが無くても、投稿先に向けた環境変数の鍵があればログイン済みとみなす（クラウドの席）。"""

    def test_environment_key_counts_as_signed_in(self):
        holder = tempfile.TemporaryDirectory()
        self.addCleanup(holder.cleanup)
        missing = str(pathlib.Path(holder.name) / 'credential')
        with mock.patch.object(bundle._distribution, 'token_path', return_value=missing), \
                mock.patch.object(bundle._distribution, 'origin', return_value='https://pages.example.test'), \
                mock.patch.dict('os.environ', {'PAGES_TOKEN': 'page-token', 'PAGES_TOKEN_ORIGIN': 'https://pages.example.test'}):
            self.assertTrue(bundle.pipeline.preflight()['logged_in'])
        with mock.patch.object(bundle._distribution, 'token_path', return_value=missing), \
                mock.patch.object(bundle._distribution, 'origin', return_value='https://pages.example.test'), \
                mock.patch.dict('os.environ', {'PAGES_TOKEN': 'page-token', 'PAGES_TOKEN_ORIGIN': 'https://another.example.test'}):
            self.assertFalse(bundle.pipeline.preflight()['logged_in'])


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name).resolve()
        self.manifest = self.root / "publish.json"
        self.output = self.root / "output"
        self.frame = self.root / "frame.html"
        self.frame.write_text('<!doctype html><html><head><title><!-- TITLE --></title><meta name="description" content="<!-- DESCRIPTION -->"></head><body><!-- CONTENT_START --><!-- CONTENT_END --></body></html>', encoding="utf-8")
        self.remote = FakeRemote()
        self.provenance = mock.patch.object(bundle.provenance, "inspect", side_effect=lambda path: {"path": pathlib.Path(path).name})
        self.provenance.start()
        self.addCleanup(self.provenance.stop)
        self.configure()

    def configure(self, reference="# Reference\n\nA cat costs 20.\n", main="# Main\n\nRead this.\n"):
        (self.root / "reference.md").write_text(reference, encoding="utf-8")
        (self.root / "main.md").write_text(main, encoding="utf-8")
        self.data = {"version": 1, "pages": [
            {"id": "reference", "slug": "lecture/references", "title": "Reference", "sources": [{"id": "reference-source", "path": "reference.md", "collapsed": True}]},
            {"id": "main", "slug": "lecture/manuscript", "title": "Manuscript", "layout": "manuscript", "sources": [{"id": "main-source", "path": "main.md"}]},
        ]}
        self.save_manifest()

    def save_manifest(self):
        self.manifest.write_text(json.dumps(self.data), encoding="utf-8")

    def run_bundle(self, **kwargs):
        return bundle.run(self.manifest, out=kwargs.pop("out", self.output), frame_path=self.frame, transport=self.remote, **kwargs)

    def test_source_metadata_can_be_collapsed_without_changing_document(self):
        self.data["pages"][1]["sources"][0]["collapse_source_note"] = True
        self.save_manifest()
        code, result = self.run_bundle()
        self.assertEqual(code, 0, result)
        rendered = self.remote.saved["lecture/manuscript"]["html"]
        self.assertIn('<details data-source-note', rendered)
        self.assertIn('文書の情報</summary>', rendered)
        self.assertIn('main.md', rendered)
        self.assertIn('Read this.', rendered)
        self.assertNotIn('<details data-source-note', self.remote.saved["lecture/references"]["html"])

    def test_source_metadata_collapse_option_rejects_non_boolean(self):
        self.data["pages"][1]["sources"][0]["collapse_source_note"] = "true"
        self.save_manifest()
        code, result = self.run_bundle()
        self.assertEqual(code, 1)
        self.assertIn('collapse_source_note', result["error"])
        self.assertEqual(self.remote.published, [])

    def test_preserve_existing_does_not_overwrite_human_edits(self):
        self.assertEqual(self.run_bundle()[0], 0)
        self.remote.saved["lecture/references"]["html"] += "<p>Human edit</p>"
        before = len(self.remote.published)
        code, result = self.run_bundle(preserve_existing=True)
        self.assertEqual(code, 1)
        self.assertIn("上書きせず", result["error"])
        self.assertEqual(len(self.remote.published), before)
        self.assertIn("Human edit", self.remote.saved["lecture/references"]["html"])

    def test_restricted_page_is_requested_at_creation_and_verified(self):
        for page in self.data["pages"]:
            page["restricted"] = True
        self.save_manifest()
        code, result = self.run_bundle()
        self.assertEqual(code, 0, result)
        self.assertTrue(all(page["visibility"] == "restricted" for page in self.remote.saved.values()))

    def test_restricted_existing_broad_page_is_not_overwritten(self):
        self.assertEqual(self.run_bundle()[0], 0)
        for page in self.data["pages"]:
            page["restricted"] = True
        self.save_manifest()
        before = len(self.remote.published)
        code, result = self.run_bundle()
        self.assertEqual(code, 1)
        self.assertIn("閲覧権限", result["error"])
        self.assertEqual(len(self.remote.published), before)

    def test_restricted_readback_must_not_report_broad_visibility(self):
        self.data["pages"][0]["restricted"] = True
        self.save_manifest()
        original = self.remote.publish
        def broken(page, directory, message):
            original(page, directory, message)
            self.remote.saved[page["slug"]]["visibility"] = "internal"
        with mock.patch.object(self.remote, "publish", side_effect=broken):
            code, result = self.run_bundle()
        self.assertEqual(code, 1)
        self.assertIn("閲覧制限", result["error"])

    def test_dry_run_verifies_every_source_without_remote_calls(self):
        original = {p: p.read_bytes() for p in (self.manifest, self.root / "reference.md", self.root / "main.md")}
        code, result = self.run_bundle(dry_run=True)
        self.assertEqual(code, 0, result)
        self.assertEqual(result["verified_sources"], 2)
        self.assertEqual(self.remote.calls, [])
        self.assertTrue((self.output / "reference/index.html").is_file())
        self.assertTrue((self.output / "main/index.html").is_file())
        self.assertEqual(original, {p: p.read_bytes() for p in original})

    def test_last_source_fidelity_failure_stops_all_publication(self):
        original_convert = bundle.convert.convert_text

        def damage(text, **kwargs):
            result = original_convert(text, **kwargs)
            if kwargs.get("heading_prefix") == "main-source":
                result["body"] = result["body"].replace("Read this.", "Lose this.")
            return result

        with mock.patch.object(bundle.convert, "convert_text", side_effect=damage):
            code, result = self.run_bundle()
        self.assertEqual(code, 1, result)
        self.assertEqual(result["stage"], "build")
        self.assertEqual(self.remote.calls, [])

    def test_unresolved_link_in_last_source_stops_all_publication(self):
        self.configure(main="# Main\n\n[Missing](missing.md)\n")
        code, result = self.run_bundle()
        self.assertEqual(code, 1, result)
        self.assertEqual(self.remote.calls, [])

    def test_publish_order_and_repeat_skip_without_duplicate_versions(self):
        first_code, first = self.run_bundle()
        self.assertEqual(first_code, 0, first)
        self.assertEqual(self.remote.published, ["lecture/references", "lecture/manuscript"])
        self.assertFalse(self.output.exists())
        second_code, second = self.run_bundle()
        self.assertEqual(second_code, 0, second)
        self.assertEqual([p["status"] for p in second["pages"]], ["unchanged", "unchanged"])
        self.assertEqual(self.remote.published, ["lecture/references", "lecture/manuscript"])
        self.assertTrue(all(value["versionNumber"] == 1 for value in self.remote.saved.values()))

    def test_partial_failure_resumes_without_reposting_success(self):
        self.remote.fail_slug = "lecture/manuscript"
        code, result = self.run_bundle()
        self.assertEqual(code, 1, result)
        self.assertEqual([p["id"] for p in result["pages"]], ["reference"])
        self.assertTrue((self.output / "result.json").is_file())
        self.remote.fail_slug = None
        code, result = self.run_bundle()
        self.assertEqual(code, 0, result)
        self.assertEqual([p["status"] for p in result["pages"]], ["unchanged", "verified"])
        self.assertEqual(self.remote.published.count("lecture/references"), 1)
        self.assertEqual(self.remote.published.count("lecture/manuscript"), 2)

    def test_saved_response_failure_is_confirmed_without_retry(self):
        self.remote.report_failure_after_save = True
        code, result = self.run_bundle()
        self.assertEqual(code, 0, result)
        self.assertEqual([p["status"] for p in result["pages"]], ["verified", "verified"])
        self.assertEqual(len(self.remote.published), 2)

    def test_cross_page_links_duplicate_headings_and_code_literals(self):
        self.configure(reference='# Reference\n\n## Same\n\nFirst.\n\n## Same\n\nSecond.\n', main='# Main\n\n[Second](reference.md#same-1)\n\n```html\nhref="reference.md#same-1"\n```\n\n`href="reference.md#same"`\n')
        code, result = self.run_bundle(dry_run=True)
        self.assertEqual(code, 0, result)
        ref = (self.output / "reference/index.html").read_text()
        main = (self.output / "main/index.html").read_text()
        self.assertIn('id="reference-source-same"', ref)
        self.assertIn('id="reference-source-same-1"', ref)
        self.assertIn('href="https://pages.example.test/internal/lecture/references#reference-source-same-1"', main)
        self.assertIn('href="reference.md#same-1"', main)
        self.assertIn('href="reference.md#same"', main)

    def test_asset_repeat_skip_repair_missing_asset_and_content_change(self):
        asset = self.root / "picture.png"
        asset.write_bytes(b"fake-image-1")
        self.configure(main="# Main\n\n![Example](picture.png)\n")
        code, result = self.run_bundle()
        self.assertEqual(code, 0, result)
        self.assertEqual(len(self.remote.assets), 1)
        original_asset_key = next(iter(self.remote.assets))
        code, result = self.run_bundle()
        self.assertEqual(code, 0, result)
        self.assertEqual(self.remote.published.count("lecture/manuscript"), 1)
        del self.remote.assets[original_asset_key]
        code, result = self.run_bundle()
        self.assertEqual(code, 0, result)
        self.assertEqual(self.remote.published.count("lecture/manuscript"), 2)
        asset.write_bytes(b"fake-image-2")
        code, result = self.run_bundle(keep=True)
        self.assertEqual(code, 0, result)
        self.assertEqual(self.remote.published.count("lecture/manuscript"), 3)
        sent_assets = list((self.output / "main/assets").rglob("*.png"))
        self.assertEqual(len(sent_assets), 1)
        self.assertEqual(sent_assets[0].read_bytes(), b"fake-image-2")
        self.assertNotIn(original_asset_key[1], self.remote.saved["lecture/manuscript"]["html"])

    def test_untracked_media_links_and_images_share_verified_assets(self):
        raw_png = b"untracked-png"
        raw_svg = b'<svg xmlns="http://www.w3.org/2000/svg"><view id="plot"/></svg>'
        (self.root / "chart.png").write_bytes(raw_png)
        (self.root / "chart.svg").write_bytes(raw_svg)
        self.configure(main='# Main\n\n[PNG 8,310](chart.png)\n\n[SVG](chart.svg#plot)\n\n![PNG 8,310](chart.png)\n')
        code, result = self.run_bundle()
        self.assertEqual(code, 0, result)
        page = self.remote.saved["lecture/manuscript"]["html"]
        png_key = 'assets/main-source/' + hashlib.sha256(raw_png).hexdigest()[:20] + '.png'
        svg_key = 'assets/main-source/' + hashlib.sha256(raw_svg).hexdigest()[:20] + '.svg'
        self.assertIn('href="' + png_key + '">PNG 8,310</a>', page)
        self.assertIn('src="' + png_key + '"', page)
        self.assertIn('href="' + svg_key + '#plot">SVG</a>', page)
        self.assertEqual(self.remote.assets, {
            ("lecture/manuscript", png_key): raw_png,
            ("lecture/manuscript", svg_key): raw_svg,
        })
        # 本文が同じでもリンク先素材が壊れていれば省略せず、保存後に再照合する。
        self.remote.assets[("lecture/manuscript", svg_key)] = b"corrupted"
        code, result = self.run_bundle()
        self.assertEqual(code, 0, result)
        self.assertEqual(self.remote.published.count("lecture/manuscript"), 2)
        self.assertEqual(self.remote.assets[("lecture/manuscript", svg_key)], raw_svg)

    def test_current_manifest_link_serves_exact_bytes_and_checks_readback(self):
        self.configure(main='# Main\n\n[Current settings](./publish.json)\n')
        # 空白や末尾改行も配布時に書き換えない。
        self.manifest.write_text(json.dumps(self.data, indent=2) + '\n\n', encoding='utf-8')
        expected = self.manifest.read_bytes()
        code, result = self.run_bundle()
        self.assertEqual(code, 0, result)
        key = 'assets/main-source/' + hashlib.sha256(expected).hexdigest()[:20] + '.json'
        self.assertEqual(self.remote.assets[("lecture/manuscript", key)], expected)
        self.assertIn('href="' + key + '">Current settings</a>', self.remote.saved["lecture/manuscript"]["html"])
        self.assertEqual(self.manifest.read_bytes(), expected)
        with mock.patch.object(self.remote, 'assets_match', return_value=False):
            code, result = self.run_bundle()
        self.assertEqual(code, 1, result)
        self.assertIn('保存内容を確認できませんでした', result['error'])

    def test_only_current_manifest_href_is_allowed_as_json_asset(self):
        cases = ('[Other settings](other.json)', '![Settings](publish.json)', '[Draft](unregistered.md)')
        (self.root / 'other.json').write_text('{"private": "not-to-publish"}')
        (self.root / 'unregistered.md').write_text('# Unregistered\n')
        for markup in cases:
            with self.subTest(markup=markup):
                self.configure(main='# Main\n\n' + markup + '\n')
                code, result = self.run_bundle()
                self.assertEqual(code, 1, result)
                self.assertEqual(self.remote.calls, [])
                self.assertEqual(self.remote.assets, {})

    def test_output_cannot_contain_originals(self):
        original = (self.root / "main.md").read_bytes()
        code, result = self.run_bundle(out=self.root)
        self.assertEqual(code, 1, result)
        self.assertEqual((self.root / "main.md").read_bytes(), original)
        self.assertEqual(self.remote.calls, [])

    def test_output_owned_by_other_manifest_is_preserved(self):
        self.output.mkdir()
        marker = self.output / ".clean-copy-owner.json"
        marker.write_text(json.dumps({"manifest": "/someone/else.json"}))
        valuable = self.output / "valuable.txt"
        valuable.write_text("Keep me")
        code, result = self.run_bundle()
        self.assertEqual(code, 1, result)
        self.assertEqual(valuable.read_text(), "Keep me")
        self.assertEqual(self.remote.calls, [])

    def test_unowned_output_is_preserved(self):
        self.output.mkdir()
        valuable = self.output / "valuable.txt"
        valuable.write_text("Keep me")
        code, result = self.run_bundle()
        self.assertEqual(code, 1, result)
        self.assertEqual(valuable.read_text(), "Keep me")

    def test_manifest_rejects_unsafe_or_ambiguous_targets(self):
        cases = [
            ("duplicate_slug", lambda: self.data["pages"][1].update(slug="lecture/references")),
            ("nested_slug", lambda: self.data["pages"][1].update(slug="lecture/references/child")),
            ("traversal", lambda: self.data["pages"][1].update(slug="lecture/../escape")),
            ("public", lambda: self.data["pages"][1].update(visibility="public")),
            ("duplicate_source_id", lambda: self.data["pages"][1]["sources"][0].update(id="reference-source")),
            ("duplicate_source_path", lambda: self.data["pages"][1]["sources"][0].update(path="reference.md")),
        ]
        for name, mutation in cases:
            with self.subTest(name=name):
                self.configure()
                mutation()
                self.save_manifest()
                code, result = self.run_bundle()
                self.assertEqual(code, 1, result)
                self.assertEqual(self.remote.calls, [])

    def test_original_changed_during_build_stops_all_publication(self):
        changed = False

        def inspect_and_change(path):
            nonlocal changed
            if not changed:
                changed = True
                (self.root / "main.md").write_text("# Main\n\nEdited concurrently.\n")
            return {"path": pathlib.Path(path).name}

        with mock.patch.object(bundle.provenance, "inspect", side_effect=inspect_and_change):
            code, result = self.run_bundle()
        self.assertEqual(code, 1, result)
        self.assertIn("原本が変わりました", result["error"])
        self.assertEqual(self.remote.calls, [])

    def test_unknown_remote_state_never_triggers_speculative_repost(self):
        with mock.patch.object(self.remote, "read", side_effect=bundle.BundleError("Cannot confirm saved state")):
            code, result = self.run_bundle()
        self.assertEqual(code, 1, result)
        self.assertEqual(self.remote.published, [])

    def test_retained_failure_records_actionable_error(self):
        self.remote.fail_slug = "lecture/manuscript"
        code, result = self.run_bundle()
        self.assertEqual(code, 1, result)
        saved_result = json.loads((self.output / "result.json").read_text())
        self.assertFalse(saved_result["ok"])
        self.assertEqual(saved_result["error"], result["error"])
        self.assertEqual([p["id"] for p in saved_result["pages"]], ["reference"])

    def test_svg_fragment_preserved_after_asset_copy(self):
        (self.root / "sprite.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"><view id="logo"/></svg>')
        self.configure(main="# Main\n\n![Logo](sprite.svg#logo)\n")
        code, result = self.run_bundle(dry_run=True)
        self.assertEqual(code, 0, result)
        page = (self.output / "main/index.html").read_text()
        self.assertRegex(page, r'src="assets/main-source/[a-f0-9]+\.svg#logo"')
        self.assertEqual(len(list((self.output / "main/assets").rglob("*.svg"))), 1)

    def test_unsupported_asset_attributes_stop_before_publication(self):
        cases = ('<img srcset="missing-2x.png 2x">', '<video poster="missing-poster.png"></video>')
        for markup in cases:
            with self.subTest(markup=markup):
                self.configure(main="# Main\n\n" + markup + "\n")
                code, result = self.run_bundle()
                self.assertEqual(code, 1, result)
                self.assertEqual(self.remote.calls, [])
                self.assertTrue("srcset" in result["error"] or "poster" in result["error"])

    def test_raw_footnote_and_html_ids_are_unique_between_sources(self):
        content = ('# Title\n\n'
                   '<div data-id="keep-marker" id="intro">Intro</div>\n\n'
                   '<sup id="fnref-1"><a href="#fn-1">1</a></sup>\n\n'
                   '<p id="fn-1">Footnote <a href="#fnref-1">Back</a></p>\n\n'
                   '```html\n<div id="intro">Example</div>\n```\n')
        self.configure(reference=content, main=content)
        self.data["pages"][0]["sources"] += self.data["pages"][1]["sources"]
        self.data["pages"] = self.data["pages"][:1]
        self.save_manifest()
        code, result = self.run_bundle(dry_run=True)
        self.assertEqual(code, 0, result)
        page = (self.output / "reference/index.html").read_text()
        index = bundle.HtmlIndex()
        index.feed(page)
        for prefix in ("reference-source", "main-source"):
            for identifier in ("intro", "fn-1", "fnref-1"):
                self.assertIn(prefix + "-" + identifier, index.ids)
            for identifier in ("fn-1", "fnref-1"):
                self.assertIn("https://pages.example.test/internal/lecture/references#" + prefix + "-" + identifier, index.links)
        self.assertEqual(len(index.ids), len(set(index.ids)))
        self.assertEqual(page.count('data-id="keep-marker"'), 2)
        self.assertEqual(page.count('&lt;div id="intro"&gt;Example&lt;/div&gt;'), 2)

    def test_unknown_manifest_fields_are_rejected_at_every_level(self):
        for level in ("root", "page", "source"):
            with self.subTest(level=level):
                self.configure()
                target = {"root": self.data, "page": self.data["pages"][0], "source": self.data["pages"][0]["sources"][0]}[level]
                target["unknown_setting"] = True
                self.save_manifest()
                code, result = self.run_bundle()
                self.assertEqual(code, 1, result)
                self.assertIn("unknown_setting", result["error"])
                self.assertEqual(self.remote.calls, [])

    def test_local_query_rejected_instead_of_silently_removed(self):
        for markup in ('[Reference](reference.md?view=print)', '![Picture](picture.png?size=large)'):
            with self.subTest(markup=markup):
                (self.root / "picture.png").write_bytes(b"fake-image")
                self.configure(main="# Main\n\n" + markup + "\n")
                code, result = self.run_bundle()
                self.assertEqual(code, 1, result)
                self.assertEqual(self.remote.calls, [])

    def test_retained_result_records_completed_state(self):
        code, result = self.run_bundle(keep=True)
        self.assertEqual(code, 0, result)
        saved_result = json.loads((self.output / "result.json").read_text())
        self.assertTrue(saved_result["ok"])
        self.assertEqual(saved_result["stage"], "done")


if __name__ == "__main__":
    unittest.main()
