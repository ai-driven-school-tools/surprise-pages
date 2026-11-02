import { CopyRow } from "../_components/copy-row";
import { LIST, SECTION_HEADING, SECTION_NOTE } from "../_components/styles";
import type { MessageKey } from "@/lib/i18n/messages/types";
import { serverTranslate } from "@/lib/i18n/server";

/**
 * デバイスを増やすときに打つコマンドを、そのまま貼れる形で見せる。
 *
 * 出すのは**コマンドだけ**。名乗り（投稿に使う値）はこの画面に一切出さない
 * ——値を等幅で見せると、人がそれを写して貼る手順が復活する。
 *
 * 置き場所を丸ごと書くのは、PATH に入っていない前提だから。フルパスで書けば
 * どのフォルダから打っても同じように動くので、「どこで実行するか」で迷わない。
 */

/** 投稿コマンドの呼び方。配布物のフォルダで打つ（README の第 3-10 章と同じ形）。 */
const CLI_PATH = "node bin/pages-publish.mjs";

const COMMANDS: readonly { where: MessageKey; command: string }[] = [
  { where: "auth.devices.add.fromComputer", command: `${CLI_PATH} login` },
  { where: "auth.devices.add.fromCloud", command: `${CLI_PATH} login --remote` },
  { where: "auth.devices.add.forCloudHere", command: `${CLI_PATH} login --remote --new` },
];

export async function AddDevice() {
  const t = await serverTranslate();
  return (
    <section className="mb-12">
      <h2 className={SECTION_HEADING}>{t("auth.devices.add.title")}</h2>
      <p className={SECTION_NOTE}>{t("auth.devices.add.note")}</p>
      <div className={LIST}>
        {COMMANDS.map((one) => (
          <CopyRow
            key={one.command}
            label={t(one.where)}
            value={one.command}
            name={t("auth.devices.add.commandName", { where: t(one.where) })}
          />
        ))}
      </div>
    </section>
  );
}
