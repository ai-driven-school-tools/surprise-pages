# -*- coding: utf-8 -*-
"""判定コード。手引きに一覧を書き写さない（写した瞬間に、どちらかが古くなる）。"""

ERROR = "error"

CODES = {
    "UNREADABLE": "原本が読めません",
    "NO_BODY_DECK": "body に data-deck がありません",
    "MAIN_NOT_DIRECT": "main[data-deck-slides] が body の直下にありません",
    "NO_SLIDES": "section[data-deck-slide] が 1 枚もありません",
    "NESTED_SLIDE": "枚（section）を入れ子にしています",
    "NOTES_NOT_LAST": "ノート（aside）が枚の最後の子ではありません",
    "NOTES_HAS_ELEMENT": "ノートに要素が入っています（文章だけにしてください）",
    "TEMPLATE_MISSING": "実行部（src/templates/deck.html）がありません",
    "TEMPLATE_MISMATCH": "実行部が src/templates/deck.html と違います。原本を直してコミットしてから",
    "HAS_BASE": "雛形または原本に <base の字面があります",
    "HAS_SOURCE_NOTE": "出典の札が既に付いています。札は機械が付けます",
    "FONT_TOO_SMALL": "枚の字が 20px 未満です",
    "USES_VIEWPORT_UNITS": "vw / vh を使っています（器の幅で組み替えない）",
    "USES_FIXED": "position: fixed または sticky を使っています",
    "RAW_COLOR": "生の色を書いています（--ads-* の名前だけ）",
    "EMOJI": "絵文字を使っています（印は Lucide の SVG）",
    "SCRIPT_IN_MAIN": "枚の中に script があります",
    "LUCIDE_TAG": "<i data-lucide> を使っています（inline SVG にしてください）",
    "COMMIT_MISMATCH": "原本が依頼のコミットと違います。触らずに報告して終わる",
}


def describe(code):
    return CODES.get(code, code)
