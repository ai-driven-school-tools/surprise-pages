/** Generate client contracts and the installable bridge from the same server sources. */
import { build } from "esbuild";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
if (process.argv.includes("--quality-only")) {
 const at=process.argv.indexOf("--out");if(at<0||!process.argv[at+1])throw new Error("--out is required");
 const out=resolve(process.argv[at+1]);await mkdir(out,{recursive:true});
 const files=["deck-image-check.mjs","page-agent-render.mjs","pages-publish.mjs"];
 for(const file of files)await copyFile(join(root,"bin",file),join(out,file));
 const inspector=await build({entryPoints:[join(root,"src/lib/deck/render-inspection.ts")],bundle:true,write:false,format:"iife",globalName:"DeckLayoutQA",platform:"browser"});
 await writeFile(join(out,"page-agent-inspection.js"),inspector.outputFiles[0].text);files.push("page-agent-inspection.js");
 const pkg=JSON.parse(await readFile(join(root,"package.json"),"utf8"));
 await writeFile(join(out,"package.json"),JSON.stringify({name:"surprise-pages-image-quality",version:"1.0.0",private:true,type:"module",dependencies:Object.fromEntries(["playwright","parse5"].map(name=>[name,pkg.dependencies[name].replace(/^\^/,"")]))},null,2)+"\n");files.push("package.json");
 const hashes={};for(const file of files)hashes[file]=createHash("sha256").update(await readFile(join(out,file))).digest("hex");
 const sourceCommit=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
 await writeFile(join(out,"manifest.json"),JSON.stringify({format:1,policy:2,sourceCommit,files:hashes},null,2)+"\n");
 process.exit(0);
}

await build({
  entryPoints:[join(root,"src/lib/page-agent/exports.ts")],
  outfile: join(root, "bin/page-agent-schema.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["zod","parse5"],
});
const outIndex = process.argv.indexOf("--out");
if (outIndex >= 0) {
  const out = resolve(process.argv[outIndex + 1]);
  await mkdir(out, { recursive: true });
  for (const name of [
    "pages-agent.mjs",
    "page-agent-schema.mjs",
    "page-agent-media.mjs",
    "page-agent-render.mjs",
    "deck-image-check.mjs",
    "pages-publish.mjs",
    "install-pages-agent.mjs",
  ])
    await copyFile(join(root, "bin", name), join(out, name));
  const inspector = await build({
    entryPoints: [join(root, "src/lib/deck/render-inspection.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "DeckLayoutQA",
    platform: "browser",
  });
  await writeFile(
    join(out, "page-agent-inspection.js"),
    inspector.outputFiles[0].text,
  );
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  await writeFile(
    join(out, "package.json"),
    JSON.stringify(
      {
        name: "surprise-pages-agent-runtime",
        version: "1.0.0",
        private: true,
        type: "module",
        dependencies: Object.fromEntries(
          ["@modelcontextprotocol/sdk", "playwright", "zod", "parse5"].map((name) => [
            name,
            pkg.dependencies[name].replace(/^\^/, ""),
          ]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
}
