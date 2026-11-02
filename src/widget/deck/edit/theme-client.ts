import {z} from 'zod';
import {myThemesSchema,myThemeSchema,themeMutationSchema,type MyTheme} from '../../../lib/deck/design/theme-model';
import {t} from '../../shared/i18n';
export async function fetchMyThemes():Promise<MyTheme[]> {
 const response=await fetch('/api/deck-themes',{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw new Error(t('decks.themeDialog.themesLoadFailed'));
 return myThemesSchema.parse(await response.json()).themes;
}
export class ThemeRequestFailure extends Error {constructor(message:string,public status:number){super(message);}}
export async function mutateTheme(input:z.infer<typeof themeMutationSchema>):Promise<unknown> {
 const response=await fetch('/api/deck-themes',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(20000)});
 const data:unknown=await response.json();
 if(!response.ok){const error=z.object({error:z.string().optional(),message:z.string().optional()}).safeParse(data);throw new ThemeRequestFailure(error.success?error.data.error??error.data.message??t('decks.themeDialog.saveFailed'):t('decks.themeDialog.saveFailed'),response.status);}
 return data;
}
export const themeResultSchema=z.object({theme:myThemeSchema});

/** Save pending text before asking the server for version-bound theme operations. */
