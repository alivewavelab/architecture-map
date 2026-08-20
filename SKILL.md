---
name: architecture-map
description: 解读任意项目的代码结构并生成「产品总图」单文件 HTML（模块卡片 + 点击展开脚本链路图，每个脚本带输入→输出，跨模块引用画虚线脚本盒）。Use when the user asks to 解读项目、生成架构图、产品总图、模块关系图, or wants a visual map of a codebase for non-technical stakeholders.
---

# Architecture Map（产品总图生成）

把任意项目解读成一张单文件 HTML 架构图：模块 = 一揽子脚本的文件夹；点模块卡片 → 底部抽屉显示脚本节点（文件名 / 职责 / 输入 → 输出）与上下游链路；跨模块引用画虚线脚本盒并标注归属。目标读者是非技术的产品负责人，不是工程师。

## 工作流程

```
Task Progress:
- [ ] Step 1: 解读项目，识别模块
- [ ] Step 2: 复制模板，填 D 字典
- [ ] Step 3: 建映射表 + 门禁脚本
- [ ] Step 4: 验证（门禁 + 截图复查）
- [ ] Step 5: 登记同步纪律
```

**Step 1: 解读项目，识别模块**

按此顺序读：README / 产品文档 → 入口文件（main、lib、index）→ 目录结构 → 关键模块的 `pub fn` / `export`。

识别模块的原则：
- 模块按**业务结果**分，不按技术层分（「管游戏」「管 MOD」是模块；「工具函数」「数据库」不是）
- 模块 = 一组脚本的命名前缀 + 文件夹；一个模块内部高内聚，模块间低耦合
- 每个模块必须能用一句大白话说清「它是干什么的」——说不出来就是边界没想清楚

**Step 2: 复制模板，填 D 字典**

复制 [template.html](template.html) 到项目（建议 `docs/product/architecture-overview.html`），替换 `{{项目名}}`，然后填 `const D = {...}`（模板里有带注释的示例模块）。

每个模块的字段：

| 字段 | 内容 | 要求 |
| --- | --- | --- |
| `name` | 英文名（中文名） | 与目录/包名对齐 |
| `plain` | 大白话一句 | 非研发能懂，如「你的游戏列表」 |
| `role` / `inn` / `out` | 职责 / 输入 / 输出 | 模块级，一两句 |
| `status` | 现状 | 已通 / 进行中 / 未开始 |
| `files` | 脚本节点数组 | 见下 |

每个脚本节点 `{ id, p, r, io, to, extTo, extFrom }`：
- `p` 真实路径（门禁查存在性）；`r` 职责一句；`io` 「输入 → 输出」人话 ≤30 字
- **io 必须读真实代码后写**（看 pub fn / export 的签名），禁止编造
- `to` 模块内边：`{ t: "同模块文件id", io: "给什么（中文）" }`
- `extTo`/`extFrom` 跨模块边：带 `p`（真实路径）+ `m`（归属模块名）画成虚线脚本盒；链路要追到最终执行者，不许甩名字断链
- 外部节点之间的边用模块级 `extLinks: [{ a, b, io, am, bm }]`

页面上每个模块还要有一张卡片节点（`<div class="node" data-k="模块key">`），未开始的模块加 `class="node ext"`（虚线框）。

**Step 3: 建映射表 + 门禁脚本**

复制 [scripts/validate-module-file-map.mjs](scripts/validate-module-file-map.mjs) 到项目 `tooling/arch-module-graph/`，调整顶部 CONFIG 区（监视区目录、生成物前缀、路径）。

建 `tooling/arch-module-graph/module-file-map.json`：

```json
{
  "modules": {
    "example-module": { "designId": null, "include": ["src/example/"] }
  },
  "unowned": [{ "path": "scripts/build.ts", "reason": "构建脚本，不属任何业务模块" }]
}
```

- `include` 前缀决定文件唯一主属；`mirror` 仅供关系图镜像；`unowned` 必须带 reason
- 有独立设计文档的模块填 `designId`，并在 HTML 的 `module-registry` JSON 块里登记

**Step 4: 验证（必须做，不许跳过）**

1. 跑门禁：`node tooling/arch-module-graph/validate-module-file-map.mjs`——0 孤儿、0 缺图才通过
2. **截图复查**（多模态，不许只跑语法检查）：

```bash
# Windows / Edge
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --screenshot="$PWD/.tmp-review.png" --window-size=1440,1400 --virtual-time-budget=4000 "file:///$PWD/docs/product/architecture-overview.html"
```

用读图工具看截图：卡片是否挤压、连线是否可见、大白话是否显示。点开模块的抽屉也要截（临时副本尾部加 `<script>pick(document.querySelector(".node[data-k='模块key']"));</script>`）。发现问题修了再截，直到能看。

**Step 5: 登记同步纪律**

在项目的 AGENTS.md / 贡献规范里写死：

- 新模块：设计文档 + 图注册 + 进度登记，缺一门禁失败
- 新脚本：必须进图（带职责与输入输出），否则 `check:arch` 判失败（规则 7 反向同步）
- 豁免：`*.test.*`、`index.ts`、`mod.rs`、`*.types.ts`、生成目录

## 设计纪律（模板已内置，不要破坏）

- 深色「装备整备室」风格：圆角 2px、无外投影、琥珀是唯一强调色
- 单文件离线：不引外部 CDN / 字体 / 脚本（布局库已内联）
- 大白话（plain）是卡片视觉焦点；技术细节收进折叠
- 未开始模块画虚线框，不假装已通

## 常见坑

- 边线颜色太淡会「看不见连线」——用 `#8a8f96` 而不是 `#5f656d`
- 模块卡片超过 4 张不要硬排一行，用 `.flow.grid4` 网格（并列关系不画箭头）
- 大模块（编排类）未来会有很多子项时，用专属页签做卡片墙，不要平铺详情
- 改完 HTML 必须截图复查，不许只跑语法检查就交付
