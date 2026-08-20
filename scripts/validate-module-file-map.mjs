#!/usr/bin/env node

// 模块文件归属与命名门禁（architecture-map skill）。
// 映射表默认：tooling/arch-module-graph/module-file-map.json；架构页默认：docs/product/architecture-overview.html。
// 复制到新项目后只改顶部 CONFIG；改校验规则时同步改目标项目的 AGENTS.md。
//
// 强制项：
// 1. 监视区（client/src、client/src-tauri/src；排除 *.test.* 与 api-client/bindings/）
//    内每个文件必须命中唯一一个模块 include，否则判孤儿；命中多个判冲突。
// 2. 映射表登记的路径必须真实存在；目录前缀命中 0 个受监视文件判失效（allowEmpty 除外）。
// 3. include 前缀不得嵌套（跨模块判冲突，同模块判冗余）。
// 4. 命名风格：Rust 区 snake_case，TS 区 kebab-case；禁止桶文件；禁止 <dir>.rs 与 <dir>/ 并存；
//    测试文件基名必须能对上被测文件。
// 5. module-registry ↔ 映射表 designId ↔ D 字典 key 三方一致。
// 6. D 字典 files 的 p 路径必须存在，且归属（主属或镜像）覆盖其所在模块；
//    跨模块引用（extTo/extFrom 带 p、extLinks 的 a/b）只查存在性。
// 7. 反向同步：映射表 include 的实现文件必须出现在对应模块的 D files 里；
//    豁免 *.test.*、index.ts、mod.rs、*.types.ts，及被 D 目录节点（p 以 / 结尾）覆盖的前缀。

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };
const toPosix = (path) => relative(root, path).split(sep).join("/");

// ── 按项目调整（CONFIG）──────────────────────────────────────────
// 复制到新项目后只需改这一段：监视区（目录 + 扩展名 + 命名风格）、
// 生成物排除前缀、映射表与架构页路径。
const WATCH_ZONES = [
  { dir: "client/src", exts: new Set([".ts", ".tsx"]), style: "ts" },
  { dir: "client/src-tauri/src", exts: new Set([".rs"]), style: "rust" },
];
const GENERATED_PREFIXES = ["client/src/api-client/bindings/"];
const MAP_PATH = "tooling/arch-module-graph/module-file-map.json";
const OVERVIEW_PATH = "docs/product/architecture-overview.html";
const EXCLUDED = (posix) =>
  /\.test\.[tj]sx?$/.test(posix) || GENERATED_PREFIXES.some((p) => posix.startsWith(p));

const walk = (directory) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
};

const watched = []; // { posix, style }
const allSourceFiles = []; // 含测试文件，供命名规则使用
for (const zone of WATCH_ZONES) {
  for (const file of walk(resolve(root, zone.dir))) {
    const posix = toPosix(file);
    if (!zone.exts.has(extname(file))) continue;
    allSourceFiles.push({ posix, style: zone.style });
    if (!EXCLUDED(posix)) watched.push({ posix, style: zone.style });
  }
}

// ── 映射表读取 ───────────────────────────────────────────────────
const mapPath = resolve(root, MAP_PATH);
expect(existsSync(mapPath), `missing module file map: ${MAP_PATH}`);
const map = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, "utf8")) : { modules: {}, unowned: [] };
const modules = map.modules ?? {};
const unowned = new Set((map.unowned ?? []).map((entry) => entry.path));

for (const entry of map.unowned ?? []) {
  expect(typeof entry.reason === "string" && entry.reason.trim().length > 0,
    `unowned 登记必须带 reason：${entry.path}`);
}

// 命中判定：前缀以 / 结尾为目录前缀，否则精确匹配
const hitBy = (posix, prefix) =>
  prefix.endsWith("/") ? posix.startsWith(prefix) : posix === prefix;

const ownersOf = (posix) =>
  Object.entries(modules)
    .filter(([, m]) => (m.include ?? []).some((prefix) => hitBy(posix, prefix)))
    .map(([key]) => key);

// ── 规则 1：孤儿与多重主属 ──────────────────────────────────────
for (const { posix } of watched) {
  const owners = ownersOf(posix);
  if (owners.length === 0 && !unowned.has(posix)) {
    errors.push(
      `孤儿文件未归属任何模块：${posix}\n` +
      `  → 在 tooling/arch-module-graph/module-file-map.json 为其所属模块登记前缀，或加入 unowned 并写明理由`,
    );
  }
  if (owners.length > 1) {
    errors.push(
      `文件被多个模块登记为主属：${posix}（${owners.join("、")}）\n` +
      `  → include 只能有一个主属模块，其余改用 mirror 字段`,
    );
  }
}

// ── 规则 2：失效登记 ─────────────────────────────────────────────
for (const [key, m] of Object.entries(modules)) {
  for (const prefix of m.include ?? []) {
    const abs = resolve(root, prefix);
    if (prefix.endsWith("/")) {
      expect(existsSync(abs) && statSync(abs).isDirectory(),
        `映射表登记的目录前缀不存在：${key} → ${prefix}\n  → 删除该条登记或修正路径`);
      if (!existsSync(abs)) continue;
      const hits = watched.filter(({ posix }) => posix.startsWith(prefix));
      expect(hits.length > 0 || m.allowEmpty,
        `映射表登记的目录前缀下没有任何受监视文件：${key} → ${prefix}\n  → 空前缀说明目录已挪走，删除该条；占位目录请显式标注 allowEmpty`);
    } else {
      expect(existsSync(abs) && statSync(abs).isFile(),
        `映射表登记的路径不存在：${key} → ${prefix}\n  → 删除该条登记或修正路径`);
    }
  }
  for (const mirror of m.mirror ?? []) {
    expect(existsSync(resolve(root, mirror)),
      `映射表登记的镜像路径不存在：${key} → ${mirror}`);
  }
}
for (const entry of map.unowned ?? []) {
  expect(existsSync(resolve(root, entry.path)),
    `unowned 登记的路径不存在：${entry.path}`);
}

// ── 规则 3：前缀不得嵌套 ─────────────────────────────────────────
const flatPrefixes = Object.entries(modules).flatMap(([key, m]) =>
  (m.include ?? []).map((prefix) => ({ key, prefix })),
);
for (let i = 0; i < flatPrefixes.length; i++) {
  for (let j = i + 1; j < flatPrefixes.length; j++) {
    const a = flatPrefixes[i];
    const b = flatPrefixes[j];
    const nested = a.prefix.startsWith(b.prefix) ? [a, b] : b.prefix.startsWith(a.prefix) ? [b, a] : null;
    if (!nested) continue;
    const [inner, outer] = nested;
    if (inner.key === outer.key) {
      errors.push(
        `前缀在同模块内冗余嵌套：${inner.key} 同时登记 ${outer.prefix} 与 ${inner.prefix}\n  → 删除被外层覆盖的内层前缀`,
      );
    } else {
      errors.push(
        `前缀跨模块嵌套：${outer.key} 的 ${outer.prefix} 覆盖了 ${inner.key} 的 ${inner.prefix}\n  → 拆成并列前缀，或把子目录并入同一模块`,
      );
    }
  }
}

// ── 规则 4：命名风格 ─────────────────────────────────────────────
const RS_NAME = /^[a-z][a-z0-9_]*\.rs$/;
const TS_NAME = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*\.(ts|tsx)$/;
const RS_DIR = /^[a-z][a-z0-9_]*$/;
const TS_DIR = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BANNED = /^(utils?|helpers?|common|misc|shared|constants)(\.[a-z0-9-]+)*\.(ts|tsx|rs)$/;

for (const zone of WATCH_ZONES) {
  const zoneAbs = resolve(root, zone.dir);
  if (!existsSync(zoneAbs)) continue;
  const dirRule = zone.style === "rust" ? RS_DIR : TS_DIR;
  const dirLabel = zone.style === "rust" ? "snake_case" : "kebab-case";
  for (const entry of walk(zoneAbs)) {
    const posix = toPosix(entry);
    if (posix.startsWith("client/src/api-client/bindings/")) continue;
    // 目录名
    let cursor = dirname(entry);
    while (cursor.length > zoneAbs.length) {
      const name = cursor.split(sep).pop();
      expect(dirRule.test(name),
        `${zone.style === "rust" ? "Rust" : "TS"} 目录名必须 ${dirLabel}：${toPosix(cursor)}/`);
      cursor = dirname(cursor);
    }
    if (!zone.exts.has(extname(entry))) continue;
    const base = entry.split(sep).pop();
    if (BANNED.test(base)) {
      errors.push(
        `禁止无语义文件名：${posix}\n  → 用职责命名，不建 utils / helpers / common / misc / constants 桶文件`,
      );
      continue;
    }
    if (zone.style === "rust") {
      expect(RS_NAME.test(base), `Rust 文件名必须 snake_case：${posix}`);
    } else {
      expect(TS_NAME.test(base), `TS 文件名必须 kebab-case：${posix}\n  → 改名后同步 architecture-overview.html 中的 p 字段`);
    }
  }
}

// 禁止 <dir>.rs 与 <dir>/ 并存
for (const { posix, style } of allSourceFiles) {
  if (style !== "rust" || !posix.endsWith(".rs")) continue;
  const siblingDir = posix.slice(0, -".rs".length) + "/";
  expect(!existsSync(resolve(root, siblingDir)),
    `Rust 禁止 <dir>.rs 与 <dir>/ 并存：${posix}\n  → 合并为 ${siblingDir}mod.rs`);
}

// 测试文件基名必须对上被测文件（<name>.test.ts(x) → <name>.ts(x) 或 <name>.page.tsx）
for (const { posix } of allSourceFiles) {
  const testMatch = posix.match(/^(.*\/)?([^/]+)\.test\.(ts|tsx)$/);
  if (!testMatch) continue;
  const dir = testMatch[1] ?? "";
  const base = testMatch[2];
  const candidates = [`${dir}${base}.ts`, `${dir}${base}.tsx`, `${dir}${base}.page.tsx`];
  expect(candidates.some((candidate) => existsSync(resolve(root, candidate))),
    `测试文件基名与被测文件不匹配：${posix}\n  → 找到 ${base}.ts / ${base}.tsx / ${base}.page.tsx 之一`);
}

// ── 规则 5：registry ↔ designId ↔ D 字典 ────────────────────────
const overviewPath = resolve(root, OVERVIEW_PATH);
const overview = readFileSync(overviewPath, "utf8");
const registryMatch = overview.match(/<script type="application\/json" id="module-registry">([\s\S]*?)<\/script>/);
expect(registryMatch, `${OVERVIEW_PATH} missing module-registry script block`);
const registry = registryMatch ? JSON.parse(registryMatch[1]) : [];

// 按模块头切分 D 字典，段内抓 p 字段（避免 files 数组内嵌套 ] 导致跨模块误吞）
const dModuleStarts = [...overview.matchAll(/^\s{2}"([a-z0-9-]+)":\s*\{\s*name:/gm)];
const dBlocks = dModuleStarts.map((match, index) => ({
  key: match[1],
  start: match.index,
  end: index + 1 < dModuleStarts.length ? dModuleStarts[index + 1].index : overview.length,
}));
const dKeys = new Set(dBlocks.map((block) => block.key));

const claimedDesignIds = new Set(
  Object.values(modules).map((m) => m.designId).filter(Boolean),
);
for (const id of registry) {
  expect(claimedDesignIds.has(id),
    `module-registry 模块无任何映射登记：${id}\n  → 在 module-file-map.json 让某个模块声明 designId: "${id}"`);
}
for (const [key, m] of Object.entries(modules)) {
  if (m.designId == null) continue;
  expect(registry.includes(m.designId),
    `映射表模块的 designId 未在 module-registry 注册：${key} → "${m.designId}"`);
}
for (const key of dKeys) {
  expect(key in modules,
    `架构页 D 字典模块未登记映射：${key}\n  → 未开始的模块也要登记，include 写空数组`);
}
for (const key of Object.keys(modules)) {
  expect(dKeys.has(key),
    `映射表模块不在架构页 D 字典中：${key}\n  → 先在 architecture-overview.html 注册架构节点，或并入已有模块`);
}

// ── 规则 6：D 字典 p 字段与映射表一致 ────────────────────────────
const mirrorOf = (posix) =>
  Object.entries(modules)
    .filter(([, m]) => (m.mirror ?? []).some((p) => hitBy(posix, p)))
    .map(([key]) => key);

for (const { key: moduleKey, start, end } of dBlocks) {
  const block = overview.slice(start, end);
  // files 条目 { id: "...", p: "..." }：查存在性 + 归属
  for (const pMatch of block.matchAll(/\{\s*id:\s*"[^"]+",\s*p:\s*"([^"]+)"/g)) {
    const p = pMatch[1];
    expect(existsSync(resolve(root, p)),
      `D 字典中的实现文件路径不存在：${moduleKey} → ${p}`);
    if (p.endsWith("/")) continue; // 目录引用（如 bindings/）只查存在性
    const owners = ownersOf(p);
    const mirrors = mirrorOf(p);
    expect(owners.includes(moduleKey) || mirrors.includes(moduleKey),
      `D 字典中的路径与映射表归属不符：${p} 在 D 中属 ${moduleKey}，映射表主属为 ${owners.join("、") || "（无）"}${mirrors.length ? `，镜像为 ${mirrors.join("、")}` : ""}`);
  }
  // 跨模块引用（extTo/extFrom 的 p、extLinks 的 a/b）：归属对方模块，只查存在性
  for (const xMatch of block.matchAll(/\{\s*t:\s*"[^"]+",\s*io:[^}]*?\bp:\s*"([^"]+)"/g)) {
    const p = xMatch[1];
    expect(existsSync(resolve(root, p)),
      `D 字典跨模块引用路径不存在：${moduleKey} → ${p}`);
  }
  for (const lMatch of block.matchAll(/\bextLinks:\s*\[([\s\S]*?)\]/g)) {
    for (const pMatch of lMatch[1].matchAll(/\b[ab]:\s*"([^"]+)"/g)) {
      const p = pMatch[1];
      expect(existsSync(resolve(root, p)),
        `D 字典 extLinks 路径不存在：${moduleKey} → ${p}`);
    }
  }
}

// ── 规则 7：反向同步——模块实现文件必须进图 ─────────────────────
const REVERSE_EXCLUDED = (posix) =>
  /\.test\.[tj]sx?$/.test(posix) || /(^|\/)index\.ts$/.test(posix) ||
  /(^|\/)mod\.rs$/.test(posix) || /\.types\.ts$/.test(posix);

for (const { key: moduleKey, start, end } of dBlocks) {
  const m = modules[moduleKey];
  if (!m) continue;
  const block = overview.slice(start, end);
  const dFiles = new Set([...block.matchAll(/\{\s*id:\s*"[^"]+",\s*p:\s*"([^"]+)"/g)].map((x) => x[1]));
  const dDirs = [...dFiles].filter((p) => p.endsWith("/"));
  const SCRIPT_EXT = /\.(rs|tsx?)$/;
  for (const inc of m.include ?? []) {
    const abs = resolve(root, inc);
    if (!existsSync(abs)) continue;
    const files = (statSync(abs).isFile() ? [abs] : walk(abs)).filter((f) => SCRIPT_EXT.test(f));
    for (const f of files) {
      const posix = toPosix(f);
      if (REVERSE_EXCLUDED(posix)) continue;
      if (dFiles.has(posix)) continue;
      if (dDirs.some((d) => posix.startsWith(d))) continue;
      expect(false,
        `模块文件未进架构图：${moduleKey} → ${posix}\n  → 在 D 字典 files 补该脚本节点（含职责与输入输出），或在映射表调整归属`);
    }
  }
}

// ── 结果 ────────────────────────────────────────────────────────
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated module file map: ${Object.keys(modules).length} modules, ${watched.length} watched files, ${unowned.size} unowned, 0 orphans.`,
  );
}
