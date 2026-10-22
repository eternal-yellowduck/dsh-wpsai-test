/**
 * 五子棋主题控制器（P0 场景主题切换）。
 *
 * 职责：主题注册表、初始主题解析、切换与持久化、向 Canvas 提供调色板、切换事件通知。
 * 设计见 docs/theme-switching-design.md 第 7 节。
 *
 * 约束：
 *   - 颜色值的唯一来源是 styles.css 的主题令牌块，本文件不出现任何颜色字面量；
 *   - 不依赖 core.js / ai.js / ui.js，可独立加载；
 *   - 零构建、零第三方依赖，file:// 双击可运行。
 *
 * UMD 兼容写法：浏览器挂载到 window.GomokuTheme，Node 下通过 require 引入单测。
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.GomokuTheme = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var STORAGE_KEY = 'gomoku.theme.v1';
  var DEFAULT_THEME = 'classic';
  var EVENT_NAME = 'gomoku:themechange';

  /** 主题注册表：id 即 <html data-theme> 取值与 localStorage 保存值；这里是合法 id 的唯一白名单。 */
  var THEMES = [
    { id: 'classic', label: '经典木纹', description: '暖木棋盘 + 深色面板', colorScheme: 'dark' },
    { id: 'midnight', label: '暗夜星空', description: '近黑夜空 + 冷色棋盘', colorScheme: 'dark' },
    { id: 'ink', label: '水墨宣纸', description: '宣纸底色 + 墨色棋盘', colorScheme: 'light' }
  ];

  /** Canvas 调色板读取的令牌（与 styles.css §7.2.2 一一对应）。 */
  var CANVAS_TOKENS = [
    '--board-light', '--board-dark', '--board-grid', '--board-star',
    '--stone-black-0', '--stone-black-1', '--stone-black-2',
    '--stone-white-0', '--stone-white-1', '--stone-white-2',
    '--stone-black-edge', '--stone-white-edge',
    '--win-band', '--last-marker', '--marker-halo', '--cursor', '--cursor-halo'
  ];

  var state = { id: null, palette: null, bound: false, listeners: [] };

  function hasDom() {
    return Boolean(root && root.document && root.document.documentElement);
  }

  function findTheme(id) {
    for (var i = 0; i < THEMES.length; i += 1) {
      if (THEMES[i].id === id) return THEMES[i];
    }
    return null;
  }

  function isValidTheme(id) {
    return Boolean(findTheme(id));
  }

  /** 纯函数：保存值合法则沿用，否则回到默认主题（经典木纹）。 */
  function resolveInitialTheme(stored) {
    return isValidTheme(stored) ? stored : DEFAULT_THEME;
  }

  function readStored() {
    try {
      return root.localStorage ? root.localStorage.getItem(STORAGE_KEY) : null;
    } catch (error) {
      return null; // 隐私模式 / file:// 限制：不记忆但功能正常
    }
  }

  function persist(id) {
    try {
      if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, id);
    } catch (error) {
      /* 存储不可用时静默降级 */
    }
  }

  /** 读取当前主题在 CSS 计算样式中的令牌，组装 Canvas 调色板并缓存。 */
  function readPalette() {
    var style = root.getComputedStyle(root.document.documentElement);
    function token(name) {
      return style.getPropertyValue(name).trim();
    }
    return {
      boardLight: token('--board-light'),
      boardDark: token('--board-dark'),
      boardGrid: token('--board-grid'),
      boardStar: token('--board-star'),
      stoneBlack: [token('--stone-black-0'), token('--stone-black-1'), token('--stone-black-2')],
      stoneWhite: [token('--stone-white-0'), token('--stone-white-1'), token('--stone-white-2')],
      stoneBlackEdge: token('--stone-black-edge'),
      stoneWhiteEdge: token('--stone-white-edge'),
      winBand: token('--win-band'),
      lastMarker: token('--last-marker'),
      markerHalo: token('--marker-halo'),
      cursor: token('--cursor'),
      cursorHalo: token('--cursor-halo')
    };
  }

  function palette() {
    if (state.palette === null) {
      state.palette = hasDom() ? readPalette() : {};
    }
    return state.palette;
  }

  function notify(id) {
    for (var i = 0; i < state.listeners.length; i += 1) {
      state.listeners[i](id);
    }
    if (hasDom() && typeof root.CustomEvent === 'function') {
      root.document.dispatchEvent(new root.CustomEvent(EVENT_NAME, { detail: { id: id } }));
    }
  }

  function updateControls() {
    if (!hasDom()) return;
    var options = root.document.querySelectorAll('.theme-option');
    for (var i = 0; i < options.length; i += 1) {
      var optionId = options[i].getAttribute('data-theme-id');
      options[i].setAttribute('aria-pressed', optionId === state.id ? 'true' : 'false');
    }
  }

  /**
   * 切换主题。options.persist === false 时只应用不写存储（首屏初始化用）。
   * 返回 false 表示 id 不在白名单，状态不变。
   */
  function apply(id, options) {
    if (!isValidTheme(id)) return false;
    if (!hasDom()) return false;
    var settings = options || {};
    var persistent = settings.persist !== false;
    var changed = state.id !== id;
    var theme = findTheme(id);

    state.id = id;
    state.palette = null; // 令牌随 data-theme 变化，下次 palette() 重新读取
    root.document.documentElement.setAttribute('data-theme', id);
    root.document.documentElement.style.colorScheme = theme.colorScheme;
    if (persistent) persist(id);
    updateControls();
    if (changed) notify(id);
    return true;
  }

  function current() {
    return state.id;
  }

  /** 订阅主题切换，返回取消订阅函数。 */
  function onChange(callback) {
    if (typeof callback !== 'function') return function () {};
    state.listeners.push(callback);
    return function unsubscribe() {
      var index = state.listeners.indexOf(callback);
      if (index !== -1) state.listeners.splice(index, 1);
    };
  }

  function bindSwitcher() {
    if (state.bound || !hasDom()) return;
    var options = root.document.querySelectorAll('.theme-option');
    for (var i = 0; i < options.length; i += 1) {
      options[i].addEventListener('click', function onThemeClick(event) {
        var id = event.currentTarget.getAttribute('data-theme-id');
        apply(id);
      });
    }
    state.bound = true;
  }

  /** 启动：解析初始主题 → 应用（对齐 head 内联脚本）→ 绑定切换控件。幂等。 */
  function init() {
    if (!hasDom()) return state.id;
    bindSwitcher();
    if (state.id) {
      updateControls();
      return state.id;
    }
    var id = resolveInitialTheme(readStored());
    apply(id, { persist: false });
    return id;
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_THEME: DEFAULT_THEME,
    EVENT_NAME: EVENT_NAME,
    THEMES: THEMES,
    CANVAS_TOKENS: CANVAS_TOKENS,
    resolveInitialTheme: resolveInitialTheme,
    isValidTheme: isValidTheme,
    init: init,
    apply: apply,
    current: current,
    palette: palette,
    onChange: onChange
  };

  if (hasDom()) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  return api;
});
