/**
 * 测试共享助手：解析 styles.css 的主题令牌并按 WCAG 2.1 计算颜色对比度。
 *
 * 由 tests/a11y.test.js 与 tests/theme.test.js 共用，零第三方依赖，
 * 只做「读 CSS → 展开 var() → 解析颜色 → 算对比度」的可复用部分。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const STYLES_PATH = path.join(__dirname, '..', '..', 'styles.css');

const MIN_TEXT_CONTRAST = 4.5; // WCAG 2.1 SC 1.4.3 普通文本
const MIN_UI_CONTRAST = 3; // WCAG 2.1 SC 1.4.11 非文本（焦点指示、图形等）

/** 读取 styles.css 并剔除注释（注释中含颜色值与冒号，会干扰声明解析）。 */
function readStyles() {
  return fs
    .readFileSync(STYLES_PATH, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 提取选择器对应的声明块（styles.css 为扁平规则，选择器唯一）。 */
function declarationsOf(cssText, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`);
  const match = cssText.match(pattern);
  if (!match) throw new Error(`styles.css 中找不到选择器「${selector}」`);
  const declarations = {};
  for (const part of match[1].split(';')) {
    const separator = part.indexOf(':');
    if (separator === -1) continue;
    declarations[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return declarations;
}

/**
 * 某主题生效的令牌集合：:root 是经典木纹（默认/回退），
 * 其余主题在 :root 之上覆盖同名令牌。
 */
function themeTokens(cssText, themeId) {
  const root = declarationsOf(cssText, ':root');
  if (!themeId || themeId === 'classic') return { ...root };
  return { ...root, ...declarationsOf(cssText, `[data-theme="${themeId}"]`) };
}

/** 展开 var(--x) 引用，返回最终 CSS 值；未定义变量直接报错（防止令牌漏声明）。 */
function resolveValue(value, tokens, depth = 0) {
  assert.ok(depth < 10, `var() 展开层级过深：${value}`);
  return value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, name) => {
    assert.ok(name in tokens, `styles.css 中未定义变量 ${name}`);
    return resolveValue(tokens[name], tokens, depth + 1);
  });
}

/** 把 #rgb / #rrggbb / rgb() / rgba() 解析为 [r, g, b]；无法解析时返回 null。 */
function parseColor(value, tokens) {
  const color = resolveValue(value, tokens).trim();
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

function colorOf(cssValue, description, tokens) {
  const color = parseColor(cssValue, tokens);
  assert.ok(color, `${description} 的颜色无法解析：${cssValue}`);
  return color;
}

/** 断言「前景色 / 背景色」达到指定对比度，失败信息带实际比值。 */
function assertContrast(description, foregroundValue, backgroundValue, minimum, tokens) {
  const foreground = colorOf(foregroundValue, `${description}前景`, tokens);
  const background = colorOf(backgroundValue, `${description}背景`, tokens);
  const ratio = contrastRatio(foreground, background);
  assert.ok(
    ratio >= minimum,
    `${description} 对比度 ${ratio.toFixed(2)}:1 低于要求 ${minimum}:1`
  );
  return ratio;
}

/** 从 outline 之类的简写中取出颜色 token（#hex / rgb() / var()）。 */
function colorTokenOf(shorthand) {
  return shorthand.split(/\s+/).find((token) => /^(#|rgb|var\()/i.test(token));
}

module.exports = {
  STYLES_PATH,
  MIN_TEXT_CONTRAST,
  MIN_UI_CONTRAST,
  readStyles,
  declarationsOf,
  themeTokens,
  resolveValue,
  parseColor,
  relativeLuminance,
  contrastRatio,
  colorOf,
  assertContrast,
  colorTokenOf
};
