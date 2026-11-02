"use client";
import { useRef, useState } from "react";
import { Icon } from "../_components/icons";
import { Modal } from "../_components/controls";
import { PageHeader } from "../_components/page-header";
import { useT } from "../_components/i18n";
import { writeClipboardText } from "@/lib/workspace/clipboard";
export function CreateDocument() {
  const trigger = useRef<HTMLButtonElement | null>(null);
  const t = useT();
  const [kind, setKind] = useState<"document" | "page" | null>(null),
    [notice, setNotice] = useState("");
  // AI への依頼文は、そのまま AI に貼る原稿（スキルの名前と日本語の指示）なので訳さない
  const request =
    kind === "document"
      ? "clean-copy スキルを使って、添付する原稿の文章・数字・順序を変えずに清書し、Pages に社内限定で新規投稿してください。完成したページのリンクを教えてください。" // i18n-keep: AI に貼る依頼文（原稿として渡す文）
      : "explain-page スキルを使って、これから伝える内容を分かりやすい図解・レポートにまとめ、Pages に社内限定で新規投稿してください。完成したページのリンクを教えてください。"; // i18n-keep: AI に貼る依頼文（原稿として渡す文）
  async function copy() {
    if (await writeClipboardText(request)) {
      setNotice(t("workspace.create.copied"));
    } else {
      setNotice(t("workspace.create.copyManually"));
    }
  }
  // リンクの位置は言語で変わるので、辞書の {link} の所で割って置く
  const [deviceBefore = "", deviceAfter = ""] = t("workspace.create.deviceNote").split("{link}");
  return (
    <main>
      <PageHeader title={t("workspace.create.title")} />
      <div className="ws-create-grid">
        <a href="/decks/create" className="ws-create-option">
          <Icon name="deck" />
          <span className="font-medium">{t("workspace.create.deck")}</span>
          <span className="ws-muted">{t("workspace.create.deckDetail")}</span>
        </a>
        <button
          type="button"
          className="ws-create-option"
          onClick={(event) => {
            trigger.current = event.currentTarget;
            setKind("document");
            setNotice("");
          }}
        >
          <Icon name="document" />
          <span className="font-medium">{t("workspace.create.document")}</span>
          <span className="ws-muted">{t("workspace.create.documentDetail")}</span>
        </button>
        <button
          type="button"
          className="ws-create-option"
          onClick={(event) => {
            trigger.current = event.currentTarget;
            setKind("page");
            setNotice("");
          }}
        >
          <Icon name="page" />
          <span className="font-medium">{t("workspace.create.page")}</span>
          <span className="ws-muted">{t("workspace.create.pageDetail")}</span>
        </button>
      </div>
      <Modal
        returnFocus={trigger}
        open={kind !== null}
        onOpenChange={(open) => {
          if (!open) setKind(null);
        }}
        title={
          t(kind === "document" ? "workspace.create.documentDialog" : "workspace.create.pageDialog")
        }
        description={t("workspace.create.dialogDetail")}
      >
        <textarea
          className="ws-prompt"
          aria-label={t("workspace.create.request")}
          value={request}
          readOnly
          onFocus={(e) => e.target.select()}
        />
        <button className="ws-button ws-primary" onClick={() => void copy()}>
          <Icon name="copy" />
          {t("workspace.create.copyRequest")}
        </button>
        <p role="status" className="ws-status">
          {notice}
        </p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
          <li>{t("workspace.create.step1")}</li>
          <li>{t("workspace.create.step2")}</li>
          <li>{t("workspace.create.step3")}</li>
        </ol>
        <p className="ws-muted mt-4">
          {deviceBefore}
          <a href="/devices" className="ws-inline-link">{t("workspace.create.addDevice")}</a>
          {deviceAfter}
        </p>
      </Modal>
    </main>
  );
}
