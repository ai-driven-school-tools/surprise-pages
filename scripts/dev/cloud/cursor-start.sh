#!/usr/bin/env bash
# Cursor のクラウド作業場が立ち上がるたびに走る（.cursor/environment.json の start）。
#
# やることは 1 つだけ。投稿コマンド（bin/pages-publish.mjs）に「ここはクラウド」と
# 分からせる印をディスクに置く。環境変数では届かない——start で立てた変数は、
# エージェントがあとから開くシェルへ渡らない。
#
# 印があると、投稿コマンドはブラウザを開こうとせず、`login --remote` の案内
# （表示された URL を本人のブラウザで開く）に切り替わる。鍵そのものは置かない。
# 毎回聞かれたくなければ、README 第 4-4 章のとおり本人専用の Secrets に
# PAGES_HOST / PAGES_TOKEN / PAGES_TOKEN_ORIGIN を入れる（投稿コマンドが直接読む）。
#
# これは雛形で、Cursor のクラウドでの動作確認はまだしていない（README 第 4-4 章）。
set -uo pipefail
log() { printf '[cursor-start] %s\n' "$*"; }
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
# 控えの置き場は deployment.json の configDir が正本（投稿コマンドと同じ計算）
CONFIG_NAME="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).configDir' "$REPO/deployment.json" 2>/dev/null || echo surprise-pages-distribution)"
CONFIG_DIR="$HOME/.config/$CONFIG_NAME"
mkdir -p "$CONFIG_DIR" && chmod 700 "$CONFIG_DIR"
printf 'cursor-cloud\n' > "$CONFIG_DIR/cloud" && chmod 600 "$CONFIG_DIR/cloud"
log "クラウドの印を置きました（$CONFIG_DIR）"
