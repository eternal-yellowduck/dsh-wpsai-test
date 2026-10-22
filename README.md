# kanbantest
# dsh-wpsai-test

## 五子棋游戏

按 [docs/gomoku-design.md](docs/gomoku-design.md) 完成的 15×15 五子棋：原生 HTML + CSS + JavaScript，
零第三方运行时依赖、零构建，双击 `index.html` 即可游玩。

多场景主题切换的实现方案与验收记录见 [docs/theme-switching-design.md](docs/theme-switching-design.md)：
支持 **经典木纹（默认）/ 暗夜星空 / 水墨宣纸** 三套配色型场景主题，切换即时生效、刷新后记住选择。

### 快速开始

1. 双击 `index.html`（`file://` 直接打开，无需本地服务器、无需安装依赖）。
2. 默认本地双人对战，黑棋先行；点击右侧"切换人机对战"可与简单 AI 对战（玩家执黑）。
3. 页面右上角可在 **经典木纹 / 暗夜星空 / 水墨宣纸** 之间切换场景主题，选择保存在浏览器本地。

### 已实现功能

- 15×15 棋盘与星位渲染，Canvas 2D，高分屏 `devicePixelRatio` 缩放、窗口尺寸自适应。
- 黑白交替落子；横、竖、主对角线、副对角线任一方向连续 ≥5 子判胜（无禁手，长连亦判胜）。
- 棋盘下满且无人五连判平局；最后落子红色标记；胜利五连半透明高亮。
- 悔棋（支持终局后悔棋继续对局，人机模式自动回退 AI 一步）、重新开始、模式切换。
- 状态面板：当前执子、已落子手数、对局状态、对局模式。
- 简单 AI（P1）：候选点裁剪 + 棋型启发式评分，含"己方成五直接下 / 对方成五必须堵"短路规则。
- 悬停预落子、键盘操作（方向键移动光标、回车/空格落子）与 `aria-live` 读屏提示。
- 三套场景主题（经典木纹 / 暗夜星空 / 水墨宣纸）：页面、面板、按钮、棋盘材质、棋子渐变与描边、最后落子标记、键盘光标成套切换；Canvas 颜色从 CSS 令牌读取，避免双源漂移。
- 主题切换即时生效、首屏无闪烁（`<head>` 内联脚本先设 `data-theme`）、刷新后记住选择（`localStorage`，存储不可用时静默降级）。
- 每套主题的文字与焦点/棋盘元素对比度由自动化测试守住（文字 ≥4.5:1、非文本 ≥3:1）。
- 完全离线，不访问网络。

### 目录结构

```
.
├── index.html          # 页面骨架，按 core → ai → theme → ui 顺序引入脚本
├── styles.css          # 布局、面板、按钮、响应式 + 三套主题令牌块
├── js/
│   ├── core.js         # 规则层：棋盘、落子、胜负/平局、悔棋、重置
│   ├── ai.js           # 简单 AI：候选点生成与棋型评分
│   ├── theme.js        # 主题控制器：注册表、切换、持久化、Canvas 调色板、事件
│   └── ui.js           # 表现层：Canvas 绘制、事件、状态面板
├── tests/
│   ├── core.test.js    # 规则层单测（设计文档 T-01 ~ T-18）
│   ├── ai.test.js      # AI 行为与性能单测
│   ├── a11y.test.js    # 三套主题的颜色对比度单测（设计文档 §2.2）
│   ├── theme.test.js   # 主题令牌完整性/初始主题/颜色源唯一性/首屏脚本单测
│   └── helpers/
│       └── contrast.js # CSS 令牌解析与 WCAG 2.1 对比度计算助手
├── docs/
│   ├── gomoku-design.md            # 五子棋开发设计文档
│   └── theme-switching-design.md   # 主题切换设计文档（已实现，含验证记录）
└── README.md
```

### 测试

```sh
node --test tests/core.test.js tests/ai.test.js tests/a11y.test.js tests/theme.test.js
```

需要 Node.js ≥ 18（使用内置 `node:test`），无需 `npm install`。

### 约定与取舍

- 规则层 `js/core.js` 为纯逻辑实现，不读写 DOM、不依赖时间、不使用随机数，可被 Node 直接 `require` 单测。
- 采用 UMD 风格经典脚本而非 ES Modules：`file://` 下浏览器禁止加载 module，双击即玩优先。
- 设计文档中 P2 的"本地保存对局"（FR-11，localStorage）未实现，属于可选增强项，见文档 13 节扩展规划。
- 主题颜色只存在于 `styles.css` 的主题令牌块（`:root` 为经典木纹，`[data-theme="midnight"]` / `[data-theme="ink"]` 覆盖同名令牌）；`js/` 中不出现颜色字面量，Canvas 调色板由 `js/theme.js` 从计算样式读取并缓存，由 `tests/theme.test.js` 静态扫描守住。
- 主题选择保存在 `localStorage['gomoku.theme.v1']`；首次访问（或清除站点数据后）默认经典木纹，不跟随系统深浅色偏好（任务 Q2 用户确认）。主题只影响视觉，不改变对局规则、AI 行为或对局状态。
