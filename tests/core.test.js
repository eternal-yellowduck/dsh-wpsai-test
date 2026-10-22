/**
 * 规则层单元测试（node --test tests/core.test.js）。
 * 用例编号对应 docs/gomoku-design.md 9.1 节 T-01 ~ T-18。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../js/core.js');

const SIZE = 15;

/** 按 [x, y] 序列交替落子（黑先），返回最后一次 place 结果。 */
function play(game, moves) {
  let last = null;
  for (const [x, y] of moves) {
    last = Core.place(game, x, y);
    assert.equal(last.ok, true, `落子 (${x},${y}) 失败：${JSON.stringify(last)}`);
  }
  return last;
}

/** 黑棋横向五连的终局：黑第 9 手在 (4,0) 成五。 */
function finishedGame() {
  const game = Core.createGame();
  play(game, [
    [0, 0], [0, 1],
    [1, 0], [1, 1],
    [2, 0], [2, 1],
    [3, 0], [3, 1],
    [4, 0]
  ]);
  return game;
}

test('T-01 新建对局：15×15、225 个空点、黑先、playing', () => {
  const game = Core.createGame();
  assert.equal(game.size, SIZE);
  assert.equal(game.board.length, SIZE * SIZE);
  assert.ok(game.board.every((v) => v === Core.EMPTY));
  assert.equal(game.turn, Core.BLACK);
  assert.equal(game.status, 'playing');
  assert.equal(game.result, null);
  assert.equal(game.lastMove, null);
  assert.deepEqual(game.history, []);
});

test('T-01b 非法棋盘尺寸抛出 RangeError', () => {
  assert.throws(() => Core.createGame({ size: 4 }), RangeError);
  assert.throws(() => Core.createGame({ size: 15.5 }), RangeError);
  assert.throws(() => Core.createGame({ size: '15' }), RangeError);
});

test('T-02 正常落子：写入棋盘、历史 +1、换手白棋', () => {
  const game = Core.createGame();
  const result = Core.place(game, 7, 7);
  assert.equal(result.ok, true);
  assert.equal(result.win, null);
  assert.equal(result.draw, false);
  assert.equal(game.board[Core.idx(7, 7, SIZE)], Core.BLACK);
  assert.equal(game.history.length, 1);
  assert.deepEqual(game.history[0], { x: 7, y: 7, color: Core.BLACK, no: 1 });
  assert.equal(game.turn, Core.WHITE);
  assert.equal(game.lastMove, game.history[0]);
  assert.equal(game.status, 'playing');
});

test('T-03 重复落子：返回 OCCUPIED，棋盘与历史不变', () => {
  const game = Core.createGame();
  Core.place(game, 3, 3);
  const before = Array.from(game.board);
  const historyLength = game.history.length;
  const turn = game.turn;
  const result = Core.place(game, 3, 3);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'OCCUPIED');
  assert.deepEqual(Array.from(game.board), before);
  assert.equal(game.history.length, historyLength);
  assert.equal(game.turn, turn);
});

test('T-04 越界落子：返回 OUT_OF_BOUNDS（含 -1 与 size）', () => {
  const game = Core.createGame();
  for (const [x, y] of [[-1, 0], [0, -1], [SIZE, 0], [0, SIZE], [1.5, 2], [NaN, 0]]) {
    const result = Core.place(game, x, y);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'OUT_OF_BOUNDS');
  }
  assert.equal(game.history.length, 0);
  assert.equal(game.turn, Core.BLACK);
});

test('T-05 横向五连判胜，返回 5 个连线坐标', () => {
  const game = finishedGame();
  assert.equal(game.status, 'finished');
  assert.equal(game.result, Core.BLACK);
  assert.equal(game.winLine.length, 5);
  assert.deepEqual(game.winLine, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
});

test('T-06 纵向五连判胜', () => {
  const game = Core.createGame();
  play(game, [
    [0, 0], [1, 0],
    [0, 1], [1, 1],
    [0, 2], [1, 2],
    [0, 3], [1, 3],
    [0, 4]
  ]);
  assert.equal(game.status, 'finished');
  assert.equal(game.result, Core.BLACK);
  assert.deepEqual(game.winLine, [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]);
});

test('T-07 主对角线五连判胜', () => {
  const game = Core.createGame();
  play(game, [
    [0, 0], [10, 0],
    [1, 1], [11, 0],
    [2, 2], [12, 0],
    [3, 3], [13, 0],
    [4, 4]
  ]);
  assert.equal(game.status, 'finished');
  assert.equal(game.result, Core.BLACK);
  assert.deepEqual(game.winLine, [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]);
});

test('T-08 副对角线五连判胜', () => {
  const game = Core.createGame();
  play(game, [
    [0, 10], [10, 0],
    [1, 9], [11, 1],
    [2, 8], [12, 2],
    [3, 7], [13, 3],
    [4, 6]
  ]);
  assert.equal(game.status, 'finished');
  assert.equal(game.result, Core.BLACK);
  assert.deepEqual(game.winLine, [[0, 10], [1, 9], [2, 8], [3, 7], [4, 6]]);
});

test('T-09 长连（6 子）同样判胜（假设 A1）', () => {
  const game = Core.createGame();
  play(game, [
    [0, 0], [0, 3],
    [1, 0], [2, 3],
    [2, 0], [4, 3],
    [4, 0], [6, 3],
    [5, 0], [8, 3],
    [3, 0]
  ]);
  assert.equal(game.status, 'finished');
  assert.equal(game.result, Core.BLACK);
  assert.equal(game.winLine.length, 6);
  assert.deepEqual(game.winLine, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]);
});

test('T-10 四子不判胜，status 仍为 playing', () => {
  const game = Core.createGame();
  play(game, [
    [0, 0], [0, 3],
    [1, 0], [2, 3],
    [2, 0], [4, 3],
    [3, 0]
  ]);
  assert.equal(game.status, 'playing');
  assert.equal(game.result, null);
  assert.equal(game.winLine, null);
  assert.equal(game.turn, Core.WHITE);
});

test('T-11 棋盘下满且无五连判平局（5×5 构造序列）', () => {
  const game = Core.createGame({ size: 5 });
  // 交替填满 25 个点，且任意方向都不出现五连。
  const moves = [
    [1, 4], [4, 2], [1, 2], [1, 0], [4, 4],
    [2, 2], [2, 3], [3, 2], [3, 1], [2, 0],
    [0, 3], [4, 3], [0, 0], [2, 4], [0, 4],
    [4, 0], [3, 4], [0, 2], [4, 1], [1, 1],
    [3, 0], [1, 3], [0, 1], [2, 1], [3, 3]
  ];
  const last = play(game, moves);
  assert.equal(game.history.length, 25);
  assert.equal(game.status, 'finished');
  assert.equal(game.result, 'draw');
  assert.equal(last.draw, true);
  assert.equal(last.win, null);
  assert.equal(game.winLine, null);
});

test('T-12 终局后落子返回 GAME_OVER，状态不变', () => {
  const game = finishedGame();
  const before = Array.from(game.board);
  const historyLength = game.history.length;
  const result = Core.place(game, 10, 10);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'GAME_OVER');
  assert.deepEqual(Array.from(game.board), before);
  assert.equal(game.history.length, historyLength);
  assert.equal(game.status, 'finished');
});

test('T-13 悔棋：棋盘恢复空点、历史 -1、turn 回退到该步执子方', () => {
  const game = Core.createGame();
  Core.place(game, 0, 0);
  Core.place(game, 1, 1);
  const result = Core.undo(game);
  assert.equal(result.ok, true);
  assert.equal(result.undone, 1);
  assert.equal(game.board[Core.idx(1, 1, SIZE)], Core.EMPTY);
  assert.equal(game.history.length, 1);
  assert.equal(game.turn, Core.WHITE);
  assert.deepEqual(game.lastMove, { x: 0, y: 0, color: Core.BLACK, no: 1 });
});

test('T-13b 悔棋可一次回退多步', () => {
  const game = Core.createGame();
  Core.place(game, 0, 0);
  Core.place(game, 1, 1);
  Core.place(game, 2, 2);
  const result = Core.undo(game, 2);
  assert.equal(result.ok, true);
  assert.equal(result.undone, 2);
  assert.equal(game.history.length, 1);
  assert.equal(game.board[Core.idx(2, 2, SIZE)], Core.EMPTY);
  assert.equal(game.turn, Core.WHITE);
  assert.equal(game.lastMove.no, 1);
});

test('T-14 历史为空时悔棋返回 NOTHING_TO_UNDO', () => {
  const game = Core.createGame();
  const result = Core.undo(game);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'NOTHING_TO_UNDO');
  assert.equal(game.status, 'playing');
});

test('T-15 终局后悔棋：回到 playing、result=null', () => {
  const game = finishedGame();
  assert.equal(game.status, 'finished');
  const result = Core.undo(game);
  assert.equal(result.ok, true);
  assert.equal(game.status, 'playing');
  assert.equal(game.result, null);
  assert.equal(game.winLine, null);
  assert.equal(game.history.length, 8);
  assert.equal(game.turn, Core.BLACK);
});

test('T-16 重新开始：棋盘全空、黑先、历史清空', () => {
  const game = finishedGame();
  Core.reset(game);
  assert.ok(game.board.every((v) => v === Core.EMPTY));
  assert.equal(game.turn, Core.BLACK);
  assert.equal(game.history.length, 0);
  assert.equal(game.status, 'playing');
  assert.equal(game.result, null);
  assert.equal(game.lastMove, null);
  assert.equal(game.winLine, null);
});

test('T-17 贴边五连正确判胜，不越界', () => {
  const game = Core.createGame();
  play(game, [
    [0, 14], [0, 12],
    [1, 14], [1, 12],
    [2, 14], [2, 12],
    [3, 14], [3, 12],
    [4, 14]
  ]);
  assert.equal(game.status, 'finished');
  assert.equal(game.result, Core.BLACK);
  assert.deepEqual(game.winLine, [[0, 14], [1, 14], [2, 14], [3, 14], [4, 14]]);
});

test('T-18 胜负判定幂等，同一局面重复调用结果一致', () => {
  const board = Core.createBoard(SIZE);
  for (let i = 0; i < 5; i += 1) {
    board[Core.idx(3 + i, 6 + i, SIZE)] = Core.WHITE;
  }
  const first = Core.checkWin(board, SIZE, 5, 8, Core.WHITE);
  const second = Core.checkWin(board, SIZE, 5, 8, Core.WHITE);
  assert.deepEqual(first, second);
  assert.equal(first.line.length, 5);
  assert.equal(Core.checkWin(board, SIZE, 0, 0, Core.WHITE), null);
  assert.equal(Core.checkWin(board, SIZE, -1, 0, Core.WHITE), null);
});
