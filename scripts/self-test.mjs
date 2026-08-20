#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const gateSrc = join(here, "validate-module-file-map.mjs");
const node = process.execPath;
let failed = 0;

const pass = (msg) => console.log("PASS  " + msg);
const fail = (msg, extra = "") => {
  failed += 1;
  console.error("FAIL  " + msg + (extra ? "\n" + extra : ""));
};

const overview = (keys, extraHtml, filesByKey = {}) => `<!doctype html><html><body>
<script type="application/json" id="module-registry">[]</script>
${extraHtml}
<script>
const D = {
${keys.map((k) => {
  const files = (filesByKey[k] || []).map((p, i) =>
    `      { id: "f${i}", p: "${p}", r: "入口", io: "in → out" }`).join(",\n");
  return `  "${k}": { name: "${k}", files: [\n${files}\n    ] }`;
}).join(",\n")}
};
</script>
</body></html>`;

const makeRoot = () => {
  const dir = mkdtempSync(join(tmpdir(), "arch-map-"));
  mkdirSync(join(dir, "docs/product"), { recursive: true });
  mkdirSync(join(dir, "tooling/arch-module-graph"), { recursive: true });
  return dir;
};

const install = (dir, { zones, map, html }) => {
  const dest = join(dir, "tooling/arch-module-graph/validate-module-file-map.mjs");
  cpSync(gateSrc, dest);
  let text = readFileSync(dest, "utf8");
  text = text.replace(/const WATCH_ZONES = \[[\s\S]*?\];/, `const WATCH_ZONES = ${zones};`);
  text = text.replace(/const GENERATED_PREFIXES = [^;]+;/, `const GENERATED_PREFIXES = [];`);
  text = text.replace(/const GRAPH_DEPTH = "[^"]+";.*/, `const GRAPH_DEPTH = "entry";`);
  writeFileSync(dest, text);
  writeFileSync(join(dir, "tooling/arch-module-graph/module-file-map.json"), JSON.stringify(map, null, 2));
  writeFileSync(join(dir, "docs/product/architecture-overview.html"), html);
};

const run = (dir) => spawnSync(node, [join(dir, "tooling/arch-module-graph/validate-module-file-map.mjs"), dir], { encoding: "utf8" });
const okGrid = `<div class="flow n2"><div></div><div></div><div></div></div>`;

{
  const dir = makeRoot();
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src/main.ts"), "export const p = 1;\n");
  const dest = join(dir, "tooling/arch-module-graph/validate-module-file-map.mjs");
  cpSync(gateSrc, dest);
  writeFileSync(join(dir, "tooling/arch-module-graph/module-file-map.json"), JSON.stringify({
    modules: { "web-shell": { designId: null, include: ["src/"] } },
    unowned: [],
  }, null, 2));
  writeFileSync(join(dir, "docs/product/architecture-overview.html"), overview(["web-shell"], okGrid, { "web-shell": ["src/"] }));
  const r = run(dir);
  const text = (r.stderr || "") + (r.stdout || "");
  r.status !== 0 && /WATCH_ZONES 为空/.test(text)
    ? pass("未改 WATCH_ZONES 判失败")
    : fail("未改 WATCH_ZONES 应失败", text);
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "pkg"), { recursive: true });
  writeFileSync(join(dir, "pkg/__init__.py"), "");
  writeFileSync(join(dir, "pkg/book_store.py"), "def save():\n  pass\n");
  install(dir, {
    zones: `[{ dir: "pkg", exts: new Set([".py"]), style: "snake" }]`,
    map: { modules: { "book-store": { designId: null, include: ["pkg/"] } }, unowned: [] },
    html: overview(["book-store"], okGrid, { "book-store": ["pkg/"] }),
  });
  const r = run(dir);
  r.status === 0 ? pass("Python __init__.py 默认豁免") : fail("Python __init__.py 默认豁免", r.stderr + r.stdout);
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "src/components"), { recursive: true });
  writeFileSync(join(dir, "src/components/Button.tsx"), "export const Button = () => null;\n");
  writeFileSync(join(dir, "src/jwt-auth.guard.ts"), "export const g = 1;\n");
  install(dir, {
    zones: `[{ dir: "src", exts: new Set([".ts", ".tsx"]), style: "kebab" }]`,
    map: { modules: { "web-shell": { designId: null, include: ["src/"] } }, unowned: [] },
    html: overview(["web-shell"], okGrid, { "web-shell": ["src/"] }),
  });
  const r = run(dir);
  r.status === 0 ? pass("React PascalCase / jwt-auth.guard.ts 默认放行") : fail("React PascalCase / jwt-auth.guard.ts 默认放行", r.stderr + r.stdout);
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "src/app"), { recursive: true });
  mkdirSync(join(dir, "src/migrations"), { recursive: true });
  writeFileSync(join(dir, "src/app/page.ts"), "export const p = 1;\n");
  writeFileSync(join(dir, "src/migrations/init-schema.ts"), "export const m = 1;\n");
  install(dir, {
    zones: `[{ dir: "src", exts: new Set([".ts"]), style: "kebab" }]`,
    map: {
      modules: { "web-shell": { designId: null, include: ["src/app/"] } },
      unowned: [{ path: "src/migrations/", reason: "一次性迁移" }],
    },
    html: overview(["web-shell"], okGrid, { "web-shell": ["src/app/"] }),
  });
  const r = run(dir);
  r.status === 0 ? pass("unowned 目录前缀覆盖 migrations") : fail("unowned 目录前缀覆盖 migrations", r.stderr + r.stdout);
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src/main.ts"), "export const p = 1;\n");
  install(dir, {
    zones: `[{ dir: "src", exts: new Set([".ts"]), style: "kebab" }]`,
    map: { modules: { "web-shell": { designId: null, include: ["src/"] } }, unowned: [] },
    html: overview(["web-shell"], `<div class="flow n2"><div class="node"></div></div>`, { "web-shell": ["src/"] }),
  });
  const out = (run(dir).stderr || "") + (run(dir).stdout || "");
  const r = run(dir);
  const text = (r.stderr || "") + (r.stdout || "");
  r.status !== 0 && /flow\.n2/.test(text) ? pass("flow.n2 单子元素判失败") : fail("flow.n2 单子元素应失败", text || out);
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "src/alpha"), { recursive: true });
  mkdirSync(join(dir, "src/beta"), { recursive: true });
  writeFileSync(join(dir, "src/alpha/entry.ts"), `import { h } from "./helper";\nimport { b } from "../beta/core";\nexport const e = h + b;\n`);
  mkdirSync(join(dir, "bin"), { recursive: true });
  writeFileSync(join(dir, "bin/cli.ts"), `import { e } from "../src/alpha/entry";\nexport const run = e;\n`);
  writeFileSync(join(dir, "src/alpha/helper.ts"), "export const h = 1;\n");
  writeFileSync(join(dir, "src/beta/core.ts"), "export const b = 1;\n");
  writeFileSync(join(dir, "tooling/arch-module-graph/module-file-map.json"), JSON.stringify({
    modules: {
      alpha: { designId: null, include: ["src/alpha/"] },
      beta: { designId: null, include: ["src/beta/"] },
    },
    unowned: [],
  }, null, 2));
  writeFileSync(join(dir, "docs/product/architecture-overview.html"), overview(
    ["alpha", "beta"],
    okGrid,
    { alpha: ["src/alpha/entry.ts"], beta: ["src/beta/core.ts"] },
  ).replace("in → out", "人手写的入口"));
  const r = spawnSync(node, [join(here, "generate-module-graph.mjs"), dir, "--depth=all"], { encoding: "utf8" });
  const html = readFileSync(join(dir, "docs/product/architecture-overview.html"), "utf8");
  const m = html.match(/<script type="application\/json" id="generated-graph">([\s\S]*?)<\/script>/);
  let gen = {};
  try { gen = JSON.parse(m?.[1] || "{}"); } catch { /* empty */ }
  const entry = gen.modules?.alpha?.files?.find((f) => f.p === "src/alpha/entry.ts");
  const toHelper = entry?.to?.some((e) => e.p === "src/alpha/helper.ts");
  const toBeta = entry?.extTo?.some((e) => e.p === "src/beta/core.ts" && e.m === "beta");
  const keptHuman = html.includes("人手写的入口");
  r.status === 0 && toHelper && toBeta && keptHuman
    ? pass("generate：相对 import 写成 to/extTo，不改人话 io")
    : fail("generate：相对 import 写成 to/extTo，不改人话 io", (r.stderr || "") + (r.stdout || "") + "\n" + (m?.[1] || "no-json"));
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "web/static/article-tools"), { recursive: true });
  writeFileSync(join(dir, "web/workspace_service.py"), "def handle():\n  pass\n");
  writeFileSync(join(dir, "web/static/article-tools/x.html"), "<html></html>\n");
  install(dir, {
    zones: `[{ dir: "web", exts: new Set([".py"]), style: "snake" }]`,
    map: { modules: { web: { designId: null, include: ["web/"] } }, unowned: [] },
    html: overview(["web"], okGrid, { web: ["web/"] }),
  });
  const r = run(dir);
  r.status === 0
    ? pass("监视 .py 时不因静态连字符目录失败")
    : fail("监视 .py 时不因静态连字符目录失败", r.stderr + r.stdout);
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "src/alpha"), { recursive: true });
  mkdirSync(join(dir, "bin"), { recursive: true });
  writeFileSync(join(dir, "src/alpha/entry.ts"), "export const e = 1;\n");
  writeFileSync(join(dir, "bin/cli.ts"), `import { e } from "../src/alpha/entry";\nexport const run = e;\n`);
  writeFileSync(join(dir, "tooling/arch-module-graph/module-file-map.json"), JSON.stringify({
    modules: {
      alpha: { designId: null, include: ["src/alpha/"] },
      cli: { designId: null, include: ["bin/"] },
    },
    unowned: [],
  }, null, 2));
  writeFileSync(join(dir, "docs/product/architecture-overview.html"), overview(
    ["alpha", "cli"],
    okGrid,
    { alpha: ["src/alpha/entry.ts"], cli: ["bin/cli.ts"] },
  ));
  const r = spawnSync(node, [join(here, "generate-module-graph.mjs"), dir, "--depth=all"], { encoding: "utf8" });
  const html = readFileSync(join(dir, "docs/product/architecture-overview.html"), "utf8");
  const m = html.match(/<script type="application\/json" id="generated-graph">([\s\S]*?)<\/script>/);
  let gen = {};
  try { gen = JSON.parse(m?.[1] || "{}"); } catch { /* empty */ }
  const cli = gen.modules?.cli?.files?.find((f) => f.p === "bin/cli.ts");
  const extOk = cli?.extTo?.some((e) => e.p === "src/alpha/entry.ts" && e.m === "alpha");
  const noRaw = !JSON.stringify(gen).includes("bin/../");
  r.status === 0 && extOk && noRaw
    ? pass("generate：bin/../ 折成规范路径并记 extTo")
    : fail("generate：bin/../ 折成规范路径并记 extTo", (r.stderr || "") + (r.stdout || "") + "\n" + (m?.[1] || "no-json"));
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src/main.ts"), "export const p = 1;\n");
  writeFileSync(join(dir, "src/extra.ts"), "export const x = 1;\n");
  const dest = join(dir, "tooling/arch-module-graph/validate-module-file-map.mjs");
  cpSync(gateSrc, dest);
  let text = readFileSync(dest, "utf8");
  text = text.replace(/const WATCH_ZONES = \[[\s\S]*?\];/, `const WATCH_ZONES = [{ dir: "src", exts: new Set([".ts"]), style: "kebab" }];`);
  text = text.replace(/const GENERATED_PREFIXES = [^;]+;/, `const GENERATED_PREFIXES = [];`);
  text = text.replace(/const GRAPH_DEPTH = "[^"]+";.*/, `const GRAPH_DEPTH = "all";`);
  writeFileSync(dest, text);
  writeFileSync(join(dir, "tooling/arch-module-graph/module-file-map.json"), JSON.stringify({
    modules: { "web-shell": { designId: null, include: ["src/"] } },
    unowned: [],
  }, null, 2));
  const html = overview(["web-shell"], okGrid, { "web-shell": ["src/main.ts"] }).replace(
    "</body>",
    `<script type="application/json" id="generated-graph">{"modules":{"web-shell":{"files":[{"id":"extra","p":"src/extra.ts"}]}}}</script></body>`,
  );
  writeFileSync(join(dir, "docs/product/architecture-overview.html"), html);
  const r = run(dir);
  r.status === 0 ? pass("generated-graph 计入反向同步") : fail("generated-graph 计入反向同步", r.stderr + r.stdout);
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "src/alpha"), { recursive: true });
  mkdirSync(join(dir, "src/beta"), { recursive: true });
  writeFileSync(join(dir, "src/alpha/entry.py"), "from beta.core import b\n");
  writeFileSync(join(dir, "src/beta/core.py"), "def b():\n  return 1\n");
  writeFileSync(join(dir, "tooling/arch-module-graph/module-file-map.json"), JSON.stringify({
    modules: {
      alpha: { designId: null, include: ["src/alpha/"] },
      beta: { designId: null, include: ["src/beta/"] },
    },
    unowned: [],
  }, null, 2));
  writeFileSync(join(dir, "docs/product/architecture-overview.html"), overview(
    ["alpha", "beta"],
    okGrid,
    { alpha: ["src/alpha/entry.py"], beta: ["src/beta/core.py"] },
  ));
  const r = spawnSync(node, [join(here, "generate-module-graph.mjs"), dir, "--depth=all"], { encoding: "utf8" });
  const html = readFileSync(join(dir, "docs/product/architecture-overview.html"), "utf8");
  const m = html.match(/<script type="application\/json" id="generated-graph">([\s\S]*?)<\/script>/);
  let gen = {};
  try { gen = JSON.parse(m?.[1] || "{}"); } catch { /* empty */ }
  const entry = gen.modules?.alpha?.files?.find((f) => f.p === "src/alpha/entry.py");
  const ok = entry?.extTo?.some((e) => e.p === "src/beta/core.py" && e.m === "beta");
  r.status === 0 && ok
    ? pass("generate：Python 绝对导入写成 extTo")
    : fail("generate：Python 绝对导入写成 extTo", (r.stderr || "") + (r.stdout || "") + "\n" + (m?.[1] || "no-json"));
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "web/static/article-tools"), { recursive: true });
  writeFileSync(join(dir, "main.py"), "def run():\n  pass\n");
  writeFileSync(join(dir, "web/static/article-tools/x.html"), "<html></html>\n");
  install(dir, {
    zones: `[{ dir: ".", exts: new Set([".py"]), style: "snake", maxDepth: 0 }]`,
    map: { modules: { workspace: { designId: null, include: ["main.py"] } }, unowned: [] },
    html: overview(["workspace"], okGrid, { workspace: ["main.py"] }),
  });
  const r = run(dir);
  r.status === 0
    ? pass("WATCH_ZONES maxDepth=0 不递归连字符目录")
    : fail("WATCH_ZONES maxDepth=0 不递归连字符目录", r.stderr + r.stdout);
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "agents"), { recursive: true });
  mkdirSync(join(dir, "collectors"), { recursive: true });
  writeFileSync(join(dir, "agents/writer.py"), '"""把选题写成稿。"""\ndef write_draft():\n  return "ok"\n');
  writeFileSync(join(dir, "collectors/news.py"), "def collect_news():\n  return []\n");
  writeFileSync(join(dir, "main.py"), "from collectors.news import collect_news\n\ndef run():\n  return collect_news()\n");
  writeFileSync(join(dir, "README.md"), "# 咨询工作台\n\n采集消息再出稿。\n");
  const r = spawnSync(node, [join(here, "bootstrap-architecture-map.mjs"), dir], { encoding: "utf8" });
  const html = existsSync(join(dir, "docs/product/architecture-overview.html"))
    ? readFileSync(join(dir, "docs/product/architecture-overview.html"), "utf8")
    : "";
  const hasIo = html.includes("write_draft()") && html.includes("collect_news()");
  const hasMods = html.includes('"agents"') && html.includes('"collectors"') && html.includes('"workspace"');
  const hasJob = html.includes('data-view="job-workspace-to-collectors"') && html.includes("从启动到采消息");
  const hasLanes = html.includes(">入口<") && html.includes(">落点<");
  r.status === 0 && hasIo && hasMods && hasJob && hasLanes
    ? pass("bootstrap：发现目录、签名 io、import 分层与作业页签")
    : fail("bootstrap：发现目录、签名 io、import 分层与作业页签", (r.stderr || "") + (r.stdout || "") + (hasJob ? "" : "\nmissing job tab"));
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "web/src"), { recursive: true });
  writeFileSync(join(dir, "web/src/main.ts"), "export function boot() { return 1; }\n");
  writeFileSync(join(dir, "web/src/other.ts"), "export function helper() { return 2; }\n");
  const r = spawnSync(node, [join(here, "bootstrap-architecture-map.mjs"), dir], { encoding: "utf8" });
  const map = existsSync(join(dir, "tooling/arch-module-graph/module-file-map.json"))
    ? JSON.parse(readFileSync(join(dir, "tooling/arch-module-graph/module-file-map.json"), "utf8"))
    : { modules: {} };
  const keys = Object.keys(map.modules || {});
  r.status === 0 && keys.includes("web-src") && !keys.includes("web")
    ? pass("bootstrap：web/src 不与顶层 web 双 zone")
    : fail("bootstrap：web/src 不与顶层 web 双 zone", (r.stderr || "") + (r.stdout || "") + "\nkeys=" + keys.join(","));
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "my_pkg"), { recursive: true });
  writeFileSync(join(dir, "my_pkg/store.py"), "def save():\n  pass\n");
  const r = spawnSync(node, [join(here, "bootstrap-architecture-map.mjs"), dir], { encoding: "utf8" });
  const map = existsSync(join(dir, "tooling/arch-module-graph/module-file-map.json"))
    ? JSON.parse(readFileSync(join(dir, "tooling/arch-module-graph/module-file-map.json"), "utf8"))
    : { modules: {} };
  const html = existsSync(join(dir, "docs/product/architecture-overview.html"))
    ? readFileSync(join(dir, "docs/product/architecture-overview.html"), "utf8")
    : "";
  r.status === 0 && map.modules["my-pkg"] && /"my-pkg":\s*\{/.test(html)
    ? pass("bootstrap：下划线目录写成 kebab key")
    : fail("bootstrap：下划线目录写成 kebab key", (r.stderr || "") + (r.stdout || "") + "\nkeys=" + Object.keys(map.modules).join(","));
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  for (let i = 0; i < 9; i++) {
    mkdirSync(join(dir, `step${i}`), { recursive: true });
    const body = i === 8
      ? "def run():\n  return 1\n"
      : `from step${i + 1}.core import run\n\ndef run():\n  return run()\n`;
    writeFileSync(join(dir, `step${i}/core.py`), body);
  }
  const r = spawnSync(node, [join(here, "bootstrap-architecture-map.mjs"), dir], { encoding: "utf8" });
  const html = existsSync(join(dir, "docs/product/architecture-overview.html"))
    ? readFileSync(join(dir, "docs/product/architecture-overview.html"), "utf8")
    : "";
  const hasOverflow = /<div class="flow n8">/.test(html) && (html.match(/<div class="flow n8">([\s\S]*?)<\/div>/)?.[1].match(/<div /g) || []).length > 15;
  r.status === 0 && !hasOverflow
    ? pass("bootstrap：作业链超过 8 站不写溢出 n8")
    : fail("bootstrap：作业链超过 8 站不写溢出 n8", (r.stderr || "") + (r.stdout || ""));
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  writeFileSync(join(dir, "main.py"), "def run():\n  pass\n");
  writeFileSync(join(dir, "docs/product/architecture-overview.html"), "<html></html>\n");
  const r = spawnSync(node, [join(here, "bootstrap-architecture-map.mjs"), dir], { encoding: "utf8" });
  r.status === 2
    ? pass("bootstrap：仅有总图时拒绝无 --force 覆盖")
    : fail("bootstrap：仅有总图时拒绝无 --force 覆盖", `status=${r.status}\n` + (r.stderr || "") + (r.stdout || ""));
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "generation"), { recursive: true });
  writeFileSync(join(dir, "generation/content.py"), '"""选题写成稿。"""\ndef generate():\n  x = f"""\nreturn prompt\n"""\n  return x\n');
  writeFileSync(join(dir, "README.md"), "# 工作台\n");
  const r = spawnSync(node, [join(here, "bootstrap-architecture-map.mjs"), dir], { encoding: "utf8" });
  const html = existsSync(join(dir, "docs/product/architecture-overview.html"))
    ? readFileSync(join(dir, "docs/product/architecture-overview.html"), "utf8")
    : "";
  r.status === 0 && html.includes("选题写成稿") && !html.includes("return prompt")
    ? pass("bootstrap：firstDoc 不误吃 f-string")
    : fail("bootstrap：firstDoc 不误吃 f-string", (r.stderr || "") + (r.stdout || ""));
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRoot();
  mkdirSync(join(dir, "web/static"), { recursive: true });
  writeFileSync(join(dir, "web/workspace_service.py"), "def open_workspace():\n  return {}\n");
  writeFileSync(join(dir, "web/static/app.js"), "export function boot() {}\n");
  const r = spawnSync(node, [join(here, "bootstrap-architecture-map.mjs"), dir], { encoding: "utf8" });
  const html = existsSync(join(dir, "docs/product/architecture-overview.html"))
    ? readFileSync(join(dir, "docs/product/architecture-overview.html"), "utf8")
    : "";
  r.status === 0 && html.includes("web/workspace_service.py") && !html.includes('p: "web/static/app.js"')
    ? pass("bootstrap：web 入口优先服务文件而不是 static/app.js")
    : fail("bootstrap：web 入口优先服务文件而不是 static/app.js", (r.stderr || "") + (r.stdout || ""));
  rmSync(dir, { recursive: true, force: true });
}

if (failed) {
  console.error(`self-test: ${failed} failed`);
  process.exit(1);
}
console.log("self-test ok");
