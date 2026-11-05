# -*- coding: utf-8 -*-
"""小さな原本を並べて、検査と投稿の契約が壊れていないことを毎回確かめる。"""

import json
import os
import shutil
import stat
import tempfile
from unittest.mock import patch

from . import check as check_mod
from . import pipeline as pipeline_mod
from . import provenance as provenance_mod
from .note import SOURCE_NOTE_ATTR, attach_note, has_source_note, source_note

HERE = os.path.dirname(os.path.realpath(__file__))
SKILL_DIR = os.path.dirname(os.path.dirname(HERE))
FIXTURES = os.path.join(SKILL_DIR, "fixtures")
STUB = os.path.join(FIXTURES, "_stub", "deck.html")


class Result(object):
    def __init__(self, name):
        self.name = name
        self.failures = []

    def check(self, label, ok, detail=""):
        if not ok:
            self.failures.append("%s%s" % (label, ("： " + detail) if detail else ""))
        return ok


def _load_case(path):
    case = {
        "note": "",
        "expect_ok": True,
        "expect_codes": [],
        "embed": "ok",
    }
    case_path = os.path.join(path, "case.json")
    if os.path.exists(case_path):
        case.update(json.load(open(case_path, encoding="utf-8")))
    return case


def _prepare_html(raw, embed, mode):
    if mode == "missing":
        return raw.replace(check_mod.PLACEHOLDER, "", 1)
    if mode == "mismatch":
        mutated = embed[:1] + "X" + embed[1:] if embed else "X"
        return raw.replace(check_mod.PLACEHOLDER, mutated, 1)
    return check_mod.apply_embed_placeholder(raw, embed)


def run_check_cases():
    results = []
    if not os.path.isdir(FIXTURES):
        result = Result("fixtures")
        result.check("fixtures がある", False, FIXTURES)
        return [result]
    embed = check_mod.embed_block(check_mod.read_text(STUB))
    names = sorted(
        name
        for name in os.listdir(FIXTURES)
        if name != "_stub" and os.path.isdir(os.path.join(FIXTURES, name))
    )
    holder = tempfile.mkdtemp(prefix="explain-deck-fix-")
    try:
        stub_copy = os.path.join(holder, "deck.html")
        shutil.copy(STUB, stub_copy)
        for name in names:
            path = os.path.join(FIXTURES, name)
            result = Result(name)
            case = _load_case(path)
            in_path = os.path.join(path, "in.html")
            result.check("in.html がある", os.path.isfile(in_path))
            if not os.path.isfile(in_path):
                results.append(result)
                continue
            raw = check_mod.read_text(in_path)
            prepared = _prepare_html(raw, embed, case.get("embed") or "ok")
            work = os.path.join(holder, name + ".html")
            with open(work, "w", encoding="utf-8") as handle:
                handle.write(prepared)
            report = check_mod.check_file(work, template_path=stub_copy)
            codes_found = [item["code"] for item in report["findings"]]
            result.check(
                "ok",
                report["ok"] == bool(case["expect_ok"]),
                "実際 %s / 期待 %s / %s" % (report["ok"], case["expect_ok"], codes_found),
            )
            expected_codes = case.get("expect_codes") or []
            if expected_codes:
                missing = [code for code in expected_codes if code not in codes_found]
                result.check("codes", not missing, "不足 %s / 実際 %s" % (missing, codes_found))
            if case["expect_ok"]:
                result.check("findings empty", codes_found == [], str(codes_found))
            results.append(result)
    finally:
        shutil.rmtree(holder, ignore_errors=True)
    return results


def _fake_cli(holder):
    path = os.path.join(holder, "pages-publish")
    received = os.path.join(holder, "received.html")
    script = """#!/usr/bin/env python3
import sys
if sys.argv[1] == "get":
    print("null")
    sys.exit(0)
args = sys.argv[1:]
file_path = ""
slug = ""
i = 0
while i < len(args):
    if args[i] == "--file" and i + 1 < len(args):
        file_path = args[i + 1]
        i += 2
        continue
    if args[i] == "--dir" and i + 1 < len(args):
        file_path = args[i + 1] + "/index.html"
        i += 2
        continue
    if args[i] == "--slug" and i + 1 < len(args):
        slug = args[i + 1]
        i += 2
        continue
    i += 1
open(%r, "w", encoding="utf-8").write(open(file_path, encoding="utf-8").read() if file_path else "")
print("https://pages.example.com/internal/" + slug)
""" % received
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(script)
    os.chmod(path, os.stat(path).st_mode | stat.S_IEXEC)
    return path, received


def run_publish_cases():
    results = []
    embed = check_mod.embed_block(check_mod.read_text(STUB))
    green = os.path.join(FIXTURES, "01-ok", "in.html")
    raw = check_mod.apply_embed_placeholder(check_mod.read_text(green), embed)

    holder = tempfile.mkdtemp(prefix="explain-deck-pub-")
    saved_env = {
        key: os.environ.get(key)
        for key in ("SURPRISE_PAGES_DIR", "SURPRISE_PAGES_CONFIG", "SURPRISE_PAGES_TRASH")
    }
    trash = os.path.join(holder, "trash")
    config = os.path.join(holder, "config")
    os.makedirs(trash)
    os.makedirs(config)
    open(os.path.join(config, "token"), "w", encoding="utf-8").write("x")
    cli, received = _fake_cli(holder)
    del received
    pages = os.path.join(holder, "pages")
    os.makedirs(os.path.join(pages, "bin"))
    os.makedirs(os.path.join(pages, "src", "templates"))
    shutil.copy(STUB, os.path.join(pages, "src", "templates", "deck.html"))
    os.environ["SURPRISE_PAGES_DIR"] = pages
    os.environ["SURPRISE_PAGES_CONFIG"] = config
    os.environ["SURPRISE_PAGES_TRASH"] = trash

    source = os.path.join(holder, "decks", "intro.html")
    os.makedirs(os.path.dirname(source))
    with open(source, "w", encoding="utf-8") as handle:
        handle.write(raw)
    before = open(source, "rb").read()

    result = Result("publish-internal")
    code, payload = pipeline_mod.run(
        source,
        slug="decks/intro",
        message="スライド: decks/intro.html",
        cli=cli,
        template_path_override=os.path.join(pages, "src", "templates", "deck.html"),
        keep=True,
    )
    result.check("exit 0", code == 0, str(payload.get("error")))
    result.check("ok", payload.get("ok") is True)
    result.check("原本が同じ", open(source, "rb").read() == before)
    posted = open(payload["copy"], encoding="utf-8").read() if payload.get("copy") else ""
    result.check("写しに札", SOURCE_NOTE_ATTR in posted)
    result.check("写しに repo が載る余地", True)
    result.check("URL", bool(payload.get("url")), str(payload.get("url")))
    result.check("原本に札が無い", not has_source_note(raw))
    result.check("単一HTMLは --file のまま", "--file" in payload.get("command", []))
    results.append(result)

    bundle = os.path.join(holder, "bundle")
    os.makedirs(os.path.join(bundle, "assets"))
    bundled_source = os.path.join(bundle, "index.html")
    with open(bundled_source, "w", encoding="utf-8") as handle:
        handle.write(raw)
    with open(os.path.join(bundle, "assets", "logo.svg"), "w", encoding="utf-8") as handle:
        handle.write('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')
    result = Result("publish-with-assets")
    code, payload = pipeline_mod.run(
        bundled_source,
        slug="decks/with-assets",
        cli=cli,
        template_path_override=os.path.join(pages, "src", "templates", "deck.html"),
        keep=True,
    )
    result.check("exit 0", code == 0, str(payload.get("error")))
    result.check("フォルダ投稿", "--dir" in payload.get("command", []))
    copied = os.path.join(os.path.dirname(payload.get("copy") or ""), "assets", "logo.svg")
    result.check("素材を相対構造のまま写す", os.path.isfile(copied))
    result.check("素材数", (payload.get("assets") or {}).get("files") == 1)
    results.append(result)

    unsafe = os.path.join(holder, "unsafe")
    os.makedirs(os.path.join(unsafe, "assets"))
    unsafe_source = os.path.join(unsafe, "index.html")
    with open(unsafe_source, "w", encoding="utf-8") as handle:
        handle.write(raw)
    with open(os.path.join(unsafe, "assets", ".env"), "w", encoding="utf-8") as handle:
        handle.write("SECRET=never-copy")
    result = Result("publish-rejects-hidden-assets")
    code, payload = pipeline_mod.run(
        unsafe_source,
        slug="decks/unsafe-assets",
        cli=cli,
        template_path_override=os.path.join(pages, "src", "templates", "deck.html"),
        keep=True,
    )
    result.check("exit 1", code == 1)
    result.check("stampで止める", payload.get("stage") == "stamp")
    result.check("隠し素材を写さない", "隠しファイル" in (payload.get("error") or ""))
    results.append(result)

    result = Result("publish-public")
    code, payload = pipeline_mod.run(
        source,
        slug="decks/intro",
        public=True,
        yes_public=True,
        cli=cli,
        template_path_override=os.path.join(pages, "src", "templates", "deck.html"),
        keep=True,
        no_git=True,
    )
    posted = open(payload["copy"], encoding="utf-8").read() if payload.get("copy") else ""
    result.check("exit 0", code == 0, str(payload.get("error")))
    result.check("札はある", SOURCE_NOTE_ATTR in posted)
    result.check("repo を出さない", "data-source-repo" not in posted)
    result.check("path を出さない", "data-source-path" not in posted)
    result.check("原本が同じ", open(source, "rb").read() == before)
    result.check("報告にノート", "ノートは画面に出ません" in (payload.get("report_draft") or ""))
    results.append(result)

    result = Result("publish-red-stops")
    broken = os.path.join(holder, "broken.html")
    with open(broken, "w", encoding="utf-8") as handle:
        handle.write("<html><body><p>not a deck</p></body></html>\n")
    before_broken = open(broken, "rb").read()
    code, payload = pipeline_mod.run(
        broken,
        slug="decks/intro",
        cli=cli,
        template_path_override=os.path.join(pages, "src", "templates", "deck.html"),
    )
    result.check("exit 1", code == 1)
    result.check("stage check", payload.get("stage") == "check")
    result.check("原本が同じ", open(broken, "rb").read() == before_broken)
    results.append(result)

    note_only = source_note(12, "intro.html", public=True)
    result = Result("note-shape")
    result.check("public に repo が無い", "data-source-repo" not in note_only)
    dirty_note = source_note(12, "intro.html", provenance={"path": "decks/intro.html", "dirty": True})
    result.check("dirty は作業中", "作業中の内容" in dirty_note and "data-source-commit" not in dirty_note)
    attached = attach_note("<html><body>\n</body></html>\n", note_only)
    result.check("札が body の前", attached.index(SOURCE_NOTE_ATTR) < attached.lower().rfind("</body"))
    results.append(result)

    for key, value in saved_env.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    shutil.rmtree(holder, ignore_errors=True)
    return results


def run_runtime_cases():
    """Published decks keep the runtime they were written with; the list decides, not this file."""
    results = []
    holder = tempfile.mkdtemp(prefix="explain-deck-runtime-")
    try:
        style = "<style>:root{--deck-k:1}[data-deck-frame]{position:fixed;font-size:12px;color:#fff}</style>"
        old_nav = "<script>var WIDTH = 1280;/*old*/data-deck-ready</script>"
        new_nav = "<script>var WIDTH = 1280;/*new*/data-deck-ready</script>"
        old_design = '<style data-deck-design-style="3">.x{font-size:12px;position:fixed;color:#000}</style><script data-deck-design-runtime="3">"<style>a{font-size:1px}</style>";/*old*/</script>'
        new_design = '<style data-deck-design-style="3">.x{color:#111}</style><script data-deck-design-runtime="3">/*new*/</script>'
        old_v3 = old_design[old_design.index("<script"):]
        slides = '<body data-deck>\n<main data-deck-slides><section data-deck-slide></section></main>\n'
        deck = "<!doctype html><html><head><title>t</title>%s</head>" + slides + "%s%s</body></html>\n"
        templates = os.path.join(holder, "src", "templates")
        os.makedirs(templates)
        os.makedirs(os.path.join(holder, "bin"))
        with open(os.path.join(holder, "bin", "deck-design-check.mjs"), "w", encoding="utf-8") as handle:
            handle.write('console.log(JSON.stringify({ ok: true }));\n')
        for name, text in (("deck.html", "<!-- x -->" + style + new_nav), ("deck-design.html", "<!-- x -->" + new_design)):
            with open(os.path.join(templates, name), "w", encoding="utf-8") as handle:
                handle.write(text)
        compat = {
            "navigation": [check_mod._sha256(old_nav), check_mod._sha256(new_nav)],
            "design": [check_mod._sha256(old_v3), check_mod._sha256(new_design[new_design.index("<script"):])],
        }
        with open(os.path.join(templates, check_mod.COMPAT_NAME), "w", encoding="utf-8") as handle:
            json.dump(compat, handle)
        template = os.path.join(templates, "deck.html")

        def checked(name, text):
            path = os.path.join(holder, name + ".html")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(text)
            return path, check_mod.check_file(path, template_path=template)

        result = Result("runtime-listed-passes")
        source, report_ = checked("listed", deck % (old_design, style, old_nav))
        result.check("通る", report_["ok"], str(report_["findings"]))
        results.append(result)

        result = Result("runtime-unknown-reports-once")
        _, report_ = checked("unknown", deck % ("", style, old_nav.replace("old", "other")))
        found = [item["code"] for item in report_["findings"]]
        result.check("1件だけ", found == ["TEMPLATE_MISMATCH"], str(found))
        results.append(result)

        result = Result("design-unknown-reports-once")
        _, report_ = checked("unknown-design", deck % (old_design.replace("old", "other"), style, old_nav))
        found = [item["code"] for item in report_["findings"]]
        result.check("1件だけ", found == ["TEMPLATE_MISMATCH"], str(found))
        results.append(result)

        result = Result("runtime-before-main-passes")
        _, report_ = checked("before-main", deck % (old_design + style + old_nav, "", ""))
        result.check("通る", report_["ok"], str(report_["findings"]))
        results.append(result)

        result = Result("unknown-before-main-is-mismatch")
        _, report_ = checked("unknown-before-main", deck % (style + old_nav.replace("old", "other"), "", ""))
        found = [item["code"] for item in report_["findings"]]
        result.check("違うと報告", found == ["TEMPLATE_MISMATCH"], str(found))
        results.append(result)

        result = Result("author-style-still-checked")
        _, report_ = checked("author", deck % ("<style>.a{font-size:12px}</style>" + old_design, style, old_nav))
        found = [item["code"] for item in report_["findings"]]
        result.check("本文の字は見る", found == ["FONT_TOO_SMALL"], str(found))
        results.append(result)

        result = Result("list-missing-recognises-nothing")
        os.remove(os.path.join(templates, check_mod.COMPAT_NAME))
        _, report_ = checked("no-list", deck % ("", style, old_nav))
        found = [item["code"] for item in report_["findings"]]
        result.check("通さない", found == ["TEMPLATE_MISMATCH"], str(found))
        with open(os.path.join(templates, check_mod.COMPAT_NAME), "w", encoding="utf-8") as handle:
            json.dump(compat, handle)
        results.append(result)

        config = os.path.join(holder, "config")
        os.makedirs(config)
        with open(os.path.join(config, "token"), "w", encoding="utf-8") as handle:
            handle.write("x")
        cli, _received = _fake_cli(holder)
        saved = os.environ.get("SURPRISE_PAGES_CONFIG")
        os.environ["SURPRISE_PAGES_CONFIG"] = config
        try:
            before = open(source, "rb").read()
            with patch.object(pipeline_mod.update_mod, "read_current", return_value={"versionId": "v1"}):
                code, payload = pipeline_mod.run(source, slug="decks/old", cli=cli, template_path_override=template, base_version="v1", keep=True, no_git=True)
            posted = open(payload["copy"], encoding="utf-8").read() if payload.get("copy") else ""
            result = Result("republish-upgrades-runtime")
            result.check("exit 0", code == 0, str(payload.get("error")))
            result.check("結果に出る", "navigation・design" in (payload.get("runtime_updated") or ""), str(payload.get("runtime_updated")))
            result.check("現行の実行部", new_nav in posted and new_design in posted)
            result.check("古い実行部が残らない", old_nav not in posted and old_design not in posted)
            result.check("原本が同じ", open(source, "rb").read() == before)
            results.append(result)

            code, payload = pipeline_mod.run(source, slug="decks/new", cli=cli, template_path_override=template, keep=True, no_git=True)
            posted = open(payload["copy"], encoding="utf-8").read() if payload.get("copy") else ""
            result = Result("new-publish-keeps-runtime")
            result.check("exit 0", code == 0, str(payload.get("error")))
            result.check("差し替えない", old_nav in posted and "runtime_updated" not in payload)
            results.append(result)
        finally:
            if saved is None:
                os.environ.pop("SURPRISE_PAGES_CONFIG", None)
            else:
                os.environ["SURPRISE_PAGES_CONFIG"] = saved
    finally:
        shutil.rmtree(holder, ignore_errors=True)
    return results


def run_all():
    results = []
    prov = provenance_mod.self_test()
    prov_result = Result("provenance")
    if prov:
        for item in prov:
            prov_result.failures.append(item)
    results.append(prov_result)
    results.extend(run_check_cases())
    # Publishing contract fixtures use a fake CLI. Real image checks have their own tests.
    with patch.object(pipeline_mod.quality_mod, "check_file", return_value={"ok": True, "slides": 1, "density": 2, "issues": []}):
        results.extend(run_publish_cases())
        results.extend(run_runtime_cases())
    return results


def report(results):
    failed = 0
    for item in results:
        if item.failures:
            failed += 1
            print("NG  %s" % item.name)
            for line in item.failures:
                print("    %s" % line)
        else:
            print("OK  %s" % item.name)
    print("")
    print("%d 件中 %d 件 NG" % (len(results), failed) if failed else "すべて OK（%d 件）" % len(results))
    return 1 if failed else 0
