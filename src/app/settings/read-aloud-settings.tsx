"use client";
import { useEffect, useState } from "react";
import { Select } from "../_components/controls";
import { SECTION_HEADING } from "../_components/styles";
import { SettingRow } from "../_components/setting-row";
import { useT } from "../_components/i18n";
import {
  localVoices,
  parseRate,
  rateLabel,
  READ_ALOUD_RATE_KEY,
  READ_ALOUD_VOICE_KEY,
  SPEECH_RATES,
  type SpeechRate,
} from "@/lib/read-aloud/settings";

type VoiceChoice = { voiceURI: string; name: string; lang: string };

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    if (value.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // 保存できない設定のブラウザでも、画面そのものは動かす（読み上げは既定の声と等速で始まる）
  }
}

/**
 * 個人設定の「読み上げ」（声と速さ）。
 *
 * 読み上げは端末の中だけで完結する（声は端末の中で動くものだけ・src/lib/read-aloud/settings.ts）ので、
 * 設定もサーバーへ送らず、このブラウザにだけ控える。道具箱（src/widget/reading/read-aloud.ts）が同じ控えを読む。
 * 選べる声は端末ごとに違うので、一覧はこの画面を開いたブラウザから読む（サーバーでは描かない）。
 */
export function ReadAloudSettings() {
  const t = useT();
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<VoiceChoice[]>([]);
  const [voice, setVoice] = useState("");
  const [rate, setRate] = useState<SpeechRate>(1);

  useEffect(() => {
    const synth = typeof window.speechSynthesis === "undefined" ? null : window.speechSynthesis;
    // 控えはブラウザの中にしかないので、描いたあとに読む（サーバーの描画と食い違わせない）
    const read = (): void => {
      setRate(parseRate(readLocal(READ_ALOUD_RATE_KEY)));
      setVoice(readLocal(READ_ALOUD_VOICE_KEY) ?? "");
      if (synth === null) return;
      setSupported(true);
      setVoices(localVoices(synth.getVoices()).map(({ voiceURI, name, lang }) => ({ voiceURI, name, lang })));
    };
    const frame = window.requestAnimationFrame(read);
    // 声の一覧は遅れて届くブラウザがある
    synth?.addEventListener("voiceschanged", read);
    return () => {
      window.cancelAnimationFrame(frame);
      synth?.removeEventListener("voiceschanged", read);
    };
  }, []);

  if (!supported) return null;

  function chooseVoice(value: string) {
    setVoice(value);
    writeLocal(READ_ALOUD_VOICE_KEY, value);
  }

  function chooseRate(value: SpeechRate) {
    setRate(value);
    writeLocal(READ_ALOUD_RATE_KEY, String(value));
  }

  // 控えた声がこの端末に無くなっていたら「自動」として見せる（読み上げも自動で選ぶ）
  const shownVoice = voices.some((choice) => choice.voiceURI === voice) ? voice : "";
  return (
    <section className="mb-12" aria-labelledby="settings-read-aloud">
      <h2 id="settings-read-aloud" className={SECTION_HEADING}>{t("settings.readAloud.title")}</h2>
      <SettingRow
        title={t("settings.readAloud.voice.title")}
        detail={voices.length === 0 ? t("settings.readAloud.voice.none") : t("settings.readAloud.voice.detail")}
      >
        {voices.length > 0 ? (
          <Select aria-label={t("settings.readAloud.voice.label")} value={shownVoice} onChange={(event) => chooseVoice(event.target.value)}>
            <option value="">{t("settings.readAloud.voice.auto")}</option>
            {voices.map((choice) => (
              <option key={choice.voiceURI} value={choice.voiceURI}>
                {t("settings.readAloud.voice.option", { name: choice.name, lang: choice.lang })}
              </option>
            ))}
          </Select>
        ) : null}
      </SettingRow>
      <SettingRow title={t("settings.readAloud.rate.title")} detail={t("settings.readAloud.rate.detail")}>
        <div className="ws-segments" role="group" aria-label={t("settings.readAloud.rate.group")}>
          {SPEECH_RATES.map((value) => (
            <button
              key={value}
              type="button"
              className="ws-segment"
              aria-pressed={rate === value}
              onClick={() => chooseRate(value)}
            >
              {rateLabel(value)}
            </button>
          ))}
        </div>
      </SettingRow>
    </section>
  );
}
