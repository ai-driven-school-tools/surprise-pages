import ts from 'typescript';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

/** Registration is explicit and reviewed. A new button/listener must not be
 * silently covered by an old operation just because it saves the same kind. */
export async function interactionSurfaces() {
 const files=(await readdir('src/widget',{recursive:true})).filter(name=>/\.tsx?$/.test(name)&&(/(^|\/)deck[-/]/.test(name)||name==='editor/opening.ts')).sort();
 const rows=[];
 for(const file of files){
  const start=rows.length;
  const source=ts.createSourceFile(file,await readFile('src/widget/'+file,'utf8'),ts.ScriptTarget.Latest,true);const seen=new Map();
  function visit(node){
   let interactive=false;
   if(ts.isCallExpression(node)){
    const name=ts.isIdentifier(node.expression)?node.expression.text:ts.isPropertyAccessExpression(node.expression)?node.expression.name.text:'';
    interactive=name==='button'||(['addEventListener','listen'].includes(name)&&Boolean(node.arguments[0]));
   }else if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(node.left))interactive=/^on[a-z]+$/.test(node.left.name.text);
   if(interactive){
    const code=node.getText(source),hash=createHash('sha256').update(code.replace(/\s+/g,' ')).digest('hex').slice(0,20),occurrence=(seen.get(hash)??0)+1;seen.set(hash,occurrence);
    let owner=node.parent;while(owner&&!ts.isFunctionDeclaration(owner)&&!ts.isMethodDeclaration(owner))owner=owner.parent;
    const control=ts.isCallExpression(node)?`${node.expression.getText(source)}(${node.arguments[0]?.getText(source)??''})`:node.left.getText(source);
    rows.push({id:`${file}:${hash}:${occurrence}`,owner:owner?.name?.getText(source)??'module',control:control.slice(0,120)});
   }
   ts.forEachChild(node,visit);
  }
  visit(source);
  if(rows.length>start)rows.push({id:`${file}:module:${createHash('sha256').update(source.text).digest('hex').slice(0,20)}`,owner:'module',control:'module definitions, including data-driven actions'});
 }
 return rows;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv.includes('--write'))throw Error('Use --write only after reviewing the operation coverage for changed controls.');
 const file='tests/support/deck-surfaces.json';let previous=[];
 try{previous=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const existing=new Map(previous.map(row=>[row.id,row]));
 const rows=(await interactionSurfaces()).map(row=>({...row,covers:existing.get(row.id)?.covers??[]}));
 await writeFile(file,JSON.stringify(rows,null,2)+'\n');
 console.log(`${rows.length} controls; ${rows.filter(row=>!row.covers.length).length} need explicit coverage assignments`);
}
