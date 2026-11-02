/**
 * PostgreSQL がそのまま受け取れる SCRAM-SHA-256 の検証子を作る（RFC 5802 / 7677）。
 * Node の標準機能だけで動く（依存を入れずに走る CI の脚本 scripts/db-migrations/ からも使うため）。
 * 配布版の初期化（scripts/setup/database.mjs）・
 * 直接つなぐ役割を CI で作る段（scripts/db-migrations/runtime-connection.mjs）が共通で使う。
 * パスワードは base64url の文字だけなので、正規化（SASLprep）で変わる文字を含まない。
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

/** 検証子の形。DDL に混ぜる前に必ずこれで確かめる。 */
export const SCRAM_VERIFIER = /^SCRAM-SHA-256\$[0-9]+:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

export function scramVerifier(password, { salt = randomBytes(16), iterations = 4096 } = {}) {
  if (!/^[A-Za-z0-9_-]+$/.test(password)) throw new Error("パスワードに想定外の文字があります");
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}
