import {defineConfig} from 'playwright/test';

const origin = `http://127.0.0.1:${process.env.PAGES_TEST_PORT ?? 3129}`;

export default defineConfig({
  testDir:'./tests/e2e', fullyParallel:process.env.PAGES_TEST_SHARDS==='on', workers:1, retries:0, forbidOnly:true,
  timeout:60000, expect:{timeout:10000}, outputDir:'test-results',
  reporter:[['list'],['html',{open:'never'}],['junit',{outputFile:'test-results/results.xml'}]],
  // 画面の言語は日本語に固定する（既定の Accept-Language は en-US。言語の決め方は docs/guides/i18n.md）。英語の画面は専用の spec で見る
  use:{baseURL:origin,locale:'ja-JP',trace:'retain-on-failure',screenshot:'only-on-failure',video:'retain-on-failure'},
  projects:[
    {name:'chromium',use:{browserName:'chromium',...(process.env.PAGES_TEST_CHROME_CHANNEL ? {channel:process.env.PAGES_TEST_CHROME_CHANNEL} : {}),...(process.env.PAGES_TEST_CHROMIUM_EXECUTABLE ? {launchOptions:{executablePath:process.env.PAGES_TEST_CHROMIUM_EXECUTABLE}} : {})}},
    {name:'webkit',use:{browserName:'webkit',...(process.env.PAGES_TEST_WEBKIT_EXECUTABLE ? {launchOptions:{executablePath:process.env.PAGES_TEST_WEBKIT_EXECUTABLE}} : {})}},
    // 毎晩の Linux には音の出口が無く、そこでは Firefox の音声の器が再開を返さない。手元の Mac でも同じ条件で走らせ、
    // 「手元では通るのに毎晩だけ落ちる」を無くす（media.cubeb.force_null_context＝出力先の無い端末の再現）。
    {name:'firefox',use:{browserName:'firefox',launchOptions:{firefoxUserPrefs:{'media.cubeb.force_null_context':true}}}},
  ],
  webServer:{command:'node tests/support/serve-app.mjs',url:origin+'/signin',
    stdout:process.env.PAGES_TEST_SERVER_LOGS==='on'?'pipe':'ignore',
    timeout:240000,reuseExistingServer:false,gracefulShutdown:{signal:'SIGTERM',timeout:10000}},
});
