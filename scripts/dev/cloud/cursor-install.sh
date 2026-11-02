#!/usr/bin/env bash
# Cursor のクラウド作業場（Cloud Agents）を作るときに 1 回走る（.cursor/environment.json の install）。
#
# ここでやるのは「秘密が要らない・何度走らせても同じ結果になる」下ごしらえだけ。
# 鍵が要ること（投稿先へのログイン）は start 側に置く。作業場の作り置きは
# 共有されうるので、ここに本人の鍵を焼き込んではいけない。
#
#   1. Node.js 24 系（違えば入れる。25 以降には pnpm を用意する corepack が付いていない）
#   2. pnpm（corepack から。版は package.json の packageManager が決める）
#   3. pnpm install（検査表・組み立てを走らせるため）
#
# これは雛形で、Cursor のクラウドでの動作確認はまだしていない（README 第 4-4 章）。
set -uo pipefail
log() { printf '[cursor-install] %s\n' "$*"; }
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
fi
if [ "${NODE_MAJOR:-0}" -ne 24 ]; then
  log "Node.js 24 系を入れます（いまは $(node --version 2>/dev/null || echo 'なし')）"
  curl -fsSL --connect-timeout 10 https://deb.nodesource.com/setup_24.x | $SUDO bash - \
    && $SUDO apt-get install -y -qq nodejs \
    || log "Node.js を入れられませんでした。投稿は動きますが、検査表は走りません"
fi
if ! command -v pnpm >/dev/null 2>&1; then
  log "pnpm を有効にします"
  $SUDO corepack enable || corepack enable || log "corepack を有効にできませんでした"
fi
if command -v pnpm >/dev/null 2>&1; then
  log "部品を入れます"
  pnpm install --frozen-lockfile || log "部品の入れ直しは失敗しました（投稿そのものは部品を使いません）"
fi
log "下ごしらえを終えました"
