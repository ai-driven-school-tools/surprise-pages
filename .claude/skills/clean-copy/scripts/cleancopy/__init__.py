# -*- coding: utf-8 -*-
"""清書の中身。入口は 1 つ上の `run.py`。

  codes.py     判定コードの正本（error / fixable / warn）
  source.py    原本の読み取り（囲みの退避・見出し・表・数え方）
  validate.py  検査（原本には書かない）
  fix.py       入れ物だけの直し（作業ファイルへ出す）
  convert.py   変換表の正本と、HTML の組み立て
  provenance.py 原本が git の中にあるときの出典（日付・コミット）
  verify.py    原本と出来上がったページの突き合わせ
  fixtures.py  小さな原本での作動確認
"""
