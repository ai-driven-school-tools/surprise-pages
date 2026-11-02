/** Small browser-safe validation shared with the authored schema. */
export function isYouTubeId(value:unknown):value is string{return typeof value==="string"&&/^[\w-]{11}$/.test(value);}
