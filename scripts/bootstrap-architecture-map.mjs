#!/usr/bin/env node

// 安装后对仓库根跑一次：发现监视区、按目录切模块、从真实签名写 io、出总图并跑生成器。
// 用法：node bootstrap-architecture-map.mjs [仓库根] [--force]
// 不编造产品故事：plain / io 来自 README / docstring / 函数签名；作业页签来自真实 import 边。

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
  "tests", "__tests__", "spec",
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
    if (SKIP_DIR.has(entry.name) || entry.name.startsWith(".")) return [];
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
  let py = 0;
  let js = 0;
  let rs = 0;
  for (const [ext, n] of counts) {
    if (ext === ".py") py += n;
    else if (ext === ".rs") rs += n;
    else if (JS_EXT.has(ext)) js += n;
  }
  const style = js >= py && js >= rs ? "kebab" : "snake";
  if (style === "snake") {
    const snake = [...counts.keys()].filter((e) => e === ".py" || e === ".rs");
    return new Set(snake.length ? snake : counts.keys());
  }
  const jsExts = [...counts.keys()].filter((e) => JS_EXT.has(e));
  return new Set(jsExts.length ? jsExts : counts.keys());
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
    if (!entry.isDirectory() || SKIP_DIR.has(entry.name) || entry.name.startsWith(".")) continue;
    if (zones.some((z) => z.dir === entry.name || z.dir.startsWith(`${entry.name}/`))) continue;
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

const FOLDER_ZH = {
  workspace: "启动", agents: "出稿", collectors: "采消息", scrapers: "抓内容",
  analysis: "选题", generation: "写稿", frontend: "给人点", web: "给人点",
  utils: "落盘", workflows: "编排", scripts: "跑脚本", cli: "跑命令",
  infra: "底座", interface: "人对面", orchestration: "编排", capabilities: "能力",
  ai: "策略", bin: "跑命令", src: "源码",
};
const zhOf = (key, title, role) => {
  if (key === "workspace" || title === "workspace") return role === "sink" ? "配置" : "启动";
  return FOLDER_ZH[key] || FOLDER_ZH[title] || title;
};

const extractIo = (posix) => {
  if (!posix || !existsSync(resolve(root, posix)) || posix.endsWith("/")) return "目录覆盖";
  const src = readFileSync(resolve(root, posix), "utf8");
  const ext = extname(posix);
  const sigs = [];
  const push = (name, params, ret) => {
    if (!name || name === "main" || name.startsWith("_")) return;
    const p = (params || "").replace(/\s+/g, " ").trim().slice(0, 20);
    const r = (ret || "导出").replace(/\s+/g, " ").trim().slice(0, 16);
    sigs.push(`${name}(${p}) → ${r}`);
  };
  if (PY_EXT.has(ext)) {
    for (const m of src.matchAll(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/gm)) push(m[1], m[2], m[3]);
  } else if (RS_EXT.has(ext)) {
    for (const m of src.matchAll(/\bpub\s+(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^{]+))?/g)) {
      push(m[1], m[2], m[3]);
    }
  } else if (JS_EXT.has(ext)) {
    for (const m of src.matchAll(/\bexport\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*([^{]+))?/g)) {
      push(m[1], m[2], m[3]);
    }
  }
  const uniq = [...new Set(sigs)].slice(0, 2);
  return uniq.length ? uniq.join("；") : `${posix.split("/").pop()} → 导出`;
};

const firstDoc = (posix) => {
  if (!posix || !existsSync(resolve(root, posix))) return "";
  const src = readFileSync(resolve(root, posix), "utf8");
  const head = src.replace(/^(?:#!.*\r?\n)?(?:#.*\r?\n)*/, "");
  const m = head.match(/^[ru]?["']{3}([\s\S]*?)["']{3}/) || head.match(/^\/\*\*([\s\S]*?)\*\//);
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
  return dir.replace(/[\W_]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "mod";
};

const pickEntry = (files) => {
  const ranked = files.filter((f) => SOURCE_EXT.has(extname(f)));
  const score = (file) => {
    const p = toPosix(file);
    if (/(?:^|\/)(static|dist|assets|public)\//.test(p)) return 80;
    if (/(?:^|\/)(main|index|mod|app|page)\.[^/]+$/.test(p)) return 0;
    if (/(?:^|\/)\w*service\w*\.[^/]+$/.test(p)) return 1;
    if (PY_EXT.has(extname(p)) && !p.endsWith("__init__.py")) return 2;
    if (p.endsWith("__init__.py")) return 90;
    return 10;
  };
  return [...ranked].sort((a, b) => score(a) - score(b) || toPosix(a).localeCompare(toPosix(b)))[0];
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

if (!force && (existsSync(destOverview) || existsSync(resolve(destTooling, "module-file-map.json")))) {
  console.error("已有总图或映射表。确认覆盖请加 --force。");
  process.exit(2);
}

copyFileSync(resolve(skillDir, "validate-module-file-map.mjs"), resolve(destTooling, "validate-module-file-map.mjs"));
copyFileSync(resolve(skillDir, "generate-module-graph.mjs"), resolve(destTooling, "generate-module-graph.mjs"));

const bucket = new Set(["web/src/lib/utils.ts", "src/lib/utils.ts", "lib/utils.ts"].filter((p) => existsSync(resolve(root, p))));
for (const zone of zones) {
  for (const file of zone.files) {
    const p = toPosix(file);
    if (/(?:^|\/)utils?\.ts$/.test(p)) bucket.add(p);
  }
}
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
  const title = zone.dir === "." ? "workspace" : zone.dir.split("/").pop();
  const label = zhOf(key, title);
  const files = [];
  if (include[0].endsWith("/")) {
    files.push({ id: "dir", p: include[0], r: "本目录实现", io: "见目录内脚本" });
  }
  const entryIo = entry && existsSync(resolve(root, entry)) && !entry.endsWith("/") ? extractIo(entry) : "";
  if (entry && existsSync(resolve(root, entry)) && !entry.endsWith("/")) {
    files.push({ id: "entry", p: entry, r: entry.split("/").pop(), io: entryIo });
  }
  dMods.push({
    key,
    name: `${title}（${label}）`,
    plain: (doc || `${label}：${title} 目录`).slice(0, 40),
    role: label,
    inn: entryIo ? entryIo.split("→")[0].trim() : "本层输入",
    out: entryIo && entryIo.includes("→") ? entryIo.split("→").slice(-1)[0].trim() : "本层输出",
    status: "待核。",
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
gate = gate.replace(/const ALLOWED_BUCKET_FILES = \[[\s\S]*?\];/, `const ALLOWED_BUCKET_FILES = ${JSON.stringify([...bucket])};`);
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
process.stdout.write((gen.stdout || "") + (gen.stderr || ""));
if (gen.status !== 0) process.exit(gen.status ?? 1);
writeFileSync(destOverview, applyImportLayout(readFileSync(destOverview, "utf8"), dMods));

const val = spawnSync(node, [resolve(destTooling, "validate-module-file-map.mjs"), root], { encoding: "utf8" });
process.stdout.write((val.stdout || "") + (val.stderr || ""));
if (val.status !== 0) process.exit(val.status ?? 1);
console.log(`Bootstrapped ${dMods.length} modules → docs/product/architecture-overview.html`);

function cardHtml(mod) {
  return `<div role="button" tabindex="0" class="node" data-k="${mod.key}"><b>${mod.name}</b><small>${mod.plain}</small><span class="io"><em>输入：</em>${mod.inn}　<em>输出：</em>${mod.out}</span></div>`;
}

function flowOf(mods) {
  const cards = mods.map(cardHtml);
  if (cards.length <= 1) return `<div class="flow">${cards[0] || ""}</div>`;
  if (cards.length > 8) return `<div class="flow grid4">${cards.join("")}</div>`;
  const inner = cards.flatMap((c, i) => (
    i === 0 ? [c] : [`<div class="arr" aria-hidden="true"><svg><use href="#arr-to"/></svg></div>`, c]
  )).join("");
  return `<div class="flow n${cards.length}">${inner}</div>`;
}

function applyImportLayout(page, mods) {
  const byKey = new Map(mods.map((m) => [m.key, m]));
  const keys = mods.map((m) => m.key);
  let gen = { modules: {} };
  const gm = page.match(/<script type="application\/json" id="generated-graph">([\s\S]*?)<\/script>/);
  try { gen = JSON.parse(gm?.[1] || "{}"); } catch { /* empty */ }
  const inbound = new Map(keys.map((k) => [k, new Set()]));
  const outbound = new Map(keys.map((k) => [k, new Set()]));
  for (const [from, rec] of Object.entries(gen.modules || {})) {
    if (!outbound.has(from)) continue;
    for (const f of rec.files || []) {
      for (const e of f.extTo || []) {
        if (e.m && inbound.has(e.m)) {
          outbound.get(from).add(e.m);
          inbound.get(e.m).add(from);
        }
      }
    }
  }
  const sources = keys.filter((k) => inbound.get(k).size === 0);
  const sinks = keys.filter((k) => outbound.get(k).size === 0 && inbound.get(k).size > 0);
  const mid = keys.filter((k) => !sources.includes(k) && !sinks.includes(k));
  const lane = (title, list) => list.length
    ? `<div class="lane"><div class="lane-t">${title}</div>\n    ${list.length === 1 ? flowOf(list) : `<div class="flow grid4">${list.map(cardHtml).join("")}</div>`}\n  </div>`
    : "";
  const overall = [
    lane("入口", sources.map((k) => byKey.get(k))),
    lane("处理", mid.map((k) => byKey.get(k))),
    lane("落点", sinks.map((k) => byKey.get(k))),
  ].filter(Boolean).join("\n") || `<div class="lane"><div class="lane-t">实现</div>\n    ${flowOf(mods)}\n  </div>`;

  const prefer = ["frontend", "web", "workspace", "cli", "bin", "scripts"];
  const rank = (k) => { const i = prefer.indexOf(k); return i < 0 ? 99 : i; };
  const pathTowardSink = (start) => {
    const q = [[start]];
    const seen = new Set([start]);
    let best = [start];
    while (q.length) {
      const path = q.shift();
      const cur = path[path.length - 1];
      if (sinks.includes(cur) && path.length > 1) return path;
      if (path.length > best.length) best = path;
      for (const next of outbound.get(cur) || []) {
        if (seen.has(next)) continue;
        seen.add(next);
        q.push([...path, next]);
      }
    }
    return best;
  };
  const startKeys = [...new Set([
    ...prefer.filter((k) => keys.includes(k) && outbound.get(k)?.size),
    ...sources.filter((k) => outbound.get(k)?.size),
  ])].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const jobs = [];
  for (const start of startKeys) {
    const path = pathTowardSink(start);
    if (path.length < 2) continue;
    const id = `job-${path[0]}-to-${path[path.length - 1]}`.replace(/[^a-z0-9-]/g, "").slice(0, 40);
    if (jobs.some((j) => j.id === id || (j.mods[0]?.key === path[0] && j.mods.at(-1)?.key === path.at(-1)))) continue;
    jobs.push({
      id,
      label: `从${zhOf(path[0], path[0])}到${zhOf(path[path.length - 1], path[path.length - 1], sinks.includes(path[path.length - 1]) ? "sink" : "")}`,
      mods: path.map((k) => byKey.get(k)).filter(Boolean),
    });
    if (jobs.length >= 3) break;
  }

  const tabs = [
    `<button class="tab" type="button" data-view="overall" aria-pressed="true">全局流向</button>`,
    ...jobs.map((j) => `<button class="tab" type="button" data-view="${j.id}" aria-pressed="false">${j.label}</button>`),
  ].join("\n  ");
  const jobViews = jobs.map((j) =>
    `<section class="view" data-panel="${j.id}">
  <div class="lane">
    <div class="lane-t">${j.label}</div>
    ${flowOf(j.mods)}
  </div>
</section>`).join("\n");

  page = page.replace(
    /<div class="tabs" role="group" aria-label="架构视图">[\s\S]*?<\/div>/,
    `<div class="tabs" role="group" aria-label="架构视图">\n  ${tabs}\n</div>`,
  );
  page = page.replace(
    /<section class="view is-on" data-panel="overall">[\s\S]*?<\/section>/,
    `<section class="view is-on" data-panel="overall">\n  ${overall}\n</section>${jobViews ? `\n${jobViews}` : ""}`,
  );
  return page;
}
