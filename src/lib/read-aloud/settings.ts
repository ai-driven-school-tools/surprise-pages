/**
 * 読み上げ（端末の声）の個人設定の正本。**選べる値と控えの名前はここだけに書く。**
 *
 * 読み上げは本人の端末の中だけで完結する（声はブラウザに備わる Web Speech API のうち、端末の中で動く声だけ）。
 * なので設定もサーバーへ送らず、このブラウザ（localStorage）にだけ控える。個人設定の画面（src/app/settings）と
 * 道具箱（src/widget/reading/read-aloud.ts）は同じサイトの上で動くので、同じ控えを読み書きする。
 *
 * このファイルはブラウザにも配るので、保存先や鍵に触るものを置かない。
 */

/** 速さの控え。道具箱の「1×」で変えた速さも、個人設定で選んだ速さも、ここに残る。 */
export const READ_ALOUD_RATE_KEY = "surprise-pages:read-aloud-rate";
/** 声の控え。中身は声の識別子（SpeechSynthesisVoice の voiceURI）。空なら自動で選ぶ。 */
export const READ_ALOUD_VOICE_KEY = "surprise-pages:read-aloud-voice";

/** 読み上げの速さ。選べるのはこの段だけ（道具箱のボタンも設定画面も同じ段）。 */
export const SPEECH_RATES = [1, 1.25, 1.5, 2] as const;
export type SpeechRate = (typeof SPEECH_RATES)[number];

/** 段にある速さだけを通す（控えの文字・送られた値のどれでも）。無ければ null。 */
export function speechRateOf(value: unknown): SpeechRate | null {
  const number = typeof value === "string" && value.trim().length > 0 ? Number(value) : value;
  return SPEECH_RATES.find((rate) => rate === number) ?? null;
}

/** 控えた速さを読む。段に無ければ等速。 */
export function parseRate(stored: string | null): SpeechRate {
  return speechRateOf(stored) ?? 1;
}

/** 速さを 1 段送る。最後の段の次は等速に戻る。 */
export function nextRate(rate: number): SpeechRate {
  const index = SPEECH_RATES.findIndex((step) => step === rate);
  return SPEECH_RATES[(index + 1) % SPEECH_RATES.length] ?? 1;
}

/** 速さの言い方（1× など）。数と記号だけなので訳さない。 */
export function rateLabel(rate: number): string {
  return `${rate}×`;
}

/** 声の選び方に使う、声の性質だけ（SpeechSynthesisVoice と同じ名前）。 */
export interface VoiceLike {
  lang: string;
  localService: boolean;
  default: boolean;
  voiceURI: string;
  name: string;
}

/**
 * Apple の声の品質の段。識別子（`com.apple.voice.<段>.ja-JP.Kyoko` など）から読む。
 * Eloquence（`com.apple.eloquence.…`）は機械的な声で、最小（super-compact）よりも下に置く。
 * Apple 以外の識別子（Chrome の「Kyoko」など）は標準と同じ段。
 */
function voiceQuality(voice: VoiceLike): number {
  const uri = voice.voiceURI.toLowerCase();
  if (uri.includes(".eloquence.")) return 0;
  if (uri.includes(".super-compact.")) return 1;
  if (uri.includes(".premium.")) return 4;
  if (uri.includes(".enhanced.") || uri.includes(".siri")) return 3;
  return 2;
}

/** 言語の名前の頭（ja-JP → ja）。 */
export function languageOf(lang: string): string {
  return lang.toLowerCase().replace("_", "-").split("-")[0] ?? "";
}

/**
 * 選んでよい声の一覧。**端末の中で動く声だけ**（localService）。
 *
 * ブラウザによっては、声が外のサービスへ文章を送って音にする。招待した人だけのページの本文を、読み上げのために
 * 外へ出さない。並びは言語ごとにまとめ、同じ言語の中は品質の高い順。
 */
export function localVoices<T extends VoiceLike>(voices: readonly T[]): T[] {
  return voices
    .filter((voice) => voice.localService)
    .map((voice, index) => ({ voice, index }))
    .sort((a, b) => {
      const lang = a.voice.lang.localeCompare(b.voice.lang);
      if (lang !== 0) return lang;
      const quality = voiceQuality(b.voice) - voiceQuality(a.voice);
      return quality !== 0 ? quality : a.index - b.index;
    })
    .map(({ voice }) => voice);
}

/**
 * 使う声を選ぶ。端末の中で動く声だけを使い、無ければ null（読み上げない）。
 *
 * 本人が個人設定で選んだ声（`preferred`）が、端末の中の声として今もあり、ページの言語と同じなら、それを使う。
 * 言語が違う声だと、別の言語の読み方で本文を読んでしまうので使わない。
 * それ以外は「品質の段 → 既定の印 → 一覧の順」で選ぶ。Safari（iPad・iPhone・Mac）は全部の声を
 * 既定と名乗るので、既定の印だけで選ぶと一覧の先頭の機械的な声を拾ってしまう。
 */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], lang: string, preferred: string | null = null): T | null {
  const base = languageOf(lang);
  const local = voices.filter((voice) => voice.localService && languageOf(voice.lang) === base);
  if (preferred !== null && preferred.length > 0) {
    const chosen = local.find((voice) => voice.voiceURI === preferred);
    if (chosen !== undefined) return chosen;
  }
  let best: T | null = null;
  for (const voice of local) {
    if (best === null) { best = voice; continue; }
    const gap = voiceQuality(voice) - voiceQuality(best);
    if (gap > 0 || (gap === 0 && voice.default && !best.default)) best = voice;
  }
  return best;
}
