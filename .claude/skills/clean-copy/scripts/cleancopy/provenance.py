# -*- coding: utf-8 -*-
"""原本が git の中にあるとき、いつのどのコミットかを機械で拾う。

判定不能は失敗にしない。git が無い・通信しない・追跡されていない、のどれでも
「ファイル名だけ」に落ちる。GitHub の permalink を出すのは、**いま組んでいる
バイトが、付けるコミットの blob と一致するときだけ**。作業中の内容を
存在しないコミットのリンクに載せると、読んだ人が別の文を見ることになる。
"""

import os
import re
import subprocess

try:
    from datetime import datetime, timedelta, timezone
except ImportError:  # pragma: no cover
    datetime = None
    timezone = None
    timedelta = None


GIT_TIMEOUT_SEC = 3
GITHUB_NWO = re.compile(
    r"(?:github\.com[:/]|github\.com/+)(?P<owner>[A-Za-z0-9_.-]+)/(?P<repo>[A-Za-z0-9_.-]+?)(?:\.git)?$"
)


def github_nwo(remote_url):
    """origin の URL から `owner/repo` を抜く。github.com 以外は None。"""
    if not remote_url:
        return None
    text = remote_url.strip()
    if text.endswith("/"):
        text = text[:-1]
    # https://x-access-token:secret@github.com/owner/repo.git
    if "github.com" in text and "@" in text and "://" in text:
        scheme, rest = text.split("://", 1)
        if "@" in rest:
            text = "%s://%s" % (scheme, rest.rsplit("@", 1)[1])
    text = text.replace("ssh://git@", "git@")
    matched = GITHUB_NWO.search(text.replace(":", "/", 1) if text.startswith("git@") else text)
    if matched is None:
        # git@github.com:owner/repo をそのまま試す
        matched = GITHUB_NWO.search(text)
    if matched is None:
        return None
    return "%s/%s" % (matched.group("owner"), matched.group("repo"))


def blob_url(nwo, commit, relpath):
    """コミット固定の GitHub ファイル URL。枝名は使わない。"""
    if not nwo or not commit or not relpath:
        return None
    from urllib.parse import quote

    encoded = quote(relpath.replace("\\", "/"), safe="/")
    return "https://github.com/%s/blob/%s/%s" % (nwo, commit, encoded)


def display_date(iso_text):
    """committer date を JST の YYYY-MM-DD にする。読めなければ None。"""
    if not iso_text or datetime is None:
        return None
    text = iso_text.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    jst = timezone(timedelta(hours=9))
    return moment.astimezone(jst).date().isoformat()


def _git(repo, args):
    env = os.environ.copy()
    env["LC_ALL"] = "C"
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GIT_OPTIONAL_LOCKS"] = "0"
    try:
        proc = subprocess.run(
            ["git", "-C", repo] + list(args),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            timeout=GIT_TIMEOUT_SEC,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0:
        return None
    return proc.stdout.decode("utf-8", "replace")


def _plain(value):
    if value is None:
        return None
    text = value.strip()
    return text or None


def inspect(path):
    """原本 1 ファイルの出典。git が使えなければ name だけの辞書。"""
    abs_path = os.path.realpath(path)
    name = os.path.basename(abs_path)
    found = {
        "name": name,
        "path": name,
        "repo": None,
        "commit": None,
        "committed_at": None,
        "url": None,
        "dirty": False,
        "tracked": False,
    }
    if not os.path.isfile(abs_path):
        return found

    parent = os.path.dirname(abs_path) or "."
    toplevel = _git(parent, ["rev-parse", "--show-toplevel"])
    if toplevel is None:
        return found
    repo = toplevel.strip()
    rel = os.path.relpath(abs_path, repo).replace("\\", "/")
    if rel.startswith(".."):
        return found

    listed = _git(repo, ["ls-files", "--error-unmatch", "--full-name", "-z", "--", rel])
    if listed is None:
        found["path"] = rel
        return found

    tracked_path = listed.split("\0", 1)[0].replace("\\", "/") or rel
    found["path"] = tracked_path
    found["tracked"] = True

    log = _git(repo, ["log", "-1", "--format=%H%n%cI", "--", tracked_path])
    if log is None:
        found["dirty"] = True
        return found
    parts = log.strip().split("\n")
    commit = _plain(parts[0] if parts else "")
    committed_at = _plain(parts[1] if len(parts) > 1 else "")
    if not commit:
        found["dirty"] = True
        return found

    commit_blob = _git(repo, ["rev-parse", "%s:%s" % (commit, tracked_path)])
    work_blob = _git(repo, ["hash-object", "--", abs_path])
    if commit_blob is None or work_blob is None:
        found["commit"] = commit
        found["committed_at"] = committed_at
        found["dirty"] = True
        return found
    if commit_blob.strip() != work_blob.strip():
        found["commit"] = commit
        found["committed_at"] = committed_at
        found["dirty"] = True
        return found

    found["commit"] = commit
    found["committed_at"] = committed_at
    remote = _git(repo, ["remote", "get-url", "origin"])
    nwo = github_nwo(remote.strip() if remote else "")
    found["repo"] = nwo
    found["url"] = blob_url(nwo, commit, tracked_path)
    return found


def reportable(found):
    """JSON 控えに残す分。空の項目は落とす。"""
    if not found:
        return None
    out = {}
    for key in ("name", "path", "repo", "commit", "committed_at", "url", "dirty", "tracked"):
        value = found.get(key)
        if value not in (None, False, ""):
            out[key] = value
        elif key in ("dirty", "tracked"):
            out[key] = bool(value)
    return out


def self_test():
    """通信しない。一時リポジトリを手元に作って、リンクを出す／出さないを見る。"""
    import shutil
    import tempfile

    fails = []

    def check(label, actual, expected):
        if actual != expected:
            fails.append("%s: 実際 %r / 期待 %r" % (label, actual, expected))

    check(
        "https",
        github_nwo("https://github.com/example-org/handbook.git"),
        "example-org/handbook",
    )
    check(
        "ssh",
        github_nwo("git@github.com:example-org/handbook.git"),
        "example-org/handbook",
    )
    check(
        "token",
        github_nwo("https://x-access-token:secret@github.com/example-org/handbook"),
        "example-org/handbook",
    )
    check("elsewhere", github_nwo("https://gitlab.com/acme/handbook.git"), None)
    check(
        "blob url",
        blob_url("acme/doc", "abc123", "docs/ops.md"),
        "https://github.com/acme/doc/blob/abc123/docs/ops.md",
    )
    check("date jst", display_date("2026-09-06T18:21:00+09:00"), "2026-09-06")
    check("date utc", display_date("2026-09-06T15:21:00+00:00"), "2026-09-07")

    outside = inspect("/nonexistent/no-such-file.md")
    check("missing name", outside["name"], "no-such-file.md")
    check("missing tracked", outside["tracked"], False)

    tmp = tempfile.mkdtemp(prefix="cleancopy-prov-")
    try:
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        env["GIT_AUTHOR_NAME"] = "t"
        env["GIT_AUTHOR_EMAIL"] = "t@example.com"
        env["GIT_COMMITTER_NAME"] = "t"
        env["GIT_COMMITTER_EMAIL"] = "t@example.com"
        env["GIT_AUTHOR_DATE"] = "2026-09-06T18:21:00+09:00"
        env["GIT_COMMITTER_DATE"] = "2026-09-06T18:21:00+09:00"

        def git_here(args):
            proc = subprocess.run(
                ["git", "-C", tmp] + args,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=GIT_TIMEOUT_SEC,
            )
            if proc.returncode != 0:
                raise RuntimeError(proc.stderr.decode("utf-8", "replace"))
            return proc.stdout.decode("utf-8", "replace")

        git_here(["init", "-q", "-b", "main"])
        docs = os.path.join(tmp, "docs")
        os.makedirs(docs)
        target = os.path.join(docs, "ops.md")
        with open(target, "w", encoding="utf-8") as handle:
            handle.write("# 題\n\n42 件。\n")
        git_here(["add", "docs/ops.md"])
        git_here(["commit", "-q", "-m", "add ops"])
        git_here(["remote", "add", "origin", "git@github.com:example-org/handbook.git"])

        clean = inspect(target)
        check("clean tracked", clean["tracked"], True)
        check("clean dirty", clean["dirty"], False)
        check("clean path", clean["path"], "docs/ops.md")
        check("clean repo", clean["repo"], "example-org/handbook")
        check("clean date", display_date(clean["committed_at"]), "2026-09-06")
        check("clean url has sha", bool(clean["url"] and clean["commit"] and clean["commit"] in clean["url"]), True)
        check("clean url path", bool(clean["url"] and clean["url"].endswith("/docs/ops.md")), True)

        with open(target, "a", encoding="utf-8") as handle:
            handle.write("追記\n")
        dirty = inspect(target)
        check("dirty flagged", dirty["dirty"], True)
        check("dirty no url", dirty["url"], None)
        check("dirty still path", dirty["path"], "docs/ops.md")

        stray = os.path.join(tmp, "scratch.md")
        with open(stray, "w", encoding="utf-8") as handle:
            handle.write("未追跡\n")
        untracked = inspect(stray)
        check("untracked not tracked", untracked["tracked"], False)
        check("untracked no url", untracked["url"], None)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    return fails
