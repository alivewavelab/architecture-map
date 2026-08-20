#!/usr/bin/env node

// 总图截图助手。有 Chrome / Edge 就出 PNG；没有浏览器就警告退出 0（布局门禁已在 validate 里查 .flow 子元素数）。
// 用法：node scripts/capture-overview.mjs [仓库根] [输出 png]

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.argv[2] ?? ".");
const out = resolve(process.argv[3] ?? resolve(root, ".tmp-review.png"));
const html = resolve(root, "docs/product/architecture-overview.html");

if (!existsSync(html)) {
  console.error(`找不到总图：${html}\n  → 先复制 template.html 到 docs/product/architecture-overview.html`);
  process.exit(1);
}

const browsers = [
  process.env.PROGRAMFILES_X86 && `${process.env.PROGRAMFILES_X86}/Microsoft/Edge/Application/msedge.exe`,
  process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}/Microsoft/Edge/Application/msedge.exe`,
  process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const bin = browsers.find((p) => existsSync(p));
if (!bin) {
  console.warn("未找到 Chrome / Edge，跳过截图。布局仍由 validate-module-file-map.mjs 的 .flow 子元素门禁兜底。");
  process.exit(0);
}

const href = "file:///" + html.replace(/\\/g, "/");
const r = spawnSync(bin, [
  "--headless",
  "--disable-gpu",
  `--screenshot=${out}`,
  "--window-size=1440,1600",
  "--virtual-time-budget=4000",
  href,
], { encoding: "utf8" });

if (!existsSync(out) || statSync(out).size < 8000) {
  console.error(`截图失败或文件过小：${out}\n${r.stderr || r.stdout || ""}`);
  process.exit(1);
}
console.log(`Wrote screenshot ${out} (${statSync(out).size} bytes)`);
