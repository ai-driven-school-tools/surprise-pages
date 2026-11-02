import { readFileSync } from "node:fs";
import { readDeckDesignHtml } from "../../src/lib/deck/design/html";
import { DECK_DESIGN_MARK } from "../../src/lib/deck/design/design";
import { readDeckCustomizationHtml } from "../../src/lib/deck/edit/customization-html";

try {
  const file = process.argv[2];
  if (!file) throw new Error("確認する原稿を指定してください");
  const html = readFileSync(file, "utf8");
  const source = readDeckDesignHtml(html);
  const customization = readDeckCustomizationHtml(html);
  const knownRuntime = /data-deck-design-runtime=["'](?:1|2|3)["']/.test(html);
  if (!source || !knownRuntime) {
    throw new Error("デザイン設定と共通部品を、新しいスライド作成の手引きに合わせてください");
  }
  if ((customization?.focus?.effective.invalidTargets.length ?? 0) > 0) {
    throw new Error("焦点の対象が見つかりません。安定した目印を確認してください");
  }
  if ((customization?.logo?.invalidSlideIds.length ?? 0) > 0) {
    throw new Error("ロゴのスライド指定が見つかりません。安定した目印を確認してください");
  }
  console.log(JSON.stringify({ ok: true, version: source.design.version, slides: source.ids.length, mark: DECK_DESIGN_MARK }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : "デザイン設定を確認できませんでした" }));
  process.exitCode = 1;
}
