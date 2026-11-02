/** 画像の棚（この資料で使った画像）から選んだ画像を置く口。 */
export function imageRequest(page:string,value:string){
 return {endpoint:"/api/pages/deck-edit/image-library",body:{page,assetId:value}};
}
