import { createHash } from 'node:crypto';
import { z } from 'zod';
import { get, put, head, BlobNotFoundError } from '@vercel/blob';
import { getDb, orgDb } from '../../db/database';
import type { OrganizationScope } from '../../organization/scope';
import { readAsset, assetKey } from '../../pages/assets';
import { loadEditablePage } from '../../access/page-edit-access';
import { readHeadOf, pageRefOf } from '../../pages/store';
import type { Member } from '../../identity/identity';
import { themeSnapshotSchema, type ThemeSnapshot, type ThemeRef, type MyTheme } from './theme-model';
import { documentTheme } from './theme-source';
import { DECK_LOGO_ASSET_PREFIX } from '../media/logo';
import { LocalizedError } from '../../i18n/errors';
import type { MessageKey } from '../../i18n/messages/types';

const rowSchema=z.object({owner_email:z.string(),version:z.string().uuid(),theme_id:z.string().uuid(),name:z.string(),snapshot:themeSnapshotSchema,logo_key:z.string().nullable(),fingerprint:z.string(),deleted:z.boolean()});
export type ThemeRow=z.infer<typeof rowSchema>;
/** 画面に届くテーマの断り。文の代わりに辞書の鍵を持つ（`message` は日本語のまま・窓口が要求の言語で訳す）。 */
export class ThemeError extends LocalizedError {constructor(key:MessageKey,public status=409,public code='theme_conflict'){super(key);this.name='ThemeError';}}
export const themeFingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function databaseError(error:{message:string}) {
 if(error.message.includes('theme_unavailable')||error.message.includes('theme_expired'))throw new ThemeError('decks.errors.themeChanged',409,'theme_unavailable');
 if(error.message.includes('theme_'))throw new ThemeError('decks.errors.themeConflict');
 throw new LocalizedError('decks.errors.themeSaveFailed');
}
export async function themeReceipt(organization:OrganizationScope,owner:string,version:string,fingerprint:string):Promise<ThemeRow|null> {
 const result=await orgDb(organization).from('deck_theme_versions').select('*').eq('owner_email',owner.toLowerCase()).eq('version',version).maybeSingle();
 if(result.error)databaseError(result.error);if(!result.data)return null;
 const row=rowSchema.parse(result.data);if(row.fingerprint!==fingerprint)throw new ThemeError('decks.errors.requestChanged');return row;
}
export async function listMyThemes(organization:OrganizationScope,owner:string):Promise<MyTheme[]> {
 const db=orgDb(organization);
 const result=await db.from('deck_my_themes').select('id,head_version').eq('owner_email',owner.toLowerCase()).is('deleted_at',null).order('updated_at',{ascending:false});
 if(result.error)databaseError(result.error);
 const heads=z.array(z.object({id:z.string(),head_version:z.string()})).parse(result.data);
 if(!heads.length)return [];
 const versions=await db.from('deck_theme_versions').select('*').eq('owner_email',owner.toLowerCase()).in('version',heads.map(h=>h.head_version));
 if(versions.error)databaseError(versions.error);
 const rows=z.array(rowSchema).parse(versions.data);
 return heads.flatMap(h=>{const row=rows.find(r=>r.version===h.head_version);return row?[publicTheme(row)]:[];});
}
export function publicTheme(row:ThemeRow):MyTheme {
 const snapshot=structuredClone(row.snapshot);
 if(snapshot.logo)snapshot.logo.asset.path=`api/deck-themes/${row.theme_id}/logo/${row.version}`;
 return {id:row.theme_id,version:row.version,name:row.name,snapshot};
}
export async function readTheme(organization:OrganizationScope,owner:string,ref:ThemeRef):Promise<ThemeRow> {
 const result=await orgDb(organization).from('deck_theme_versions').select('*').eq('owner_email',owner.toLowerCase()).eq('theme_id',ref.id).eq('version',ref.version).maybeSingle();
 if(result.error)databaseError(result.error);if(!result.data)throw new ThemeError('decks.errors.themeMissing',404);
 const row=rowSchema.parse(result.data);if(row.deleted)throw new ThemeError('decks.errors.themeMissing',404);return row;
}
export async function pinTheme(owner:string,requestId:string,fingerprint:string,ref:ThemeRef):Promise<ThemeRow> {
 const result=await getDb().rpc('pin_deck_my_theme',{p_owner:owner.toLowerCase(),p_request:requestId,p_fingerprint:fingerprint,p_id:ref.id,p_version:ref.version});
 if(result.error)databaseError(result.error);return z.array(rowSchema).parse(result.data)[0];
}
export async function saveThemeRow(owner:string,requestId:string,fingerprint:string,id:string,expected:string|null,name:string,snapshot:ThemeSnapshot,logoKey:string|null,deleted=false) {
 const result=await getDb().rpc('save_deck_my_theme',{p_owner:owner.toLowerCase(),p_id:id,p_version:requestId,p_expected:expected,p_name:name,p_snapshot:snapshot,p_logo_key:logoKey,p_fingerprint:fingerprint,p_deleted:deleted});
 if(result.error)databaseError(result.error);return z.array(rowSchema).parse(result.data)[0];
}
export async function themeSource(organization:OrganizationScope,viewer:Member,pageSlug:string,baseVersionId:string) {
 const gate=await loadEditablePage(organization,viewer,pageSlug);if(!gate.ok)throw new ThemeError('decks.errors.pageMissing',404);
 const source=await readHeadOf(gate.page);if(!source)throw new ThemeError('decks.errors.pageMissing',404);
 if(source.revision.versionId!==baseVersionId)throw new ThemeError('decks.errors.pageUpdated');
 return source.html;
}
const extension=(contentType:string)=>({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg','image/avif':'avif'})[contentType]??'png';
const MAX_LOGO_BYTES=10*1024*1024;
export async function themeBytesOf(stream:ReadableStream<Uint8Array>) {
 const reader=stream.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>MAX_LOGO_BYTES)throw new ThemeError('decks.errors.logoTooLarge',400);chunks.push(next.value);}}
 finally{await reader.cancel();}
 if(!length)throw new ThemeError('decks.errors.logoUnreadable',400);return Buffer.concat(chunks);
}
export async function themeLogoBytes(row:ThemeRow) {
 if(!row.logo_key||!row.snapshot.logo)throw new ThemeError('decks.errors.logoMissing',404);
 const hit=await get(row.logo_key,{access:'private'});if(!hit||hit.statusCode!==200)throw new ThemeError('decks.errors.logoUnreadable',503);
 return themeBytesOf(hit.stream);
}
async function immutableLogo(key:string,bytes:Buffer,contentType:string) {
 const exists=async()=>{try{
  const metadata=await head(key);const stored=await get(key,{access:'private',useCache:false});
  if(!stored||stored.statusCode!==200)throw new ThemeError('decks.errors.logoUnconfirmed',503);
  const previous=await themeBytesOf(stored.stream);
  if(metadata.contentType!==contentType||!previous.equals(bytes))throw new ThemeError('decks.errors.logoMismatch');
  return true;
 }catch(error){if(error instanceof BlobNotFoundError)return false;throw error;}};
 if(await exists())return;
 try{await put(key,bytes,{access:'private',allowOverwrite:false,addRandomSuffix:false,multipart:false,contentType});}
 catch(error){if(!await exists())throw error;}
}
export async function captureTheme(organization:OrganizationScope,viewer:Member,pageSlug:string,baseVersionId:string,version:string) {
 const source=await themeSource(organization,viewer,pageSlug,baseVersionId),snapshot=documentTheme(source);
 if(!snapshot.logo)return {snapshot,logoKey:null};
 const ref=pageRefOf(pageSlug);if(!ref)throw new ThemeError('decks.errors.pageInvalid',400);
 const logo=snapshot.logo.asset,asset=await readAsset(organization,ref.slugPrefix,[...ref.slug,...logo.path.split('/')]);
 if(!asset||asset.size>MAX_LOGO_BYTES)throw new ThemeError('decks.errors.logoUnreadable',503);
 const bytes=await themeBytesOf(await asset.open(null,new AbortController().signal));
 // 自分のテーマのロゴも組織の置き場の頭の下に置く（assetKey が頭を付ける）
 const logoKey=assetKey(organization,'internal',['_deck-themes',themeFingerprint(viewer.email.toLowerCase()).slice(0,32),version,`logo.${extension(logo.contentType)}`]);
 await immutableLogo(logoKey,bytes,logo.contentType);return {snapshot,logoKey};
}
export async function copyThemeToPage(organization:OrganizationScope,row:ThemeRow,pageSlug:string,requestId:string):Promise<ThemeSnapshot> {
 return copyThemeSnapshotToPage(organization,row.snapshot, () => themeLogoBytes(row), pageSlug, requestId);
}
/** Both personal and company themes create immutable, document-owned logo assets. */
export async function copyThemeSnapshotToPage(organization:OrganizationScope,value:ThemeSnapshot,readLogo:()=>Promise<Buffer>,pageSlug:string,requestId:string):Promise<ThemeSnapshot> {
 const snapshot=structuredClone(value);if(!snapshot.logo)return snapshot;
 const ref=pageRefOf(pageSlug);if(!ref)throw new ThemeError('decks.errors.pageInvalid',400);
 const relative=`${DECK_LOGO_ASSET_PREFIX}${requestId}.${extension(snapshot.logo.asset.contentType)}`;
 await immutableLogo(assetKey(organization,ref.slugPrefix,[...ref.slug,...relative.split('/')]),await readLogo(),snapshot.logo.asset.contentType);
 snapshot.logo.asset.path=relative;return snapshot;
}
