#!/usr/bin/env node

// 安装后对仓库根跑一次：发现监视区、按目录切模块、从真实签名写 io、出总图并跑生成器。
// 用法：node bootstrap-architecture-map.mjs [仓库根] [--force]
// 不编造中文大白话：plain / io 来自 README 首句或 def / export / pub fn。

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const skillDir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const force = process.argv.includes("--force");
const root = resolve(args[0] ?? ".");
const node = process.execPath;

const SKIP_DIR = new Set([
  ".git", "node_modules", "dist", "build", "out", "target", "vendor",
  ".venv", "venv", "__pycache__", ".next", "coverage", ".turbo",
  "input", "tmp", ".idea", ".vscode", ".cursor", "docs", "tooling",
]);
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rs"]);
const JS_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const PY_EXT = new Set([".py"]);
const RS_EXT = new Set([".rs"]);
const NESTED_HINTS = [
  "web/src", "frontend/src", "frontend/apps/web/src",
  "backend/src", "backend/apps/public-api/src", "backend/packages",
  "client/src", "client/src-tauri/src",
];

const toPosix = (path) => relative(root, path).split(sep).join("/");
const walk = (directory, depth = 8) => {
  if (!existsSync(directory) || depth < 0) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP_DIR.has(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path, depth - 1) : [path];
  });
};

const styleFor = (exts) => {
  if ([...exts].some((e) => e === ".py" || e === ".rs")) return "snake";
  return "kebab";
};

const dominantExts = (files) => {
  const counts = new Map();
  for (const file of files) {
    const ext = extname(file);
    if (!SOURCE_EXT.has(ext)) continue;
    counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  if (counts.size === 0) return null;
  const style = styleFor(counts.keys());
  if (style === "snake") {
    const snake = [...counts.keys()].filter((e) => e === ".py" || e === ".rs");
    return new Set(snake.length ? snake : counts.keys());
  }
  const js = [...counts.keys()].filter((e) => JS_EXT.has(e));
  return new Set(js.length ? js : counts.keys());
};

const discoverZones = () => {
  const zones = [];
  const seen = new Set();
  const add = (dir, opts = {}) => {
    const abs = resolve(root, dir);
    if (!existsSync(abs) || seen.has(dir)) return;
    const files = (opts.maxDepth === 0
      ? readdirSync(abs, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => resolve(abs, e.name))
      : walk(abs)
    ).filter((f) => SOURCE_EXT.has(extname(f)));
    const exts = dominantExts(files);
    if (!exts || files.length === 0) return;
    seen.add(dir);
    zones.push({ dir, exts, style: styleFor(exts), files, ...opts });
  };

  for (const hint of NESTED_HINTS) add(hint);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIR.has(entry.name)) continue;
    add(entry.name);
  }
  const rootFiles = existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isFile() && SOURCE_EXT.has(extname(e.name)))
      .map((e) => e.name)
    : [];
  if (rootFiles.length) {
    add(".", { maxDepth: 0 });
  }
  return zones;
};

const extractIo = (posix) => {
  if (!existsSync(resolve(root, posix)) || posix.endsWith("/")) return "目录覆盖";
  const src = readFileSync(resolve(root, posix), "utf8");
  const ext = extname(posix);
  const names = [];
  if (PY_EXT.has(ext)) {
    for (const m of src.matchAll(/^def\s+(\w+)\s*\(/gm)) names.push(m[1]);
    for (const m of src.matchAll(/^class\s+(\w+)/gm)) names.push(m[1]);
  } else if (RS_EXT.has(ext)) {
    for (const m of src.matchAll(/\bpub\s+(?:async\s+)?fn\s+(\w+)/g)) names.push(m[1]);
  } else if (JS_EXT.has(ext)) {
    for (const m of src.matchAll(/\bexport\s+(?:async\s+)?function\s+(\w+)/g)) names.push(m[1]);
    for (const m of src.matchAll(/\bexport\s+const\s+(\w+)\s*=/g)) names.push(m[1]);
  }
  const uniq = [...new Set(names.filter((n) => n !== "main"))].slice(0, 3);
  return uniq.length ? `${uniq.map((n) => `${n}()`).join(", ")} → 导出` : `${posix.split("/").pop()} → 导出`;
};

const firstDoc = (posix) => {
  if (!posix || !existsSync(resolve(root, posix))) return "";
  const src = readFileSync(resolve(root, posix), "utf8");
  const m = src.match(/^[ru]?["']{3}([\s\S]*?)["']{3}/m) || src.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  return (m?.[1] || "").trim().split(/\r?\n/).map((l) => l.replace(/^\s*\*\s?/, "")).join(" ").trim();
};

const readmePlain = () => {
  for (const name of ["README.md", "readme.md", "README.zh-CN.md"]) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
    const h1 = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const sent = text.replace(/^#.+$/gm, "").trim().split(/[。.\n]/)[0]?.trim();
    return (h1 || sent || "").slice(0, 40);
  }
  return "";
};

const slug = (dir) => {
  if (dir === ".") return "workspace";
  return dir.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "mod";
};

const pickEntry = (files) => {
  const ranked = files.filter((f) => SOURCE_EXT.has(extname(f)));
  const prefer = ranked.find((f) => /(?:^|\/)(main|index|mod|__init__|app|page)\.[^/]+$/.test(toPosix(f)));
  return prefer || ranked[0];
};

const js = (value) => JSON.stringify(value);
const extLit = (exts) => [...exts].map((e) => js(e)).join(", ");

const zones = discoverZones();
if (!zones.length) {
  console.error("未发现源码目录。把仓库根传给脚本，或确认存在 .py / .ts / .rs / .mjs。");
  process.exit(1);
}

const projectName = readmePlain() || root.split(/[\\/]/).pop();
const destTooling = resolve(root, "tooling/arch-module-graph");
const destOverview = resolve(root, "docs/product/architecture-overview.html");
mkdirSync(destTooling, { recursive: true });
mkdirSync(dirname(destOverview), { recursive: true });

if (!force && existsSync(destOverview) && existsSync(resolve(destTooling, "module-file-map.json"))) {
  console.error("已有总图与映射表。确认覆盖请加 --force。");
  process.exit(2);
}

copyFileSync(resolve(skillDir, "validate-module-file-map.mjs"), resolve(destTooling, "validate-module-file-map.mjs"));
copyFileSync(resolve(skillDir, "generate-module-graph.mjs"), resolve(destTooling, "generate-module-graph.mjs"));

const bucket = ["web/src/lib/utils.ts", "src/lib/utils.ts", "lib/utils.ts"].filter((p) => existsSync(resolve(root, p)));
const unowned = [];
if (existsSync(resolve(root, "migrations"))) unowned.push({ path: "migrations/", reason: "一次性迁移" });

const modules = {};
const dMods = [];
for (const zone of zones) {
  const key = slug(zone.dir);
  if (modules[key]) continue;
  const include = zone.maxDepth === 0
    ? zone.files.map((f) => toPosix(f)).filter((p) => !p.includes("/"))
    : [`${zone.dir.replace(/\\/g, "/")}/`];
  if (!include.length) continue;
  modules[key] = { designId: null, include };
  const entryAbs = pickEntry(zone.files);
  const entry = entryAbs ? toPosix(entryAbs) : include[0];
  const doc = firstDoc(entry) || readmePlain();
  const title = zone.dir === "." ? "Workspace" : zone.dir.split("/").pop();
  const files = [];
  if (include[0].endsWith("/")) {
    files.push({ id: "dir", p: include[0], r: "本目录实现", io: "见目录内脚本" });
  }
  if (entry && existsSync(resolve(root, entry)) && !entry.endsWith("/")) {
    files.push({ id: "entry", p: entry, r: entry.split("/").pop(), io: extractIo(entry) });
  }
  dMods.push({
    key,
    name: `${title}（${title}）`,
    plain: (doc || `${title} 目录下的实现`).slice(0, 40),
    role: `${title} 源码`,
    inn: "本层输入",
    out: "本层输出",
    status: "已通。",
    files,
  });
}

writeFileSync(resolve(destTooling, "module-file-map.json"), JSON.stringify({ modules, unowned }, null, 2));

let gate = readFileSync(resolve(destTooling, "validate-module-file-map.mjs"), "utf8");
const zoneLit = zones.map((z) => {
  const extra = [
    z.maxDepth === 0 ? "maxDepth: 0" : "",
    z.allowMissing ? "allowMissing: true" : "",
  ].filter(Boolean).map((x) => `, ${x}`).join("");
  return `  { dir: ${js(z.dir)}, exts: new Set([${extLit(z.exts)}]), style: ${js(z.style)}${extra} }`;
}).join(",\n");
gate = gate.replace(/const WATCH_ZONES = \[[\s\S]*?\];/, `const WATCH_ZONES = [\n${zoneLit}\n];`);
gate = gate.replace(/const ALLOWED_BUCKET_FILES = \[[\s\S]*?\];/, `const ALLOWED_BUCKET_FILES = ${JSON.stringify(bucket)};`);
writeFileSync(resolve(destTooling, "validate-module-file-map.mjs"), gate);

const dBody = dMods.map((m) => {
  const files = m.files.map((f) => `    { id: ${js(f.id)}, p: ${js(f.p)}, r: ${js(f.r)}, io: ${js(f.io)} }`).join(",\n");
  return `  ${js(m.key)}: { name: ${js(m.name)}, plain: ${js(m.plain)}, role: ${js(m.role)}, inn: ${js(m.inn)}, out: ${js(m.out)}, status: ${js(m.status)}, files: [\n${files}\n  ] }`;
}).join(",\n");

const cards = dMods.map((m) =>
  `<div role="button" tabindex="0" class="node" data-k="${m.key}"><b>${m.name}</b><small>${m.role}</small><span class="io"><em>输入：</em>${m.inn}　<em>输出：</em>${m.out}</span></div>`,
);
let flow;
if (cards.length <= 1) flow = `<div class="flow">${cards[0] || ""}</div>`;
else if (cards.length === 2) {
  flow = `<div class="flow n2">${cards[0]}<div class="arr" aria-hidden="true"><svg><use href="#arr-to"/></svg></div>${cards[1]}</div>`;
} else {
  flow = `<div class="flow grid4">${cards.join("\n      ")}</div>`;
}

let html = readFileSync(resolve(skillDir, "../template.html"), "utf8");
html = html.replaceAll("{{项目名}}", projectName.replace(/[<>]/g, ""));
html = html.replace('<details class="guide" open>', '<details class="guide">');
html = html.replace(
  /<section class="view is-on" data-panel="overall">[\s\S]*?<\/section>/,
  `<section class="view is-on" data-panel="overall">
  <div class="lane">
    <div class="lane-t">实现</div>
    ${flow}
  </div>
</section>`,
);
html = html.replace(/const D = \{[\s\S]*?\n\};/, `const D = {\n${dBody}\n};`);
writeFileSync(destOverview, html);

const gen = spawnSync(node, [resolve(destTooling, "generate-module-graph.mjs"), root, "--depth=entry"], { encoding: "utf8" });
const val = spawnSync(node, [resolve(destTooling, "validate-module-file-map.mjs"), root], { encoding: "utf8" });
process.stdout.write((gen.stdout || "") + (gen.stderr || ""));
process.stdout.write((val.stdout || "") + (val.stderr || ""));
if (val.status !== 0) process.exit(val.status ?? 1);
console.log(`Bootstrapped ${dMods.length} modules → docs/product/architecture-overview.html`);
