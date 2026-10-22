/**
 * 五子棋规则层（纯逻辑）。
 *
 * 职责：棋盘数据、落子校验、胜负/平局判定、悔棋、重置。
 * 约束（docs/gomoku-design.md 第 7 节）：不读写 DOM、不依赖时间、不使用 Math.random，
 * 同一输入必然同一输出，便于单元测试与复盘回放。
 *
 * 采用 UMD 兼容写法，脚本以经典 <script> 方式引入后挂载到 window.GomokuCore，
 * 在 Node 下通过 require('../js/core.js') 供 node:test 直接测试（file:// 可直接打开）。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GomokuCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var EMPTY = 0;
  var BLACK = 1;
  var WHITE = 2;
  var DEFAULT_SIZE = 15;

  // 横、竖、主对角线、副对角线（6.2 节：以最后落子为中心的四方向扫描）。
  var DIRECTIONS = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];

  /** 创建空棋盘：一维 Int8Array，索引 index = y * size + x。 */
  function createBoard(size) {
    return new Int8Array(size * size);
  }

  function idx(x, y, size) {
    return y * size + x;
  }

  function inBounds(x, y, size) {
    return x >= 0 && x < size && y >= 0 && y < size;
  }

  function nextColor(color) {
    return color === BLACK ? WHITE : BLACK;
  }

  /**
   * 创建新对局。
   * @param {{size?: number}} [options]
   * @returns {object} GameState
   */
  function createGame(options) {
    var size = options && options.size !== undefined ? options.size : DEFAULT_SIZE;
    if (!Number.isInteger(size) || size < 5) {
      throw new RangeError('棋盘尺寸必须是 >= 5 的整数，收到：' + size);
    }
    return {
      size: size,
      board: createBoard(size),
      turn: BLACK,
      history: [],
      status: 'playing',
      result: null,
      lastMove: null,
      winLine: null
    };
  }

  /**
   * 以 (x, y) 为起点向四个方向扫描，判断是否连续 >= 5 子。
   * 只检查最后落子即可：任何新产生的五连必然经过最新落子。
   * @param {Int8Array|number[]} board
   * @param {number} size
   * @param {number} x
   * @param {number} y
   * @param {1|2} color
   * @returns {null|{line: number[][]}} 命中时返回构成连线（含长连）的全部坐标
   */
  function checkWin(board, size, x, y, color) {
    if (!inBounds(x, y, size)) {
      return null;
    }
    for (var d = 0; d < DIRECTIONS.length; d += 1) {
      var dx = DIRECTIONS[d][0];
      var dy = DIRECTIONS[d][1];
      var line = [[x, y]];
      var nx;
      var ny;

      for (nx = x + dx, ny = y + dy; inBounds(nx, ny, size) && board[idx(nx, ny, size)] === color; nx += dx, ny += dy) {
        line.push([nx, ny]);
      }
      for (nx = x - dx, ny = y - dy; inBounds(nx, ny, size) && board[idx(nx, ny, size)] === color; nx -= dx, ny -= dy) {
        line.unshift([nx, ny]);
      }
      if (line.length >= 5) {
        return { line: line };
      }
    }
    return null;
  }

  /**
   * 落子。所有非法操作通过返回值表达，不抛异常（6.1 节）。
   * @returns {{ok:true, move:object, win:null|{line:number[][]}, draw:boolean}
   *          |{ok:false, reason:'GAME_OVER'|'OUT_OF_BOUNDS'|'OCCUPIED'}}
   */
  function place(game, x, y) {
    if (!game || game.status !== 'playing') {
      return { ok: false, reason: 'GAME_OVER' };
    }
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(x, y, game.size)) {
      return { ok: false, reason: 'OUT_OF_BOUNDS' };
    }
    var i = idx(x, y, game.size);
    if (game.board[i] !== EMPTY) {
      return { ok: false, reason: 'OCCUPIED' };
    }

    var color = game.turn;
    game.board[i] = color;
    var move = { x: x, y: y, color: color, no: game.history.length + 1 };
    game.history.push(move);
    game.lastMove = move;

    var win = checkWin(game.board, game.size, x, y, color);
    var draw = false;
    if (win) {
      game.status = 'finished';
      game.result = color;
      game.winLine = win.line;
    } else if (game.history.length === game.size * game.size) {
      // 必须先判胜负再判平局：棋盘下满且无人五连才算平局（6.3 节）。
      draw = true;
      game.status = 'finished';
      game.result = 'draw';
      game.winLine = null;
    } else {
      game.turn = nextColor(color);
    }
    return { ok: true, move: move, win: win, draw: draw };
  }

  /**
   * 悔棋（可退多步）。终局后悔棋会恢复为 playing，可继续对局（6.4 节）。
   * @param {object} game
   * @param {number} [steps=1]
   * @returns {{ok:true, undone:number}|{ok:false, reason:'NOTHING_TO_UNDO'}}
   */
  function undo(game, steps) {
    if (!game || game.history.length === 0) {
      return { ok: false, reason: 'NOTHING_TO_UNDO' };
    }
    var total = Number.isInteger(steps) && steps > 0 ? steps : 1;
    var undone = 0;
    while (undone < total && game.history.length > 0) {
      var move = game.history.pop();
      game.board[idx(move.x, move.y, game.size)] = EMPTY;
      game.turn = move.color;
      undone += 1;
    }
    game.status = 'playing';
    game.result = null;
    game.winLine = null;
    game.lastMove = game.history.length > 0 ? game.history[game.history.length - 1] : null;
    return { ok: true, undone: undone };
  }

  /** 重置对局：原地清空棋盘、回到黑棋先手。 */
  function reset(game) {
    game.board.fill(EMPTY);
    game.history.length = 0;
    game.turn = BLACK;
    game.status = 'playing';
    game.result = null;
    game.lastMove = null;
    game.winLine = null;
    return game;
  }

  return {
    EMPTY: EMPTY,
    BLACK: BLACK,
    WHITE: WHITE,
    DEFAULT_SIZE: DEFAULT_SIZE,
    DIRECTIONS: DIRECTIONS,
    createBoard: createBoard,
    idx: idx,
    inBounds: inBounds,
    nextColor: nextColor,
    createGame: createGame,
    checkWin: checkWin,
    place: place,
    undo: undo,
    reset: reset
  };
});
