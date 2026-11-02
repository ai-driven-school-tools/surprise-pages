"use client";
import { startTransition, useEffect, useOptimistic, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../_components/icons";
import { IconButton, Modal } from "../_components/controls";
import { FIELD, PAGE, SECTION_HEADING } from "../_components/styles";
import { PageHeader } from "../_components/page-header";
import { SettingRow } from "../_components/setting-row";
import { applyAppearance } from "../_components/appearance";
import type { WorkspaceAppearance } from "@/lib/workspace/settings";
import { betaFeatureDetail, betaFeatureTitle, hasBetaFeature, type BetaFeatureId } from "@/lib/settings/beta-features";
import { fetchMyThemes, mutateTheme } from "@/widget/deck/edit/theme-client";
import type { MyTheme } from "@/lib/deck/design/theme-model";
import type { SiteUsage } from "@/lib/workspace/usage";
import { formatMediaBytes } from "@/lib/deck/media/media";
import { LOCALES, LOCALE_NAMES, type LocaleSetting } from "@/lib/i18n/locales";
import { useT } from "../_components/i18n";
/** 個人設定の保存の口（`/api/workspace`）へ送る 1 件。 */
type SettingChange =
  | { action: "appearance"; value: WorkspaceAppearance }
  | { action: "locale"; value: LocaleSetting }
  | { action: "beta"; feature: BetaFeatureId; enabled: boolean };
export function SettingsScreen({
  name,
  email,
  appearance,
  locale,
  beta,
  offered,
  usage,
  retentionDays,
  myRecords,
  children,
}: {
  name: string;
  email: string;
  appearance: WorkspaceAppearance;
  /** 個人設定の言語（`auto` はブラウザの言語） */
  locale: LocaleSetting;
  /** 本人が入れているベータ機能（既定は空） */
  beta: readonly BetaFeatureId[];
  /** 並べてよいベータ機能（台帳の順・組織で使えない機能は抜いてある。サーバーが決めて渡す） */
  offered: readonly BetaFeatureId[];
  /** 設置した本人にだけ届く（社内版と招待相手は null） */
  usage: SiteUsage | null;
  /** 見たページの記録が何日で消えるか */
  retentionDays: number;
  /** 「自分に関わる記録」の節（サーバーが本人の行だけを組んで渡す。配布版は無い） */
  myRecords?: ReactNode;
  children: ReactNode;
}) {
  const themeTrigger = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();
  const t = useT();
  const [notice, setNotice] = useState(""),
    [themeOpen, setThemeOpen] = useState(false);
  /*
   * 押した設定は、サーバーの返事を待たずにその場で映す（DESIGN.md 12 章「動き」）。
   *
   * 映しているのは「押した値」で、正本はサーバーから届く props のまま。保存できたら画面を取り直し
   * （router.refresh）、届いた props が押した値と同じになるので、見た目は 1 度も戻らない。
   * 保存に失敗したら押した値は props に戻り、下の 1 行で告げる。
   * 待っている間に部品を無効にしない——薄くなった部品が「重い」の正体だった。続けて押せば最後の値が勝つ。
   */
  const [shownAppearance, showAppearance] = useOptimistic(appearance);
  const [shownLocale, showLocale] = useOptimistic(locale);
  const [shownBeta, showBeta] = useOptimistic(
    beta,
    (current: readonly BetaFeatureId[], change: { feature: BetaFeatureId; enabled: boolean }) =>
      change.enabled
        ? hasBetaFeature(current, change.feature)
          ? current
          : [...current, change.feature]
        : current.filter((id) => id !== change.feature),
  );
  /** 映してから送る。送る前に `show` で押した値を出し、保存できたら画面を取り直す。 */
  function save(change: SettingChange, show: () => void) {
    setNotice("");
    startTransition(async () => {
      show();
      try {
        const response = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change),
        });
        if (!response.ok) throw new Error();
        // 外枠が言語と外観を決めるので、画面ごと描き直す（届いた値は押した値と同じ）
        router.refresh();
      } catch {
        setNotice(t("common.saveFailedRetry"));
        if (change.action === "appearance") applyAppearance(appearance);
      }
    });
  }
  function setAppearance(value: WorkspaceAppearance) {
    if (value === shownAppearance) return;
    save({ action: "appearance", value }, () => {
      showAppearance(value);
      // 色は <html> で決まるので、外枠の描き直しを待たずにその場で当てる
      applyAppearance(value);
    });
  }
  function setLocale(value: LocaleSetting) {
    if (value === shownLocale) return;
    save({ action: "locale", value }, () => showLocale(value));
  }
  function setBeta(feature: BetaFeatureId, enabled: boolean) {
    if (enabled === hasBetaFeature(shownBeta, feature)) return;
    save({ action: "beta", feature, enabled }, () => showBeta({ feature, enabled }));
  }
  /*
   * 行は節（h2）で組む。アカウント（名乗り・端末・記録）→ 画面（外観・言語）→ スライド（マイテーマ）→
   * 保存の使用量（配布版の本人だけ）→ ベータ機能。節の間は mb-12、行の間と行の中の余白は .ws-setting が持つ。
   * 行に線も絵も置かない（src/app/_components/setting-row.tsx）。
   */
  return (
    <main className={PAGE}>
      <PageHeader title={t("settings.title")} />
      <section className="mb-12" aria-labelledby="settings-account">
        <h2 id="settings-account" className={SECTION_HEADING}>{t("settings.account")}</h2>
        {/* 1 行目は名乗り（人の名前）、2 行目はアドレス。どこでログインしたかは右端に 1 語 */}
        <SettingRow title={name} detail={email}>
          <span className="ws-muted">Google</span>
        </SettingRow>
        <SettingRow title={t("settings.devices.title")} detail={t("settings.devices.detail")}>
          <a href="/devices" className="ws-button">
            {t("common.manage")}
            <Icon name="next" small />
          </a>
        </SettingRow>
        <SettingRow title={t("settings.views.title")} detail={t("settings.views.detail", { count: retentionDays })}>
          {children}
        </SettingRow>
      </section>
      <section className="mb-12" aria-labelledby="settings-screen">
        <h2 id="settings-screen" className={SECTION_HEADING}>{t("settings.screen")}</h2>
        <SettingRow title={t("settings.appearance.title")}>
          <div className="ws-choice-group" role="group" aria-label={t("settings.appearance.group")}>
            {(["system", "light", "dark"] satisfies WorkspaceAppearance[]).map((value) => (
              <IconButton
                key={value}
                icon={value}
                label={t(`settings.appearance.${value}`)}
                aria-pressed={shownAppearance === value}
                onClick={() => setAppearance(value)}
              />
            ))}
          </div>
        </SettingRow>
        {/* 言語の名前はその言語自身で書く（LOCALE_NAMES・訳さない） */}
        <SettingRow title={t("settings.language.title")} detail={t("settings.language.detail")}>
          <div className="ws-segments" role="group" aria-label={t("settings.language.group")}>
            {(["auto", ...LOCALES] satisfies LocaleSetting[]).map((value) => (
              <button
                key={value}
                type="button"
                className="ws-segment"
                aria-pressed={shownLocale === value}
                onClick={() => setLocale(value)}
              >
                {value === "auto" ? t("settings.language.auto") : LOCALE_NAMES[value]}
              </button>
            ))}
          </div>
        </SettingRow>
      </section>
      <section className="mb-12" aria-labelledby="settings-decks">
        <h2 id="settings-decks" className={SECTION_HEADING}>{t("settings.decks")}</h2>
        <SettingRow title={t("settings.themes.title")} detail={t("settings.themes.detail")}>
          <button ref={themeTrigger} className="ws-button" onClick={() => setThemeOpen(true)}>
            {t("common.manage")}
            <Icon name="next" small />
          </button>
        </SettingRow>
      </section>
      {usage ? <UsageSection usage={usage} /> : null}
      {myRecords ?? null}
      {/* 多くの人が使わない機能は、本人が入れるまでどの画面にも出さない。入れる場所はここ 1 つ。
          行は台帳（src/lib/settings/beta-features.ts）から出す——機能を足しても、この画面は書き足さない。
          組織で使えない機能（鍵の無い自然な声）はサーバーが抜いて渡す（offered） */}
      {offered.length > 0 ? <section aria-labelledby="settings-beta">
        <h2 id="settings-beta" className={SECTION_HEADING}>{t("settings.beta.title")}</h2>
        {offered.map((feature) => (
          <SettingRow key={feature} title={betaFeatureTitle(feature, t)} detail={betaFeatureDetail(feature, t)}>
            <div className="ws-segments" role="group" aria-label={t("settings.beta.group", { feature: betaFeatureTitle(feature, t) })}>
              {[false, true].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  className="ws-segment"
                  aria-pressed={hasBetaFeature(shownBeta, feature) === value}
                  onClick={() => setBeta(feature, value)}
                >
                  {value ? t("common.on") : t("common.off")}
                </button>
              ))}
            </div>
          </SettingRow>
        ))}
      </section> : null}
      <p role="status" className="ws-status">
        {notice}
      </p>
      <Modal
        returnFocus={themeTrigger}
        open={themeOpen}
        onOpenChange={setThemeOpen}
        title={t("settings.themes.title")}
      >
        <ThemeSettings />
      </Modal>
    </main>
  );
}
/**
 * 無料枠を使い切って止まる前に気づくための数。請求の数字ではなく、自分の保存先を数えた値。
 * 量を帯や色で表さない（DESIGN.md）。数と、上限の確かめ方を字で書く。
 */
function UsageSection({ usage }: { usage: SiteUsage }) {
  const t = useT();
  return (
    <section className="mb-12" aria-labelledby="settings-usage">
      <h2 id="settings-usage" className={SECTION_HEADING}>{t("settings.usage.title")}</h2>
      <SettingRow
        title={t("settings.usage.database")}
        detail={t("settings.usage.databaseDetail")}
      >
        <span className="ws-muted">
          {t("settings.usage.databaseValue", {
            size: formatMediaBytes(usage.databaseBytes),
            pages: usage.pages,
            revisions: usage.revisions,
          })}
        </span>
      </SettingRow>
      <SettingRow
        title={t("settings.usage.assets")}
        detail={t("settings.usage.assetsDetail")}
      >
        <span className="ws-muted">
          {usage.assets === null
            ? t("settings.usage.uncounted")
            : t(usage.assets.partial ? "settings.usage.assetsValueAtLeast" : "settings.usage.assetsValue", {
                size: formatMediaBytes(usage.assets.bytes),
                files: usage.assets.files,
              })}
        </span>
      </SettingRow>
    </section>
  );
}
function ThemeSettings() {
  const t = useT();
  const [themes, setThemes] = useState<MyTheme[] | null>(null),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState<MyTheme | null>(null),
    [name, setName] = useState(""),
    [deleting, setDeleting] = useState(false),
    [busy, setBusy] = useState(false);
  function reload() {
    setNotice("");
    void fetchMyThemes()
      .then(setThemes)
      .catch(() => setNotice(t("settings.themes.loadFailed")));
  }
  useEffect(() => {
    let active = true;
    void fetchMyThemes()
      .then((rows) => {
        if (active) setThemes(rows);
      })
      .catch(() => {
        if (active) setNotice(t("settings.themes.loadFailed"));
      });
    return () => {
      active = false;
    };
  }, [t]);
  async function save() {
    if (!selected) return;
    setBusy(true);
    setNotice("");
    try {
      const common = {
        requestId: crypto.randomUUID(),
        theme: { id: selected.id, version: selected.version },
      };
      await mutateTheme(
        deleting
          ? { ...common, action: "delete" }
          : { ...common, action: "rename", name },
      );
      setSelected(null);
      setDeleting(false);
      reload();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : t("common.saveFailed"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p role="status" className="ws-status">
        {notice}
      </p>
      {themes === null ? (
        notice ? (
          <button className="ws-button" onClick={reload}>
            {t("common.retry")}
          </button>
        ) : (
          <p className="ws-muted" role="status">
            {t("common.loading")}
          </p>
        )
      ) : themes.length === 0 ? (
        <p className="ws-muted">
          {t("settings.themes.empty")}
        </p>
      ) : (
        <ul>
          {themes.map((theme) => (
            <li key={theme.id} className="ws-setting">
              <span>{theme.name}</span>
              <button
                className="ws-button"
                onClick={() => {
                  setSelected(theme);
                  setName(theme.name);
                  setDeleting(false);
                }}
              >
                {t("common.edit")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected ? (
        <div className="pt-6">
          <label className="grid gap-1.5 text-sm">
            {t("settings.themes.name")}
            <input
              aria-label={t("settings.themes.name")}
              className={FIELD}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy || deleting}
            />
          </label>
          {deleting ? (
            <p className="mt-3 text-sm">
              {t("settings.themes.deleteNote")}
            </p>
          ) : null}
          <div className="ws-dialog-actions">
            <button
              className={`ws-button ${deleting ? "ws-danger" : "ws-primary"}`}
              disabled={busy || !name.trim()}
              onClick={() => void save()}
            >
              {busy ? t("common.saving") : deleting ? t("settings.themes.delete") : t("settings.themes.saveName")}
            </button>
            {!deleting ? (
              <IconButton
                icon="delete"
                label={t("settings.themes.deleteTheme")}
                disabled={busy}
                onClick={() => setDeleting(true)}
              />
            ) : null}
            <button
              className="ws-button"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
