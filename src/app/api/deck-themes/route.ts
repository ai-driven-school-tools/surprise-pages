import {currentBrowserIdentity} from '@/lib/identity/identity';
import {jsonError,jsonResponse,serverError} from '@/lib/api';
import {sameOriginRequest} from '@/lib/access/request-security';
import {themeMutationSchema,themeRefSchema} from '@/lib/deck/design/theme-model';
import {themeOperations} from '@/lib/deck/design/theme-source';
import {listMyThemes,themeReceipt,themeFingerprint,captureTheme,saveThemeRow,readTheme,publicTheme,pinTheme,copyThemeToPage,themeSource,ThemeError} from '@/lib/deck/design/theme-store';
import { routeLog } from "@/lib/logging/server-log";
import {currentOrganization} from '@/lib/organization/scope';
import {localizedMessage} from '@/lib/i18n/errors';
import {rt,requestTranslate} from '@/lib/i18n/request';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 return routeLog("/api/deck-themes", request, async () => {
   const organization=await currentOrganization();
   const viewer=await currentBrowserIdentity();if(!viewer)return jsonError(rt('decks.server.loginRequired'),401);
   try{const query=new URL(request.url).searchParams;if(query.has('id')){const ref=themeRefSchema.safeParse(Object.fromEntries(query));if(!ref.success)return jsonError(rt('decks.server.checkRequest'),400);return jsonResponse({themes:[publicTheme(await readTheme(organization,viewer.email,ref.data))]},200);}return jsonResponse({themes:await listMyThemes(organization,viewer.email)},200);}catch(error){if(error instanceof ThemeError)return jsonResponse({error:localizedMessage(error,requestTranslate()),code:error.code},error.status);return serverError(error);}
 });
}
export async function POST(request:Request) {
 return routeLog("/api/deck-themes", request, async () => {
   const organization=await currentOrganization();
   const viewer=await currentBrowserIdentity();if(!viewer)return jsonError(rt('decks.server.loginRequired'),401);
   if(!sameOriginRequest(request)||request.headers.get('sec-fetch-site')==='cross-site')return jsonError(rt('decks.server.sameScreen'),403);
   try{
    const raw=await request.text();if(raw.length>4096)return jsonError(rt('decks.server.requestTooLarge'),413);
    const parsed=themeMutationSchema.safeParse(JSON.parse(raw));if(!parsed.success)return jsonError(rt('decks.server.checkRequest'),400);
    const input=parsed.data,fingerprint=themeFingerprint(input);
    if(input.action==='apply'){
     const source=await themeSource(organization,viewer,input.page,input.baseVersionId);
     const row=await pinTheme(viewer.email,input.requestId,fingerprint,input.theme);
     const snapshot=await copyThemeToPage(organization,row,input.page,input.requestId);
     return jsonResponse({operations:themeOperations(source,snapshot,{id:row.theme_id,version:row.version,name:row.name})},200);
    }
    const receipt=await themeReceipt(organization,viewer.email,input.requestId,fingerprint);
    if(receipt)return jsonResponse({theme:publicTheme(receipt),deleted:receipt.deleted},200);
    if(input.action==='save'){
     const {snapshot,logoKey}=await captureTheme(organization,viewer,input.page,input.baseVersionId,input.requestId);
     const row=await saveThemeRow(viewer.email,input.requestId,fingerprint,input.replace?.id??input.requestId,input.replace?.version??null,input.name,snapshot,logoKey);
     return jsonResponse({theme:publicTheme(row)},201);
    }
    const old=await readTheme(organization,viewer.email,input.theme);
    const row=await saveThemeRow(viewer.email,input.requestId,fingerprint,old.theme_id,old.version,input.action==='rename'?input.name:old.name,old.snapshot,old.logo_key,input.action==='delete');
    return jsonResponse({theme:publicTheme(row),deleted:row.deleted},200);
   }catch(error){if(error instanceof ThemeError)return jsonResponse({error:localizedMessage(error,requestTranslate()),code:error.code},error.status);if(error instanceof SyntaxError)return jsonError(rt('decks.server.checkRequest'),400);return serverError(error);}
 });
}
