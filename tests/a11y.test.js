/**
 * 可访问性（颜色对比度）测试：node --test tests/a11y.test.js。
 * 依据 docs/gomoku-design.md §2.2「颜色对比度 ≥ 4.5:1」。
 * 直接读取 styles.css 的实际颜色值并按 WCAG 2.1 计算对比度，
 * 覆盖 D-01（主按钮白字）的正常/悬停/焦点态，以及次要按钮与常规文本，防止回归。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS = fs
  .readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ''); // 注释中含颜色值与冒号，先剔除再解析声明

const MIN_TEXT_CONTRAST = 4.5; // WCAG 2.1 SC 1.4.3 普通文本
const MIN_UI_CONTRAST = 3; // WCAG 2.1 SC 1.4.11 非文本（焦点指示等）

/** 提取选择器对应的声明块（styles.css 为扁平规则，选择器唯一）。 */
function declarationsOf(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`);
  const match = CSS.match(pattern);
  assert.ok(match, `styles.css 中找不到选择器「${selector}」`);
  const declarations = {};
  for (const part of match[1].split(';')) {
    const separator = part.indexOf(':');
    if (separator === -1) continue;
    declarations[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return declarations;
}

const ROOT = declarationsOf(':root');

/** 展开 var(--x) 引用，返回最终 CSS 值。 */
function resolve(value, depth = 0) {
  assert.ok(depth < 10, `var() 展开层级过深：${value}`);
  return value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, name) => {
    assert.ok(ROOT[name], `styles.css 中未定义变量 ${name}`);
    return resolve(ROOT[name], depth + 1);
  });
}

/** 把 #rgb / #rrggbb / rgb() 解析为 [r, g, b]；无法解析（如 transparent）返回 null。 */
function parseColor(value) {
  const color = resolve(value).trim();
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3
      ? hex[1].split('').map((char) => char + char).join('')
      : hex[1];
    return [0, 2, 4].map((index) => parseInt(digits.slice(index, index + 2), 16));
  }
  const rgb = color.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    return rgb[1].split(',').map((part) => parseFloat(part.trim())).slice(0, 3);
  }
  return null;
}

function linearize(channel) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG 2.1 相对亮度对比度（返回值范围 1~21）。 */
function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function colorOf(cssValue, description) {
  const color = parseColor(cssValue);
  assert.ok(color, `${description} 的颜色无法解析：${cssValue}`);
  return color;
}

/** 断言「前景色 / 背景色」达到指定对比度，失败信息带实际比值。 */
function assertContrast(description, foregroundValue, backgroundValue, minimum) {
  const foreground = colorOf(foregroundValue, `${description}前景`);
  const background = colorOf(backgroundValue, `${description}背景`);
  const ratio = contrastRatio(foreground, background);
  assert.ok(
    ratio >= minimum,
    `${description} 对比度 ${ratio.toFixed(2)}:1 低于要求 ${minimum}:1`
  );
}

const btn = declarationsOf('.btn');
const btnHover = declarationsOf('.btn:not(.btn-ghost):hover:not(:disabled)');
const btnGhost = declarationsOf('.btn-ghost');
const btnGhostHover = declarationsOf('.btn-ghost:hover:not(:disabled)');
const btnFocus = declarationsOf('.btn:focus-visible');
const boardFocus = declarationsOf('.board:focus-visible');

test('D-01 主按钮（.btn）文字对比度 ≥ 4.5:1', () => {
  assertContrast('主按钮文字', btn.color, btn.background, MIN_TEXT_CONTRAST);
});

test('D-01 主按钮悬停态文字对比度 ≥ 4.5:1', () => {
  assertContrast('主按钮悬停态文字', btn.color, btnHover.background, MIN_TEXT_CONTRAST);
});

test('次要按钮（.btn-ghost）文字对比度 ≥ 4.5:1', () => {
  // .btn-ghost 背景为 transparent，实际透出所在的 .info-area 面板底色。
  assertContrast('次要按钮文字', btnGhost.color, 'var(--panel-bg)', MIN_TEXT_CONTRAST);
});

test('次要按钮悬停态保持透明背景，并以边框色提示悬停', () => {
  // 悬停规则未声明 background 时沿用 .btn-ghost 的 transparent，不应被主按钮悬停底色覆盖。
  const hoverBackground = btnGhostHover.background === undefined
    ? 'transparent'
    : resolve(btnGhostHover.background).trim();
  assert.equal(hoverBackground, 'transparent', `.btn-ghost:hover 背景应为 transparent，实际为：${hoverBackground}`);
  assertContrast('次要按钮悬停边框', btnGhostHover['border-color'], 'var(--panel-bg)', MIN_UI_CONTRAST);
});

test('焦点指示（非文本）对比度 ≥ 3:1', () => {
  const btnOutlineColor = btnFocus.outline.split(/\s+/).find((token) => /^(#|rgb|var\()/i.test(token));
  assert.ok(btnOutlineColor, `.btn:focus-visible 的 outline 找不到颜色：${btnFocus.outline}`);
  assertContrast('主按钮焦点环', btnOutlineColor, 'var(--panel-bg)', MIN_UI_CONTRAST);

  const boardOutlineColor = boardFocus.outline.split(/\s+/).find((token) => /^(#|rgb|var\()/i.test(token));
  assert.ok(boardOutlineColor, `.board:focus-visible 的 outline 找不到颜色：${boardFocus.outline}`);
  assertContrast('棋盘焦点环', boardOutlineColor, 'var(--page-bg)', MIN_UI_CONTRAST);
});

test('常规文本颜色对比度 ≥ 4.5:1（回归）', () => {
  const textCases = [
    ['页面副标题', '.app-subtitle', 'var(--page-bg)'],
    ['操作提示', '.tips', 'var(--panel-bg)'],
    ['状态键名', '.info-item dt', 'var(--panel-bg)'],
    ['错误提示', '.message.is-error', 'var(--page-bg)'],
    ['结果提示', '.message.is-result', 'var(--page-bg)']
  ];
  for (const [description, selector, background] of textCases) {
    assertContrast(description, declarationsOf(selector).color, background, MIN_TEXT_CONTRAST);
  }
});
