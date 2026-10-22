/**
 * 可访问性（颜色对比度）测试：node --test tests/a11y.test.js。
 * 依据 docs/gomoku-design.md §2.2「颜色对比度 ≥ 4.5:1」与 docs/theme-switching-design.md §9。
 * 直接读取 styles.css 的实际颜色值并按 WCAG 2.1 计算对比度，
 * 覆盖 D-01（主按钮白字）的正常/悬停/焦点态、次要按钮、常规文本与主题切换控件；
 * 三套场景主题（经典木纹 / 暗夜星空 / 水墨宣纸）各自校验一遍，防止换肤导致对比度回归。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  readStyles,
  declarationsOf,
  themeTokens,
  assertContrast,
  colorTokenOf,
  MIN_TEXT_CONTRAST,
  MIN_UI_CONTRAST
} = require('./helpers/contrast');

const CSS = readStyles();
const THEME_IDS = ['classic', 'midnight', 'ink'];

const btn = declarationsOf(CSS, '.btn');
const btnHover = declarationsOf(CSS, '.btn:not(.btn-ghost):hover:not(:disabled)');
const btnGhost = declarationsOf(CSS, '.btn-ghost');
const btnGhostHover = declarationsOf(CSS, '.btn-ghost:hover:not(:disabled)');
const btnFocus = declarationsOf(CSS, '.btn:focus-visible');
const boardFocus = declarationsOf(CSS, '.board:focus-visible');
const themeOption = declarationsOf(CSS, '.theme-option');
const themeOptionPressed = declarationsOf(CSS, '.theme-option[aria-pressed="true"]');
const themeOptionFocus = declarationsOf(CSS, '.theme-option:focus-visible');

/** 每个用例在三套主题下各跑一遍：tokens 为该主题生效的令牌集合。 */
function forEachTheme(name, run) {
  for (const themeId of THEME_IDS) {
    test(`${name} [${themeId}]`, () => run(themeTokens(CSS, themeId)));
  }
}

forEachTheme('D-01 主按钮（.btn）文字对比度 ≥ 4.5:1', (tokens) => {
  assertContrast('主按钮文字', btn.color, btn.background, MIN_TEXT_CONTRAST, tokens);
});

forEachTheme('D-01 主按钮悬停态文字对比度 ≥ 4.5:1', (tokens) => {
  assertContrast('主按钮悬停态文字', btn.color, btnHover.background, MIN_TEXT_CONTRAST, tokens);
});

forEachTheme('次要按钮（.btn-ghost）文字对比度 ≥ 4.5:1', (tokens) => {
  // .btn-ghost 背景为 transparent，实际透出所在的 .info-area 面板底色。
  assertContrast('次要按钮文字', btnGhost.color, 'var(--panel-bg)', MIN_TEXT_CONTRAST, tokens);
});

forEachTheme('次要按钮悬停态保持透明背景，并以边框色提示悬停', (tokens) => {
  // 悬停规则未声明 background 时沿用 .btn-ghost 的 transparent，不应被主按钮悬停底色覆盖。
  const hoverBackground = btnGhostHover.background === undefined
    ? 'transparent'
    : btnGhostHover.background.trim();
  assert.equal(hoverBackground, 'transparent', `.btn-ghost:hover 背景应为 transparent，实际为：${hoverBackground}`);
  assertContrast('次要按钮悬停边框', btnGhostHover['border-color'], 'var(--panel-bg)', MIN_UI_CONTRAST, tokens);
});

forEachTheme('焦点指示（非文本）对比度 ≥ 3:1', (tokens) => {
  const btnOutlineColor = colorTokenOf(btnFocus.outline);
  assert.ok(btnOutlineColor, `.btn:focus-visible 的 outline 找不到颜色：${btnFocus.outline}`);
  assertContrast('主按钮焦点环', btnOutlineColor, 'var(--panel-bg)', MIN_UI_CONTRAST, tokens);

  const boardOutlineColor = colorTokenOf(boardFocus.outline);
  assert.ok(boardOutlineColor, `.board:focus-visible 的 outline 找不到颜色：${boardFocus.outline}`);
  assertContrast('棋盘焦点环', boardOutlineColor, 'var(--page-bg)', MIN_UI_CONTRAST, tokens);
});

forEachTheme('常规文本颜色对比度 ≥ 4.5:1（回归）', (tokens) => {
  const textCases = [
    ['页面副标题', '.app-subtitle', 'var(--page-bg)'],
    ['操作提示', '.tips', 'var(--panel-bg)'],
    ['状态键名', '.info-item dt', 'var(--panel-bg)'],
    ['错误提示', '.message.is-error', 'var(--page-bg)'],
    ['结果提示', '.message.is-result', 'var(--page-bg)']
  ];
  for (const [description, selector, background] of textCases) {
    assertContrast(description, declarationsOf(CSS, selector).color, background, MIN_TEXT_CONTRAST, tokens);
  }
});

forEachTheme('主题切换控件文字与焦点对比度', (tokens) => {
  assertContrast('切换控件文字', themeOption.color, 'var(--page-bg)', MIN_TEXT_CONTRAST, tokens);
  assertContrast('切换控件选中边框', themeOptionPressed['border-color'], 'var(--page-bg)', MIN_UI_CONTRAST, tokens);
  const focusColor = colorTokenOf(themeOptionFocus.outline);
  assert.ok(focusColor, `.theme-option:focus-visible 的 outline 找不到颜色：${themeOptionFocus.outline}`);
  assertContrast('切换控件焦点环', focusColor, 'var(--page-bg)', MIN_UI_CONTRAST, tokens);
});
