
/** Explicit allowlist: never inherit production credentials into a test child. */
export function testEnvironment(extra = {}) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'USER', 'TMPDIR', 'LANG', 'LC_ALL', 'SystemRoot', 'CI']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return {...env, NEXT_TELEMETRY_DISABLED:'1', ...extra};
}

/**
 * 手元で起こすアプリに渡す環境。本番と同じ組み立て（NODE_ENV=production）で、ログインは本物の
 * Auth.js のまま（LOCAL_LOGIN_REQUIRED=1 で手元の仮の人も切る）。Google の鍵は形だけの値で、
 * 署名の鍵（secret）は呼ぶ側が毎回作る使い捨て。保存先や画像の置き場は extra で渡す。
 */
export function appEnvironment({origin, secret, extra = {}}) {
  return testEnvironment({PAGES_EDITION:'personal', AUTH_SECRET:secret, AUTH_URL:origin, AUTH_TRUST_HOST:'true',
    AUTH_GOOGLE_ID:'test-only', AUTH_GOOGLE_SECRET:'test-only', LOCAL_LOGIN_REQUIRED:'1', NODE_ENV:'production', ...extra});
}

/**
 * 外のサービスへ届く鍵の名前。手元の確認で子プロセスへ渡してはいけないもの。
 * src/lib/settings/environment.json の Slack・原本の取り込み・画像検索・画像の置き場・移行用の鍵と、
 * 従量課金の AI（Anthropic / OpenAI / AI Gateway / Cursor）と GitHub の鍵、Vercel のプロジェクトに宛先を足す鍵。
 * 検査表（check-local-verify）が src/lib/settings/environment.json と突き合わせる。
 */
export const EXTERNAL_SECRETS = [
  'BLOB_READ_WRITE_TOKEN', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'DATABASE_ADMIN_URL', 'STAGING_DATABASE_ADMIN_URL', 'DATABASE_CA_CERT',
  'SLACK_BOT_TOKEN', 'SLACK_USER_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_TEAM_ID', 'SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET',
  'SERPER_API_KEY', 'CURSOR_API_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'CRON_SECRET',
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'VERCEL_TOKEN', 'VERCEL_API_TOKEN',
  'PAGES_TOKEN', 'PAGES_REALTIME_URL', 'PAGES_REALTIME_PUBLISHABLE_KEY', 'PAGES_REALTIME_SIGNING_JWK',
];

/**
 * 子プロセスへ渡す直前に通す。外の鍵が 1 つでも入っていたり、保存先が本番や手元以外を
 * 指していたりしたら止める（値は文言に出さない）。
 */
export function assertIsolated(env) {
  const leaked = EXTERNAL_SECRETS.filter(name => typeof env[name] === 'string' && env[name].length > 0);
  if (leaked.length) throw new Error(`外のサービスの鍵が渡されようとしています（${leaked.join('・')}）`);
  if (env.DATABASE_URL !== undefined && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(env.DATABASE_URL).hostname)) throw new Error('保存先が手元ではありません');
  return env;
}

export function localTestUrl(value) {
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('検査は手元専用の宛先だけに接続できます');
  return url;
}
