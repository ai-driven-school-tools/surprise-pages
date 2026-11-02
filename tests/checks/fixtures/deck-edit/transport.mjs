// Only the transport and authenticated identity are replaced. SQL, permission
// predicates, source edits, revision writes, and route handlers stay real.
const ident = value => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Invalid SQL identifier ${value}`);
  return `"${value}"`;
};
// 検査の会社は example.test（下の ALLOWED_DOMAIN と同じ）。所属で「会社の人」を決めるようになったので、
// 移行が入れた最初の組織（最初の組織）に example.test を自動参加のドメインとして足す。本番の example.com と同じ扱いで、
// 検査の人は初めての照合で member の所属が作られる（管理者にするのは各検査が所属の役割を上げる）。
const FIRST_ORGANIZATION='00000000-0000-4000-8000-000000000001';
// 組織に属する表（src/lib/organization/tenant-tables.json）。組織で絞った口（orgDb）は本物と同じく、この表に組織の条件と印を付ける
import tenantTables from '../../../../src/lib/organization/tenant-tables.json' with {type:'json'};
const ORGANIZATION_TABLES=new Set(Object.keys(tenantTables.organization));
// 組織の印の列がまだ無い保存先（組織の移行より前を再現する検査）では絞らない。表ごとに 1 度だけ確かめる
const scopedColumns=new WeakMap();
async function hasOrganizationColumn(pg,table){
  if(!scopedColumns.has(pg))scopedColumns.set(pg,new Map());
  const known=scopedColumns.get(pg);
  if(!known.has(table))known.set(table,pg.query("select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name='organization_id'",[table]).then(result=>result.rows.length>0));
  return known.get(table);
}
const companies=new WeakMap();
function company(pg){
  if(!companies.has(pg))companies.set(pg,pg.query(`insert into organization_domains (organization_id,domain,auto_join)
    select id,'example.test',true from organizations where id=$1 on conflict do nothing`,[FIRST_ORGANIZATION]).catch(()=>undefined));
  return companies.get(pg);
}
/** 名乗りの差し替え。手形の人を、本物と同じ保存先の関数（org_member_identity）で要求の組織の人か所属なしに分ける。 */
async function placed(viewer){
  // 役割は手形（ここでは検査が渡した人）から採らず、本物と同じく毎回名簿から引く
  if(!viewer||viewer.kind!=='member')return viewer??null;
  await company(globalThis.__deckPg);
  const {rows}=await globalThis.__deckPg.query('select public.org_member_identity($1,$2) as r',[FIRST_ORGANIZATION,viewer.email.trim().toLowerCase()]);
  const role=rows[0]?.r?.role??null;
  return role===null?{...viewer,kind:'outsider',organization:{id:FIRST_ORGANIZATION,assetPrefix:''}}:{...viewer,organization:{id:FIRST_ORGANIZATION,assetPrefix:'',role}};
}
export function getDb() {
  return {async rpc(name,args){
    await company(globalThis.__deckPg);
    globalThis.__deckQueries?.push({table:name,action:'rpc',columns:'*'});
    const entries=Object.entries(args);try{const result=await globalThis.__deckPg.query(`select * from ${ident(name)}(${entries.map(([key],i)=>`${ident(key)} => $${i+1}`).join(',')})`,entries.map(([,value])=>value));return {data:JSON.parse(JSON.stringify(result.rows)),error:null};}catch(error){return {data:null,error:{code:error.code,message:error.message}};}
  },from(table,organization=null) {
    let action='select', body, columns='*', single=false, limit, order, conflict;
    const filters=[];
    const query={
      select(value='*'){columns=value;return query;},
      eq(key,value){filters.push([key,'=',value]);return query;},
      is(key,value){filters.push([key,'is',value]);return query;},
      not(key,operator,value){if(operator!=='is'||value!==null)throw new Error('未対応の比較です');filters.push([key,'is not',value]);return query;},
      gt(key,value){filters.push([key,'>',value]);return query;},
      lt(key,value){filters.push([key,'<',value]);return query;},
      like(key,value){filters.push([key,'like',value]);return query;},
      ilike(key,value){filters.push([key,'ilike',value]);return query;},
      in(key,value){filters.push([key,'in',value]);return query;},
      order(key,{ascending=true}={}){order=[key,ascending];return query;},
      limit(n){limit=n;return query;},
      insert(value){action='insert';body=value;return query;},
      upsert(value,options){action='insert';body=value;conflict=options.onConflict;return query;},
      update(value){action='update';body=value;return query;},
      delete(){action='delete';return query;},
      maybeSingle(){single=true;return execute();},single(){single=true;return execute();},
      then(resolve,reject){return execute().then(resolve,reject);},
    };
    async function execute(){
      // 組織で絞った口: 本物（src/lib/db/database.ts の orgDb）と同じく、組織に属する表は組織の条件を付け、足す行には印を入れる
      if(organization!==null&&ORGANIZATION_TABLES.has(table)&&await hasOrganizationColumn(globalThis.__deckPg,table)){
        if(action==='insert')body=Array.isArray(body)?body.map(row=>({organization_id:organization,...row})):{organization_id:organization,...body};
        else filters.push(['organization_id','=',organization]);
      }
      // 所属の名簿を読む・書くときだけ、検査の会社を先に足しておく（ほかの表の問い合わせの回数は変えない）
      if(table==='organization_members'||table==='organization_domains')await company(globalThis.__deckPg);
      globalThis.__deckQueries?.push({table,action,columns});
      const values=[];
      const bind=value=>{values.push(value);return `$${values.length}`;};
      const returning=columns==='*'?'*':columns.split(',').map(s=>ident(s.trim())).join(',');
      let sql;
      if(action==='insert'){
        const entries=Object.entries(body);
        sql=`insert into ${ident(table)} (${entries.map(([k])=>ident(k)).join(',')}) values (${entries.map(([,v])=>bind(v)).join(',')})`;
      if(conflict)sql+=` on conflict (${conflict.split(',').map(ident).join(',')}) do update set ${entries.map(([key])=>`${ident(key)}=excluded.${ident(key)}`).join(',')}`;
      }else if(action==='update'){
        sql=`update ${ident(table)} set ${Object.entries(body).map(([k,v])=>`${ident(k)}=${bind(v)}`).join(',')}`;
      }else if(action==='delete')sql=`delete from ${ident(table)}`;
      else sql=`select ${returning} from ${ident(table)}`;
      if(filters.length)sql+=' where '+filters.map(([k,op,v])=>op==='is'?`${ident(k)} is null`:op==='is not'?`${ident(k)} is not null`:op==='in'?`${ident(k)} = any(${bind(v)})`:`${ident(k)} ${op} ${bind(v)}`).join(' and ');
      if(action==='select'){
        if(order)sql+=` order by ${ident(order[0])} ${order[1]?'asc':'desc'}`;
        if(limit)sql+=` limit ${Number(limit)}`;
      }else sql+=` returning ${returning}`;
      try{
        const result=await globalThis.__deckPg.query(sql,values);
        const rows=JSON.parse(JSON.stringify(result.rows));
        return {data:single?(rows[0]??null):rows,error:null};
      }catch(error){return {data:null,error:{code:error.code,message:error.message}};}
    }
    return query;
  }};
}
/**
 * 組織で絞った口（src/lib/db/database.ts の orgDb）。同じ保存先へつなぎ、組織を取る関数（org_…）にだけ組織の目印を足す。
 * 組織に属する表には本物と同じく組織の条件と印を付ける。絞りの字面そのものは check-tenant-scope.mjs が本物の口で見る。
 */
export function orgDb(organization){
  const db=getDb();
  return {from:table=>db.from(table,organization.id),rpc:(name,args)=>db.rpc(name,name.startsWith('org_')?{p_organization_id:organization.id,...args}:args)};
}
export const currentIdentity=async()=>placed(globalThis.__deckIdentity.getStore()??null);
export const currentBrowserIdentity=async()=>{const viewer=await placed(globalThis.__deckIdentity.getStore()??null);return viewer?.kind==='member'?viewer:null;};
export const isOutsider=value=>value?.kind==='outsider';
/** 記録の人をいまの所属で名乗りにする（本物と同じく名簿を読むだけ・所属を作らない）。 */
export async function stillMembers(organization,people){
  await company(globalThis.__deckPg);
  const found=new Map();
  for(const person of people){
    const email=person.email.trim().toLowerCase();
    const {rows}=await globalThis.__deckPg.query("select role from public.organization_members where organization_id=$1 and email=$2 and status='active'",[organization.id,email]);
    if(rows[0])found.set(email,{kind:'member',email:person.email,name:person.name??null,image:null,desktop:false,organization:{id:organization.id,assetPrefix:organization.assetPrefix,role:rows[0].role}});
  }
  return found;
}
export const stillMember=async(organization,person)=>(await stillMembers(organization,[person])).get(person.email.trim().toLowerCase())??null;
/** 所属を引く前の手形の人（素材の通行証の確かめだけが使う）。 */
export const currentSessionPerson=async()=>{const viewer=globalThis.__deckIdentity?.getStore();return viewer?.kind==='member'?{email:viewer.email,name:viewer.name??null,image:null,desktop:false}:null;};
export const isMember=value=>value?.kind==='member';
export const isMemberOf=(value,organization)=>value?.kind==='member'&&value.organization?.id===organization?.id;
export const ownsRow=(viewer,email,guestId)=>viewer?.kind==='member'?viewer.email===email:viewer?.kind==='guest'?viewer.guestId===guestId:false;
export const ALLOWED_DOMAIN='example.test';
export const warmPageHtml=async()=>{};
export const dropPageDelivery=async()=>{};export const expirePageAssets=async()=>{};
export class BlobNotFoundError extends Error {}
export async function put(path,body,options){
  if(globalThis.__deckAssets.has(path)&&options.allowOverwrite===false)throw new Error('Already exists');
  let bytes;
  if(body instanceof ReadableStream){const reader=body.getReader(),parts=[];while(true){const next=await reader.read();if(next.done)break;parts.push(next.value);}bytes=Buffer.concat(parts);}
  else bytes=Buffer.from(body);
  if(globalThis.__deckAssets.has(path)&&options.allowOverwrite===false)throw new Error('Already exists');
  globalThis.__deckAssets.set(path,{bytes,options,uploadedAt:new Date()});return {pathname:path};
}
export const head=async(path)=>{const value=globalThis.__deckAssets.get(path);if(!value)throw new BlobNotFoundError();return {size:value.bytes.length,contentType:value.options.contentType,etag:'"test-'+value.bytes.length+'"',uploadedAt:value.uploadedAt??new Date()};};
export const get=async(path)=>{const value=globalThis.__deckAssets.get(path);if(!value)return null;return {statusCode:200,stream:new ReadableStream({start(c){for(let at=0;at<value.bytes.length;at+=65536)c.enqueue(value.bytes.subarray(at,at+65536));c.close();}}),headers:new Headers({'content-length':String(value.bytes.length)}),blob:await head(path)};};
export const list=async({prefix='',cursor,limit=1000}={})=>{const all=[...globalThis.__deckAssets.entries()].filter(([path])=>path.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b)),at=Number(cursor??0),page=all.slice(at,at+limit);return {blobs:page.map(([pathname,v])=>({pathname,size:v.bytes.length,uploadedAt:v.uploadedAt??new Date()})),hasMore:at+limit<all.length,cursor:String(at+limit)};};
export const del=async(paths)=>{for(const path of Array.isArray(paths)?paths:[paths])globalThis.__deckAssets.delete(path);};

export async function createMultipartUploader(path,options){
 const parts=[];return {uploadId:'test',key:path,async uploadPart(partNumber,body){const bytes=Buffer.from(body);globalThis.__deckMultipartSizes?.push(bytes.length);if(bytes.length>8*1024*1024)throw new Error('Part exceeds bounded memory');parts[partNumber-1]=bytes;return {etag:'part-'+partNumber,partNumber};},async complete(manifest){if(manifest.length!==parts.length)throw new Error('Missing part');return put(path,Buffer.concat(parts),{...options,multipart:true});}};
}
