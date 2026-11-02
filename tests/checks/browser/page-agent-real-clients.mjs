/** Opt-in live client acceptance on an isolated local server; never production pages. */
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const origin = process.env.PAGE_AGENT_QA_ORIGIN;
if (!origin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
  throw new Error("PAGE_AGENT_QA_ORIGIN must be an isolated loopback harness");
const root = process.cwd(),
  work = await mkdtemp(join(tmpdir(), "pages-client-qa-"));
const skill = resolve(
  "../surprise-plugins/plugins/surprise-pages/skills/read-page",
);
for (const location of [".agents/skills", ".claude/skills"]) {
  await mkdir(join(work, location), { recursive: true });
  await symlink(skill, join(work, location, "read-page"));
}
const env = {
  ...process.env,
  PAGES_HOST: origin,
  PAGES_TOKEN_ORIGIN: origin,
  PAGES_TOKEN: "local-harness-test-only",
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
};
const mcp = {
  command: process.execPath,
  args: [join(root, "bin/pages-agent.mjs")],
  env: {
    PAGES_HOST: origin,
    PAGES_TOKEN_ORIGIN: origin,
    PAGES_TOKEN: "local-harness-test-only",
  },
};
await writeFile(
  join(work, "mcp.json"),
  JSON.stringify({
    mcpServers: { "surprise-pages": { type: "stdio", ...mcp } },
  }),
);
const prompts = {
  codex: `${origin}/internal/example/design\nこのPagesの表紙の見出しを「共同編集を、もっと簡単に。」へ変更してください。`,
  claude: `${origin}/internal/example/design\nこのPagesの表紙を、文章の内容は維持してもっと読みやすく整えてください。`,
};
const definitions = {
  codex: [
    "exec",
    "--ignore-user-config",
    "--ephemeral",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--json",
    "-C",
    work,
    "-c",
    'mcp_servers.surprise-pages.default_tools_approval_mode="approve"',
    "-c",
    `mcp_servers.surprise-pages.command=${JSON.stringify(mcp.command)}`,
    "-c",
    `mcp_servers.surprise-pages.args=${JSON.stringify(mcp.args)}`,
    "-c",
    `mcp_servers.surprise-pages.env={ PAGES_HOST = "${origin}", PAGES_TOKEN_ORIGIN = "${origin}", PAGES_TOKEN = "local-harness-test-only" }`,
    prompts.codex,
  ],
  claude: [
    "-p",
    "--setting-sources",
    "project",
    "--plugin-dir",
    resolve("../surprise-plugins/plugins/surprise-pages"),
    "--no-session-persistence",
    "--strict-mcp-config",
    "--mcp-config",
    join(work, "mcp.json"),
    "--settings",
    '{"disableAllHooks":true}',
    "--allowedTools",
    "mcp__surprise-pages__*",
    "Read",
    "--output-format",
    "stream-json",
    "--verbose",
    "--max-turns",
    "32",
    prompts.claude,
  ],
};
const names = process.env.PAGE_AGENT_CLIENT
  ? [process.env.PAGE_AGENT_CLIENT]
  : ["codex", "claude"];
for (const name of names) {
  const start = Date.now();
  let stdout = "",
    stderr = "";
  const code = await new Promise((resolve, reject) => {
    const child = spawn(name, definitions[name], {
      cwd: work,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => child.kill("SIGTERM"), 360000);
    child.stdout.on("data", (data) => {
      stdout += data;
      appendFileSync(join(work, `${name}.live.log`), data, { mode: 0o600 });
    });
    child.stderr.on("data", (data) => (stderr += data));
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  await writeFile(join(work, `${name}.log`), stdout + "\n" + stderr, {
    mode: 0o600,
  });
  const called=[];
  for(const line of stdout.split("\n")){
    let event;try{event=JSON.parse(line);}catch{continue;}
    if(event.type==="item.completed"&&event.item?.type==="mcp_tool_call")called.push(event.item.tool);
    const content=event.message?.content;
    if(Array.isArray(content))for(const part of content)if(part.type==="tool_use"&&part.name?.startsWith("mcp__surprise-pages__"))called.push(part.name.split("__").at(-1));
  }
  const tools=[...new Set(called)];
  console.log(
    JSON.stringify({
      client: name,
      exitCode: code,
      elapsedMs: Date.now() - start,
      tools,
      evidence: join(work, `${name}.log`),
    }),
  );
}
console.log("Evidence directory: " + work);
