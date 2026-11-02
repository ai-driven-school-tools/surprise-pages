#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""清書の道具一式。原本を検査し、入れ物だけ直し、HTML に組み、原本と突き合わせる。

ふだん打つのは 1 本だけ。検査から投稿・片付け・報告の下書きまで通す。

    python3 run.py publish 原本.md --slug reports/2026-09-07-kickoff \\
        [--description "一覧に出る 1 文"] [--public --yes-public] [--dry-run]

止まったときの切り分けに、区間ごとの合図も残してある。

    python3 run.py preflight        # 投稿コマンドとログインの控えだけ確かめる
    python3 run.py validate 原本.md
    python3 run.py fix 原本.md --out 作業.md [--apply-defaults --title 表題]
    python3 run.py convert 作業.md --out page-out --original 原本.md --description "一覧に出る 1 文"
    python3 run.py verify 原本.md --out page-out [--work 作業.md]
    python3 run.py mapping          # 変換表を読む
    python3 run.py look             # 見た目の一式と印（配信側が写す）
    python3 run.py test-fixtures    # 手引きを書き換える前に、ここが全部緑であること

**原本には 1 バイトも書かない。** fix は必ず `--out` に出し、入力と同じ場所を指すと断る。
出す値はどれも JSON。終了コードは 0（問題なし）/ 1（止まる）/ 2（そもそも走れない）。
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))

from cleancopy import (
    codes,
    convert as convert_mod,
    fix as fix_mod,
    pipeline as pipeline_mod,
    provenance as provenance_mod,
    validate as validate_mod,
    verify as verify_mod,
)
from cleancopy.source import SourceError, count_chars, read_source

HERE = os.path.dirname(os.path.realpath(__file__))
DEFAULT_FRAME = pipeline_mod.DEFAULT_FRAME
DEFAULT_MERMAID = pipeline_mod.mermaid_path()

OK = pipeline_mod.OK
STOP = pipeline_mod.STOP
CANNOT_RUN = pipeline_mod.CANNOT_RUN

#: 変換の控えの置き場。**`page-out/` の中に置かない。**
#: 投稿はフォルダごと送るので、中に置くと控えまで相手に配られてしまう。
REPORT_NAME = pipeline_mod.REPORT_NAME


def default_report_path(out_dir):
    return os.path.join(os.path.dirname(os.path.abspath(out_dir)), REPORT_NAME)


def emit(payload):
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2, sort_keys=False)
    sys.stdout.write("\n")


def fail(message):
    emit({"ok": False, "error": message})
    return CANNOT_RUN


def cmd_publish(args):
    """ふだん打つ 1 本。検査から投稿・片付け・報告の下書きまで通す。"""
    code, payload = pipeline_mod.run(
        args.source,
        slug=args.slug,
        out=args.out,
        description=args.description,
        title=args.title,
        message=args.message,
        public=args.public,
        yes_public=args.yes_public,
        dry_run=args.dry_run,
        frame_path=args.frame,
        mermaid_template=args.mermaid_template,
        report_path=args.report,
        work_path=args.work,
        no_git=args.no_git,
        keep=args.keep,
        layout=args.layout,
    )
    emit(payload)
    return code


def cmd_publish_bundle(args):
    from cleancopy import bundle
    code, result = bundle.run(args.manifest, out=args.out, dry_run=args.dry_run,
                              keep=args.keep, frame_path=args.frame,
                              mermaid_template=args.mermaid_template, preserve_existing=args.preserve_existing)
    emit(result)
    return code


def cmd_preflight(args):
    """投稿コマンドとログインの控えだけ確かめる（切り分け用）。"""
    del args
    found = pipeline_mod.preflight()
    payload = {
        "ok": bool(found["cli"]) and found["logged_in"],
        "cli": found["cli"],
        "logged_in": found["logged_in"],
        "cloud": found["cloud"],
        "ensured": found["ensured"],
        "detail": found["detail"],
    }
    if not found["cli"]:
        payload["next"] = ["画面に出ている案内をそのままユーザーに見せる"]
    elif not found["logged_in"]:
        payload["next"] = [pipeline_mod.login_hint(found)]
    emit(payload)
    return OK if payload["ok"] else STOP


def cmd_validate(args):
    try:
        text = read_source(args.source)
    except SourceError as err:
        emit(
            {
                "source": args.source,
                "findings": [
                    {
                        "code": "UNREADABLE",
                        "severity": codes.ERROR,
                        "line": 1,
                        "detail": str(err),
                        "default": "",
                    }
                ],
                "summary": {codes.ERROR: 1, codes.FIXABLE: 0, codes.WARN: 0},
            }
        )
        return STOP
    report = validate_mod.validate_text(text, os.path.dirname(os.path.abspath(args.source)), args.source)
    emit(report)
    return STOP if validate_mod.has_error(report) else OK


def cmd_fix(args):
    try:
        text = read_source(args.source)
    except SourceError as err:
        return fail(str(err))

    source_real = os.path.realpath(args.source)
    out_real = os.path.realpath(args.out)
    if source_real == out_real:
        return fail("原本を上書きしようとしています。別の場所を --out に渡してください: %s" % args.out)

    title = args.title
    if args.apply_defaults and not title:
        title = os.path.splitext(os.path.basename(args.source))[0]

    fixed, applied = fix_mod.fix_text(text, apply_defaults=args.apply_defaults, title=title)
    out_dir = os.path.dirname(os.path.abspath(args.out))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        handle.write(fixed)

    after = validate_mod.validate_text(fixed, os.path.dirname(source_real), args.out)
    emit(
        {
            "source": args.source,
            "out": args.out,
            "applied": applied,
            "remaining": [item for item in after["findings"] if item["severity"] != codes.WARN],
            "warnings": [item for item in after["findings"] if item["severity"] == codes.WARN],
        }
    )
    return STOP if validate_mod.has_error(after) else OK


def _load_frame(path):
    if not os.path.exists(path):
        raise convert_mod.ConvertError(
            "額縁が見つかりません: %s\n"
            "スキル置き場を決めてから `--frame <スキル置き場>/_shared/references/base.html` を渡してください。" % path
        )
    return open(path, encoding="utf-8").read()


def cmd_convert(args):
    try:
        work_text = read_source(args.source)
        original_path = args.original or args.source
        original_text = read_source(original_path)
    except SourceError as err:
        return fail(str(err))

    check = validate_mod.validate_text(work_text, os.path.dirname(os.path.abspath(args.source)), args.source)
    if validate_mod.has_error(check) and not args.force:
        emit(
            {
                "ok": False,
                "error": "止まる判定が残ったままです。人に既定案を見せて了承をもらってから "
                "`fix --apply-defaults` を通してください。",
                "findings": [item for item in check["findings"] if item["severity"] == codes.ERROR],
            }
        )
        return STOP

    try:
        built = convert_mod.convert_text(work_text, original_text=original_text, title=args.title, layout=args.layout)
        frame = _load_frame(args.frame)
        snippet = convert_mod.mermaid_snippet(args.mermaid_template) if built["needs_mermaid"] else None
        found = None
        if not args.public and not args.no_git:
            found = provenance_mod.inspect(original_path)
        display_name = (found or {}).get("path") or os.path.basename(original_path)
        note = convert_mod.source_note(
            count_chars(original_text),
            display_name,
            public=args.public,
            provenance=None if args.public else found,
        )
        body = built["body"] + "\n" + note
        page = convert_mod.build_page(
            frame, built["title"], args.description or built["title"], body, snippet, layout=args.layout
        )
    except convert_mod.ConvertError as err:
        return fail(str(err))

    os.makedirs(args.out, exist_ok=True)
    page_path = os.path.join(args.out, "index.html")
    with open(page_path, "w", encoding="utf-8") as handle:
        handle.write(page)

    report = {
        "source": args.source,
        "original": original_path,
        "page": page_path,
        "title": built["title"],
        "description": args.description or built["title"],
        "public": bool(args.public),
        "mermaid": built["needs_mermaid"],
        "extra_headings": built["extra_headings"],
        "headings_not_in_original": built["headings_not_in_original"],
        "heading_count_html": built["heading_count_html"],
        "removed_text": built["removed_text"],
        "added_text": built["added_text"],
        "notes": built["notes"],
        "provenance": None if args.public else provenance_mod.reportable(found),
    }
    report_path = args.report or default_report_path(args.out)
    with open(report_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2, sort_keys=False)
        handle.write("\n")

    emit(
        {
            "ok": True,
            "page": page_path,
            "report": report_path,
            "title": built["title"],
            "mermaid": built["needs_mermaid"],
            "notes": built["notes"],
            "provenance": None if args.public else provenance_mod.reportable(found),
        }
    )
    return OK


def cmd_verify(args):
    try:
        original_text = read_source(args.original)
    except SourceError as err:
        return fail(str(err))
    page_path = args.page or os.path.join(args.out, "index.html")
    report_path = args.report or default_report_path(args.out)
    if not os.path.exists(page_path):
        return fail("ページが見つかりません: %s" % page_path)
    if not os.path.exists(report_path):
        return fail("変換の控えが見つかりません: %s（convert が作ります）" % report_path)

    page_html = open(page_path, encoding="utf-8").read()
    report = json.load(open(report_path, encoding="utf-8"))
    work_text = None
    if args.work:
        try:
            work_text = read_source(args.work)
        except SourceError as err:
            return fail(str(err))

    result = verify_mod.verify(original_text, page_html, report, work_text=work_text)
    emit(result)
    return OK if result["ok"] else STOP


def cmd_look(args):
    """見た目の一式と印を JSON で出す。配信側の一式（src/lib/settings/clean-copy-look.generated.json）の材料。"""
    print(json.dumps({"stamp": convert_mod.look_stamp(), "look": convert_mod.look()}, ensure_ascii=False, sort_keys=True, indent=2))
    return 0


def cmd_mapping(args):
    del args
    print("原本の書き方 → 出るもの（正本は scripts/cleancopy/convert.py の STYLE）\n")
    for left, right in convert_mod.MAPPING:
        print("- %s\n    %s" % (left, right))
    print("\n判定コードの一覧は scripts/cleancopy/codes.py。")
    return OK


def cmd_codes(args):
    del args
    rows = []
    for code, (severity, what, default) in codes.CATALOG.items():
        rows.append({"code": code, "severity": severity, "what": what, "default": default})
    rows.sort(key=lambda row: (row["severity"], row["code"]))
    emit({"codes": rows})
    return OK


def cmd_test_fixtures(args):
    from cleancopy import fixtures

    return fixtures.run(
        os.path.normpath(os.path.join(HERE, "..", "fixtures")),
        frame_path=args.frame,
        update=args.update,
        only=args.only,
    )


def build_parser():
    parser = argparse.ArgumentParser(description="原本を清書する道具一式")
    subs = parser.add_subparsers(dest="command")

    batch = subs.add_parser("publish-bundle", help="登録した複数の原本を全件照合して一括公開する")
    batch.add_argument("manifest", help="公開先と原本の順番を記したJSON")
    batch.add_argument("--out", help="作業用の出力先。既定は一時領域")
    batch.add_argument("--dry-run", action="store_true", help="組版と照合のみ。通信・公開しない")
    batch.add_argument("--preserve-existing", action="store_true", help="公開後の本文変更を上書きせず停止する")
    batch.add_argument("--keep", action="store_true", help="公開後も検証用出力を残す")
    batch.add_argument("--frame", default=DEFAULT_FRAME)
    batch.add_argument("--mermaid-template", default=None)
    batch.set_defaults(func=cmd_publish_bundle)

    whole = subs.add_parser("publish", help="検査から投稿・片付けまで 1 回で通す（ふだんはこれ）")
    whole.add_argument("source", help="原本（1 バイトも書き換えない）")
    whole.add_argument("--slug", help="そのまま URL になる（英小文字・数字・- _ . / だけ）")
    whole.add_argument("--out", default="page-out", help="組み上げ先（既定は page-out）")
    whole.add_argument("--description", help="一覧と OGP に出る 1 文（本文には出ない）")
    whole.add_argument("--title", help="表題（既定は原本の最上位の見出し）")
    whole.add_argument("--message", help="投稿に添える 1 行（既定は付けない）")
    whole.add_argument("--public", action="store_true", help="公開。--yes-public とセットでのみ効く")
    whole.add_argument("--yes-public", action="store_true", help="公開の指示をユーザーから取ってある")
    whole.add_argument("--dry-run", action="store_true", help="照合まで。投稿も片付けもしない")
    whole.add_argument("--keep", action="store_true", help="投稿しても片付けない（検査用）")
    whole.add_argument("--work", help="作業ファイルの置き場（既定は out の隣の %s）" % pipeline_mod.WORK_NAME)
    whole.add_argument("--report", help="控えの置き場（既定は out の隣の %s）" % REPORT_NAME)
    whole.add_argument("--frame", default=DEFAULT_FRAME)
    whole.add_argument("--mermaid-template", default=None)
    whole.add_argument("--no-git", action="store_true", help="git の出典を付けない（検査用）")
    whole.add_argument("--layout", choices=convert_mod.LAYOUTS, default="default", help="講義原稿の表・スライド指示には manuscript、1 行 1 息の台本には script")
    whole.set_defaults(func=cmd_publish)

    ready = subs.add_parser("preflight", help="投稿コマンドとログインの控えを確かめる")
    ready.set_defaults(func=cmd_preflight)

    one = subs.add_parser("validate", help="原本を検査して判定コードを並べる")
    one.add_argument("source")
    one.set_defaults(func=cmd_validate)

    two = subs.add_parser("fix", help="入れ物だけ直して作業ファイルに出す")
    two.add_argument("source")
    two.add_argument("--out", required=True, help="出す先（原本と同じ場所は断る）")
    two.add_argument("--apply-defaults", action="store_true", help="止まる判定の既定案も当てる（了承後）")
    two.add_argument("--title", help="表題を立てるときの文言（既定はファイル名）")
    two.set_defaults(func=cmd_fix)

    three = subs.add_parser("convert", help="HTML に組んで page-out に出す")
    three.add_argument("source", help="作業ファイル（fix の出力）")
    three.add_argument("--out", default="page-out")
    three.add_argument("--original", help="原本（末尾の 1 行と照合の基準に使う）")
    three.add_argument("--title")
    three.add_argument("--description", help="一覧と OGP に出る 1 文（本文には出ない）")
    three.add_argument("--public", action="store_true", help="公開のときだけ。末尾の 1 行からファイル名を落とす")
    three.add_argument("--frame", default=DEFAULT_FRAME)
    three.add_argument("--mermaid-template", default=DEFAULT_MERMAID)
    three.add_argument("--report", help="控えの置き場（既定は page-out の隣の %s）" % REPORT_NAME)
    three.add_argument("--force", action="store_true", help="止まる判定が残っていても組む（使わない）")
    three.add_argument("--no-git", action="store_true", help="git の出典を付けない（検査用）")
    three.add_argument("--layout", choices=convert_mod.LAYOUTS, default="default", help="講義原稿には manuscript、1 行 1 息の台本には script")
    three.set_defaults(func=cmd_convert)

    four = subs.add_parser("verify", help="原本と出来上がったページを突き合わせる")
    four.add_argument("original")
    four.add_argument("--out", default="page-out")
    four.add_argument("--page")
    four.add_argument("--report")
    four.add_argument("--work", help="作業ファイル（控えの裏取りに使う）")
    four.set_defaults(func=cmd_verify)

    five = subs.add_parser("mapping", help="変換表を読む")
    five.set_defaults(func=cmd_mapping)

    look = subs.add_parser("look", help="見た目の一式を JSON で出す（配信側が写す）")
    look.set_defaults(func=cmd_look)

    six = subs.add_parser("codes", help="判定コードの一覧を読む")
    six.set_defaults(func=cmd_codes)

    seven = subs.add_parser("test-fixtures", help="フィクスチャを全部走らせる")
    seven.add_argument("--update", action="store_true", help="期待値を作り直す（人が目で見てから commit する）")
    seven.add_argument("--only", help="1 件だけ走らせる")
    seven.add_argument("--frame", default=DEFAULT_FRAME)
    seven.set_defaults(func=cmd_test_fixtures)

    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return CANNOT_RUN
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
