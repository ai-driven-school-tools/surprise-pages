import {currentBrowserIdentity} from '@/lib/identity/identity';
import {jsonError,serverError} from '@/lib/api';
import {themeRefSchema} from '@/lib/deck/design/theme-model';
import {readTheme,themeLogoBytes,ThemeError} from '@/lib/deck/design/theme-store';
import { routeLog } from "@/lib/logging/server-log";
import {currentOrganization} from '@/lib/organization/scope';
import {localizedMessage} from '@/lib/i18n/errors';
import {rt,requestTranslate} from '@/lib/i18n/request';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string;version:string}>}) {
 return routeLog("/api/deck-themes/[id]/logo/[version]", _request, async () => {
   const organization=await currentOrganization();
   const viewer=await currentBrowserIdentity();if(!viewer)return jsonError(rt('decks.server.loginRequired'),401);
   const ref=themeRefSchema.safeParse(await params);if(!ref.success)return jsonError(rt('decks.server.logoNotFound'),404);
   try{
    const row=await readTheme(organization,viewer.email,ref.data),bytes=await themeLogoBytes(row);
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':row.snapshot.logo!.asset.contentType,'Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-Type-Options':'nosniff'}});
   }catch(error){if(error instanceof ThemeError)return jsonError(localizedMessage(error,requestTranslate()),error.status);return serverError(error);}
 });
}
