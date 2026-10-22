# kanbantest
# dsh-wpsai-test

## 五子棋游戏

按 [docs/gomoku-design.md](docs/gomoku-design.md) 完成的 15×15 五子棋：原生 HTML + CSS + JavaScript，
零第三方运行时依赖、零构建，双击 `index.html` 即可游玩。

多场景主题切换的设计方案见 [docs/theme-switching-design.md](docs/theme-switching-design.md)
（当前仅交付设计文档，主题功能尚未实现）。

### 快速开始

1. 双击 `index.html`（`file://` 直接打开，无需本地服务器、无需安装依赖）。
2. 默认本地双人对战，黑棋先行；点击右侧"切换人机对战"可与简单 AI 对战（玩家执黑）。

### 已实现功能

- 15×15 棋盘与星位渲染，Canvas 2D，高分屏 `devicePixelRatio` 缩放、窗口尺寸自适应。
- 黑白交替落子；横、竖、主对角线、副对角线任一方向连续 ≥5 子判胜（无禁手，长连亦判胜）。
- 棋盘下满且无人五连判平局；最后落子红色标记；胜利五连半透明高亮。
- 悔棋（支持终局后悔棋继续对局，人机模式自动回退 AI 一步）、重新开始、模式切换。
- 状态面板：当前执子、已落子手数、对局状态、对局模式。
- 简单 AI（P1）：候选点裁剪 + 棋型启发式评分，含"己方成五直接下 / 对方成五必须堵"短路规则。
- 悬停预落子、键盘操作（方向键移动光标、回车/空格落子）与 `aria-live` 读屏提示。
- 完全离线，不访问网络。

### 目录结构

```
.
├── index.html          # 页面骨架，按 core → ai → ui 顺序引入脚本
├── styles.css          # 布局、面板、按钮、响应式
├── js/
│   ├── core.js         # 规则层：棋盘、落子、胜负/平局、悔棋、重置
│   ├── ai.js           # 简单 AI：候选点生成与棋型评分
│   └── ui.js           # 表现层：Canvas 绘制、事件、状态面板
├── tests/
│   ├── core.test.js    # 规则层单测（设计文档 T-01 ~ T-18）
│   ├── ai.test.js      # AI 行为与性能单测
│   └── a11y.test.js    # 颜色对比度单测（设计文档 §2.2）
├── docs/
│   ├── gomoku-design.md            # 五子棋开发设计文档
│   └── theme-switching-design.md   # 主题切换设计文档（待实现）
└── README.md
```

### 测试

```sh
node --test tests/core.test.js tests/ai.test.js tests/a11y.test.js
```

需要 Node.js ≥ 18（使用内置 `node:test`），无需 `npm install`。

### 约定与取舍

- 规则层 `js/core.js` 为纯逻辑实现，不读写 DOM、不依赖时间、不使用随机数，可被 Node 直接 `require` 单测。
- 采用 UMD 风格经典脚本而非 ES Modules：`file://` 下浏览器禁止加载 module，双击即玩优先。
- 设计文档中 P2 的"本地保存对局"（FR-11，localStorage）未实现，属于可选增强项，见文档 13 节扩展规划。
