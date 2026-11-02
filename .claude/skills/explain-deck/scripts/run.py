#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""スライド（deck）の検査と投稿。原本には 1 バイトも書かない。

    python3 run.py publish 原本.html --slug decks/intro \\
        [--public --yes-public] [--message "スライド: …"] [--commit SHA] [--dry-run]

    python3 run.py check 原本.html [--commit SHA]
    python3 run.py preflight
    python3 run.py test-fixtures
"""

import argparse
import json
import os
import sys
import subprocess

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))

from explaindeck import check as check_mod
from explaindeck import pipeline as pipeline_mod
from explaindeck import kit as kit_mod
from explaindeck import quality as quality_mod

OK = pipeline_mod.OK
STOP = pipeline_mod.STOP
CANNOT_RUN = pipeline_mod.CANNOT_RUN


def emit(payload):
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2, sort_keys=False)
    sys.stdout.write("\n")


def cmd_prepare(args):
    result = kit_mod.prepare()
    if result["ok"]:
        try:
            result["image_quality"] = quality_mod.prepare()
        except quality_mod.QualityError as error:
            emit({"ok": False, "stage": "quality", "error": str(error), "next": "検査道具の準備が完了するまで投稿しない。表示された案内を確認してprepareを再実行してください"})
            return CANNOT_RUN
    emit(result)
    return OK if result["ok"] else CANNOT_RUN


def cmd_check(args):
    report = check_mod.check_file(args.source, template_path=args.template, commit=args.commit)
    emit(report)
    return OK if report["ok"] else STOP


def cmd_preflight(args):
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


def cmd_publish(args):
    code, payload = pipeline_mod.run(
        args.source,
        slug=args.slug,
        message=args.message,
        public=args.public,
        yes_public=args.yes_public,
        dry_run=args.dry_run,
        keep=args.keep,
        no_git=args.no_git,
        commit=args.commit,
        template_path_override=args.template,
        base_version=args.base_version,
    )
    emit(payload)
    return code


def cmd_read(args):
    from explaindeck.update import read_current
    import subprocess
    try:
        emit(read_current(pipeline_mod.cli_path(), args.slug, args.public))
        return OK
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        emit({"ok": False, "stage": "read", "error": str(error), "next": ["投稿先と閲覧権限を確認する"]})
        return STOP


def cmd_test_fixtures(args):
    from explaindeck import fixtures as fixtures_mod

    del args
    results = fixtures_mod.run_all()
    return fixtures_mod.report(results)


def build_parser():
    parser = argparse.ArgumentParser(description="スライド（deck）の検査と投稿。原本には書かない。")
    subs = parser.add_subparsers(dest="cmd")

    prepare = subs.add_parser("prepare", help="見本と共通部品を用意する（作業中の複製には触らない）")
    prepare.set_defaults(func=cmd_prepare)

    one = subs.add_parser("check", help="契約を確かめる（原本には書かない）")
    one.add_argument("source")
    one.add_argument("--template", help="実行部の雛形（既定はこのリポジトリの src/templates/deck.html）")
    one.add_argument("--commit", help="依頼のコミット。バイトが一致しないと赤")
    one.set_defaults(func=cmd_check)

    two = subs.add_parser("preflight", help="投稿コマンドとログインの控えだけ確かめる")
    two.set_defaults(func=cmd_preflight)

    three = subs.add_parser("publish", help="検査して札を付けた写しを投稿する")
    three.add_argument("source")
    three.add_argument("--slug")
    three.add_argument("--message")
    three.add_argument("--base-version", help="取り寄せて変更案と比較した現在の版。既存ページの更新に必須")
    three.add_argument("--public", action="store_true")
    three.add_argument("--yes-public", action="store_true")
    three.add_argument("--dry-run", action="store_true")
    three.add_argument("--keep", action="store_true", help="写しを片付けない（検査用）")
    three.add_argument("--no-git", action="store_true", help="git の出典を付けない（検査用）")
    three.add_argument("--commit", help="依頼のコミット。バイトが一致しないと赤")
    three.add_argument("--template")
    three.set_defaults(func=cmd_publish)

    read = subs.add_parser("read", help="現在の本文と版をJSONで取り寄せる（更新前に比較する）")
    read.add_argument("--slug", required=True)
    read.add_argument("--public", action="store_true")
    read.set_defaults(func=cmd_read)

    four = subs.add_parser("test-fixtures", help="フィクスチャを全部走らせる")
    four.set_defaults(func=cmd_test_fixtures)

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
