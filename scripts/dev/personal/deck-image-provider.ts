export const hasWebImages=false;
export async function searchImages(...args:[string,string,AbortSignal]):Promise<{ticket:string;title:string;width:number;height:number;source:string;domain:string;sourcePageUrl:string;previewUrl:string}[]>{void args;return [];}
export function imageRequest(page:string,provider:"web"|"library",value:string){
 if(provider!=="library")throw new Error("この画像は取り込めません");
 return {endpoint:"/api/pages/deck-edit/image-library",body:{page,assetId:value}};
}
