import tempfile
import unittest
from pathlib import Path
from unittest import mock

from explaindeck import kit


class KitTest(unittest.TestCase):
    def test_repository_has_the_kit(self):
        root = Path(__file__).resolve().parents[5]
        with mock.patch.object(kit._distribution, "pages_dir", return_value=str(root)):
            self.assertTrue(kit.prepare()["ok"])

    def test_missing_files_never_reach_outside(self):
        with tempfile.TemporaryDirectory() as empty, mock.patch.object(kit._distribution, "pages_dir", return_value=empty):
            result = kit.prepare()
        self.assertFalse(result["ok"])
        self.assertNotIn("http", result["next"])


if __name__ == "__main__":
    unittest.main()
