import os
from pathlib import Path
import tempfile
import unittest

from explaindeck import pipeline


class CompanionAssetsTest(unittest.TestCase):
    def setUp(self):
        self.room = tempfile.TemporaryDirectory()
        self.source = Path(self.room.name) / "source"
        self.target = Path(self.room.name) / "target"
        (self.source / "assets").mkdir(parents=True)
        self.target.mkdir()
        (self.source / "index.html").write_text("<html></html>")

    def tearDown(self):
        self.room.cleanup()

    def copy(self):
        return pipeline.copy_deck_assets(str(self.source / "index.html"), str(self.target))

    def test_copies_only_safe_media_with_relative_structure(self):
        nested = self.source / "assets" / "figures"
        nested.mkdir()
        (nested / "chart.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
        result = self.copy()
        self.assertEqual(result["files"], 1)
        self.assertTrue((self.target / "assets" / "figures" / "chart.svg").is_file())

    def test_rejects_hidden_and_non_media_files(self):
        (self.source / "assets" / ".env").write_text("SECRET=no")
        with self.assertRaises(ValueError):
            self.copy()
        (self.source / "assets" / ".env").unlink()
        (self.source / "assets" / "notes.html").write_text("secret")
        with self.assertRaises(ValueError):
            self.copy()

    def test_copies_video_captions_without_rewriting_the_cues(self):
        captions = "WEBVTT\n\n00:00.000 --> 00:03.000\n一文を残す\n"
        (self.source / "assets" / "workflow-ja.vtt").write_text(captions)
        self.assertEqual(self.copy()["files"], 1)
        self.assertEqual((self.target / "assets" / "workflow-ja.vtt").read_text(), captions)

    def test_rejects_links_outside_the_assets_tree(self):
        secret = Path(self.room.name) / "secret.svg"
        secret.write_text("secret")
        try:
            os.symlink(secret, self.source / "assets" / "logo.svg")
        except OSError:
            self.skipTest("symlinks are unavailable")
        with self.assertRaises(ValueError):
            self.copy()


if __name__ == "__main__":
    unittest.main()
