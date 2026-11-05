"""スライドの見本一式を、このリポジトリの中から見つける。外から取り寄せない。"""
from pathlib import Path

from . import distribution_environment as _distribution
FILES = (
    "src/templates/deck.html", "src/templates/deck-design.html", "docs/guides/deck-design.md",
    "docs/guides/deck-formats.md", "src/templates/deck-styles.json", "src/templates/deck-preview-compat.json",
    "bin/deck-design-check.mjs", "bin/deck-image-check.mjs", "src/lib/html/image-display-size.ts",
    "tests/checks/fixtures/internal/example/deck-format-catalog.html",
    "tests/checks/fixtures/internal/example/deck-design-presentation.html",
    "tests/checks/fixtures/internal/example/deck-design-proposal.html",
    "tests/checks/fixtures/internal/example/deck-design-report.html",
)


def local_root():
    return Path(_distribution.pages_dir())


def complete(root):
    return all((root / name).is_file() for name in FILES)


def resolve():
    return local_root()


def prepare():
    local = local_root()
    return report(local) if complete(local) else unavailable()


def unavailable():
    return {"ok": False, "next": "スライドの見本一式がリポジトリの中に見つかりません。配布物を取り直すか、消したファイルを git で戻してください"}


def report(root):
    return {
        "ok": True,
        "root": str(root),
        "guide": str(root / "docs/guides/deck-design.md"),
        "formats": str(root / "docs/guides/deck-formats.md"),
        "styles": str(root / "src/templates/deck-styles.json"),
        "catalog": str(root / "tests/checks/fixtures/internal/example/deck-format-catalog.html"),
        "template": str(root / "src/templates/deck.html"),
    }
