"""配布に同梱するPython処理も、投稿コマンドと同じ接続設定を使う。"""
import json
import os
import subprocess
import urllib.error
import urllib.request
from pathlib import Path


def pages_dir():
    for parent in Path(__file__).resolve().parents:
        marker = parent / "deployment.json"
        if marker.is_file() and (parent / "bin/pages-publish.mjs").is_file():
            if json.loads(marker.read_text(encoding="utf-8")).get("edition") != "personal":
                raise RuntimeError("配布版のフォルダを開いてください")
            return str(parent)
    raise RuntimeError("配布版のフォルダが見つかりません")


def connection():
    result = subprocess.run(
        ["node", str(Path(pages_dir()) / "bin/pages-publish.mjs"), "config", "--json"],
        check=True, capture_output=True, text=True,
    )
    value = json.loads(result.stdout)
    if not value.get("personal") or not value.get("origin"):
        raise RuntimeError("本人用の投稿先を設定してください")
    return value


def origin():
    return connection()["origin"]


def config_dir():
    return str(Path(token_path()).parent)


def token_path():
    return connection()["credentialFile"]


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, "別の接続先へ鍵を送りません", headers, fp)


def open_request(request, timeout=30):
    return urllib.request.build_opener(_NoRedirect).open(request, timeout=timeout)


def publish_token():
    """投稿コマンドと同じ決まりで鍵を選ぶ（環境変数 → 手元の控え）。無ければ None。

    環境変数の鍵は、その宛先（PAGES_TOKEN_ORIGIN）が投稿先と同じときだけ使う（別のサイトへ鍵を送らない）。
    """
    from_env = (os.environ.get("PAGES_TOKEN") or "").strip()
    if from_env and os.environ.get("PAGES_TOKEN_ORIGIN") == origin():
        return from_env
    try:
        stored = Path(token_path()).read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return stored or None
