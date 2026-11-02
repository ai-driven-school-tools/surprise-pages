import { MediaFailure, type MediaFailureCode } from "../../../lib/deck/media/failure";
import { t } from "../../shared/i18n";
export type MediaRecovery = "choose" | "retry" | "target" | "original" | "save" | "login" | "none";
export type MediaIssue = { title: string; detail: string; action: MediaRecovery; label: string; secondary?: { action: MediaRecovery; label: string } };
export function mediaFailureCode(error: unknown): MediaFailureCode {
  return error instanceof MediaFailure ? error.code : error instanceof TypeError ? "connection" : "unknown";
}
/** State determines the useful next action. Permanent failures never offer a blind retry. */
export function mediaIssue(code: MediaFailureCode, detail: string): MediaIssue {
  switch (code) {
    case "format": return { title: t("deckEditor.mediaFeedback.formatTitle"), detail: t("deckEditor.mediaFeedback.formatDetail"), action: "choose", label: t("deckEditor.mediaFeedback.chooseAgain") };
    case "invalid-file": return { title: t("deckEditor.mediaFeedback.invalidTitle"), detail: "", action: "choose", label: t("deckEditor.mediaFeedback.chooseAgain") };
    case "empty": return { title: t("deckEditor.mediaFeedback.emptyTitle"), detail: t("deckEditor.mediaFeedback.emptyDetail"), action: "choose", label: t("deckEditor.mediaFeedback.chooseAgain") };
    case "size": return { title: t("deckEditor.mediaFeedback.sizeTitle"), detail, action: "choose", label: t("deckEditor.mediaFeedback.chooseSmaller") };
    case "remote": return {title:t("deckEditor.mediaFeedback.remoteTitle"),detail:t("deckEditor.mediaFeedback.remoteDetail"),action:"choose",label:t("deckEditor.mediaFeedback.addFromFile")};
    case "connection": return { title: t("deckEditor.mediaFeedback.connectionTitle"), detail: t("deckEditor.mediaFeedback.connectionDetail"), action: "retry", label: t("deckEditor.mediaFeedback.sendAgain") };
    case "auth": return { title: t("deckEditor.mediaFeedback.authTitle"), detail: t("deckEditor.mediaFeedback.authDetail"), action: "login", label: t("deckEditor.mediaFeedback.checkLogin"), secondary:{action:"retry",label:t("deckEditor.mediaFeedback.retry")} };
    case "permission": return { title: t("deckEditor.mediaFeedback.permissionTitle"), detail: t("deckEditor.mediaFeedback.permissionDetail"), action: "none", label: "" };
    case "target": return { title: t("deckEditor.mediaFeedback.targetTitle"), detail: t("deckEditor.mediaFeedback.targetDetail"), action: "target", label: t("deckEditor.mediaFeedback.addToCurrent") };
    case "save": return { title: t("deckEditor.mediaFeedback.saveTitle"), detail: t("deckEditor.mediaFeedback.saveDetail"), action: "save", label: t("deckEditor.mediaFeedback.checkSave"), secondary: { action: "retry", label: t("deckEditor.mediaFeedback.retry") } };
    default: return { title: t("deckEditor.mediaFeedback.unknownTitle"), detail: t("deckEditor.mediaFeedback.unknownDetail"), action: "retry", label: t("deckEditor.mediaFeedback.tryAgain") };
  }
}
