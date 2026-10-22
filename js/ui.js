/**
 * 五子棋界面层：Canvas 渲染、DOM 事件、状态面板。
 * 只负责展示与交互：规则判定委托 GomokuCore（js/core.js），人机落子委托 GomokuAI（js/ai.js）。
 * 对应 docs/gomoku-design.md 第 8 节：双列/单列布局、高分屏缩放、最后落子、悬停预落子、胜利高亮、键盘与读屏。
 */
(function (global) {
  'use strict';
  var Core = global.GomokuCore;
  var AI = global.GomokuAI;
  var BOARD_SIZE = 15;
  var MODE_PVP = 'pvp';
  var MODE_PVE = 'pve';
  var AI_DELAY_MS = 60; // 让“AI 思考中”有机会渲染，整体仍远低于 300ms 验收上限
  var STAR_POINTS = [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]];
  var REASON_TEXT = {
    OCCUPIED: '该位置已有棋子，请换一个点。',
    OUT_OF_BOUNDS: '落子超出棋盘范围。',
    GAME_OVER: '对局已结束，请悔棋或重新开始。'
  };
  var app = {
    game: null, mode: MODE_PVP, aiPending: false, hover: null, cursor: null,
    dpr: 1, cssSize: 0, cell: 0, origin: 0, raf: 0, timer: 0, els: {}
  };

  /** 尺寸与坐标：按 devicePixelRatio 放大画布，cell = floor(宽 / (size + 1))，四周留一格。 */
  function resizeCanvas() {
    var canvas = app.els.canvas;
    var dpr = global.devicePixelRatio || 1;
    var cssSize = Math.max(240, Math.round(canvas.getBoundingClientRect().width || 480));
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    app.els.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    app.dpr = dpr;
    app.cssSize = cssSize;
    app.cell = Math.max(8, Math.floor(cssSize / (app.game.size + 1)));
    app.origin = (cssSize - app.cell * (app.game.size - 1)) / 2;
  }

  /** 像素坐标 → 最近交叉点；超出棋盘范围返回 null。 */
  function toGridPoint(clientX, clientY) {
    var rect = app.els.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var px = ((clientX - rect.left) / rect.width) * app.cssSize;
    var py = ((clientY - rect.top) / rect.height) * app.cssSize;
    var x = Math.round((px - app.origin) / app.cell);
    var y = Math.round((py - app.origin) / app.cell);
    if (!Core.inBounds(x, y, app.game.size)) return null;
    if (Math.abs(px - (app.origin + x * app.cell)) > app.cell / 2) return null;
    if (Math.abs(py - (app.origin + y * app.cell)) > app.cell / 2) return null;
    return { x: x, y: y };
  }

  function boardPixel(x, y) { return { px: app.origin + x * app.cell, py: app.origin + y * app.cell }; }

  function drawGrid(ctx) {
    var size = app.game.size;
    var start = app.origin;
    var end = app.origin + app.cell * (size - 1);
    ctx.save();
    ctx.strokeStyle = '#6b4f27';
    ctx.lineWidth = 1;
    for (var i = 0; i < size; i += 1) {
      var pos = app.origin + i * app.cell;
      ctx.beginPath();
      ctx.moveTo(start, pos);
      ctx.lineTo(end, pos);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos, start);
      ctx.lineTo(pos, end);
      ctx.stroke();
    }
    // 星位：15 路画四角星 + 天元，小棋盘只画天元
    ctx.fillStyle = '#4a3517';
    var stars = size >= 15 ? STAR_POINTS : [[Math.floor(size / 2), Math.floor(size / 2)]];
    for (var j = 0; j < stars.length; j += 1) {
      if (stars[j][0] >= size || stars[j][1] >= size) continue;
      var star = boardPixel(stars[j][0], stars[j][1]);
      ctx.beginPath();
      ctx.arc(star.px, star.py, Math.max(2, app.cell * 0.09), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawStone(ctx, x, y, color, alpha) {
    var pos = boardPixel(x, y);
    var radius = app.cell * 0.42;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.beginPath();
    ctx.arc(pos.px, pos.py, radius, 0, Math.PI * 2);
    var gradient = ctx.createRadialGradient(
      pos.px - radius * 0.35, pos.py - radius * 0.35, radius * 0.15, pos.px, pos.py, radius);
    if (color === Core.BLACK) {
      gradient.addColorStop(0, '#7c7c7c');
      gradient.addColorStop(0.5, '#2b2b2b');
      gradient.addColorStop(1, '#000000');
    } else {
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.7, '#efefef');
      gradient.addColorStop(1, '#c5c5c5');
    }
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = Math.max(1, app.cell * 0.03);
    ctx.strokeStyle = color === Core.BLACK ? 'rgba(0, 0, 0, 0.85)' : 'rgba(130, 130, 130, 0.75)';
    ctx.stroke();
    ctx.restore();
  }

  function drawWinBand(ctx) {
    var line = app.game.winLine;
    if (!line || line.length < 2) return;
    var first = boardPixel(line[0][0], line[0][1]);
    var last = boardPixel(line[line.length - 1][0], line[line.length - 1][1]);
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.45)';
    ctx.lineWidth = app.cell * 0.72;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(first.px, first.py);
    ctx.lineTo(last.px, last.py);
    ctx.stroke();
    ctx.restore();
  }

  function drawLastMarker(ctx) {
    var move = app.game.lastMove;
    if (!move) return;
    var pos = boardPixel(move.x, move.y);
    ctx.save();
    ctx.fillStyle = '#ff4d4f';
    ctx.beginPath();
    ctx.arc(pos.px, pos.py, Math.max(2, app.cell * 0.09), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function canHumanAct() { return app.mode === MODE_PVP || app.game.turn === Core.BLACK; }

  function drawHover(ctx) {
    var point = app.hover;
    if (!point || app.aiPending || app.game.status !== 'playing' || !canHumanAct()) return;
    if (app.game.board[Core.idx(point.x, point.y, app.game.size)] !== Core.EMPTY) return;
    drawStone(ctx, point.x, point.y, app.game.turn, 0.42);
  }

  function drawCursor(ctx) {
    if (!app.cursor || global.document.activeElement !== app.els.canvas) return;
    var pos = boardPixel(app.cursor.x, app.cursor.y);
    var half = app.cell * 0.46;
    ctx.save();
    ctx.strokeStyle = 'rgba(79, 140, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(pos.px - half, pos.py - half, half * 2, half * 2);
    ctx.restore();
  }

  function draw() {
    var ctx = app.els.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, app.cssSize, app.cssSize);
    drawGrid(ctx);
    drawWinBand(ctx);
    for (var i = 0; i < app.game.history.length; i += 1) {
      drawStone(ctx, app.game.history[i].x, app.game.history[i].y, app.game.history[i].color, 1);
    }
    drawLastMarker(ctx);
    drawHover(ctx);
    drawCursor(ctx);
  }

  function scheduleDraw() {
    if (app.raf) return;
    app.raf = global.requestAnimationFrame(function () { app.raf = 0; draw(); });
  }

  /** 状态面板与提示文案。 */
  function setMessage(text, kind) {
    if (!app.els.message) return;
    app.els.message.textContent = text;
    app.els.message.className = kind ? 'message is-' + kind : 'message';
  }

  function resultText() {
    var result = app.game.result;
    if (result === 'draw') return '平局！棋盘已下满，双方未分胜负。';
    if (result === Core.BLACK) return '黑棋获胜！';
    if (result === Core.WHITE) return '白棋获胜！';
    return null;
  }

  function updatePanel() {
    var game = app.game;
    var els = app.els;
    els.turnDot.className = 'turn-dot ' + (game.turn === Core.BLACK ? 'is-black' : 'is-white');
    els.turnText.textContent = game.turn === Core.BLACK ? '黑棋' : '白棋';
    els.moveCount.textContent = String(game.history.length);
    els.statusText.textContent = app.aiPending ? 'AI 思考中…' : (game.status === 'finished' ? '已结束' : '对局中');
    els.modeText.textContent = app.mode === MODE_PVE ? '人机对战' : '本地双人';
    els.undoBtn.disabled = app.aiPending || game.history.length === 0;
    els.modeBtn.disabled = app.aiPending;
    var label = '五子棋棋盘，已落子 ' + game.history.length + ' 手';
    label += game.status === 'finished' ? '，对局已结束' : '，当前执子' + (game.turn === Core.BLACK ? '黑棋' : '白棋');
    els.canvas.setAttribute('aria-label', label + '；方向键移动光标，回车或空格落子');
  }

  function render() {
    updatePanel();
    scheduleDraw();
  }

  /** 交互动作。 */
  function showResult() {
    var text = resultText();
    if (text) setMessage(text, 'result');
    return Boolean(text);
  }

  function placeAt(x, y) {
    var game = app.game;
    if (app.aiPending) { setMessage('AI 正在思考，请稍候。', 'error'); return; }
    if (game.status !== 'playing') { setMessage(REASON_TEXT.GAME_OVER, 'error'); return; }
    if (!canHumanAct()) { setMessage('当前是 AI 的回合，请稍候。', 'error'); return; }
    var result = Core.place(game, x, y);
    if (!result.ok) { setMessage(REASON_TEXT[result.reason] || '无法在此处落子。', 'error'); return; }
    app.hover = null;
    app.cursor = { x: x, y: y };
    render();
    if (showResult()) return;
    if (app.mode === MODE_PVE) {
      setMessage('AI 回合…');
      scheduleAiMove();
    } else {
      setMessage(game.turn === Core.BLACK ? '轮到黑棋落子。' : '轮到白棋落子。');
    }
  }

  function scheduleAiMove() {
    if (app.mode !== MODE_PVE || app.game.status !== 'playing' || app.game.turn !== Core.WHITE) return;
    app.aiPending = true;
    render();
    app.timer = global.setTimeout(function () {
      app.timer = 0;
      if (!app.aiPending) return;
      app.aiPending = false;
      var game = app.game;
      if (game.status !== 'playing' || game.turn !== Core.WHITE) { render(); return; }
      var move = AI.chooseMove(game, 'simple');
      if (move) Core.place(game, move.x, move.y);
      app.hover = null;
      render();
      if (!showResult()) setMessage('轮到你落子（黑棋）。');
    }, AI_DELAY_MS);
  }

  function undo() {
    if (app.aiPending) { setMessage('AI 正在思考，请稍候。', 'error'); return; }
    var game = app.game;
    if (game.history.length === 0) { setMessage('当前没有可悔的棋。', 'error'); return; }
    Core.undo(game, 1);
    // 人机模式下额外回退 AI 的一步，直到轮到人类或历史为空（设计文档 6.4 节）。
    while (app.mode === MODE_PVE && game.turn !== Core.BLACK && game.history.length > 0) {
      Core.undo(game, 1);
    }
    app.hover = null;
    app.cursor = null;
    render();
    setMessage('已悔棋，继续对局。');
  }

  function restart() {
    if (app.timer) { global.clearTimeout(app.timer); app.timer = 0; }
    app.aiPending = false;
    Core.reset(app.game);
    app.hover = null;
    app.cursor = null;
    render();
    setMessage(app.mode === MODE_PVE ? '已重新开始：你执黑棋，先行。' : '已重新开始：黑棋先行。');
  }

  function toggleMode() {
    if (app.aiPending) return;
    app.mode = app.mode === MODE_PVP ? MODE_PVE : MODE_PVP;
    app.els.modeBtn.textContent = app.mode === MODE_PVE ? '切换本地双人' : '切换人机对战';
    restart();
  }

  /** 事件绑定。 */
  function onPointerMove(event) {
    var point = toGridPoint(event.clientX, event.clientY);
    if (!point) {
      if (app.hover) { app.hover = null; scheduleDraw(); }
      return;
    }
    if (app.hover && app.hover.x === point.x && app.hover.y === point.y) return;
    app.hover = point;
    scheduleDraw();
  }

  function onPointerLeave() {
    if (!app.hover) return;
    app.hover = null;
    scheduleDraw();
  }

  function onBoardClick(event) {
    var point = toGridPoint(event.clientX, event.clientY);
    if (point) placeAt(point.x, point.y);
  }

  function onBoardKeyDown(event) {
    var size = app.game.size;
    var point = app.cursor || { x: Math.floor(size / 2), y: Math.floor(size / 2) };
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      placeAt(point.x, point.y);
      return;
    }
    if (event.key === 'ArrowLeft') point = { x: Math.max(0, point.x - 1), y: point.y };
    else if (event.key === 'ArrowRight') point = { x: Math.min(size - 1, point.x + 1), y: point.y };
    else if (event.key === 'ArrowUp') point = { x: point.x, y: Math.max(0, point.y - 1) };
    else if (event.key === 'ArrowDown') point = { x: point.x, y: Math.min(size - 1, point.y + 1) };
    else return;
    event.preventDefault();
    app.cursor = point;
    scheduleDraw();
  }

  function onResize() {
    resizeCanvas();
    scheduleDraw();
  }

  function bindEvents() {
    var canvas = app.els.canvas;
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseleave', onPointerLeave);
    canvas.addEventListener('click', onBoardClick);
    canvas.addEventListener('keydown', onBoardKeyDown);
    app.els.undoBtn.addEventListener('click', undo);
    app.els.restartBtn.addEventListener('click', restart);
    app.els.modeBtn.addEventListener('click', toggleMode);
    global.addEventListener('resize', onResize);
  }

  /** 初始化：元素引用、对局创建、首次绘制。 */
  function init() {
    var canvas = document.getElementById('board');
    var messageEl = document.getElementById('message');
    if (!canvas) return;
    if (!Core || !AI) {
      if (messageEl) messageEl.textContent = '脚本加载失败，请检查 js/core.js、js/ai.js、js/ui.js 是否完整。';
      return;
    }
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) {
      if (messageEl) messageEl.textContent = '当前浏览器不支持 Canvas，请更换浏览器后重试。';
      return;
    }
    app.els = {
      canvas: canvas, ctx: ctx, message: messageEl,
      turnDot: document.getElementById('turn-dot'), turnText: document.getElementById('turn-text'),
      moveCount: document.getElementById('move-count'), statusText: document.getElementById('status-text'),
      modeText: document.getElementById('mode-text'), undoBtn: document.getElementById('undo-btn'),
      restartBtn: document.getElementById('restart-btn'), modeBtn: document.getElementById('mode-btn')
    };
    app.game = Core.createGame({ size: BOARD_SIZE });
    resizeCanvas();
    bindEvents();
    render();
    setMessage('黑棋先行，点击棋盘落子。');
  }

  global.GomokuUI = { init: init, app: app };
  if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
