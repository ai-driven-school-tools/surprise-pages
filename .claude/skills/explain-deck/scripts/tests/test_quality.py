import json
import subprocess
import unittest
from pathlib import Path
from unittest import mock

from explaindeck import quality


class QualityTest(unittest.TestCase):
    def test_prepare_uses_this_repository(self):
        root = Path(__file__).resolve().parents[5]
        with mock.patch.object(quality._distribution, "pages_dir", return_value=str(root)):
            runtime = quality.prepare()
        self.assertEqual(Path(runtime["root"]), root / "bin")

    def test_prepare_stops_without_tools(self):
        with mock.patch.object(quality._distribution, "pages_dir", return_value="/nonexistent"):
            with self.assertRaises(quality.QualityError):
                quality.prepare()

    def test_check_file_rejects_unreadable_report(self):
        with mock.patch.object(quality, "prepare", return_value={"node": "node", "root": "/x", "policy": 2}), \
             mock.patch.object(quality.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "not json", "")):
            with self.assertRaises(quality.QualityError):
                quality.check_file("source.html")


if __name__ == "__main__":
    unittest.main()
