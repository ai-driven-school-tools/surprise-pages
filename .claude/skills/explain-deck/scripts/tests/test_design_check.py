"""Pages owns the schema; the skill must call it and propagate failures without changing the original."""
import json
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from explaindeck import check


def listed(block):
    """A compatibility list holding only the navigation script of this exact block."""
    script = check.navigation_span(block)
    return {"navigation": {check._sha256(block[script[0] : script[1]])}, "design": set()}


class DesignBridgeTest(unittest.TestCase):
    def setUp(self):
        self.holder = tempfile.TemporaryDirectory()
        root = Path(self.holder.name)
        self.template = root / "src" / "templates" / "deck.html"
        self.template.parent.mkdir(parents=True)
        skill = Path(check.__file__).resolve().parents[2]
        template = (skill / "fixtures" / "_stub" / "deck.html").read_text()
        self.template.write_text(template)
        self.source = root / "a deck.html"
        self.original = '<html><head><script type="application/json" data-deck-design>{}</script></head><body data-deck><main data-deck-slides><section data-deck-slide><h1>例</h1></section></main>' + check.embed_block(template) + '</body></html>'
        self.source.write_text(self.original)

    def tearDown(self):
        self.holder.cleanup()

    def run_result(self, payload, code=0):
        result = subprocess.CompletedProcess([], code, json.dumps(payload), "")
        with patch.object(check.subprocess, "run", return_value=result) as called:
            report = check.check_file(str(self.source), template_path=str(self.template))
        return report, called

    def test_uses_pages_validator_with_original_path(self):
        report, called = self.run_result({"ok": True})
        self.assertTrue(report["ok"])
        args = called.call_args.args[0]
        self.assertEqual(args[0], "node")
        # 雛形は <リポジトリ>/src/templates/ にあり、検査はリポジトリ直下の bin/ にある
        self.assertEqual(os.path.normpath(args[1]), str(self.template.parent.parent.parent / "bin" / "deck-design-check.mjs"))
        self.assertEqual(args[2], str(self.source))
        self.assertEqual(self.source.read_text(), self.original)

    def test_failure_stops_before_publish(self):
        report, _ = self.run_result({"ok": False, "message": "目印が重複しています"}, 1)
        self.assertFalse(report["ok"])
        self.assertEqual(report["findings"][-1]["code"], "DESIGN_INVALID")
        self.assertEqual(report["findings"][-1]["detail"], "目印が重複しています")

    def test_missing_validator_stops_with_action(self):
        with patch.object(check.subprocess, "run", side_effect=FileNotFoundError()):
            report = check.check_file(str(self.source), template_path=str(self.template))
        self.assertFalse(report["ok"])
        self.assertIn("最新", report["findings"][-1]["detail"])

    def test_legacy_does_not_require_design_validator(self):
        self.source.write_text(self.original.replace(' data-deck-design', ''))
        with patch.object(check.subprocess, "run") as called:
            report = check.check_file(str(self.source), template_path=str(self.template))
        self.assertTrue(report["ok"])
        called.assert_not_called()

    def test_known_previous_runtime_remains_publishable(self):
        skill = Path(check.__file__).resolve().parents[2]
        previous = (skill / "fixtures" / "_stub" / "deck-legacy.html").read_text()
        legacy = check.embed_block(previous)
        (self.template.parent / check.COMPAT_NAME).write_text(json.dumps({"navigation": list(listed(legacy)["navigation"]), "design": []}))
        self.source.write_text(
            '<html><head><title>旧資料</title></head><body data-deck>'
            '<main data-deck-slides><section data-deck-slide><h1>例</h1></section></main>'
            + legacy + '</body></html>'
        )
        with patch.object(check.subprocess, "run") as called:
            report = check.check_file(str(self.source), template_path=str(self.template))
        self.assertTrue(report["ok"])
        self.assertTrue(check.has_known_runtime(self.source.read_text(), listed(legacy)))
        called.assert_not_called()

    def test_font_geometry_runtime_remains_accepted_unchanged(self):
        skill = Path(check.__file__).resolve().parents[2]
        previous = (skill / "fixtures" / "_stub" / "deck-fonts-legacy.html").read_text()
        embedded = check.embed_block(previous)
        self.assertTrue(check.has_known_runtime(embedded, listed(embedded)))
        self.assertFalse(check.has_known_runtime(embedded.replace("var WIDTH = 1280;", "var WIDTH = 1200;", 1), listed(embedded)))

    def test_named_links_runtime_remains_accepted_unchanged(self):
        skill = Path(check.__file__).resolve().parents[2]
        previous = (skill / "fixtures" / "_stub" / "deck-named-links-legacy.html").read_text()
        embedded = check.embed_block(previous)
        self.assertTrue(check.has_known_runtime(embedded, listed(embedded)))
        self.assertFalse(check.has_known_runtime(embedded.replace("var WIDTH = 1280;", "var WIDTH = 1200;", 1), listed(embedded)))

    def test_step_control_runtime_remains_accepted_unchanged(self):
        skill = Path(check.__file__).resolve().parents[2]
        previous = (skill / "fixtures" / "_stub" / "deck-catalog-legacy.html").read_text()
        embedded = check.embed_block(previous)
        self.assertTrue(check.has_known_runtime(embedded, listed(embedded)))
        self.assertFalse(check.has_known_runtime(embedded.replace('var shown = 0;', 'var shown = 1;', 1), listed(embedded)))

    def test_guided_runtime_remains_publishable_without_rewriting_source(self):
        skill = Path(check.__file__).resolve().parents[2]
        previous = (skill / "fixtures" / "_stub" / "deck-guided-legacy.html").read_text()
        embedded = check.embed_block(previous)
        self.assertEqual(
            hashlib.sha256(embedded.encode()).hexdigest(),
            "99ae27bdf76c441a305913e79b3991b00cf1ebb203b2b2ef5681748d0e5250e8",
        )
        (self.template.parent / check.COMPAT_NAME).write_text(json.dumps({"navigation": list(listed(embedded)["navigation"]), "design": []}))
        original = (
            '<html><head><title>段階表示の旧資料</title>'
            '<script type="application/json" data-deck-design>{}</script></head>'
            '<body data-deck><main data-deck-slides>'
            '<section data-deck-slide><h1>原稿はそのまま</h1></section></main>'
            + embedded + '</body></html>'
        )
        self.source.write_text(original)
        with patch.object(check.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, '{"ok":true}', "")) as called:
            report = check.check_file(str(self.source), template_path=str(self.template))
        self.assertTrue(report["ok"], report["findings"])
        self.assertTrue(check.has_known_runtime(original, listed(embedded)))
        self.assertEqual(self.source.read_text(), original)
        called.assert_called_once()

    def test_guided_runtime_compatibility_requires_exact_bytes(self):
        skill = Path(check.__file__).resolve().parents[2]
        previous = (skill / "fixtures" / "_stub" / "deck-guided-legacy.html").read_text()
        changed = check.embed_block(previous).replace('var shown = 0;', 'var shown = 1;', 1)
        self.assertNotEqual(changed, check.embed_block(previous))
        self.assertFalse(check.has_known_runtime(changed, listed(check.embed_block(previous))))
        findings, _title = check.check_html(self.original.replace(check.embed_block(self.template.read_text()), changed), self.template.read_text())
        self.assertIn("TEMPLATE_MISMATCH", [item["code"] for item in findings])

    def test_only_known_inert_data_scripts_are_allowed_in_slides(self):
        allowed = [('type', 'application/json'), ('data-dd-chart-source', None)]
        self.assertTrue(check._allowed_data_script(allowed))
        self.assertFalse(check._allowed_data_script(allowed + [('src', '/run.js')]))
        self.assertFalse(check._allowed_data_script([('type', 'text/javascript'), ('data-dd-chart-source', None)]))
        self.assertFalse(check._allowed_data_script([('type', 'application/json'), ('data-unknown', None)]))

    def test_only_exact_companion_css_is_excluded(self):
        shared = '<style>.shared{font-size:12px;color:#123456}</style>'
        source = self.original.replace('</head>', shared + '</head>')
        clean, _title = check.check_html(source, self.template.read_text(), [shared])
        self.assertEqual(clean, [])
        changed, _title = check.check_html(source.replace('#123456', '#123457'), self.template.read_text(), [shared])
        self.assertIn('FONT_TOO_SMALL', [item['code'] for item in changed])
        self.assertIn('RAW_COLOR', [item['code'] for item in changed])


if __name__ == "__main__":
    unittest.main()


class CompatibilityListTest(unittest.TestCase):
    def test_no_handwritten_list_remains(self):
        self.assertFalse(hasattr(check, "KNOWN_LEGACY_RUNTIME_SHA256"))

    def test_missing_list_recognises_nothing(self):
        self.assertEqual(check.load_compat("/nonexistent/deck.html"), {"navigation": set(), "design": set()})

    def test_repository_list_keeps_every_shipped_runtime(self):
        # 手書きの印の一覧を、リポジトリの互換の一覧に置き換えても、前に配った実行部は今までどおり通す
        skill = Path(__file__).resolve().parents[2]
        compat = check.load_compat(check.default_template_path())
        self.assertTrue(compat["navigation"])
        for name in ("deck-legacy.html", "deck-fonts-legacy.html", "deck-named-links-legacy.html", "deck-catalog-legacy.html", "deck-guided-legacy.html"):
            previous = (skill / "fixtures" / "_stub" / name).read_text()
            self.assertTrue(check.has_known_runtime(check.embed_block(previous), compat), name)
