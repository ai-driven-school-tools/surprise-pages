"""Content-loss regression tests: python3 -m unittest discover -s scripts/tests."""
import pathlib
import re
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from cleancopy.convert import convert_text
from cleancopy.fix import fix_text
from cleancopy.verify import verify


class FidelityTests(unittest.TestCase):
    def render(self, source):
        work, _ = fix_text(source, apply_defaults=True, title="Title")
        report = convert_text(work, original_text=source)
        result = verify(source, report["body"], report, work_text=work)
        self.assertTrue(result["ok"], result)
        return work, report

    def rejects(self, source, transform):
        work, report = self.render(source)
        result = verify(source, transform(report["body"]), report, work_text=work)
        self.assertFalse(result["ok"], result)

    def test_same_length_word_replacement(self):
        self.rejects("# Title\n\nBuy a cat.\n", lambda body: body.replace("cat", "dog"))

    def test_reordered_paragraphs(self):
        self.rejects("# Title\n\nFirst step.\n\nLater step.\n", lambda body: body.replace("First", "TEMP").replace("Later", "First").replace("TEMP", "Later"))

    def test_reordered_numbers(self):
        self.rejects("# Title\n\nBuy 20, sell 30.\n", lambda body: body.replace("20", "TEMP").replace("30", "20").replace("TEMP", "30"))

    def test_collapsed_table_preserves_text_but_fails(self):
        source = "# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n"
        self.rejects(source, lambda body: re.sub(r"</?(?:table|thead|tbody|tr|th|td)\b[^>]*>", "", body))

    def test_removed_cell_boundary(self):
        source = "# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n"
        self.rejects(source, lambda body: re.sub(r"</td>\s*<td[^>]*>", "", body, count=1))

    def test_code_indentation(self):
        self.rejects("# Title\n\n```python\nif yes:\n    run()\n```\n", lambda body: body.replace("    run()", "run()"))

    def test_code_blank_line(self):
        self.rejects("# Title\n\n```\na\n\nb\n```\n", lambda body: body.replace("a\n\nb", "a\nb"))

    def test_literal_symbols_are_content(self):
        self.rejects("# Title\n\nUse `a_b` and `x-y`.\n", lambda body: body.replace("a_b", "ab"))

    def test_work_copy_rewrite_cannot_hide_change(self):
        original = "# Title\n\nBuy a cat.\n"
        work = original.replace("cat", "dog")
        report = convert_text(work, original_text=original)
        self.assertFalse(verify(original, report["body"], report, work_text=work)["ok"])

    def test_invented_ledger_cannot_hide_missing_sentence(self):
        source = "# Title\n\nKeep this.\n\nLose this.\n"
        work, report = self.render(source)
        report["removed_text"].append("Lose this.")
        body = report["body"].replace("Lose this.", "")
        self.assertFalse(verify(source, body, report, work_text=work)["ok"])

    def test_source_note_on_same_line_keeps_body(self):
        source = "# Title\n\nKeep this.\n"
        work, report = self.render(source)
        body = report["body"].replace("\n", "") + '<p data-source-note>Extra 99</p>'
        self.assertTrue(verify(source, body, report, work_text=work)["ok"])

    def test_literal_source_note_text_is_not_metadata(self):
        self.render("# Title\n\nThe data-source-note marker.\n")

    def test_quote_table_and_fence(self):
        source = "# Title\n\n> ## Slide\n>\n> | A | B |\n> |---|---|\n> | 1 | 2 |\n>\n> ```text\n>   a\n>   > literal\n> ```\n"
        self.render(source)
        self.rejects(source, lambda body: body.replace("  a", "a"))

    def test_comment_followed_by_table(self):
        self.render("# Title\n\n<!-- GENERATED_BEGIN -->\n> | A | B |\n> |---|---|\n> | 1 | 2 |\n<!-- GENERATED_END -->\n")

    def test_entity_markup_does_not_hide_number_change(self):
        self.rejects('# Title\n\n<div>A &amp; B 20</div>\n', lambda body: body.replace("20", "30"))

    def test_empty_table_cell_repair(self):
        self.render("# Title\n\n| A | B |\n|---|---|\n| 1 |\n")

    def test_added_title(self):
        self.render("A short paragraph.\n")

    def test_raw_html_scrub(self):
        self.render('# Title\n\n<div style="color:red">A &amp; B</div>\n\n<script>danger(42)</script>\n')


if __name__ == "__main__":
    unittest.main()
