---
name: architecture-map
description: 解读任意项目的代码结构并生成「产品总图」单文件 HTML（模块卡片 + 点击展开脚本链路图，每个脚本带输入→输出，跨模块引用画虚线脚本盒）。安装后先跑 bootstrap-architecture-map.mjs，不要手填 CONFIG。Use when the user asks to 解读项目、生成架构图、产品总图、模块关系图, or wants a visual map of a codebase for non-technical stakeholders.
---

# Architecture Map（产品总图生成）

把任意项目解读成一张单文件 HTML 架构图：模块 = 一揽子脚本的文件夹；点模块卡片 → 底部抽屉显示脚本节点（文件名 / 职责 / 输入 → 输出）与上下游链路；跨模块引用画虚线脚本盒并标注归属。目标读者是非技术的产品负责人，不是工程师。

**点击纪律（不许破）：** 任何模块卡片都只在底部抽屉展开。脚本再多也在抽屉里画，不给个别模块做跳页签 / 专属大页特例。

**页签筛选（不许破）：**
- `全局流向` = 全部模块分层
- 其余页签 = **一条真实用户作业**，从界面追到最终执行者，只留这条链上的模块（模块少、链完整）
- 不要给编排引擎 / 网关 / 控制器开「目录墙」页签。引擎是链上的一站，点全局卡片看抽屉
- 给人看的导读不要放大段说明；Agent 需要的读法写在 HTML 注释里

## 工作流程

```
Task Progress:
- [ ] Step 1: 跑引导脚本（发现监视区 / 切模块 / 签名写 io / import 分层与作业页签）
- [ ] Step 2: 只改明显错的大白话（可选）
- [ ] Step 3: 验证（门禁 + 截图复查）
- [ ] Step 4: 登记同步纪律
```

**Step 1: 跑引导脚本（默认，不要手填 CONFIG）**

对仓库根执行（skill 目录下的脚本，或已复制到项目后）：

```
node scripts/bootstrap-architecture-map.mjs [仓库根]
```

已有总图时加 `--force` 才覆盖。脚本会：发现源码目录并写入 `WATCH_ZONES`（根入口用 `maxDepth: 0`，不递归整仓）、按目录切模块、从 README / docstring / 真实函数签名写 `plain` 与 `io`、复制门禁与生成器、跑 `--depth=entry`，再按 `#generated-graph` 的 import 边排「入口 / 处理 / 落点」，并加最多 3 条作业页签：优先从界面/启动走到落点，标题用动作词典（采消息 / 出稿 / 落盘），不编具体产品故事。

Agent **不要**先手改 CONFIG 再出图。引导失败再补监视区。

识别模块的原则（引导已按目录切开；只在切错时手改映射表）：
- 优先按**业务结果**分（「管写作」「管会员」是模块；「工具函数」不是）
- 模块 = 一组脚本的命名前缀 + 文件夹；一个模块内部高内聚，模块间低耦合
- 每个模块必须能用一句大白话说清「它是干什么的」——说不出来就是边界没想清楚

项目自己就是分层架构（如 interface / orchestration / infra，且有测试钉死依赖方向）时：
- **按仓库真实分层切模块**，不要为了「业务结果」把一个目录拆给三个模块（`include` 会交叉）
- 在 `plain` 上加倍写人话，把技术层翻译成读者能懂的结果
- `infra` / `lib` 这类底座可以保留为一张卡片，但必须能说清「所有状态/文件/锁落在这里」

**Step 2: 只改明显错的大白话（可选）**

总图在 `docs/product/architecture-overview.html`。`io` 已从真实签名抽出（`foo() → 导出`），不是编造中文。只有读者看不懂、或模块切错时，才改 D 的 `plain` / 映射表。

每个模块的字段（手改时仍遵守）：

每个模块的字段：

| 字段 | 内容 | 要求 |
| --- | --- | --- |
| `name` | 英文名（中文名） | 与目录/包名对齐 |
| `plain` | 大白话一句 | 非研发能懂 |
| `role` / `inn` / `out` | 职责 / 输入 / 输出 | 模块级，一两句 |
| `status` | 现状 | 已通 / 进行中 / 未开始 |
| `statusHref` | 可选进度链接 | 没有 progress.md 就别写 |
| `files` | 脚本节点数组 | 见下 |

每个脚本节点 `{ id, p, r, io, to, extTo, extFrom }`：
- `p` 真实路径（门禁查存在性）；`r` 职责一句；`io` 「输入 → 输出」人话 ≤30 字
- **io 必须读真实代码后写**（看 pub fn / export 的签名），禁止编造
- `to` 模块内边：`{ t: "同模块文件id", io: "给什么（中文）" }`
- `extTo`/`extFrom` 跨模块边：带 `p`（真实路径）+ `m`（归属模块名）画成虚线脚本盒；链路要追到最终执行者，不许甩名字断链
- 外部节点之间的边用模块级 `extLinks: [{ a, b, io, am, bm }]`
- 目录节点：`p` 以 `/` 结尾，覆盖该前缀下所有脚本，用来给大目录减负

页面上每个模块还要有一张卡片节点（`<div class="node" data-k="模块key">`），未开始的模块加 `class="node ext"`（虚线框）。点它必须打开底部抽屉，禁止按模块 key 跳转别的页签。

**Step 3: 验证（必须做，不许跳过）**

引导已复制门禁。若必须手改顶部 CONFIG（引导漏了目录时）：

| 字段 | 作用 |
| --- | --- |
| `WATCH_ZONES` | **复制后必填**，默认空数组会失败。`{ dir, exts, style: "kebab"\|"snake"\|"kebab-strict" }`；可加 `allowEmpty` / `allowMissing` / `maxDepth`（`0` = 只扫该层文件，根目录入口用这个，不要无脑 `dir: "."` 递归）。`kebab` 默认放行 `Button.tsx` / `useDarkMode.ts` / `jwt-auth.guard.ts`；只要纯短横杠用 `kebab-strict` |
| `GENERATED_PREFIXES` | 生成物目录，所有规则都跳过；默认 `[]` |
| `MAP_PATH` / `OVERVIEW_PATH` | 映射表与架构页 |
| `ALLOWED_BUCKET_FILES` | 第三方固定桶文件白名单（如 shadcn `lib/utils.ts`） |
| `GRAPH_DEPTH` | 默认 `entry`（每模块至少一个入口）。`all` 时每个实现文件必须进图（D `files` **或** `#generated-graph`） |
| `DIR_EXEMPT` | 目录名豁免，默认已放行 `[param]`、`(group)`、`__fixtures__`、`zh-CN` |

`include` 支持：目录前缀 `src/ai/`、精确文件、glob `src/helix-*.mjs` / `web/src/lib/audio-*.ts`。跨模块父子目录按**最长前缀**判主属。

建 `tooling/arch-module-graph/module-file-map.json`：

```json
{
  "modules": {
    "example-module": { "designId": null, "include": ["src/example/"] }
  },
  "unowned": [
    { "path": "scripts/build.ts", "reason": "构建脚本，不属任何业务模块" },
    { "path": "src/migrations/", "reason": "一次性数据库迁移" }
  ]
}
```

- `include` 前缀决定文件唯一主属；`mirror` 仅供关系图镜像；`unowned` 必须带 reason，支持目录前缀 `migrations/` 与 glob
- `__init__.py` / `__main__.py` / `mod.rs` 默认不跑文件名风格检查
- 没有根 `package.json` 时直接 `node tooling/arch-module-graph/validate-module-file-map.mjs`；或挂到最近的 package.json，argv[2] 传仓库根
- 没有设计文档体系时 `designId` 一律 `null`，`module-registry` 填 `[]`
- 中大型仓库保持默认 `GRAPH_DEPTH=entry`，用目录节点覆盖大文件夹，再按需改 `all`

在 `package.json` 加：`"check:arch": "node tooling/arch-module-graph/validate-module-file-map.mjs"`

复制 [scripts/generate-module-graph.mjs](scripts/generate-module-graph.mjs) 到同一目录。填完 D 后跑：

```
node tooling/arch-module-graph/generate-module-graph.mjs [--depth=entry|all]
```

引导已跑过生成器。若只补边：`node tooling/arch-module-graph/generate-module-graph.mjs [--depth=entry|all]`。它写 `#generated-graph`（相对 import / Python 包导入 / `use crate::`），`io` 从真实 `def` / `export` / `pub fn` 抽出，不覆盖 D 里已有人话。

1. 跑门禁：`node tooling/arch-module-graph/validate-module-file-map.mjs`——0 孤儿、0 缺图才通过。成功日志会打印每个监视区命中数和图表覆盖率；监视区写错必须失败，不许假绿。`.flow.n2` 等网格的直接子元素数也对，单张卡写成 n2 会失败（卡片会掉进 92px 标签列）。
2. **截图复查**（多模态，不许只跑语法检查）。可先跑 `node scripts/capture-overview.mjs [仓库根]`（有 Chrome / Edge 才出 PNG，没有浏览器不挡门禁）：

```powershell
# Windows / Edge
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --screenshot="$PWD/.tmp-review.png" --window-size=1440,1400 --virtual-time-budget=4000 ("file:///" + ($PWD.Path.Replace('\','/') + "/docs/product/architecture-overview.html"))
```

```bash
# macOS / Linux（Chrome 或 Chromium）
chrome --headless --disable-gpu --screenshot="$PWD/.tmp-review.png" --window-size=1440,1400 --virtual-time-budget=4000 "file://$PWD/docs/product/architecture-overview.html"
```

找不到浏览器时，用读图工具直接打开 HTML 文件复查，并在回复里写明降级原因。

用读图工具看截图：卡片是否挤压、连线是否可见、大白话是否显示。点开模块的抽屉也要截（临时副本尾部加 `<script>pick(document.querySelector(".node[data-k='模块key']"));</script>`）。点任何模块都必须仍停在当前图、底部展开，不许跳走。发现问题修了再截，直到能看。

**Step 4: 登记同步纪律**

在项目的 AGENTS.md / 贡献规范里写死：

- 新模块：设计文档（如有）+ 图注册 + 进度登记，缺一门禁失败
- 新脚本：`GRAPH_DEPTH=all` 时必须进图（D `files` 或先跑生成器）；`io` 至少是真实函数名，禁止编造中文
- 点模块 = 底部抽屉，不给大模块做第二种交互
- 顶部页签只按用户作业切片，不按引擎类型切片
- 豁免：测试文件、`index.*`、`mod.rs`、`__init__.py`、`*.types.*`、生成目录、D 目录节点

## 设计纪律（模板已内置，不要破坏）

- 深色「装备整备室」风格：圆角 2px、无外投影、琥珀是唯一强调色
- 单文件离线：不引外部 CDN / 字体 / 脚本（布局库已内联）
- 大白话（plain）是卡片视觉焦点；技术细节收进折叠
- 未开始模块画虚线框，不假装已通
- 不在模板或脚本里写死某个项目的模块 key、进度文件名、调用链比喻
- 给人看的页面不要放大段操作说明；Agent 需要的读法写在 HTML 注释里
- 抽屉脚本图：空白处拖拽平移、滚轮缩放；连线默认三次贝塞尔，不用直角折线

## 常见坑

- 边线颜色太淡会「看不见连线」——用 `#8a8f96` 而不是 `#5f656d`
- 模块卡片超过 4 张不要硬排一行，用 `.flow.grid4` 网格（并列关系不画箭头）
- 同一 `.lane` 里不要并列两个 `.flow`：多出来的会掉进左侧 92px 标签列。模板已用 `grid-column: 2` 兜底；门禁还查 `.flow.nK` 子元素数
- 改完 HTML 必须截图复查，不许只跑语法检查就交付
- 复制后门禁 `WATCH_ZONES` 默认是空的，不改会失败；不要从某个产品仓库抄 `client/src`
- 根目录有入口文件时用 `{ dir: ".", maxDepth: 0 }`，不要递归扫整仓
- 目录名检查只看监视扩展名文件的祖先；`web/static/article-tools` 这种静态目录不再误杀 `.py` 监视区
- 只改了 `WATCH_ZONES` 却忘了改 `exts`：`.mjs` / `.py` 项目会全量误报或假绿
- 平铺 `lib/` 用 glob（`src/lib/audio-*.ts`），不要手写上百条精确路径
- Next.js / React：`kebab` 默认已放行 PascalCase / camelCase / `jwt-auth.guard.ts`；只要纯短横杠才写 `kebab-strict`
- `unowned` 用目录前缀（`src/migrations/`），不要一条条登记迁移文件
