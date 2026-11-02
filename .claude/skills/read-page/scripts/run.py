#!/usr/bin/env python3
"""Pages のページを読む（＋コメントを見る・書く・解決にする）1 本。

**リンクを渡されたら、これを打つ。** 招待した人だけのページ（`/internal/…`）はブラウザのログインで
守られているので、ふつうのページ取得では中身が取れない（ログインの画面か、
中身の入っていない器だけが返る）。取れるのは、鍵を添えて配信元の口を叩いたときだけ。

読み先と鍵は、このリポジトリの投稿コマンド（bin/pages-publish.mjs）の設定から取る。
読み先は自分のサイトだけで、**ほかの宛先へは鍵を送らない**。
鍵が無ければ、このリポジトリで 1 回ログインするところまで案内して止まる。

使い方

  run.py read     <URL かスラッグ> [--save <ファイル>] [--out <フォルダ>] [--version <目印>]
  run.py revise   <URL かスラッグ> [--out <フォルダ>] [--version <目印>]
  run.py comments <URL かスラッグ> [--all]
  run.py comment  <URL かスラッグ> --body "…" [--priority want|better|must]
  run.py resolve  <コメントの番号>
  run.py reopen   <コメントの番号>
  run.py --self-test

終了コード
  0 … 済んだ
  1 … 止まった（鍵が無い・ページが無い・つながらない）
  2 … そもそも走れない（渡すものが足りない・形が違う）

"""

import argparse
import html as html_module
import json
import os
import re
import shlex
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

import distribution_environment as _distribution

TIMEOUT_SECONDS = 60

SAFE_SLUG = re.compile(r"^[a-z0-9][a-z0-9._/-]*$")
COMMENT_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
COMMENT_PRIORITIES = ("must", "better", "want")

# 額縁（base.html）が本文を挟んでいる印。ここだけ読めば、PDF ボタンや
# 「先頭へ戻る」といった器の部品が本文に混ざらない。
CONTENT_START = "<!-- CONTENT_START -->"
CONTENT_END = "<!-- CONTENT_END -->"
SOURCE_NOTE_ATTR = "data-source-note"
SOURCE_REPO_ATTR = "data-source-repo"
SOURCE_PATH_ATTR = "data-source-path"
SOURCE_COMMIT_ATTR = "data-source-commit"
DEFAULT_REVISE_OUT = "page-out"
LONG_TEXT_CHARS = 8000
BLOCK_TAGS = ("p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "figure", "tr", "td", "th")

def publish_command():
    """投稿コマンドの呼び方。どのフォルダから打っても届くよう、このリポジトリの場所を前に付ける。"""
    try:
        return "node " + shlex.quote(str(Path(_distribution.pages_dir()) / "bin" / "pages-publish.mjs"))
    except RuntimeError:
        return "node <リポジトリ>/bin/pages-publish.mjs"


LOGIN_HELP = f"""次にすること — このリポジトリの投稿コマンドで 1 回だけ済ませてください。

  {publish_command()} login
  （ブラウザが開くので、自分の Google アカウントで許可する）

鍵の中身はチャットに貼らないでください。"""


class Stop(Exception):
    """人に見せて止まる。code は終了コード。"""

    def __init__(self, message, code=1, next_steps=""):
        super().__init__(message)
        self.message = message
        self.code = code
        self.next_steps = next_steps


# ---------------------------------------------------------------- 渡されたものを読む


def clean_target(text):
    """人が貼るいろいろな形から、ページを指す 1 本を取り出す。

    Slack の `<URL|見出し>`、マークダウンの `[見出し](URL)`、括弧や引用符つき、
    末尾の句読点——どれも「貼った本人にはリンク」なので、こちらで剥がす。
    """
    value = (text or "").strip()
    if not value:
        raise Stop("読むページが渡されていません", code=2)

    if "](" in value:  # [見出し](URL)
        value = value.split("](", 1)[1].split(")", 1)[0].strip()
    value = value.strip("<>`\"'　 ")
    if "|" in value and value.lower().startswith("http"):  # Slack の <URL|見出し>
        value = value.split("|", 1)[0].strip()
    return value.rstrip("。、,.")


def parse_target(*args):
    host, text = (None, args[0]) if len(args) == 1 else args
    """URL かスラッグを (配信元, 招待した人だけか公開か, スラッグ, 版の目印) に開く。

    受け取れる形は 4 つ。
      https://<自分のサイト>/internal/guides/foo   … 招待した人だけのページ
      https://<自分のサイト>/public/onboarding   … 公開ページ
      internal/guides/foo ・ public/onboarding     … 配信元の言い方そのまま
      guides/foo                                   … 素のスラッグ（招待した人だけのページとみなす）
    """
    value = clean_target(text)
    origin = (host or _distribution.origin()).strip()
    if not origin.startswith("http"):
        origin = f"https://{origin}"
    origin = origin.rstrip("/")

    version = None
    visibility = "internal"

    if value.lower().startswith("http"):
        parsed = urllib.parse.urlparse(value)
        if f"{parsed.scheme}://{parsed.netloc}" != origin:
            raise Stop(
                f"自分のサイト（{origin}）以外のページは読めません: {text}",
                code=2,
                next_steps="鍵は自分のサイトにだけ送ります。自分のサイトのリンクか、スラッグを渡してください。",
            )
        for key, values in urllib.parse.parse_qs(parsed.query).items():
            if key == "v" and values:
                version = values[0]
        path = urllib.parse.unquote(parsed.path)
    else:
        path = value

    path = path.strip("/")
    head, _, rest = path.partition("/")
    if head in ("i", "internal"):
        visibility, path = "internal", rest
    elif head in ("p", "public"):
        visibility, path = "public", rest

    slug = path.strip("/")
    if not slug:
        raise Stop(
            f"ページの場所が読み取れません: {text}",
            code=2,
            next_steps="URL は https://<自分のサイト>/internal/<スラッグ> の形です。ユーザーに貼り直してもらってください。",
        )
    check_slug(slug)
    return origin, visibility, slug, version


def check_slug(slug):
    if not SAFE_SLUG.match(slug) or ".." in slug or "//" in slug:
        raise Stop(
            f"スラッグの形が違います: {slug}",
            code=2,
            next_steps="使えるのは英小文字・数字・- _ . / だけです。日本語や大文字が入っていないか確かめてください。",
        )


def page_slug(visibility, slug):
    return f"{visibility}/{slug}"


def page_url(origin, visibility, slug):
    return f"{origin}/{'i' if visibility == 'internal' else 'p'}/{slug}"


# ---------------------------------------------------------------- 鍵


def load_token():
    """この環境の鍵。無ければ None。**中身はどこにも出さない。**"""
    try:
        stored = Path(_distribution.token_path()).read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return stored or None


def require_token():
    token = load_token()
    if token:
        return token
    raise Stop(
        "この環境には自分のサイトの鍵がありません（招待した人だけのページは、ログインした人にだけ見えます）",
        next_steps=LOGIN_HELP,
    )


# ---------------------------------------------------------------- 配信元の口


def call(origin, method, path, token, payload=None):
    """配信元に 1 回聞く。返るのは JSON。止まるときは人の言葉にして投げる。"""
    request = urllib.request.Request(f"{origin}{path}", method=method)
    request.add_header("authorization", f"Bearer {token}")
    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request.add_header("content-type", "application/json; charset=utf-8")
    try:
        if body is not None:
            request.data = body
        with _distribution.open_request(request, timeout=TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise stop_for_status(error) from None
    except urllib.error.URLError as error:
        raise Stop(
            f"{origin} につながりませんでした（{error.reason}）",
            next_steps="通信が塞がれている作業場かもしれません。少し置いてもう一度試すか、手元のパソコンから開いてください。",
        ) from None


def stop_for_status(error):
    """配信元が断ってきたときの、人に見せる言い方。"""
    detail = ""
    try:
        detail = json.loads(error.read().decode("utf-8")).get("error", "")
    except Exception:
        detail = ""

    if error.code == 401:
        return Stop(
            "この環境の鍵が通りませんでした（まだ入れていないか、切れています）",
            next_steps=LOGIN_HELP,
        )
    if error.code == 403:
        return Stop(
            detail or "このページを見る権限がありません",
            next_steps="招待されていないページかもしれません。ページの持ち主に確かめてください。",
        )
    if error.code == 404:
        return Stop(
            detail or "そのページはありません",
            next_steps="URL の /internal/（招待した人だけ）と /public/（公開）の別と、スラッグの綴りを確かめてください。消されたページかもしれません。",
        )
    return Stop(detail or f"配信元の応答が {error.code} でした")


# ---------------------------------------------------------------- HTML を文にする


class TextMaker(HTMLParser):
    """ページの HTML を、読むための文に開く。

    見出し・箇条書き・表・図（mermaid）の形は残す。**要約はしない**——読む人（AI）が
    自分で判断できるように、書いてあることをそのまま渡すのがこの部品の役目。
    """

    SKIP = {"script", "style", "noscript", "svg", "template", "head"}
    BLOCK = {
        "p", "div", "section", "article", "header", "footer", "main", "aside",
        "ul", "ol", "table", "thead", "tbody", "blockquote", "details", "summary",
        "figure", "figcaption", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
    }

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip_depth = 0
        self.pre_depth = 0
        self.list_stack = []
        self.heading_depth = 0
        self.link = None
        self.link_text = ""

    # -- 組み立ての土台
    def add(self, text):
        if not text:
            return
        self.parts.append(text)
        if self.link is not None:
            self.link_text += text

    def newline(self, count=1):
        """直前の改行と合わせて count 本になるようにそろえる。"""
        tail = "".join(self.parts[-6:])
        have = len(tail) - len(tail.rstrip("\n")) if tail else count
        if not self.parts:
            return
        for _ in range(max(0, count - have)):
            self.parts.append("\n")

    # -- 目印ごとの振る舞い
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag in self.SKIP:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return

        if tag == "pre":
            self.pre_depth += 1
            self.newline(2)
            language = "mermaid" if "mermaid" in (values.get("class") or "") else ""
            self.add(f"```{language}\n")
            return
        if self.pre_depth:
            return

        if tag == "br":
            # 見出しの中の改行は、見出しを 2 つに割ってしまうので空白にする
            self.add(" " if self.heading_depth else "\n")
            return
        if tag in ("ul", "ol"):
            self.list_stack.append({"kind": tag, "count": 0})
            self.newline(2)
            return
        if tag == "li":
            self.newline(1)
            depth = max(0, len(self.list_stack) - 1)
            marker = "-"
            if self.list_stack and self.list_stack[-1]["kind"] == "ol":
                self.list_stack[-1]["count"] += 1
                marker = f"{self.list_stack[-1]['count']}."
            self.add(f"{'  ' * depth}{marker} ")
            return
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.heading_depth += 1
            self.newline(2)
            self.add("#" * int(tag[1]) + " ")
            return
        if tag == "tr":
            self.newline(1)
            self.add("|")
            return
        if tag in ("td", "th"):
            self.add(" ")
            return
        if tag == "a":
            self.link = values.get("href") or ""
            self.link_text = ""
            return
        if tag == "img":
            source = values.get("src") or ""
            alt = values.get("alt") or ""
            self.newline(1)
            self.add(f"[画像: {alt or source}]")
            self.newline(1)
            return
        if tag in self.BLOCK:
            self.newline(2)

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if self.skip_depth:
            return

        if tag == "pre":
            self.pre_depth = max(0, self.pre_depth - 1)
            self.add("\n```")
            self.newline(2)
            return
        if self.pre_depth:
            return

        if tag in ("ul", "ol"):
            if self.list_stack:
                self.list_stack.pop()
            self.newline(2)
            return
        if tag in ("td", "th"):
            self.add(" |")
            return
        if tag == "a":
            href = self.link or ""
            text = self.link_text.strip()
            self.link = None
            self.link_text = ""
            if href.startswith("http") and text and href not in text:
                self.add(f"（{href}）")
            return
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.heading_depth = max(0, self.heading_depth - 1)
        if tag in self.BLOCK or tag == "tr":
            self.newline(2 if tag in self.BLOCK else 1)

    def handle_data(self, data):
        if self.skip_depth:
            return
        if self.pre_depth:
            self.add(data)
            return
        text = re.sub(r"\s+", " ", data)
        if not text.strip():
            # 語と語の間の 1 つ分だけ残す（消すと単語がくっつく）
            if self.parts and not self.parts[-1].endswith((" ", "\n")):
                self.add(" ")
            return
        self.add(text)

    def text(self):
        joined = re.sub(r"[ \t]+\n", "\n", "".join(self.parts))

        # 行頭の空きは詰める。ただし図（``` で囲った中）の字下げは意味を持つので残す
        lines = []
        in_figure = False
        for line in joined.split("\n"):
            if line.lstrip().startswith("```"):
                in_figure = not in_figure
                lines.append(line.strip())
                continue
            lines.append(line if in_figure else re.sub(r"[ \t]{2,}", " ", line.lstrip()))

        return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def body_of(page_html):
    """額縁の中の本文だけを切り出す（印が無ければ本文らしい範囲へ落とす）。"""
    if CONTENT_START in page_html and CONTENT_END in page_html:
        return page_html.split(CONTENT_START, 1)[1].split(CONTENT_END, 1)[0]
    matched = re.search(r"<main\b[^>]*>(.*)</main>", page_html, re.S | re.I)
    if matched:
        return matched.group(1)
    matched = re.search(r"<body\b[^>]*>(.*)</body>", page_html, re.S | re.I)
    return matched.group(1) if matched else page_html


def html_to_text(page_html):
    maker = TextMaker()
    maker.feed(body_of(page_html))
    maker.close()
    return maker.text()


def title_of(page_html, fallback=""):
    matched = re.search(r"<title\b[^>]*>(.*?)</title>", page_html, re.S | re.I)
    if not matched:
        return fallback
    return html_module.unescape(re.sub(r"\s+", " ", matched.group(1))).strip() or fallback


def outline_of(text):
    """文にした結果から、見出しの行だけを残す。"""
    lines = []
    for line in (text or "").splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            lines.append(stripped)
    return lines


def source_stamp(page_html):
    """清書の切手（出所の印）を読む。無ければ図解。

    配信元が後から `markdown` / `sourceMarkdown` を返すようになっても、
    切手の有無だけで種類を決める。deck（`data-deck`）はこの道具の対象外。
    """
    if re.search(r"<body\b[^>]*\bdata-deck\b", page_html or "", re.I):
        return {"kind": "deck"}
    match = re.search(r"<[^>]*\b" + re.escape(SOURCE_NOTE_ATTR) + r"\b[^>]*>", page_html or "", re.I)
    if not match:
        return {"kind": "diagram"}

    tag = match.group(0)

    def attr(name):
        found = re.search(rf'{re.escape(name)}="([^"]*)"', tag, re.I)
        return html_module.unescape(found.group(1)) if found else ""

    return {
        "kind": "clean-copy",
        "repo": attr(SOURCE_REPO_ATTR),
        "path": attr(SOURCE_PATH_ATTR),
        "commit": attr(SOURCE_COMMIT_ATTR),
    }


def markdown_from_source(result):
    """配信元が原本のマークダウンを返していればそれを使う（後から足す口）。"""
    if not isinstance(result, dict):
        return ""
    for key in ("markdown", "sourceMarkdown"):
        value = result.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return ""


def quote_html_of(comment):
    """コメント作成時に残した選択範囲の HTML。無ければ空。"""
    if not isinstance(comment, dict):
        return ""
    value = comment.get("quoteHtml")
    return value.strip() if isinstance(value, str) else ""


def collapse_ws(text):
    return re.sub(r"\s+", " ", html_module.unescape(text or "")).strip()


def snippet_around_quote(content_html, quote):
    """引用の文字を含む直近のブロックを、本文 HTML から切り出す。"""
    hay = html_module.unescape(content_html or "")
    needle = collapse_ws(quote)
    if not needle:
        return None

    text_chars = []
    index_map = []
    i = 0
    while i < len(hay):
        if hay[i] == "<":
            close = hay.find(">", i)
            if close < 0:
                break
            i = close + 1
            continue
        text_chars.append(hay[i])
        index_map.append(i)
        i += 1

    collapsed = []
    collapsed_map = []
    for ch, origin in zip(text_chars, index_map):
        if ch.isspace():
            if collapsed and collapsed[-1] != " ":
                collapsed.append(" ")
                collapsed_map.append(origin)
            continue
        collapsed.append(ch)
        collapsed_map.append(origin)
    joined = "".join(collapsed)
    at = joined.find(needle)
    if at < 0:
        return None
    start = collapsed_map[at]
    last = min(at + len(needle) - 1, len(collapsed_map) - 1)
    end = collapsed_map[last] + 1
    return expand_to_block(hay, start, end)


def expand_to_block(html, start, end):
    """引用の位置を、直近のブロック要素まで広げる。"""
    prefix = html[:start]
    pattern = r"<(" + "|".join(BLOCK_TAGS) + r")\b[^>]*>"
    matches = list(re.finditer(pattern, prefix, re.I))
    if not matches:
        left = max(0, start - 80)
        right = min(len(html), end + 80)
        return html[left:right].strip()
    tag = matches[-1].group(1)
    block_start = matches[-1].start()
    close = re.search(rf"</{re.escape(tag)}\s*>", html[end:], re.I)
    block_end = end + close.end() if close else min(len(html), end + 200)
    return html[block_start:block_end].strip()


def snippet_for_comment(content_html, comment):
    """選択範囲 HTML があればそれを使い、無ければ引用の文字で本文から探す。"""
    saved = quote_html_of(comment)
    if saved:
        return saved
    return snippet_around_quote(content_html, (comment or {}).get("quote") or "")


def open_comments(comments):
    return [one for one in comments if isinstance(one, dict) and one.get("resolvedAt") in (None, "")]


def comment_author(comment):
    return ((comment.get("author") or {}).get("name") if isinstance(comment, dict) else None) or "名前なし"


def format_comments(comments, snippet_notes=None):
    """画面とファイルに出す、未解決コメントの短い一覧。"""
    notes = snippet_notes or {}
    lines = []
    for one in comments:
        cid = one.get("id") or ""
        lines.append(f"{one.get('priority') or 'want'}  未解決  {cid}")
        lines.append(f"  {comment_author(one)}")
        if one.get("quote"):
            lines.append(f"  引用: {one['quote']}")
        for line in str(one.get("body") or "").split("\n"):
            lines.append(f"  {line}")
        extra = notes.get(cid)
        if extra:
            lines.append(f"  {extra}")
        lines.append("")
    return "\n".join(lines).rstrip() + ("\n" if comments else "")


def find_local_original(path):
    """この作業場に、切手のパスと同じファイルがあればそれを使う。"""
    if not path:
        return None
    candidates = [Path(path)]
    if not Path(path).is_absolute():
        candidates.append(Path.cwd() / path)
        candidates.append(Path.cwd() / Path(path).name)
    for one in candidates:
        try:
            if one.is_file():
                return one
        except OSError:
            continue
    return None


def fetch_github_file(repo, path, commit):
    """切手の GitHub 住所から、その版のファイルを取る。取れなければ None。"""
    if not (repo and path and commit):
        return None
    encoded = urllib.parse.quote(path)
    url = f"https://api.github.com/repos/{repo}/contents/{encoded}?ref={urllib.parse.quote(commit)}"
    request = urllib.request.Request(url)
    request.add_header("accept", "application/vnd.github.raw")
    token = (os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or "").strip()
    if token:
        request.add_header("authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.read().decode("utf-8")
    except (urllib.error.URLError, urllib.error.HTTPError, UnicodeDecodeError, TimeoutError):
        pass

    try:
        proc = subprocess.run(
            [
                "gh", "api",
                f"repos/{repo}/contents/{path}",
                "-H", "Accept: application/vnd.github.raw",
                "-f", f"ref={commit}",
            ],
            capture_output=True,
            timeout=20,
        )
        if proc.returncode == 0 and proc.stdout:
            return proc.stdout.decode("utf-8")
    except (OSError, subprocess.SubprocessError, UnicodeDecodeError):
        pass
    return None


def load_clean_copy_markdown(stamp, result):
    """清書の原本。配信元 → 手元 → GitHub の順。HTML から復元はしない。"""
    from_api = markdown_from_source(result)
    if from_api:
        return from_api, "配信元"

    path = (stamp or {}).get("path") or ""
    local = find_local_original(path)
    if local is not None:
        return local.read_text(encoding="utf-8"), str(local)

    remote = fetch_github_file((stamp or {}).get("repo"), path, (stamp or {}).get("commit"))
    if remote is not None:
        repo = stamp.get("repo")
        short = (stamp.get("commit") or "")[:7]
        return remote, f"{repo}@{short}"

    raise Stop(
        "清書の原本（マークダウン）が取れません",
        next_steps=(
            "このページは清書です。直すのはマークダウン原本で、HTML から文章を復元しません。\n"
            "原本のファイルを渡すか、切手（data-source-path）のリポジトリに届く作業場で打ち直してください。"
        ),
    )


def print_revise_head(kind_line, title, url, marks, outline):
    print(f"種類: {kind_line}")
    print(f"表題: {title}")
    print(f"URL : {url}")
    if marks:
        print(f"版  : {' / '.join(marks)}")
    print("")
    print("目次:")
    if outline:
        for line in outline:
            print(f"  {line}")
    else:
        print("  （見出しがありません）")


def version_marks(result):
    marks = []
    if isinstance((result or {}).get("versionNumber"), int):
        marks.append(f"第 {result['versionNumber']} 版")
    if (result or {}).get("shortVersionId"):
        marks.append(str(result["shortVersionId"]))
    return marks


def refuse_existing_out(out):
    blockers = [out / "index.html", out / "原本.md", out / "本文.md"]
    existing = [str(one) for one in blockers if one.exists()]
    if existing:
        raise Stop(
            f"すでに {existing[0]} があります",
            next_steps="別の場所を --out で指定するか、先に片付けてください（前回の本文と混ざります）。",
        )


# ---------------------------------------------------------------- 仕事


def read_page(args):
    origin, visibility, slug, version = parse_target(args.target)
    version = args.version or version

    # 置き先の確認は取り寄せる前に済ませる（先に取ると、行き先が無いのに
    # 「取れました」だけ画面に出て、何が起きたのか読めなくなる）
    out = Path(args.out) if args.out else None
    if out is not None and (out / "index.html").exists():
        raise Stop(
            f"すでに {out / 'index.html'} があります",
            next_steps="別の場所を --out で指定するか、先に片付けてください（前回の本文と混ざります）。",
        )

    token = require_token()

    query = urllib.parse.urlencode(
        {"slug": page_slug(visibility, slug), **({"v": version} if version else {})}
    )
    result = call(origin, "GET", f"/api/pages/source?{query}", token)
    page_html = result.get("html") or ""
    title = result.get("title") or title_of(page_html)

    marks = []
    if isinstance(result.get("versionNumber"), int):
        marks.append(f"第 {result['versionNumber']} 版")
    if result.get("shortVersionId"):
        marks.append(str(result["shortVersionId"]))

    print(f"表題: {title}")
    print(f"URL : {page_url(origin, visibility, slug)}")
    if marks:
        print(f"版  : {' / '.join(marks)}")

    if out is not None:
        target = out / "index.html"
        out.mkdir(parents=True, exist_ok=True)
        target.write_text(page_html, encoding="utf-8")
        print(f"本文: {target} に置きました（{len(page_html):,} 文字の HTML）")
        print("")
        print("直したら、投稿のスキル（clean-copy / explain-page）から同じスラッグへ投稿すると新しい版になります:")
        print(f"  {publish_command()} --dir {out} --slug {slug}"
              + (" --public" if visibility == "public" else ""))
        print("画像や動画は保管庫に置いたままです（手元で開くと絵は出ませんが、投稿すれば元どおり出ます）。")
        print("直すなら revise を使ってください。この HTML を全文読まないでください。")
        return 0

    text = html_to_text(page_html)
    if args.save:
        saved = Path(args.save)
        if saved.parent != Path(""):
            saved.parent.mkdir(parents=True, exist_ok=True)
        saved.write_text(text, encoding="utf-8")
        print(f"本文: {saved} に置きました（{len(text):,} 文字）")
        return 0

    print(f"本文: {len(text):,} 文字")
    print("")
    print("─" * 60)
    print(text)
    return 0


def list_comments(args):
    origin, visibility, slug, _ = parse_target(args.target)
    token = require_token()
    where = page_slug(visibility, slug)
    result = call(origin, "GET", f"/api/comments?page={urllib.parse.quote(where)}", token)
    comments = [one for one in (result.get("comments") or []) if isinstance(one, dict)]
    open_ones = [one for one in comments if one.get("resolvedAt") in (None, "")]
    shown = comments if args.all else open_ones
    resolved_count = len(comments) - len(open_ones)

    if not shown:
        if args.all or not comments:
            print(f"コメントはありません（{where}）")
        else:
            print(f"未解決はありません（{where} · 解決済 {resolved_count} 件 · --all ですべて）")
        return 0

    head = f"コメント {len(shown)} 件" if args.all else f"未解決 {len(shown)} 件"
    extra = f" · ほかに解決済 {resolved_count} 件 · --all ですべて" if not args.all and resolved_count else ""
    print(f"{head}（{where}{extra}）")
    print("")
    for one in shown:
        author = (one.get("author") or {}).get("name") or "名前なし"
        print(f"{one.get('priority') or 'want'}  {'解決済' if one.get('resolvedAt') else '未解決'}  {one.get('id')}")
        print(f"  {author}")
        if one.get("quote"):
            print(f"  引用: {one['quote']}")
        for line in str(one.get("body") or "").split("\n"):
            print(f"  {line}")
        print("")
    return 0


def fetch_page_and_comments(args):
    """配信元から本文とコメントを取る。返すのは (origin, visibility, slug, result, page_html, comments)。"""
    origin, visibility, slug, version = parse_target(args.target)
    version = getattr(args, "version", None) or version
    token = require_token()
    query = urllib.parse.urlencode(
        {"slug": page_slug(visibility, slug), **({"v": version} if version else {})}
    )
    result = call(origin, "GET", f"/api/pages/source?{query}", token)
    page_html = result.get("html") or ""
    where = page_slug(visibility, slug)
    listed = call(origin, "GET", f"/api/comments?page={urllib.parse.quote(where)}", token)
    comments = [one for one in (listed.get("comments") or []) if isinstance(one, dict)]
    return origin, visibility, slug, result, page_html, comments


def write_comments_file(path, comments, snippet_notes=None):
    if not comments:
        path.write_text("未解決のコメントはありません\n", encoding="utf-8")
        return
    path.write_text(format_comments(comments, snippet_notes), encoding="utf-8")


def revise_page(args):
    """コメントを直す材料を手元に置く。画面には種類・目次・コメントだけ出す。"""
    out = Path(args.out or DEFAULT_REVISE_OUT)
    refuse_existing_out(out)

    origin, visibility, slug, result, page_html, comments = fetch_page_and_comments(args)
    title = result.get("title") or title_of(page_html)
    marks = version_marks(result)
    url = page_url(origin, visibility, slug)
    stamp = source_stamp(page_html)
    shown = open_comments(comments)
    resolved_count = len(comments) - len(shown)

    if stamp.get("kind") == "deck":
        raise Stop(
            "スライド（deck）は、この道具の対象外です",
            next_steps="原本は git の HTML です。リポジトリの原本を直して、explain-deck から出し直してください。",
        )

    out.mkdir(parents=True, exist_ok=True)
    public_flag = " --public" if visibility == "public" else ""

    if stamp.get("kind") == "clean-copy" or markdown_from_source(result):
        markdown, source_label = load_clean_copy_markdown(stamp, result)
        original = out / "原本.md"
        original.write_text(markdown, encoding="utf-8")
        write_comments_file(out / "コメント.txt", shown)
        print_revise_head(
            "清書（直すのはマークダウン。HTML は読まない・触らない）",
            title,
            url,
            marks,
            outline_of(markdown),
        )
        print(f"原本: {original}（{source_label}）")
        print("")
        if shown:
            extra = f" · ほかに解決済 {resolved_count} 件" if resolved_count else ""
            print(f"未解決 {len(shown)} 件{extra}")
            print("")
            print(format_comments(shown))
        elif comments:
            print(f"未解決はありません（解決済 {resolved_count} 件）")
            print("")
        else:
            print("コメントはありません")
            print("")
        print(f"次: {original} のその文を差し替える。終わったら清書のスキルで同じスラッグへ出し直す:")
        print(f"  python3 <clean-copy のフォルダ>/scripts/run.py publish {original} --slug {slug}{public_flag}")
        print("完成見本の HTML は直さない。本文.md を作って清書として出し直す、もしない。")
        return 0

    text = html_to_text(page_html)
    body = body_of(page_html)
    context = out / "本文.md"
    context.write_text(text, encoding="utf-8")
    (out / "index.html").write_text(page_html, encoding="utf-8")

    snippet_notes = {}
    if shown:
        holder = out / "snippets"
        holder.mkdir(parents=True, exist_ok=True)
        for one in shown:
            cid = one.get("id") or ""
            snippet = snippet_for_comment(body, one)
            if snippet and cid:
                target = holder / f"{cid}.html"
                target.write_text(snippet + "\n", encoding="utf-8")
                snippet_notes[cid] = f"断片: {target}"
            elif cid:
                snippet_notes[cid] = "引用が本文HTMLに見つかりません。本文.md で場所を確認する"

    write_comments_file(out / "コメント.txt", shown, snippet_notes)
    print_revise_head(
        "図解（文脈は 本文.md。直すのは HTML の部分。本文.md は投稿しない）",
        title,
        url,
        marks,
        outline_of(text),
    )
    if len(text) > LONG_TEXT_CHARS:
        print(f"文脈: {context}（長いので、必要な見出しの付近を Grep する。全文は読まない）")
    else:
        print(f"文脈: {context}")
    print(f"投稿用: {out / 'index.html'}（最初から読まない）")
    print("")
    if shown:
        extra = f" · ほかに解決済 {resolved_count} 件" if resolved_count else ""
        print(f"未解決 {len(shown)} 件{extra}")
        print("")
        print(format_comments(shown, snippet_notes))
    elif comments:
        print(f"未解決はありません（解決済 {resolved_count} 件）")
        print("")
    else:
        print("コメントはありません")
        print("")
    print("次: 本文.md で話の位置をつかむ。直すときは断片を手がかりに index.html のそこだけ差し替える。")
    print("本文.md を直して清書として出し直さない。投稿は図解のスキルから、同じスラッグへ。")
    print(f"  {publish_command()} --dir {out} --slug {slug}{public_flag}")
    return 0


def post_comment(args):
    origin, visibility, slug, _ = parse_target(args.target)
    if not (args.body or "").strip():
        raise Stop("--body が要ります", code=2)
    if args.priority not in COMMENT_PRIORITIES:
        raise Stop(f"--priority に使えるのは {' / '.join(COMMENT_PRIORITIES)} だけです", code=2)
    token = require_token()
    created = call(
        origin,
        "POST",
        "/api/comments",
        token,
        {
            "pageSlug": page_slug(visibility, slug),
            "parentId": None,
            "quote": None,
            "quoteContext": None,
            "body": args.body,
            "kind": "comment",
            "priority": args.priority,
            "notifySlack": False,
        },
    )
    print("書きました")
    comment_id = ((created or {}).get("comment") or {}).get("id")
    if comment_id:
        print(f"  {comment_id}")
    return 0


def set_resolved(args, resolved):
    if not COMMENT_ID.match((args.comment_id or "").strip()):
        raise Stop(
            f"コメントの番号の形が正しくありません: {args.comment_id}",
            code=2,
            next_steps="`run.py comments <URL>` で出る番号（8-4-4-4-12 の並び）をそのまま渡してください。",
        )
    origin = (os.environ.get("PAGES_HOST") or DEFAULT_HOST).rstrip("/")
    if not origin.startswith("http"):
        origin = f"https://{origin}"
    token = require_token()
    call(origin, "PATCH", f"/api/comments/{urllib.parse.quote(args.comment_id)}", token, {"resolved": resolved})
    print("解決にしました" if resolved else "未解決に戻しました")
    print(f"  {args.comment_id}")
    return 0


# ---------------------------------------------------------------- 入口


def build_parser():
    parser = argparse.ArgumentParser(
        prog="run.py",
        description="Pages のページを読む・コメントを扱う",
    )
    parser.add_argument("--self-test", action="store_true", help="この道具そのものを点検する（通信しない）")
    subparsers = parser.add_subparsers(dest="command")

    read = subparsers.add_parser("read", help="ページの中身を読む")
    read.add_argument("target", help="URL かスラッグ")
    read.add_argument("--save", default="", help="読んだ文をファイルに置く（長いページを少しずつ読むとき）")
    read.add_argument("--out", default="", help="本文の HTML を置くフォルダ（直すときだけ。既定は画面に文で出す）")
    read.add_argument("--version", default="", help="過去の版の目印（履歴の画面に出ている 7 桁）")

    revise = subparsers.add_parser("revise", help="コメントを直す材料を手元に置く（HTML 全文は出さない）")
    revise.add_argument("target", help="URL かスラッグ")
    revise.add_argument("--out", default=DEFAULT_REVISE_OUT, help="置くフォルダ（既定は page-out）")
    revise.add_argument("--version", default="", help="過去の版の目印（履歴の画面に出ている 7 桁）")

    comments = subparsers.add_parser("comments", help="ページのコメントを出す")
    comments.add_argument("target", help="URL かスラッグ")
    comments.add_argument("--all", action="store_true", help="解決済も出す")

    comment = subparsers.add_parser("comment", help="コメントを 1 件書く")
    comment.add_argument("target", help="URL かスラッグ")
    comment.add_argument("--body", default="", help="本文")
    comment.add_argument("--priority", default="want", help="must / better / want（既定は want）")

    for name, help_text in (("resolve", "コメントを解決にする"), ("reopen", "コメントを未解決に戻す")):
        one = subparsers.add_parser(name, help=help_text)
        one.add_argument("comment_id", help="コメントの番号")

    return parser


def main(argv):
    # 長いページは `| head` で覗かれる。途中で読むのをやめられても、
    # 後始末の警告を撒かずに黙って終わる
    try:
        import signal

        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (ImportError, AttributeError, ValueError):
        pass

    parser = build_parser()
    args = parser.parse_args(argv)

    if args.self_test:
        return self_test()
    if not args.command:
        parser.print_help()
        return 2

    jobs = {
        "read": read_page,
        "revise": revise_page,
        "comments": list_comments,
        "comment": post_comment,
        "resolve": lambda one: set_resolved(one, True),
        "reopen": lambda one: set_resolved(one, False),
    }
    try:
        return jobs[args.command](args)
    except Stop as stop:
        print(f"止まりました: {stop.message}", file=sys.stderr)
        if stop.next_steps:
            print("", file=sys.stderr)
            print(stop.next_steps, file=sys.stderr)
        return stop.code


# ---------------------------------------------------------------- 自己点検


def self_test():
    """通信せずに、渡されたものの読み取りと本文の開き方を点検する。"""
    results = []

    def check(label, got, want):
        results.append((label, got == want, f"got={got!r} want={want!r}"))

    def check_true(label, condition, detail=""):
        results.append((label, bool(condition), detail))

    SITE = "https://pages.example.test"

    # 1. 渡されたものの読み取り
    check(
        "招待した人だけのページの URL",
        parse_target(SITE, "https://pages.example.test/internal/guides/foo")[1:],
        ("internal", "guides/foo", None),
    )
    check(
        "公開ページの URL",
        parse_target(SITE, "https://pages.example.test/public/onboarding")[1:],
        ("public", "onboarding", None),
    )
    check(
        "版の目印つき",
        parse_target(SITE, "https://pages.example.test/internal/guides/foo?v=02be568#top")[1:],
        ("internal", "guides/foo", "02be568"),
    )
    check("素のスラッグ", parse_target(SITE, "guides/foo")[1:], ("internal", "guides/foo", None))
    check("配信元の言い方", parse_target(SITE, "public/onboarding")[1:], ("public", "onboarding", None))
    check(
        "Slack の貼り方",
        parse_target(SITE, "<https://pages.example.test/internal/guides/foo|pages…>")[1:],
        ("internal", "guides/foo", None),
    )
    check(
        "マークダウンの貼り方",
        parse_target(SITE, "[見出し](https://pages.example.test/internal/guides/foo)")[1:],
        ("internal", "guides/foo", None),
    )
    check("末尾のスラッシュ", parse_target(SITE, "https://pages.example.test/internal/guides/foo/")[1:], ("internal", "guides/foo", None))
    check("配信元も返す", parse_target(SITE, "guides/foo")[0], SITE)
    try:
        parse_target(SITE, "https://other.example.test/internal/guides/foo")
        check_true("よそのサイトの URL では止まる", False, "止まらなかった")
    except Stop as stop:
        check_true("よそのサイトの URL では止まる", stop.code == 2, f"code={stop.code}")

    for bad, label in (("", "空"), ("https://pages.example.test/internal/", "スラッグが無い"), ("guides/日本語", "日本語")):
        try:
            parse_target(SITE, bad)
            check_true(f"おかしな指定で止まる（{label}）", False, "止まらなかった")
        except Stop as stop:
            check_true(f"おかしな指定で止まる（{label}）", stop.code == 2, f"code={stop.code}")

    # 2. 本文の開き方
    sample = """<!DOCTYPE html><html><head><title>見本のページ</title>
    <script>捨てる()</script><style>.x{}</style></head><body>
    <div class="frame">器の部品（PDF ボタンなど）</div>
    <main>
    <!-- CONTENT_START -->
    <h1>大きな見出し</h1>
    <p>ふつうの段落と<a href="https://example.com/a">外の行き先</a>。</p>
    <h2>小さな見出し</h2>
    <ul><li>一つ目</li><li>二つ目</li></ul>
    <ol><li>順番あり</li></ol>
    <table><tr><th>名前</th><th>中身</th></tr><tr><td>あ</td><td>い</td></tr></table>
    <pre class="mermaid">graph TD
  A --&gt; B</pre>
    <img src="shot.png" alt="画面の写し">
    <p>&amp; の実体参照も戻す</p>
    <!-- CONTENT_END -->
    </main></body></html>"""
    text = html_to_text(sample)
    check_true("器の部品は入らない", "器の部品" not in text, text[:120])
    check_true("捨てるものは入らない", "捨てる()" not in text and ".x{}" not in text)
    check_true("見出しの段が残る", "# 大きな見出し" in text and "## 小さな見出し" in text, text[:200])
    check_true("箇条書きが残る", "- 一つ目" in text and "1. 順番あり" in text, text[:400])
    check_true("表が読める形になる", "| 名前 | 中身 |" in text, text[:400])
    check_true("図は図のまま残る", "```mermaid" in text and "A --> B" in text, text[-200:])
    check_true("図の中の字下げは残す", "\n  A --> B" in text, repr(text[-200:]))
    check_true("本文の行頭は詰める", "\n " not in text.split("```")[0], repr(text[:200]))
    check_true("行き先が分かる", "（https://example.com/a）" in text, text[:300])
    check_true("画像があると分かる", "[画像: 画面の写し]" in text)
    check_true("実体参照が戻る", "& の実体参照も戻す" in text)
    check_true("表題が読める", title_of(sample) == "見本のページ", title_of(sample))

    plain = html_to_text("<body><p>印の無いページ</p></body>")
    check_true("印が無くても本文を出す", plain == "印の無いページ", plain)

    # 2b. 直す材料の切り出し（通信しない）
    clean_html = (
        '<html><body><main><!-- CONTENT_START -->'
        '<h1>議事録</h1><p>リリースは 3 月</p>'
        f'<p {SOURCE_NOTE_ATTR} {SOURCE_REPO_ATTR}="acme/doc" '
        f'{SOURCE_PATH_ATTR}="docs/ops.md" {SOURCE_COMMIT_ATTR}="abc1234">docs/ops.md</p>'
        "<!-- CONTENT_END --></main></body></html>"
    )
    stamp = source_stamp(clean_html)
    check("切手ありは清書", stamp.get("kind"), "clean-copy")
    check("切手のパス", stamp.get("path"), "docs/ops.md")
    check("切手のリポジトリ", stamp.get("repo"), "acme/doc")
    check("切手なしは図解", source_stamp(sample).get("kind"), "diagram")
    check(
        "deck は対象外",
        source_stamp('<html><body data-deck><main>枚</main></body></html>').get("kind"),
        "deck",
    )

    md_text = html_to_text(sample)
    check_true("図解の文脈に見出しが残る", "# 大きな見出し" in md_text and "## 小さな見出し" in md_text)
    check_true("図解の文脈に図の文が残る", "```mermaid" in md_text and "A --> B" in md_text)
    check("目次は見出しだけ", outline_of(md_text), ["# 大きな見出し", "## 小さな見出し"])

    content = body_of(sample)
    month = snippet_around_quote(content, "ふつうの段落")
    check_true("引用から段落の断片が出る", month is not None and "ふつうの段落" in month, month)
    check_true("断片に額縁が混ざらない", month is not None and "器の部品" not in month, month)
    check_true("断片に script が混ざらない", month is not None and "捨てる()" not in month, month)

    figure = snippet_around_quote(content, "A --> B")
    check_true("図の引用は pre ごと残る", figure is not None and "<pre" in figure and "A --> B" in figure, figure)

    with_saved = snippet_for_comment(content, {"quote": "無い言葉", "quoteHtml": "<p>選んだ範囲</p>"})
    check("選択範囲 HTML を優先する", with_saved, "<p>選んだ範囲</p>")
    check_true("引用が無ければ断片は無い", snippet_around_quote(content, "存在しない言葉") is None)

    from_api = markdown_from_source({"markdown": "# 原本\n\n本文"})
    check("配信元のマークダウンを読む", from_api, "# 原本\n\n本文")
    check("配信元に無ければ空", markdown_from_source({"html": "<p>x</p>"}), "")

    listed = format_comments(
        [{"id": "aaaa", "priority": "must", "author": {"name": "検査用の人"}, "quote": "3 月", "body": "4 月にする"}],
        {"aaaa": "断片: page-out/snippets/aaaa.html"},
    )
    check_true("コメント一覧に断片の案内がある", "断片: page-out/snippets/aaaa.html" in listed, listed)
    check_true("本文.md を投稿する案内は出さない", "本文.md は投稿しない" in "図解（文脈は 本文.md。直すのは HTML の部分。本文.md は投稿しない）")

    import tempfile

    holder = tempfile.mkdtemp(prefix="read-page-revise-")
    try:
        dest = Path(holder)
        (dest / "本文.md").write_text(md_text, encoding="utf-8")
        snippets = dest / "snippets"
        snippets.mkdir()
        (snippets / "aaaa.html").write_text(month + "\n", encoding="utf-8")
        write_comments_file(
            dest / "コメント.txt",
            [{"id": "aaaa", "priority": "must", "author": {"name": "検査用の人"}, "quote": "ふつうの段落", "body": "言い回しを直す"}],
            {"aaaa": f"断片: {snippets / 'aaaa.html'}"},
        )
        check_true("図解の文脈ファイルを置く", (dest / "本文.md").is_file() and "# 大きな見出し" in (dest / "本文.md").read_text(encoding="utf-8"))
        check_true("断片ファイルを置く", "<p>" in (snippets / "aaaa.html").read_text(encoding="utf-8"))
        check_true("コメントファイルに断片の案内がある", "断片:" in (dest / "コメント.txt").read_text(encoding="utf-8"))
        refuse_existing_out(dest)
        check_true("既存の本文.md で止まる", False, "止まらなかった")
    except Stop as stop:
        check_true("既存の本文.md で止まる", "本文.md" in stop.message, stop.message)
    finally:
        pass

    try:
        empty = Path(tempfile.mkdtemp(prefix="read-page-empty-"))
        refuse_existing_out(empty)
        check_true("空の置き場は通す", True)
    except Stop as stop:
        check_true("空の置き場は通す", False, stop.message)

    # 3. 断られたときの言い方（鍵の案内に必ず行き着く）
    class FakeError(urllib.error.HTTPError):
        def __init__(self, code, said=""):
            super().__init__("https://example.invalid", code, "", {}, None)
            self.said = said

        def read(self):
            if not self.said:
                return b""
            return json.dumps({"error": self.said}, ensure_ascii=False).encode("utf-8")

    check_true("鍵が通らないときはこのリポジトリでの手順を出す", "このリポジトリ" in stop_for_status(FakeError(401)).next_steps)
    check_true("鍵が通らないときはログインの打ち方も出す", "pages-publish.mjs login" in stop_for_status(FakeError(401)).next_steps)
    check_true("無いページはそう言う", "そのページはありません" in stop_for_status(FakeError(404)).message)
    check_true("無いページは確かめ先も出す", "/internal/" in stop_for_status(FakeError(404)).next_steps)
    check_true(
        "配信元の言い分はそのまま残す",
        "サーバーの言い分" in stop_for_status(FakeError(403, "サーバーの言い分")).message,
    )

    # 4. 鍵の探し方（投稿コマンドの控え）。中身は出さない
    import tempfile
    from unittest import mock

    holder = Path(tempfile.mkdtemp(prefix="read-page-selftest-")) / "credential"
    with mock.patch.object(_distribution, "token_path", return_value=str(holder)):
        check_true("鍵が無ければ None", load_token() is None)
        holder.write_text("控えの鍵\n", encoding="utf-8")
        check_true("控えから読む", load_token() == "控えの鍵")

    print("ページを読む道具の自己点検")
    print("")
    for index, (label, passed, detail) in enumerate(results, start=1):
        print(f"{index:>2}. {'合格' if passed else '不合格'}  {label}")
        if not passed and detail:
            print(f"      | {detail}")
    failed = [label for label, passed, _ in results if not passed]
    print("")
    print(f"{len(results)} 件のうち 合格 {len(results) - len(failed)} 件 / 不合格 {len(failed)} 件")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
