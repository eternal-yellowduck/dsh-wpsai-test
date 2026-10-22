# 五子棋主题切换设计文档

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.1（实现基线） |
| 文档状态 | 已评审并实现（用户已确认 Q1–Q3，结论见 §12；实现与验证记录见 §14） |
| 关联任务 | Task #33：做一个主题切换，可以切换不同风格的场景 |
| 适用阶段 | P0（主题令牌化 + 三套场景主题 + 切换与持久化）已实现；P1（跟随系统、过渡动画）未做 |
| 编写日期 | 2026-10-22 |
| 现状基线 | 仓库 `main` 分支既有五子棋实现：`index.html`、`styles.css`、`js/core.js`、`js/ai.js`、`js/ui.js`、`tests/*.test.js` |

---

## 1. 方案摘要

**一句话结论**：在既有零构建、零依赖、Canvas 2D 的五子棋实现上，用「CSS 自定义属性 + `<html data-theme>`」作为唯一的主题数据源，新增一个轻量 `js/theme.js` 主题控制器与一个可访问的场景切换控件；首批提供 **经典木纹 / 暗夜星空 / 水墨宣纸** 三套"场景"主题，主题切换即时生效、写入 `localStorage` 持久化、首屏无闪烁，并把目前散落在 `styles.css` 与 `js/ui.js` 中的硬编码颜色全部收敛为主题令牌（含 Canvas 绘制所需的棋子/棋盘/标记色）。

**推荐方案**：方案 A（CSS 令牌 + `data-theme` + JS 调色板桥接）。

**用户确认结论（2026-10-22）**：Q1 确认为配色/材质型主题、不引入图片资源；Q2 首次访问始终默认经典木纹；Q3 主题需要影响棋子材质（完整场景主题）。实现按此结论落地，与本文推荐方案一致。

**为什么这样选**：
1. 项目已确定"零构建、零第三方依赖、双击 `index.html` 即玩"，多套样式表或运行时 CSS-in-JS 都会引入额外加载/维护成本，CSS 变量是唯一不需要新增构建步骤的方案。
2. 棋盘由 Canvas 绘制，颜色无法由 CSS 自动继承，必须由 JS 读取令牌后交给绘制层；把"读取 + 缓存"集中到 `theme.js`，可避免主题色在 CSS 与 JS 两处重复定义。
3. 三套主题不是简单换个强调色，而是"场景化"：背景氛围、棋盘材质、网格/星位、棋子边缘、落子标记与焦点光标都要成套成组变化；令牌化后每套主题只需声明同一组令牌。
4. 可访问性可被单测强约束：每套主题的文字/按钮/焦点/棋盘元素对比度都用现有 `tests/a11y.test.js` 的对比度算法复核（设计期已按 WCAG 2.1 公式核算，附录 A 为基线值）。

---

## 2. 背景与目标

### 2.1 背景

现有版本只有一套深色 UI + 浅木色棋盘（整体设计见 [五子棋开发设计文档](gomoku-design.md)），视觉颜色分为两处：

- `styles.css`：`:root` 已有 13 个颜色令牌，但 `body` 的背景径向渐变（第 33 行）、棋盘容器渐变与阴影（第 69–71 行）、`turn-dot` 棋子色（第 136、141 行）、按钮焦点环（第 173 行）仍为硬编码值。
- `js/ui.js`：Canvas 绘制中的棋盘线 `#6b4f27`（第 60 行）、星位 `#4a3517`（第 74 行）、黑白棋子渐变（第 96–102 行）、棋子描边（第 107 行）、胜利高亮条（第 118 行）、最后落子红点 `#ff4d4f`（第 133 行）、键盘光标 `rgba(79, 140, 255, 0.95)`（第 154 行）全部硬编码。

因此"换主题"目前无法只靠改 CSS 完成，必须先做一次小规模的**颜色令牌化重构**，否则主题会同时受 CSS 与 JS 两套颜色源制约，出现"面板变了、棋盘没变"的割裂。

### 2.2 目标

| 编号 | 目标 | 说明 |
| --- | --- | --- |
| G-01 | 场景化主题切换 | 提供 ≥3 套风格差异明显的主题，覆盖页面氛围、面板、按钮、棋盘材质、棋子、标记与焦点指示 |
| G-02 | 即时切换 | 点击即生效，无需刷新、无需重建对局/Canvas，不丢失任何对局状态 |
| G-03 | 记忆用户选择 | 刷新/重新打开后保持上次主题 |
| G-04 | 首屏无闪烁（FOUC） | 已有保存主题时，首帧即为目标主题，不出现"先经典后暗夜"闪跳 |
| G-05 | 可访问性不降级 | 每套主题的文字对比度 ≥ 4.5:1、UI 组件/焦点指示 ≥ 3:1，由自动化测试守住 |
| G-06 | 保持既有约束 | 不引入第三方依赖、不新增网络请求、不加构建步骤，`file://` 双击可运行 |
| G-07 | 为后续扩展预留 | 新增主题只需追加一段 CSS 令牌块 + 一条注册表记录，不改渲染逻辑 |

### 2.3 成功标准（可验收）

1. 三套主题各切换一次，页面 UI 与 Canvas 棋盘在同一帧内成套变化，无残留旧颜色。
2. 任一套主题下，`node --test tests/*.test.js` 全部通过（含新增主题对比度与令牌完整性用例），原有 35 个用例不回归。
3. 保存主题后刷新页面，首屏即为该主题（无可见闪变）。
4. 断网、`file://` 直接打开、320px 窄屏、键盘操作、`prefers-reduced-motion` 场景下均可正常切换。

---

## 3. 范围与非目标

### 3.1 本次范围（设计层）

- 主题数据模型、令牌清单与三套主题的基线配色（含设计期对比度核算）。
- 主题控制器（`js/theme.js`）的职责、接口、初始化与持久化流程。
- Canvas 渲染层的令牌化改造方案与绘制差异点。
- 切换控件的界面/交互/无障碍设计。
- 首屏无闪烁方案与脚本引入顺序。
- 测试与验收设计（自动化 + 手工清单）。
- 文件级变更清单与里程碑估算。

### 3.2 非目标（本设计不覆盖 / 本期不做）

- ~~**不实现代码**：本次任务交付设计文档；实现由后续开发任务按本文档执行。~~ **v1.1 已实现**：实现与验证记录见 §14。
- 不做自定义主题（用户自选颜色）、主题市场、导入导出主题包。
- 不做位图背景/插画/音效等资源型场景（会破坏零资源、`file://` 离线约束）。
- 不改变对局规则、AI 行为、棋盘尺寸、脚本加载顺序中的业务依赖（`core.js → ai.js → ui.js` 保持不变，仅插入 `theme.js`）。
- 不做服务端/账号级主题同步；主题只存本机浏览器。
- 不改动 `README` 中的既有功能描述。

---

## 4. 约束与假设

### 4.1 约束

| 编号 | 约束 | 影响 |
| --- | --- | --- |
| C-01 | 零构建、零第三方运行时依赖、无网络请求 | 只能用原生 CSS 变量 + 经典 `<script>` |
| C-02 | 必须支持 `file://` 双击打开 | 不能用 ES Modules、不能假设存在 HTTP 服务；`localStorage` 在部分浏览器的 `file://` 下可能被禁用，需 try/catch 降级 |
| C-03 | 棋盘由 Canvas 2D 绘制，不受 CSS 直接控制 | 必须由 JS 读取主题令牌后传入绘制函数 |
| C-04 | 现有 `tests/a11y.test.js` 直接解析 `styles.css` 的 `:root` | 令牌化时 `:root` 必须继续保留完整可用值（作为默认主题与回退），否则既有测试与"无 JS"均会失效 |
| C-05 | 既有脚本为非模块经典脚本，通过全局命名空间协作 | `theme.js` 需以 `global.GomokuTheme` 暴露，加载顺序在 `ui.js` 之前 |
| C-06 | 单文件职责单一、单文件 ≤ 400 行的既有约定 | `theme.js` 目标 ≤ 180 行；`ui.js` 只做令牌消费，不承载主题数据 |

### 4.2 关键假设

| 编号 | 假设 | 处理方式 |
| --- | --- | --- |
| A-01 | "不同风格的场景"指视觉风格/氛围主题（木纹、暗夜、水墨），而非具象背景插画 | **已确认（Q1）**：用户确认是配色主题、不引入图片资源，按本假设执行 |
| A-02 | 浏览器均支持 CSS 自定义属性与 `localStorage`（近两个大版本桌面/移动主流浏览器） | 不支持 CSS 变量时页面回退为 `:root` 经典主题；`localStorage` 异常时静默降级为不记忆 |
| A-03 | 主题切换不影响对局数据（`history`/`turn`/`status`/`mode`/AI 计时器） | 验收项 TH-09 强制检查：切换前后对局状态快照一致 |
| A-04 | Canvas 颜色在主题切换时一次性重绘即可，不需要渐变过渡 | 棋盘色以单帧跳变换新；页面 UI 用 CSS `transition` 仅过渡颜色属性（低成本），并遵循 `prefers-reduced-motion` |
| A-05 | 图表"移动端 320px 以上可用"约束延续 | 切换控件在窄屏换行/收窄，不破坏既有单列布局 |

---

## 5. 需求清单

### 5.1 功能性需求

| 编号 | 需求 | 优先级 | 验收标准 |
| --- | --- | --- | --- |
| FR-T01 | 提供三套场景主题：经典木纹、暗夜星空、水墨宣纸 | P0 | 三套主题视觉差异明显，均完整可用 |
| FR-T02 | 主题切换控件常驻页面，可随时切换 | P0 | 页面头部可见切换控件，点击后 1 帧内完成切换 |
| FR-T03 | 主题切换同时作用于 DOM UI 与 Canvas 棋盘 | P0 | 面板、按钮、棋盘、棋子、标记、光标全部成套变化，无旧主题残留色 |
| FR-T04 | 记忆主题选择 | P0 | 刷新后自动恢复；清除站点数据后回到默认 |
| FR-T05 | 首次访问的默认主题策略 | P0 | 无保存值时**始终默认经典木纹**（Q2 已确认，不跟随系统深浅色偏好）；用户显式选择后以其保存值为准 |
| FR-T06 | 首屏无主题闪烁 | P1 | 有保存值刷新时首帧即为目标主题 |
| FR-T07 | 切换控件键盘可用 | P0 | Tab 可达、Enter/Space 触发、焦点可见、`aria-pressed` 正确 |
| FR-T08 | 主题持久化失败可降级 | P0 | 隐私模式/`file://` 限制下页面正常、无报错、可正常切换（仅不记忆） |
| FR-T09 | 主题切换不打断对局 | P0 | 切换后棋盘历史、当前执子、胜负状态、对局模式、AI 进行中状态均不变 |
| FR-T10 | 三套主题共用同一套语义令牌 | P1 | 令牌完整性测试通过：每套主题声明全部必需令牌 |
| FR-T11 | 主题配置可扩展 | P1 | 新增主题仅需追加一段令牌块 + 注册表一项，渲染层无改动 |

### 5.2 非功能性需求

| 维度 | 要求 |
| --- | --- |
| 兼容性 | Chrome/Edge/Firefox/Safari 最近两个大版本；320px 宽可用；`file://` 可运行 |
| 性能 | 主题切换 repaint < 16ms（仅整盘重绘 + CSS 颜色过渡）；令牌读取每主题一次（缓存） |
| 可访问性 | 文字对比度 ≥ 4.5:1、非文本/焦点 ≥ 3:1（三套主题均校验）；控件有中文可读名称；尊重 `prefers-reduced-motion` |
| 可维护性 | 主题数据只存在于 `styles.css` 一处；`js/theme.js` 不含具体颜色值；`js/ui.js` 不含颜色字面量 |
| 依赖 | 0 第三方依赖、0 网络请求、0 构建步骤 |
| 测试 | 新增 `tests/theme.test.js`，并扩展 `tests/a11y.test.js` 覆盖全部主题；既有 35 例不回归 |

---

## 6. 方案选项与对比

### 6.1 候选方案

| 方案 | 核心思路 | 优点 | 代价 | 结论 |
| --- | --- | --- | --- | --- |
| **A. CSS 变量 + `data-theme` + Canvas 调色板桥接**（推荐） | 所有颜色收敛为 CSS 自定义属性；主题 = 覆盖同一组属性的一组 CSS 块；根元素 `data-theme` 决定生效块；Canvas 用 `getComputedStyle` 读取令牌并缓存 | 单一颜色源；零构建零依赖；首屏无闪烁可做（head 内联脚本先设属性）；既有 `a11y.test.js` 解析方式可平滑扩展；新增主题只加 CSS | Canvas 需 JS 读取令牌并改造绘制函数；`file://` 下主题切换有极小成本 | **采用** |
| B. 多套完整样式表按 `<link disabled>` 切换 | 每套主题一个完整 CSS 文件，切换时启用对应 `<link>` | 主题隔离彻底，CSS 无需变量 | 首屏先加载默认主题再切目标主题 → **不可避免闪烁**；布局/组件规则重复三份，易漂移；`file://` 与本地文件引入虽可行但多文件加载更易失败 | 否 |
| C. 运行时 CSS-in-JS：主题对象同时生成 CSS 变量与 Canvas 调色板 | JS 是唯一数据源，`applyTheme` 时把令牌写成内联 CSS 变量 | 无 FOUC（若脚本在 head）；无 CSS 变量解析成本 | 颜色值全进 JS，可读性与评审性差；CSS 文件与调试工具中看不到主题；现有 CSS 测试需大改；违背景本"颜色属于样式层"的边界 | 否 |
| D. 仅用 `filter: hue-rotate/greyscale` 一键换色 | 给根容器加滤镜 | 改动量极小 | 无法精细控制棋盘/棋子/文字对比度，格子与木纹会被整体染色，暗夜/水墨风格做不出来；可访问性不可控 | 否（作为反例记录） |

### 6.2 方案 A 的内部取舍

| 决策点 | 选项 | 推荐 | 理由 |
| --- | --- | --- | --- |
| 主题触发方式 | `class="theme-xxx"` vs `data-theme="xxx"` | `data-theme` | 语义明确、便于 CSS 属性选择器、对测试解析更稳定 |
| 默认主题存放位置 | `[data-theme="classic"]` 独立块 vs `:root` 直接作为经典主题 | `:root` = 经典木纹（默认/回退） | 无 JS、无 `localStorage`、CSS 变量不支持时自动获得经典主题；既有 `a11y.test.js` 的 `:root` 解析继续有效 |
| Canvas 取色方式 | JS 里再写一份调色板 vs `getComputedStyle` 读取 | 读取 | 避免双源漂移；测试只需校验 CSS |
| 取色时机 | 每次 `draw()` 读取 vs 主题切换时读取并缓存 | 缓存 | 避免每帧解析样式；主题切换时失效重读 |
| 记忆介质 | Cookie / `localStorage` / IndexedDB | `localStorage`（键 `gomoku.theme.v1`） | 同步、简单、无网络；异常可 try/catch 降级 |

---

## 7. 推荐方案设计

### 7.1 架构与数据流

```
┌─────────────────────────────────────────────────────────────┐
│ index.html <head> 内联脚本（防闪烁）：                        │
│   读 localStorage → 校验 → 立刻设置 <html data-theme="...">   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────v─────────────────────────────────┐
│ styles.css                                                   │
│   :root { …经典木纹令牌… }            ← 默认 / 回退 / 无 JS    │
│   [data-theme="midnight"] { …暗夜星空令牌… }                 │
│   [data-theme="ink"]       { …水墨宣纸令牌… }                │
│   组件样式只消费 var(--…)，不含颜色字面量                      │
└───────────────────────────┬─────────────────────────────────┘
                            │ getComputedStyle 读取（每主题一次，缓存）
┌───────────────────────────v─────────────────────────────────┐
│ js/theme.js  GomokuTheme                                     │
│   THEMES 注册表 / initTheme / applyTheme / current / palette │
│   localStorage 读写（try/catch）/ 派发 gomoku:themechange    │
└───────────────┬───────────────────────────┬─────────────────┘
                │ 切换                           │ 事件 + 当前调色板
                v                               v
      切换控件（index.html + styles.css）   js/ui.js（Canvas 绘制消费调色板）
```

**依赖方向**：`ui.js → theme.js`（仅取调色板与订阅事件），`theme.js` 不依赖 `core.js`/`ai.js`/`ui.js`；主题与规则、AI 完全解耦。

### 7.2 主题令牌设计

> 命名原则：令牌按**语义**命名，不按颜色值命名；同一令牌在每套主题中必须给出值；不在 `js/` 中出现颜色字面量。

#### 7.2.1 页面与语义色令牌

| 令牌 | 用途 | 经典木纹（`:root`） | 暗夜星空 | 水墨宣纸 |
| --- | --- | --- | --- | --- |
| `--page-bg` | 页面底色 | `#202634` | `#0b1020` | `#f4efe4` |
| `--page-glow` | 页面顶部氛围光晕 | `#2c3549` | `#16203a` | `#ece5d6` |
| `--panel-bg` | 信息面板底 | `#2a3142` | `#141b2d` | `#fffdf7` |
| `--panel-border` | 面板/次要按钮边框 | `#3b4458` | `#26314a` | `#d5cbb8` |
| `--text` | 主文字 | `#f3f5f9` | `#eaf0ff` | `#2a2620` |
| `--text-muted` | 次要文字/提示 | `#b7c0d2` | `#a8b6d1` | `#6c6457` |
| `--accent` | 焦点环/强调色 | `#4f8cff` | `#8cc8ff` | `#8c2f1e` |
| `--accent-strong` | 主按钮底 | `#2563eb` | `#2563eb` | `#8c2f1e` |
| `--accent-strong-hover` | 主按钮悬停底 | `#1d4ed8` | `#1d4ed8` | `#6f2415` |
| `--danger` | 错误提示文字 | `#ff7875` | `#ff9b9b` | `#a3231b` |
| `--win` | 胜利结果文字 | `#ffd166` | `#ffd166` | `#7d4e00` |
| `--focus-ring-inner` | 按钮内圈焦点环（落在面板底色上） | `#ffffff` | `#ffffff` | `#2a2620`（浅底主题用墨色，白环在宣纸底上不可见，见 §7.7） |
| `--text-on-accent` | 主按钮文字色 | `#ffffff` | `#ffffff` | `#ffffff` |

#### 7.2.2 棋盘与棋子令牌（Canvas 读取）

| 令牌 | 用途 | 经典木纹 | 暗夜星空 | 水墨宣纸 |
| --- | --- | --- | --- | --- |
| `--board-light` | 棋盘渐变亮端 | `#ecc47e` | `#2e405f` | `#e3d5b3` |
| `--board-dark` | 棋盘渐变暗端 | `#d9a95e` | `#1c2942` | `#d3c19a` |
| `--board-shadow` | 棋盘投影 | `rgba(0,0,0,0.38)` | `rgba(0,0,0,0.55)` | `rgba(60,50,30,0.28)` |
| `--board-edge` | 棋盘内描边高光 | `rgba(255,255,255,0.18)` | `rgba(140,200,255,0.22)` | `rgba(255,255,255,0.55)` |
| `--board-grid` | 网格线 | `#6b4f27` | `#8fa9cc` | `#3f382c` |
| `--board-star` | 星位/天元 | `#4a3517` | `#b9cdea` | `#2a241c` |
| `--stone-black-0/1/2` | 黑棋径向渐变三档 | `#7c7c7c` / `#2b2b2b` / `#000000` | `#8a93a8` / `#232a38` / `#05070c` | `#6b6b6b` / `#2b2b2b` / `#000000` |
| `--stone-white-0/1/2` | 白棋径向渐变三档 | `#ffffff` / `#efefef` / `#c5c5c5` | `#ffffff` / `#e6ecf7` / `#b9c6dd` | `#ffffff` / `#f4f1e8` / `#ddd5c3` |
| `--stone-black-edge` | 黑棋描边 | `#000000` | `#aac8ff` | `#000000` |
| `--stone-white-edge` | 白棋描边 | `#6b4f27`（原 `rgba(130,130,130,.75)`，见 §7.7） | `#e8eefb` | `#4a4438` |
| `--win-band` | 胜利五连高亮条 | `rgba(255,209,102,0.45)` | `rgba(255,209,102,0.42)` | `rgba(184,134,43,0.35)` |
| `--last-marker` | 最后落子标记点 | `#d9363e`（原 `#ff4d4f`，见 §7.7） | `#d9363e` | `#c0392b` |
| `--marker-halo` | 最后落子标记外圈光环（黑棋上的可见性） | `#ffffff` | `#ffffff` | `#fffdf7` |
| `--cursor` | 键盘光标框 | `#143f7a`（原 `rgba(79,140,255,.95)`，见 §7.7） | `#8cc8ff` | `#7a2e1e` |
| `--cursor-halo` | 键盘光标外圈描边 | `rgba(255,255,255,0.85)` | `rgba(11,16,32,0.85)` | `rgba(255,253,247,0.9)` |

非主题令牌（三套共用，不进主题块）：`--radius: 12px`、`--theme-transition: 180ms`。

**对比度核算**：上述基线值按 WCAG 2.1 相对亮度公式逐项核算（文字/按钮 ≥4.5:1，焦点/棋盘元素/棋子轮廓 ≥3:1）。实现完成后由 `tests/theme.test.js` 对 `styles.css` 实际值重新计算（结果见附录 A），防止后续调整色值时回归；实现期复核发现「最后落子标记」与「水墨宣纸白色焦点内环」两处基线不达标，已按 §7.7 修正。

#### 7.2.3 主题注册表

```js
// js/theme.js
const THEMES = [
  { id: 'classic',  label: '经典木纹', description: '暖木棋盘 + 深色面板', colorScheme: 'dark'  },
  { id: 'midnight', label: '暗夜星空', description: '深蓝夜空 + 冷色棋盘', colorScheme: 'dark'  },
  { id: 'ink',      label: '水墨宣纸', description: '宣纸底 + 墨色棋盘',   colorScheme: 'light' }
];
```

`id` 同时作为 `data-theme` 取值与 `localStorage` 中保存的值；注册表是"合法主题 id"的唯一白名单。

### 7.3 主题控制器设计（`js/theme.js`）

#### 7.3.1 接口

```js
global.GomokuTheme = {
  STORAGE_KEY, DEFAULT_THEME, EVENT_NAME, // 常量：存储键 / 默认主题 / 事件名
  THEMES,                            // 只读注册表
  CANVAS_TOKENS,                     // Canvas 读取的令牌清单
  resolveInitialTheme(stored),       // 纯函数，可单测：返回合法 id（无保存值 → classic）
  isValidTheme(id),                  // 白名单判断
  init(),                            // 启动：确定初始主题、应用、绑定切换控件（幂等）
  apply(id, options),                // 切换主题：options.persist 默认 true
  current(),                         // 当前主题 id
  palette(),                         // 当前主题的 Canvas 调色板（缓存）
  onChange(callback)                 // 订阅切换事件，返回取消订阅函数
};
```

#### 7.3.2 初始化流程

```
init():
  1. stored = 读 localStorage['gomoku.theme.v1']（try/catch，异常返回 null）
  2. id = resolveInitialTheme(stored)     // Q2：无保存值 → 'classic'
  3. apply(id, { persist: false })        // 内联脚本可能已预置 data-theme，这里幂等对齐
  4. 绑定切换控件按钮事件，按当前 id 初始化 aria-pressed

resolveInitialTheme(stored):
  stored ∈ THEMES.id  → 返回 stored
  否则                → 'classic'        // 首次访问 / 非法值 / 存储不可用
```

> v1.1 变更：按用户对 Q2 的答复，去掉 `prefers-color-scheme` 分支，首次访问固定经典木纹；跟随系统作为 P1 扩展保留在 §13。

#### 7.3.3 切换流程

```
apply(id, { persist = true }):
  1. id 不在白名单 → 返回 false，不改状态
  2. document.documentElement.dataset.theme = id
  3. document.documentElement.style.colorScheme = theme.colorScheme  // 滚动条/原生控件配色
  4. paletteCache 失效（下次 palette() 重新读取）
  5. persist 时写 localStorage（try/catch，失败静默）
  6. 更新控件 aria-pressed / 可读状态文本
  7. 派发 document.dispatchEvent(new CustomEvent('gomoku:themechange', { detail: { id } }))
     → ui.js 收到后刷新调色板并 requestAnimationFrame 重绘
  8. 返回 true
```

**幂等与竞态**：重复 `apply` 同一主题不重复派发事件；AI 思考期间切换主题只触发重绘，不触碰 `aiPending`/计时器（重绘不重建 game 对象）。

#### 7.3.4 Canvas 调色板（`palette()`）

首次调用时 `getComputedStyle(document.documentElement)` 读取 §7.2.2 全部令牌，组装并缓存：

```js
{
  boardLight, boardDark, boardGrid, boardStar,
  stoneBlack: [c0, c1, c2], stoneWhite: [c0, c1, c2],
  stoneBlackEdge, stoneWhiteEdge,
  winBand, lastMarker, cursor, cursorHalo
}
```

`getComputedStyle` 读取自定义属性得到的值可能为 `#rrggbb`、`rgb()`/`rgba()` 等不同书写形式，Canvas 的 `fillStyle`/`strokeStyle` 均可直接接受，无需在 JS 中解析或转换。**约定：`js/theme.js` 中不得出现具体颜色值（自检项）**；若某令牌缺失，读取返回空串，`ui.js` 使用无主题的兜底（透明/黑色）但不应发生——由令牌完整性测试在 CI 前拦截。

### 7.4 切换控件设计（`index.html` + `styles.css`）

#### 7.4.1 结构与位置

放在页面头部右侧，与标题同一行；窄屏自动换行到标题下方：

```html
<header class="app-header">
  <div class="app-title">
    <h1>五子棋</h1>
    <p class="app-subtitle">15×15 · 黑棋先行 · 横竖斜任意方向连成五子即胜</p>
  </div>
  <div class="theme-switcher" role="group" aria-label="场景主题">
    <button type="button" class="theme-option" data-theme-id="classic"  aria-pressed="true">
      <span class="theme-swatch" data-theme-id="classic" aria-hidden="true"></span>经典木纹
    </button>
    <button type="button" class="theme-option" data-theme-id="midnight" aria-pressed="false">
      <span class="theme-swatch" data-theme-id="midnight" aria-hidden="true"></span>暗夜星空
    </button>
    <button type="button" class="theme-option" data-theme-id="ink" aria-pressed="false">
      <span class="theme-swatch" data-theme-id="ink" aria-hidden="true"></span>水墨宣纸
    </button>
  </div>
</header>
```

- 采用**分段按钮组**而非下拉框：主题数量固定为 3、全部选项可同时看到，切换成本最低；读屏可读、键盘 Tab 可达。
- `.theme-swatch` 为 12×12 圆形色块，用两段 `linear-gradient(135deg, …)` 表达主题基调。**实现取舍**：色块预览的是"其他主题"的颜色，无法用当前主题的令牌表达，因此在 `styles.css` 中按 `data-theme-id` 写死三组预览色（该文件内除令牌块外唯一按主题区分的颜色，设计上仍符合"主题数据只存在于 styles.css"）。
- `aria-pressed="true"` 表示当前主题；切换后由 JS 同步更新（不要只依赖 `:focus`）。上面标记为"经典木纹选中"只是**无 JS 时的兜底初值**，实际初始选中项由 `theme.js init()` 按"保存值 → 默认经典木纹"的顺序修正。
- 控件不进入 `aria-live`，避免每次切换都打断读屏；主题变化本身不是对局信息，不需要播报（若需要可 P1 增加 `sr-only` 状态文本，由用户按需开启）。

#### 7.4.2 样式要点

- 按钮最小触控尺寸 32×32px（桌面）/ 44px 高（触屏媒体查询），文字 13px；选中态用 `--accent` 描边 + 令牌底色，不依赖纯颜色区分——选中态同时加粗。
- 焦点环使用 `--accent`，与既有 `.btn:focus-visible` 风格一致。
- 窄屏（< 720px）：`.app-header` 改为纵向排列，`.theme-switcher` 横向铺满并允许换行；不改变既有 `.layout` 单列规则。
- 切换控件高度固定，避免加载/切换时布局抖动。

### 7.5 持久化与首屏无闪烁

`localStorage` 键：`gomoku.theme.v1`（带 `v1` 便于将来迁移；值就是主题 id）。

**防闪烁**：`index.html` 的 `<head>` 中、`<link rel="stylesheet">` **之前** 放一段极小的内联脚本，在首次绘制前给 `<html>` 设置 `data-theme`：

```html
<script>
  (function () {
    var valid = { classic: 1, midnight: 1, ink: 1 };
    var theme = 'classic';
    try {
      var saved = localStorage.getItem('gomoku.theme.v1');
      if (saved && valid[saved]) theme = saved;
    } catch (error) { /* 存储被禁用时使用默认主题 */ }
    document.documentElement.setAttribute('data-theme', theme);
  })();
</script>
```

- 主题 id 白名单在 `theme.js` 与内联脚本各出现一次（不同执行时机，无法共享），这是**唯一允许的重复**，由 `tests/theme.test.js` 校验两处白名单一致，防止漂移。
- 无保存值时内联脚本直接写 `data-theme="classic"`，与 `styles.css` 的 `:root` 一致，并与 `theme.js` 初始化幂等；也符合 Q2"首次访问始终经典木纹"的确认结论。
- 若内联脚本被执行策略拦截（本仓库无 CSP，但保持健壮），`theme.js init()` 仍会在脚本加载后应用主题，只是可能出现一次首屏闪烁，不影响功能。

### 7.6 Canvas 渲染层改造（`js/ui.js`）

| 绘制函数/位置 | 现状 | 改造后 |
| --- | --- | --- |
| `drawGrid` 网格线 | 硬编码 `'#6b4f27'` | `ctx.strokeStyle = app.palette.boardGrid` |
| `drawGrid` 星位 | 硬编码 `'#4a3517'` | `app.palette.boardStar` |
| `drawStone` 黑/白渐变 | 硬编码三档颜色 | 循环使用 `app.palette.stoneBlack` / `stoneWhite` 数组 |
| `drawStone` 描边 | 黑白各一硬编码 rgba | `app.palette.stoneBlackEdge` / `stoneWhiteEdge` |
| `drawWinBand` | `rgba(255,209,102,0.45)` | `app.palette.winBand` |
| `drawLastMarker` | `'#ff4d4f'` 单色圆点 | 双层：`app.palette.markerHalo` 大圆点打底 + `app.palette.lastMarker` 小圆点，保证黑棋上的标记可见 |
| `drawCursor` | `rgba(79,140,255,0.95)` 单层框 | 双层框：先用 `app.palette.cursorHalo` 画 4px 外框，再用 `app.palette.cursor` 画 2px 内框（提升木色/深色棋盘上的可见性） |
| `draw` 触发 | 仅 `requestAnimationFrame` 合并 | 新增强制重绘入口 `refreshPalette()`：`app.palette = GomokuTheme.palette(); scheduleDraw();`，由 `gomoku:themechange` 事件调用 |

`app` 对象新增 `palette` 字段；`init()` 中在首次 `render()` 前初始化调色板。棋盘容器背景渐变、阴影仍由 CSS 负责（`.board-wrap` 消费 `--board-*`），Canvas 只画线与棋子，职责不变。

### 7.7 既有可辨识度问题的顺带修正

设计期用 WCAG 2.1 公式核算现值时发现三处现有实现的对比度低于本设计对各主题的要求（属于"主题令牌化时一并修正"，不扩大功能范围）：

| 元素 | 现状值 | 现值对比度 | 修正后（经典木纹） | 修正后对比度（实现后实测） |
| --- | --- | --- | --- | --- |
| 键盘光标框 | `rgba(79,140,255,.95)` | 对棋盘亮/暗端仅 **1.96:1 / 1.50:1** | `--cursor: #143f7a` + `--cursor-halo` 双层描边 | 对棋盘亮/暗端 **6.31:1 / 4.84:1** |
| 白棋描边 | `rgba(130,130,130,.75)` | 对棋盘暗端 **2.15:1** | `--stone-white-edge: #6b4f27` | 对棋盘亮/暗端 **4.60:1 / 3.53:1** |
| 最后落子标记 | `#ff4d4f` | 对白棋子 **3.00:1**（临界） | `--last-marker` 圆点 + `--marker-halo` 外圈 | 标记/光环 **4.62:1**；光环/黑棋最亮端 **4.17:1** |
| 水墨宣纸按钮焦点内环 | `#ffffff`（设计初值） | 对宣纸面板仅 **1.02:1**（不可见） | `[data-theme="ink"] { --focus-ring-inner: #2a2620 }` | 对宣纸面板 **14.78:1** |

说明：光标框是键盘操作时的焦点/定位指示，属于 WCAG 2.1 SC 1.4.11 非文本对比度范畴；棋子与落子标记是游戏核心视觉信息，一并按 ≥3:1 约束。修正只改颜色令牌与标记绘制层数，不改变形状、尺寸与交互。实现期复核发现设计初值的「最后落子标记对比度」与「水墨宣纸白色焦点内环」不达标，已分别改为双层标记（光环 + 圆点）与浅底主题深色内环，并按实测值更新本表与附录 A。

### 7.8 动效与降级

- 页面 UI 颜色过渡：`transition: background-color var(--theme-transition) ease, border-color …, color …`（只过渡颜色，不过渡尺寸，避免布局抖动）。
- Canvas 不做颜色插值过渡（跨主题插值在深/浅主题间会出现中间态浑浊），切换即整盘重绘，单帧完成。
- `@media (prefers-reduced-motion: reduce) { ':root { --theme-transition: 0ms; } }` 并把过渡全部设为 0。
- 高对比度/强制颜色模式（`forced-colors: active`）：保留主题令牌，棋子改用 `Canvas` 绘制不受强制色影响；控件加 `1px solid ButtonText` 边框保证系统色下仍有轮廓（P2，尽力而为）。

### 7.9 三套主题的视觉基调

| 主题 | 氛围（场景感） | 棋盘 | 棋子 | 强调色与标记 |
| --- | --- | --- | --- | --- |
| 经典木纹 | 暖色室内棋桌：深灰蓝面板 + 顶部微光 | 浅木黄渐变、深棕网格、棕色星位 | 黑白经典渐变，白棋棕色描边 | 蓝 `#2563eb` 主按钮、深蓝光标、朱红落子标记 |
| 暗夜星空 | 深夜对局：近黑蓝底 + 顶部星云微光 | 深蓝灰材质、冷蓝网格、亮蓝星位 | 黑棋带冷蓝高光描边、白棋冷白 | 亮蓝 `#8cc8ff` 焦点/光标，金色胜利高亮 |
| 水墨宣纸 | 书案棋谱：宣纸米白底 + 暖棕面板 | 米黄宣纸、墨色网格、墨色星位 | 墨黑与纸白棋子，白棋墨色描边 | 朱砂 `#8c2f1e` 主按钮/焦点，赭石胜利文字 |

三套主题的差异覆盖：页面底色/氛围、面板、按钮、文字层级、棋盘两档材质色、网格/星位、棋子渐变与描边、最后落子标记、键盘光标、胜利高亮。保证"换主题"是整体场景变化，而非单一强调色变化。

### 7.10 文件变更清单（实现阶段）

| 文件 | 变更类型 | 内容 |
| --- | --- | --- |
| `docs/theme-switching-design.md` | 新增 | 本文档（本次交付） |
| `index.html` | 修改 | `<head>` 内联防闪烁脚本；头部新增 `.app-header` 两栏结构与 `.theme-switcher`；在 `ai.js` 与 `ui.js` 之间引入 `js/theme.js` |
| `styles.css` | 修改 | `:root` 补全全部令牌（含 Canvas 用色），新增 `[data-theme="midnight"]`、`[data-theme="ink"]` 令牌块；组件样式改用 `var()`；`body` 渐变、`.board-wrap`、`.turn-dot`、`.btn:focus-visible` 令牌化；新增切换控件样式与窄屏规则；`prefers-reduced-motion` 块 |
| `js/theme.js` | 新增 | 主题注册表、`resolveInitialTheme`、`init/apply/current/palette/onChange`、`localStorage` 读写与事件派发（约 270 行） |
| `js/ui.js` | 修改 | 引入 `app.palette`，逐函数替换颜色字面量为调色板取值；光标与最后落子标记改为双层绘制；新增 `refreshPalette()` 并通过 `onChange` 触发重绘（其余逻辑不动） |
| `tests/theme.test.js` | 新增 | 主题注册表/初始主题纯函数/令牌完整性/白名单一致性/CSS 令牌覆盖/首屏脚本顺序/三套主题对比度用例（22 例） |
| `tests/a11y.test.js` | 修改 | 复用共享对比度助手，改为按主题作用域解析令牌；既有 D-01 等用例保持语义不变（每例 ×3 套主题） |
| `tests/helpers/contrast.js` | 新增 | 从 `a11y.test.js` 抽出的 CSS 解析 + WCAG 对比度助手（`node:test` 零依赖，`require` 共享） |
| `README.md` | 修改 | 功能列表、目录结构与测试命令补充主题切换 |

**明确不改**：`js/core.js`、`js/ai.js`（规则与 AI 与主题无关）；既有测试用例的断言语义。

---

## 8. 关键决策记录

| 编号 | 决策 | 备选 | 理由 |
| --- | --- | --- | --- |
| D-TH-01 | CSS 变量 + `data-theme` + JS 读令牌 | 多套样式表 / CSS-in-JS / filter 换色 | 见 §6.1，唯一同时满足零构建、无闪烁、可测试、单一颜色源的方案 |
| D-TH-02 | `:root` 直接作为经典木纹主题（默认/回退） | 经典主题也放独立 `[data-theme]` 块 | 保证无 JS、存储失效、旧浏览器时仍有完整外观；沿用既有 `a11y.test.js` 的 `:root` 解析 |
| D-TH-03 | Canvas 颜色由 `getComputedStyle` 读取并缓存 | JS 内置一份调色板 | 避免 CSS 与 JS 双源漂移；主题数据只存于 `styles.css` |
| D-TH-04 | 首次访问（无保存值）**始终默认经典木纹**，用户显式选择后以其保存值为准 | 跟随系统 `prefers-color-scheme` | 用户已确认（Q2）：默认场景固定为经典木纹，行为可预期；跟随系统留作 P1 扩展（§13） |
| D-TH-05 | 主题仅存 `localStorage`（键 `gomoku.theme.v1`） | Cookie / 服务端同步 | 无需网络与后端，符合离线约束 |
| D-TH-06 | 场景感用渐变/线条/配色表达，不引入位图资源 | 背景插画 | 保持零资源、`file://` 稳定、首屏无额外加载；若确需插画见待确认 Q1 |
| D-TH-07 | 主题令牌化同时修正光标/白棋描边/落子标记对比度 | 另行开缺陷任务 | 三者都落在主题令牌边界内，顺手修正成本低，且主题测试可一并守住 |

---

## 9. 验收标准与测试计划

### 9.1 验收标准

| 编号 | 验收项 | 验收方式 |
| --- | --- | --- |
| TH-01 | 三套主题完整可用，切换成套生效（UI + Canvas） | 手工：逐主题截图核对；自动：令牌完整性测试 + Canvas 调色板键完整性 |
| TH-02 | 切换即时生效（<100ms 感知）、不刷新页面 | 手工：观察切换；无整页重载 |
| TH-03 | 刷新后保持上次主题 | 手工：选暗夜→刷新；自动：`resolveInitialTheme` 单测 |
| TH-04 | 首屏无主题闪烁 | 手工：慢速网络/强制重绘下观察首帧；代码审查内联脚本位置 |
| TH-05 | 每套主题声明全部必需令牌 | 自动：`tests/theme.test.js` 令牌完整性用例 |
| TH-06 | 每套主题文字 ≥4.5:1、非文本/焦点 ≥3:1 | 自动：主题对比度用例（复用 WCAG 助手） |
| TH-07 | 键盘可切换，`aria-pressed` 正确 | 手工 Tab/Enter/Space；自动：`tests/theme.test.js` 校验切换控件标记与初始选中项 |
| TH-08 | 存储不可用时正常降级 | 手工：隐私模式/禁用存储；代码审查 try/catch |
| TH-09 | 切换不影响对局状态 | 手工：落子/AI 思考中/终局时切换，核对面板与棋盘历史不变 |
| TH-10 | 既有功能与测试零回归 | 自动：`node --test tests/core.test.js tests/ai.test.js tests/a11y.test.js tests/theme.test.js` 全部通过（70 例；规则/AI 既有 35 例不回归） |
| TH-11 | 无新增依赖/请求/构建，`file://` 可运行 | 手工：断网双击 `index.html`，控制台无报错 |
| TH-12 | `prefers-reduced-motion` 下无过渡动画 | 手工：系统开启减少动态效果后切换 |
| TH-13 | 320px 宽不溢出、切换控件可达 | 手工：开发者工具窄屏 |
| TH-14 | 强制颜色/高对比模式基本可辨识（P2 尽力而为） | 手工：Windows 高对比模式 |

### 9.2 自动化测试设计（`tests/theme.test.js`）

| 编号 | 用例 | 预期 |
| --- | --- | --- |
| T-TH-01 | `resolveInitialTheme('midnight')` | 返回 `'midnight'`（保存值优先） |
| T-TH-02 | `resolveInitialTheme(null)` / `(undefined)` / `('')` | 均返回 `'classic'`（Q2：首次访问默认经典木纹） |
| T-TH-03 | `resolveInitialTheme('unknown')` / 非字符串 | `'classic'`（非法值被忽略） |
| T-TH-04 | 注册表与首屏脚本一致性 | 3 项、id 唯一、含 label/description/colorScheme；内联白名单一致；存储键一致；无 `prefers-color-scheme`；切换控件覆盖全部主题且初始仅一项 `aria-pressed="true"` |
| T-TH-05 | 令牌完整性 | 每个主题块（含 `:root`）声明 §7.2 全部必需令牌；主题块覆盖页面/棋盘关键令牌而非单一强调色 |
| T-TH-06 | 文本与按钮文字对比度 | 三套主题的正文/次要文字/按钮白字/错误/胜利文字均 ≥4.5:1 |
| T-TH-07 | 主题差异覆盖 | 暗夜星空、水墨宣纸与经典木纹相比，页面、面板、棋盘、棋子、光标等 ≥8 个令牌不同 |
| T-TH-08 | 焦点与棋盘非文本对比度 | `--accent` 对页面/面板、`--cursor` 对棋盘两档、`--board-grid`、`--board-star`、`--stone-*-edge`、落子标记/光环、光环/黑棋均 ≥3:1 |
| T-TH-09 | 颜色源唯一性 | `js/ui.js`、`js/theme.js` 中不出现颜色字面量（`#rgb/#rrggbb/rgb()/rgba()/hsl()`） |
| T-TH-10 | 兜底可用 | `:root` 覆盖全部必需令牌（无 JS/无主题属性时页面完整） |
| T-TH-11 | Canvas 调色板桥接 | `GomokuTheme.CANVAS_TOKENS` 与设计清单一致，`readPalette()` 读取的令牌与清单一一对应 |
| T-TH-12 | 首屏与脚本顺序 | 设置 `data-theme` 的内联脚本位于 `<link rel="stylesheet">` 之前；`theme.js` 先于 `ui.js` 加载 |

> 说明：对比度计算与 CSS 解析复用 `tests/helpers/contrast.js`；`tests/a11y.test.js` 同样改为按主题作用域解析令牌，既有 D-01 等用例保持语义不变、每例在三套主题下各跑一遍。

### 9.3 手工验收清单（浏览器）

1. 双击 `index.html`（`file://`）：默认主题正确、控制台无报错、无闪烁。
2. 依次切换三套主题：页面所有区域与棋盘、棋子、标记、光标一致变化，无旧颜色残留。
3. 选暗夜星空后刷新：首屏直接是暗夜星空，无经典木纹闪现。
4. 清除 `localStorage` 后刷新：回到默认经典木纹（Q2 已确认，不跟随系统深浅色）。
5. 落子若干（含人机模式 AI 思考中）后切换主题：手数、当前执子、结果提示、模式不变；AI 正常落子。
6. 终局后切换主题：胜利高亮条与结果文字颜色成套变化。
7. 键盘：Tab 到切换控件，Enter/Space 切换，焦点环清晰；`aria-pressed` 随选中变化。
8. 隐私模式/禁用站点数据：切换正常、无报错（不记忆）。
9. 缩到 320px 宽：切换控件换行不溢出，棋盘仍为正圆/正方形且可落子。
10. 系统开启"减少动态效果"：切换无过渡动画。
11. 断网后重复 1–2：功能不受影响（无任何网络请求）。

### 9.4 回归策略

- `js/core.js`、`js/ai.js` 不修改，既有 `core.test.js`、`ai.test.js` 必须原样通过。
- `tests/a11y.test.js` 原有断言语义不变；仅解析范围从"`:root`"扩展到"主题作用域"，默认主题的期望值不变。
- 每次新增主题或调整色值，必须同时通过 T-TH-05 ~ T-TH-08，否则不得合并。

---

## 10. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
| --- | --- | --- | --- |
| 主题色改动导致对比度不达标 | 可访问性回归、被验收打回 | 中 | 每套主题强制跑对比度测试；改色必须同时跑 `tests/theme.test.js` |
| `js/ui.js` 硬编码颜色漏改 | 切换后棋盘残留旧色，视觉割裂 | 中 | T-TH-09 静态扫描 + 手工逐主题核对（手工清单第 2 项） |
| 首屏闪烁 | 体验瑕疵 | 中 | `<head>` 内联脚本在样式表前设置 `data-theme`；手工清单第 1、3 项验证 |
| `file://` 下 `localStorage` 受限 | 主题不记忆 | 低 | try/catch 静默降级；功能不受影响；手工清单第 8 项验证 |
| 主题白名单两处（内联脚本/theme.js）漂移 | 保存的主题值被误判 | 低 | T-TH-04 校验两处白名单一致；主题 id 变更需同步修改 |
| CSS 解析测试在新增主题块后失效 | 测试假阴性/假阳性 | 中 | 主题块保持扁平规则、选择器唯一；共享助手只解析令牌声明 |
| 主题切换引发重绘抖动 | 体验卡顿 | 低 | 颜色过渡仅作用于颜色属性；Canvas 单帧重绘；切换时读取令牌仅一次并缓存 |
| 场景期望偏差（用户要插画场景） | 方案方向错误 | 低 | 列为待确认 Q1；设计已把场景感限制在配色/材质维度，可低成本转向 |
| 色觉障碍用户区分困难 | 可访问性不足 | 低 | 黑白棋子靠明度差 + 描边轮廓区分，不只靠色相；主题间整体明度差异明显 |

---

## 11. 里程碑与排期

| 里程碑 | 内容 | 交付物 | 预估 |
| --- | --- | --- | --- |
| M1 | 设计文档 | 本文档（待评审） | 0.5 天 |
| M2 | 颜色令牌化 + 主题控制器 + 测试助手 | `styles.css` 令牌块、`js/theme.js`、`tests/helpers/contrast.js`、`tests/theme.test.js`，T-TH-01~08 通过 | 1 天 |
| M3 | 切换控件 + 首屏脚本 + 持久化 + Canvas 适配 | `index.html`、`styles.css` 控件样式、`js/ui.js` 调色板化，手工清单 1–8 通过 | 1 天 |
| M4 | 三套主题调色打磨 + 动效/降级 + 全量验收 | 三套主题视觉定稿、手工清单 1–11 通过、既有测试全绿 | 1 天 |

合计约 3.5 个工作日；M1 评审通过后进入 M2，M2/M3 可顺序推进。**v1.1 已按 M1–M4 完成实现与自动化验收（见 §14）。**

---

## 12. 待确认问题（已全部确认，结论回填）

| 编号 | 问题 | 影响 | 用户结论（2026-10-22） |
| --- | --- | --- | --- |
| Q1 | "不同风格的场景"是否确认为**配色/材质型主题**（经典木纹、暗夜星空、水墨宣纸）？若期望具象插画场景（森林/海滩/星空图），需引入本地图片资源，会改变"零资源、零网络"约束 | 决定 M2/M3 的工作量与资源策略 | **已确认**：是配色主题，**不引入图片资源**；按配色/材质型主题实现（A-01） |
| Q2 | 首次访问（无保存值）是否跟随系统深/浅色偏好？还是始终默认经典木纹？ | 影响 `resolveInitialTheme` 与内联脚本 | **已确认**：默认 **经典木纹**；不跟随系统偏好（D-TH-04、FR-T05） |
| Q3 | 主题是否需要影响**棋子材质**（黑白棋子渐变/描边）？还是只换页面 UI 与棋盘底色？ | 影响 Canvas 令牌范围与实现量 | **已确认**：**会影响**棋子材质；按完整场景主题实现（含棋盘、棋子、标记、光标） |

---

## 13. 后续扩展（非本期）

1. **自定义主题**：用户自选强调色/棋盘色，生成并保存为个人主题（需颜色校验器保证对比度）。
2. **更多场景**：樱花、森林、赛博霓虹等主题包；以同一令牌集扩展，新增一项注册 + 一段 CSS 块。
3. **跟随系统实时切换**：监听 `matchMedia('(prefers-color-scheme)')` 变化，在用户未显式选择时自动跟随。
4. **资源型主题**：如需背景插画，先评估引入本地图片对首屏与 `file://` 的影响，并增加资源缺失降级。
5. **主题无障碍增强**：高对比主题（黑白纯色）、色觉友好主题、`forced-colors` 完整适配。
6. **主题与对局记录**：复盘回放时保留当时主题（低优先级，仅视觉记录）。

---

## 14. 实现与验收记录（v1.1）

### 14.1 实现文件

| 文件 | 状态 | 说明 |
| --- | --- | --- |
| `index.html` | 修改 | `<head>` 防闪烁内联脚本；`.app-header` 两栏结构与三按钮 `.theme-switcher`；脚本顺序 `core → ai → theme → ui` |
| `styles.css` | 修改 | `:root` 经典木纹全量令牌 + `[data-theme="midnight"]` / `[data-theme="ink"]` 覆盖块；组件颜色全部改为 `var()`；切换控件样式、窄屏规则、颜色过渡与 `prefers-reduced-motion` 降级 |
| `js/theme.js` | 新增 | 主题注册表、`resolveInitialTheme`、`init/apply/current/palette/onChange`、`localStorage` 持久化与降级、`gomoku:themechange` 事件 |
| `js/ui.js` | 修改 | `app.palette` 桥接；网格/星位/棋子/胜利条/落子标记/光标全部改为调色板取值；光标与落子标记双层绘制；主题事件触发调色板失效与重绘 |
| `tests/helpers/contrast.js` | 新增 | CSS 声明解析、`var()` 展开、WCAG 2.1 对比度计算（零依赖） |
| `tests/theme.test.js` | 新增 | T-TH-01 ~ T-TH-12 |
| `tests/a11y.test.js` | 修改 | 复用共享助手，按主题作用域校验 |
| `README.md` | 修改 | 功能列表、目录结构、测试命令 |
| `js/core.js`、`js/ai.js` | 未改 | 规则与 AI 与主题无关，既有测试原样通过 |

### 14.2 自动化验证结果

- 全量测试：`node --test tests/core.test.js tests/ai.test.js tests/a11y.test.js tests/theme.test.js` → **70 例全部通过，0 失败**。
  - `core.test.js` 18 例、`ai.test.js` 11 例：未改动的既有规则/AI 用例。
  - `a11y.test.js` 21 例：原有 D-01 等 7 组断言语义不变，各在三套主题下执行。
  - `theme.test.js` 20 例：T-TH-01 ~ T-TH-12，含令牌完整性、三套主题对比度、颜色源唯一性、白名单/首屏脚本/加载顺序。
- 浏览器端到端实测（Chrome Headless + DevTools Protocol，直接打开 `file://` 下的真实 `index.html`）：
  - 首访：`data-theme=classic`、`aria-pressed` 正确、`--page-bg=#202634`、`--board-light=#ecc47e`。
  - 点击棋盘落子后切换水墨宣纸：`data-theme=ink`、`--page-bg=#f4efe4`、`--board-light=#e3d5b3`；Canvas 落子标记像素由 `#d9363e` 变为 `#c0392b`（说明调色板已重读、棋盘已重绘）；`aria-pressed` 同步；`localStorage['gomoku.theme.v1']=ink`。
  - 切换前后对局手数（1 手）与状态（`playing`）不变。
  - 刷新后：`GomokuTheme.current()=ink`、`data-theme=ink`，与首屏内联脚本一致（主题记忆生效）。
  - 全程无页面异常（`Runtime.exceptionThrown` 为空）。

### 14.3 仍需人工确认的验收项

- §9.3 手工清单中的键盘 Tab/Enter/Space、320px 窄屏、`prefers-reduced-motion`、隐私模式禁用存储、Windows 强制颜色模式需在真实浏览器交互确认；其余项已由自动化测试或上述端到端脚本覆盖。
- Q1–Q3 已全部确认，无剩余待决策问题。

### 14.4 与 v1.0 设计基线的差异（均有说明）

1. **默认主题**：按 Q2 去掉 `prefers-color-scheme` 分支，首次访问固定经典木纹。
2. **新增令牌**：`--text-on-accent`（主按钮文字色）、`--marker-halo`（落子标记光环）；三套主题各声明 32 个主题令牌。
3. **可辨识度修正**：最后落子标记改为「光环 + 圆点」双层绘制；水墨宣纸 `--focus-ring-inner` 由 `#ffffff` 改为 `#2a2620`，否则白色焦点环在宣纸面板上不可见（见 §7.7）。
4. **切换控件色块**：`.theme-swatch` 预览色按主题 id 写在 `styles.css`（其他主题颜色无法用当前主题的令牌表达），`js/` 中仍无颜色字面量。

---

## 附录 A：三套主题对比度实测结果

计算方式：WCAG 2.1 相对亮度公式 `(L1+0.05)/(L2+0.05)`。下表为 v1.1 实现完成后，由 `tests/theme.test.js` 对 `styles.css` 实际声明值逐项复核的结果（与测试使用同一公式）；棋盘相关项取棋盘渐变两档中较低值，保证两端都满足。

| 检查项（前景 / 背景） | 要求 | 经典木纹 | 暗夜星空 | 水墨宣纸 |
| --- | --- | --- | --- | --- |
| 正文 / 面板 | ≥4.5 | 11.90:1 | 15.03:1 | 14.78:1 |
| 正文 / 页面 | ≥4.5 | 13.86:1 | 16.59:1 | 13.11:1 |
| 次要文字 / 面板 | ≥4.5 | 7.10:1 | 8.39:1 | 5.74:1 |
| 主按钮白字 / 按钮底 | ≥4.5 | 5.17:1 | 5.17:1 | 8.27:1 |
| 主按钮白字 / 悬停底 | ≥4.5 | 6.70:1 | 6.70:1 | 10.83:1 |
| 错误提示 / 页面 | ≥4.5 | 5.90:1 | 9.39:1 | 6.51:1 |
| 胜利文字 / 页面 | ≥4.5 | 10.49:1 | 13.13:1 | 6.18:1 |
| 焦点环 / 页面 | ≥3 | 4.70:1 | 10.66:1 | 7.21:1 |
| 键盘光标 / 棋盘（两档取低） | ≥3 | 4.84:1 | 5.87:1 | 5.30:1 |
| 网格线 / 棋盘（两档取低） | ≥3 | 3.53:1 | 4.33:1 | 6.54:1 |
| 星位 / 棋盘（两档取低） | ≥3 | 5.40:1 | 6.44:1 | 8.68:1 |
| 白棋描边 / 棋盘（两档取低） | ≥3 | 3.53:1 | 8.96:1 | 5.45:1 |
| 黑棋描边 / 棋盘（两档取低） | ≥3 | 9.79:1 | 6.16:1 | 11.86:1 |
| 最后落子标记 / 标记光环 | ≥3 | 4.62:1 | 4.62:1 | 5.35:1 |
| 标记光环 / 黑棋最亮端 | ≥3 | 4.17:1 | 3.08:1 | 5.24:1 |

结论：三套主题实测全部满足设计约束（文字 ≥4.5:1、非文本与焦点 ≥3:1），由 `tests/theme.test.js` 持续守住；后续调整任何色值必须重新通过该测试。

---

## 附录 B：术语

| 术语 | 含义 |
| --- | --- |
| 主题令牌（design token） | 以语义命名的 CSS 自定义属性，主题通过覆盖同一组令牌实现换肤 |
| `data-theme` | 挂在 `<html>` 上的属性，取值对应主题 id，用于选择生效的令牌块 |
| FOUC | 首屏闪烁：样式/主题在首次绘制后才生效导致的短暂错误外观 |
| 调色板（palette） | Canvas 绘制所需的令牌集合，由 `theme.js` 从计算样式读取并提供给 `ui.js` |
| 对比度 | WCAG 2.1 定义的前景/背景相对亮度比，普通文字要求 ≥4.5:1，非文本 UI 与焦点要求 ≥3:1 |
