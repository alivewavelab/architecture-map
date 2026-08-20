# architecture-map

Cursor Skill：解读任意项目的代码结构，生成一张**单文件「产品总图」HTML**。

模块 = 一揽子脚本的文件夹。点模块卡片，底部抽屉展开脚本节点（文件名 / 职责 / 输入 → 输出）和上下游链路；跨模块引用画成虚线脚本盒。任何模块都走底部抽屉。顶部页签只按「一条真实用户作业」切片上下游，不给编排引擎开目录墙。目标读者是非技术的产品负责人。

## 安装

把仓库克隆到 Cursor 个人 skills 目录：

```powershell
# Windows
git clone https://github.com/alivewavelab/architecture-map.git $HOME\.cursor\skills\architecture-map
```

```bash
# macOS / Linux
git clone https://github.com/alivewavelab/architecture-map.git ~/.cursor/skills/architecture-map
```

然后在 Cursor 对话里说「解读项目」或「生成产品总图」。

已有本机副本时，用 `git pull` 更新即可。

## 仓库内容

| 文件 | 作用 |
| --- | --- |
| [SKILL.md](SKILL.md) | Agent 五步工作流：解读 → 填 D 字典 → 建门禁 → 验证 → 登记纪律 |
| [template.html](template.html) | 单文件交互模板（深色装备整备室风格，布局库已内联，可离线打开） |
| [scripts/validate-module-file-map.mjs](scripts/validate-module-file-map.mjs) | 模块归属、命名、unowned 目录前缀、`.flow` 布局门禁；复制后只改顶部 CONFIG |
| [scripts/generate-module-graph.mjs](scripts/generate-module-graph.mjs) | 从真实 import 写入 `#generated-graph`，不覆盖 D 人话 |
| [scripts/capture-overview.mjs](scripts/capture-overview.mjs) | 有 Chrome / Edge 时截总图；没有浏览器不挡门禁 |
| [scripts/self-test.mjs](scripts/self-test.mjs) | 门禁与生成器默认项自测 |

## 工作流（摘要）

1. 按业务结果识别模块，每个模块能用一句大白话说明「它干什么」。
2. 复制 `template.html` 到项目（建议 `docs/product/architecture-overview.html`），填 `const D = {...}`。每个脚本的 `io` 必须读真实代码后写。
3. 复制门禁脚本，**必须先填 `WATCH_ZONES`**（默认空数组会失败），再建 `module-file-map.json`。跑 `generate-module-graph.mjs` 补 import 边（不改人话 `io`）。
4. 跑门禁，再截图复查（不许只跑语法检查）。
5. 在项目规范里写死：新模块要注册，新脚本要进图。

完整步骤见 [SKILL.md](SKILL.md)。

## 许可

MIT
