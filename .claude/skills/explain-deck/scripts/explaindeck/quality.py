"""スライドの画像の描画検査。このリポジトリの bin/deck-image-check.mjs と、入っている Playwright を使う。"""
import json
from pathlib import Path
import shutil
import subprocess

from . import distribution_environment as _distribution


class QualityError(ValueError):
    pass


def prepare():
    node = shutil.which("node")
    if not node:
        raise QualityError("画像検査に必要な Node.js がありません。導入ガイドの手順で入れてから、やり直してください")
    root = Path(_distribution.pages_dir())
    script = root / "bin/deck-image-check.mjs"
    if not script.is_file() or not (root / "node_modules/playwright").is_dir():
        raise QualityError("画像検査の道具が見つかりません。リポジトリで pnpm install と pnpm exec playwright install chromium を実行してから、やり直してください")
    return {"node": node, "root": str(script.parent), "policy": 2}


def check_file(source, page=None):
    runtime = prepare()
    command = [runtime["node"], str(Path(runtime["root"]) / "deck-image-check.mjs"), str(source)]
    if page:
        command += ["--page", page]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=120, check=False)
        report = json.loads(result.stdout)
        if not isinstance(report, dict) or not isinstance(report.get("ok"), bool) or report.get("density", 0) < 2 or not isinstance(report.get("issues"), list):
            raise ValueError()
        if report["ok"] and report["issues"]:
            raise ValueError()
        if not isinstance(report.get("slides"), int) or report["slides"] < 1:
            raise ValueError()
        if result.returncode not in (0, 1) or (result.returncode == 0) != report["ok"]:
            raise ValueError()
        return report
    except (OSError, ValueError, TypeError, subprocess.SubprocessError):
        raise QualityError("画像の描画検査が完了しませんでした。ブラウザ・書体・素材の読込を確認してください。未検査では投稿しません") from None
