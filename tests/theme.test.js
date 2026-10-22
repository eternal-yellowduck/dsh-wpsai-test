/**
 * 主题切换单元测试：node --test tests/theme.test.js。
 * 对应 docs/theme-switching-design.md §9.2 的 T-TH-01 ~ T-TH-10（另含首屏脚本与脚本顺序校验）。
 *
 * 校验四类内容：
 *   1) 主题控制器纯函数与注册表（可在 Node 直接 require js/theme.js）；
 *   2) 三套主题的令牌完整性与 WCAG 2.1 对比度（直接解析 styles.css，与页面实际取值一致）；
 *   3) 颜色源唯一性（js/ui.js、js/theme.js 不出现颜色字面量）；
 *   4) 首屏防闪烁脚本、白名单一致性、脚本加载顺序与切换控件标记。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Theme = require('../js/theme.js');
const {
  readStyles,
  declarationsOf,
  themeTokens,
  assertContrast,
  parseColor,
  contrastRatio,
  colorTokenOf,
  MIN_TEXT_CONTRAST,
  MIN_UI_CONTRAST
} = require('./helpers/contrast');

const REPO_ROOT = path.join(__dirname, '..');
const CSS = readStyles();
const INDEX_HTML = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
const THEME_JS = fs.readFileSync(path.join(REPO_ROOT, 'js', 'theme.js'), 'utf8');
const UI_JS = fs.readFileSync(path.join(REPO_ROOT, 'js', 'ui.js'), 'utf8');

const THEME_IDS = ['classic', 'midnight', 'ink'];
const STORAGE_KEY = 'gomoku.theme.v1';

/** 每套主题都必须声明的语义令牌（§7.2.1）。 */
const SEMANTIC_TOKENS = [
  '--page-bg', '--page-glow', '--panel-bg', '--panel-border',
  '--text', '--text-muted', '--accent', '--accent-strong', '--accent-strong-hover',
  '--text-on-accent', '--danger', '--win', '--focus-ring-inner'
];

/** 每套主题都必须声明的 Canvas 用令牌（§7.2.2，由 js/theme.js 通过 getComputedStyle 读取）。 */
const CANVAS_TOKENS = [
  '--board-light', '--board-dark', '--board-grid', '--board-star',
  '--stone-black-0', '--stone-black-1', '--stone-black-2',
  '--stone-white-0', '--stone-white-1', '--stone-white-2',
  '--stone-black-edge', '--stone-white-edge',
  '--win-band', '--last-marker', '--marker-halo', '--cursor', '--cursor-halo'
];

/** 只由 CSS 使用（Canvas 不读取）的棋盘令牌：棋盘容器渐变与投影。 */
const BOARD_CSS_TOKENS = ['--board-shadow', '--board-edge'];

const REQUIRED_TOKENS = [...SEMANTIC_TOKENS, ...CANVAS_TOKENS, ...BOARD_CSS_TOKENS];

/** 颜色字面量扫描：十六进制色 / rgb() / rgba() / hsl()。 */
const COLOR_LITERAL_PATTERN = /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i;

// ---------------------------------------------------------------------------
// T-TH-01 ~ T-TH-03：初始主题解析（用户已确认 Q2：无保存值时始终默认经典木纹）
// ---------------------------------------------------------------------------

test('T-TH-01 保存值合法时优先沿用', () => {
  for (const id of THEME_IDS) {
    assert.equal(Theme.resolveInitialTheme(id), id);
  }
});

test('T-TH-02 无保存值（null / undefined / 空串）时默认经典木纹', () => {
  assert.equal(Theme.resolveInitialTheme(null), 'classic');
  assert.equal(Theme.resolveInitialTheme(undefined), 'classic');
  assert.equal(Theme.resolveInitialTheme(''), 'classic');
});

test('T-TH-03 非法保存值被忽略并回到经典木纹', () => {
  assert.equal(Theme.resolveInitialTheme('unknown'), 'classic');
  assert.equal(Theme.resolveInitialTheme('CLASSIC'), 'classic');
  assert.equal(Theme.resolveInitialTheme({ id: 'ink' }), 'classic');
});

test('主题合法性白名单与默认主题', () => {
  assert.equal(Theme.DEFAULT_THEME, 'classic');
  assert.equal(Theme.STORAGE_KEY, STORAGE_KEY);
  for (const id of THEME_IDS) assert.equal(Theme.isValidTheme(id), true, `合法主题 ${id}`);
  assert.equal(Theme.isValidTheme('random'), false);
});

// ---------------------------------------------------------------------------
// T-TH-04：注册表结构、白名单与首屏内联脚本一致性
// ---------------------------------------------------------------------------

test('T-TH-04 主题注册表结构完整且 id 唯一', () => {
  assert.equal(Array.isArray(Theme.THEMES), true);
  assert.equal(Theme.THEMES.length, 3);
  const ids = Theme.THEMES.map((theme) => theme.id);
  assert.deepEqual(ids, THEME_IDS);
  assert.equal(new Set(ids).size, ids.length, '主题 id 不应重复');
  for (const theme of Theme.THEMES) {
    assert.ok(theme.label && theme.label.length > 0, `${theme.id} 缺 label`);
    assert.ok(theme.description && theme.description.length > 0, `${theme.id} 缺 description`);
    assert.ok(['dark', 'light'].includes(theme.colorScheme), `${theme.id} 的 colorScheme 非法`);
  }
});

test('T-TH-04 首屏内联脚本白名单与 theme.js 注册表一致', () => {
  const match = INDEX_HTML.match(/var valid = \{([^}]*)\};/);
  assert.ok(match, 'index.html 中找不到首屏主题白名单 var valid = {...}');
  const inlineIds = [...match[1].matchAll(/([a-z-]+)\s*:\s*1/g)].map((item) => item[1]);
  assert.deepEqual(inlineIds.sort(), [...THEME_IDS].sort());
});

test('T-TH-04 首屏内联脚本按 Q2 默认经典木纹，不读取系统深浅色偏好', () => {
  assert.match(INDEX_HTML, /var theme = 'classic';/, '内联脚本默认主题应为 classic');
  assert.doesNotMatch(INDEX_HTML, /prefers-color-scheme/, 'Q2 已确认首次访问始终默认经典木纹');
});

test('T-TH-04 localStorage 键在首屏脚本与 theme.js 中一致', () => {
  assert.match(INDEX_HTML, new RegExp(`localStorage\\.getItem\\('${STORAGE_KEY}'\\)`));
  assert.ok(THEME_JS.includes(`'${STORAGE_KEY}'`), 'theme.js 应使用同一存储键');
});

test('T-TH-04 index.html 切换控件覆盖全部主题且初始只选中默认主题', () => {
  for (const id of THEME_IDS) {
    assert.match(INDEX_HTML, new RegExp(`data-theme-id="${id}"`), `缺少主题按钮 ${id}`);
    assert.match(INDEX_HTML, new RegExp(`aria-pressed="(true|false)"[^>]*>\\s*<span class="theme-swatch" data-theme-id="${id}"`),
      `主题按钮 ${id} 结构不完整`);
  }
  const pressed = INDEX_HTML.match(/aria-pressed="true"/g) || [];
  assert.equal(pressed.length, 1, '初始状态应恰好有一个 aria-pressed="true"');
});

// ---------------------------------------------------------------------------
// T-TH-05 / T-TH-10：令牌完整性（含 :root 回退）
// ---------------------------------------------------------------------------

test('T-TH-05 三套主题各自声明全部必需令牌', () => {
  for (const themeId of THEME_IDS) {
    const tokens = themeTokens(CSS, themeId);
    for (const token of REQUIRED_TOKENS) {
      assert.ok(
        typeof tokens[token] === 'string' && tokens[token].trim().length > 0,
        `主题 ${themeId} 缺少令牌 ${token}`
      );
    }
  }
});

test('T-TH-05 暗夜星空与水墨宣纸通过独立 data-theme 块覆盖令牌', () => {
  for (const themeId of ['midnight', 'ink']) {
    const block = declarationsOf(CSS, `[data-theme="${themeId}"]`);
    const overrides = Object.keys(block).filter((name) => name.startsWith('--'));
    assert.ok(overrides.length >= REQUIRED_TOKENS.length - 2, `${themeId} 块令牌数量偏少`);
    // 主题块应覆盖页面与棋盘关键令牌，而不是只换一个强调色
    for (const token of ['--page-bg', '--panel-bg', '--board-light', '--stone-white-0', '--cursor']) {
      assert.ok(token in block, `${themeId} 未覆盖 ${token}`);
    }
  }
});

test('T-TH-10 :root 作为经典木纹/无 JS 回退声明全部必需令牌', () => {
  const root = declarationsOf(CSS, ':root');
  for (const token of REQUIRED_TOKENS) {
    assert.ok(token in root, `:root 缺少回退令牌 ${token}`);
  }
  assert.ok('--radius' in root && '--theme-transition' in root, ':root 应含非主题令牌');
});

// ---------------------------------------------------------------------------
// T-TH-06 ~ T-TH-08：WCAG 2.1 对比度（对 styles.css 实际取值核算）
// ---------------------------------------------------------------------------

const TEXT_CONTRAST_CASES = [
  ['正文/面板', '--text', '--panel-bg'],
  ['正文/页面', '--text', '--page-bg'],
  ['次要文字/面板', '--text-muted', '--panel-bg'],
  ['次要文字/页面', '--text-muted', '--page-bg'],
  ['按钮文字/主按钮底', '--text-on-accent', '--accent-strong'],
  ['按钮文字/悬停底', '--text-on-accent', '--accent-strong-hover'],
  ['错误提示/页面', '--danger', '--page-bg'],
  ['胜利文字/页面', '--win', '--page-bg']
];

const UI_CONTRAST_CASES = [
  ['焦点环/页面', '--accent', '--page-bg'],
  ['焦点环/面板', '--accent', '--panel-bg'],
  ['键盘光标/棋盘亮端', '--cursor', '--board-light'],
  ['键盘光标/棋盘暗端', '--cursor', '--board-dark'],
  ['网格线/棋盘亮端', '--board-grid', '--board-light'],
  ['网格线/棋盘暗端', '--board-grid', '--board-dark'],
  ['星位/棋盘亮端', '--board-star', '--board-light'],
  ['星位/棋盘暗端', '--board-star', '--board-dark'],
  ['黑棋描边/棋盘亮端', '--stone-black-edge', '--board-light'],
  ['黑棋描边/棋盘暗端', '--stone-black-edge', '--board-dark'],
  ['白棋描边/棋盘亮端', '--stone-white-edge', '--board-light'],
  ['白棋描边/棋盘暗端', '--stone-white-edge', '--board-dark'],
  ['落子标记/标记光环', '--last-marker', '--marker-halo'],
  ['落子标记/白棋中心', '--last-marker', '--stone-white-1'],
  ['标记光环/黑棋最亮端', '--marker-halo', '--stone-black-0'],
  ['标记光环/黑棋中间调', '--marker-halo', '--stone-black-1']
];

test('T-TH-06 文本与按钮文字对比度 ≥ 4.5:1（三套主题）', () => {
  for (const themeId of THEME_IDS) {
    const tokens = themeTokens(CSS, themeId);
    for (const [description, foreground, background] of TEXT_CONTRAST_CASES) {
      assertContrast(`${themeId} ${description}`, tokens[foreground], tokens[background],
        MIN_TEXT_CONTRAST, tokens);
    }
  }
});

test('T-TH-08 焦点、棋盘元素与棋子轮廓对比度 ≥ 3:1（三套主题）', () => {
  for (const themeId of THEME_IDS) {
    const tokens = themeTokens(CSS, themeId);
    for (const [description, foreground, background] of UI_CONTRAST_CASES) {
      assertContrast(`${themeId} ${description}`, tokens[foreground], tokens[background],
        MIN_UI_CONTRAST, tokens);
    }
  }
});

test('T-TH-07 主题差异覆盖棋盘材质与棋子（非单一强调色）', () => {
  const classic = themeTokens(CSS, 'classic');
  const mustDiffer = ['--page-bg', '--panel-bg', '--board-light', '--board-dark', '--cursor'];
  for (const themeId of ['midnight', 'ink']) {
    const tokens = themeTokens(CSS, themeId);
    for (const token of mustDiffer) {
      assert.notEqual(tokens[token], classic[token], `${themeId} 的 ${token} 与经典木纹相同`);
    }
    const compared = ['--page-bg', '--panel-bg', '--board-light', '--board-dark',
      '--board-grid', '--stone-black-1', '--stone-white-1', '--stone-black-edge',
      '--stone-white-edge', '--cursor'];
    const changed = compared.filter((token) => tokens[token] !== classic[token]);
    assert.ok(changed.length >= 8, `${themeId} 与经典木纹的令牌差异不足（仅 ${changed.join(', ')}）`);
  }
});

// ---------------------------------------------------------------------------
// 颜色源唯一性：ui.js / theme.js 不出现颜色字面量
// ---------------------------------------------------------------------------

test('T-TH-09 js/ui.js 不出现颜色字面量（颜色只能来自主题调色板）', () => {
  const code = UI_JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, COLOR_LITERAL_PATTERN, 'js/ui.js 中出现了颜色字面量，请改为读取 app.palette');
});

test('T-TH-09 js/theme.js 不出现颜色字面量（主题数据只存在于 styles.css）', () => {
  const code = THEME_JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, COLOR_LITERAL_PATTERN, 'js/theme.js 中出现了颜色字面量');
});

// ---------------------------------------------------------------------------
// Canvas 调色板桥接与首屏脚本顺序
// ---------------------------------------------------------------------------

test('Canvas 调色板令牌清单与 styles.css 令牌一一对应', () => {
  assert.deepEqual([...Theme.CANVAS_TOKENS].sort(), [...CANVAS_TOKENS].sort());
  const readTokens = [...THEME_JS.matchAll(/token\('(--[\w-]+)'\)/g)].map((item) => item[1]);
  assert.deepEqual([...new Set(readTokens)].sort(), [...CANVAS_TOKENS].sort(),
    'readPalette() 读取的令牌应与 CANVAS_TOKENS 一致');
});

test('index.html 首屏脚本位于样式表之前，theme.js 先于 ui.js 加载', () => {
  const inlineScriptIndex = INDEX_HTML.indexOf("document.documentElement.setAttribute('data-theme'");
  const stylesheetIndex = INDEX_HTML.indexOf('<link rel="stylesheet"');
  const themeScriptIndex = INDEX_HTML.indexOf('src="js/theme.js"');
  const uiScriptIndex = INDEX_HTML.indexOf('src="js/ui.js"');
  assert.ok(inlineScriptIndex !== -1, '缺少首屏设置 data-theme 的内联脚本');
  assert.ok(inlineScriptIndex < stylesheetIndex, '内联脚本必须在样式表之前，才能避免首屏闪烁');
  assert.ok(themeScriptIndex !== -1 && uiScriptIndex !== -1);
  assert.ok(themeScriptIndex < uiScriptIndex, 'theme.js 必须在 ui.js 之前加载');
});

test('切换控件样式使用主题令牌且具备选中/焦点态', () => {
  const option = declarationsOf(CSS, '.theme-option');
  const pressed = declarationsOf(CSS, '.theme-option[aria-pressed="true"]');
  const focus = declarationsOf(CSS, '.theme-option:focus-visible');
  assert.match(option.color, /var\(--text\)/);
  assert.match(pressed['border-color'], /var\(--accent\)/);
  const focusColor = colorTokenOf(focus.outline);
  assert.ok(focusColor, '.theme-option:focus-visible 缺少颜色');
  const tokens = themeTokens(CSS, 'classic');
  assert.equal(parseColor(focusColor, tokens).length, 3);
  const ratio = contrastRatio(
    parseColor(focusColor, tokens),
    parseColor(tokens['--page-bg'], tokens)
  );
  assert.ok(ratio >= MIN_UI_CONTRAST, `切换控件焦点环对比度 ${ratio.toFixed(2)}:1 不足`);
});
