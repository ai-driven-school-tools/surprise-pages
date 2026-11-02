/** Authored library art direction; saved reader settings still take precedence. */
export function catalogAppearance(format, { dark = false, photographic = false } = {}) {
 const opening = format === 'title' || format === 'divider';
 return {
  background: dark ? '#14251e' : '#ffffff',
  accent: dark ? '#b5d9b8' : '#22634d', secondary: dark ? '#c8b988' : '#b6bf94',
  decoration: photographic ? 'none' : opening || dark ? 'glow' : 'gradient',
  intensity: photographic ? 0 : opening || dark ? 64 : 10,
  x: 90, y: 20, scale: 120, angle: 145, motion: false,
  typography: "modern", ornament: opening && !photographic ? "rule" : "none",
 };
}
