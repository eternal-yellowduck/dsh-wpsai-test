/**
 * 简单 AI 单元测试（node --test tests/ai.test.js）。
 * 覆盖设计文档 6.5 节的候选点生成、棋型评分、必胜/必堵短路与确定性要求。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../js/core.js');
const AI = require('../js/ai.js');

/** 按 [x, y] 序列交替落子（黑先），返回对局。 */
function play(game, moves) {
  for (const [x, y] of moves) {
    const result = Core.place(game, x, y);
    assert.equal(result.ok, true, `落子 (${x},${y}) 失败：${JSON.stringify(result)}`);
  }
  return game;
}

test('A-01 空棋盘首手落在天元 (7,7)', () => {
  const game = Core.createGame();
  assert.deepEqual(AI.candidateMoves(game), [{ x: 7, y: 7 }]);
  assert.deepEqual(AI.chooseMove(game, 'simple'), { x: 7, y: 7 });
});

test('A-02 候选点均为空点、位于已有棋子周围 2 格内', () => {
  const game = play(Core.createGame(), [[7, 7], [8, 8], [2, 3]]);
  const candidates = AI.candidateMoves(game);
  assert.ok(candidates.length > 0);
  for (const cell of candidates) {
    assert.equal(game.board[Core.idx(cell.x, cell.y, game.size)], Core.EMPTY);
    const near = game.history.some(
      (move) => Math.abs(move.x - cell.x) <= AI.SEARCH_RADIUS && Math.abs(move.y - cell.y) <= AI.SEARCH_RADIUS
    );
    assert.equal(near, true, `候选点 (${cell.x},${cell.y}) 不在任何棋子周围`);
  }
});

test('A-03 己方有成五点：直接成五获胜', () => {
  const game = play(Core.createGame(), [
    [1, 0], [5, 5],
    [1, 2], [6, 5],
    [1, 4], [7, 5],
    [1, 6], [8, 5],
    [3, 3]
  ]);
  assert.equal(game.turn, Core.WHITE);
  assert.equal(game.status, 'playing');
  const move = AI.chooseMove(game, 'simple');
  assert.ok(move, 'AI 应返回落子点');
  const winning = [[4, 5], [9, 5]].some(([x, y]) => x === move.x && y === move.y);
  assert.equal(winning, true, `AI 应下在 (4,5) 或 (9,5)，实际为 (${move.x},${move.y})`);
});

test('A-04 对方有成五点：必须封堵', () => {
  const game = play(Core.createGame(), [
    [5, 5], [0, 0],
    [6, 5], [0, 2],
    [7, 5], [0, 4],
    [8, 5]
  ]);
  assert.equal(game.turn, Core.WHITE);
  const move = AI.chooseMove(game, 'simple');
  assert.ok(move, 'AI 应返回落子点');
  const blocking = [[4, 5], [9, 5]].some(([x, y]) => x === move.x && y === move.y);
  assert.equal(blocking, true, `AI 应封堵 (4,5) 或 (9,5)，实际为 (${move.x},${move.y})`);
});

test('A-05 己方与对方同时有成五点：优先自己获胜', () => {
  const game = play(Core.createGame(), [
    [5, 7], [5, 5],
    [6, 7], [6, 5],
    [7, 7], [7, 5],
    [8, 7], [8, 5],
    [0, 0]
  ]);
  assert.equal(game.turn, Core.WHITE);
  const move = AI.chooseMove(game, 'simple');
  assert.ok(move, 'AI 应返回落子点');
  const winning = [[4, 5], [9, 5]].some(([x, y]) => x === move.x && y === move.y);
  assert.equal(winning, true, `AI 应自己成五，实际为 (${move.x},${move.y})`);
});

test('A-06 决策确定性：同一局面重复调用返回同一点', () => {
  const game = play(Core.createGame(), [
    [7, 7], [6, 6],
    [8, 8], [5, 5],
    [7, 8], [6, 8]
  ]);
  const first = AI.chooseMove(game, 'simple');
  const second = AI.chooseMove(game, 'simple');
  assert.deepEqual(first, second);
});

test('A-07 决策不修改对局状态', () => {
  const game = play(Core.createGame(), [[7, 7], [8, 8], [6, 6]]);
  const boardBefore = Array.from(game.board);
  const historyBefore = game.history.map((move) => ({ ...move }));
  const turnBefore = game.turn;
  const statusBefore = game.status;
  AI.chooseMove(game, 'simple');
  assert.deepEqual(Array.from(game.board), boardBefore);
  assert.deepEqual(game.history, historyBefore);
  assert.equal(game.turn, turnBefore);
  assert.equal(game.status, statusBefore);
});

test('A-08 终局或无合法点时返回 null', () => {
  const game = play(Core.createGame(), [
    [0, 0], [0, 1],
    [1, 0], [1, 1],
    [2, 0], [2, 1],
    [3, 0], [3, 1],
    [4, 0]
  ]);
  assert.equal(game.status, 'finished');
  assert.equal(AI.chooseMove(game, 'simple'), null);
  assert.equal(AI.chooseMove(null, 'simple'), null);
});

test('A-09 单步决策耗时满足 < 300ms 的性能要求', () => {
  const game = play(Core.createGame(), [
    [7, 7], [8, 8],
    [6, 6], [8, 6],
    [6, 8], [9, 9],
    [5, 5], [7, 9]
  ]);
  const started = process.hrtime.bigint();
  const move = AI.chooseMove(game, 'simple');
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(move, 'AI 应返回落子点');
  assert.ok(elapsedMs < 300, `AI 决策耗时 ${elapsedMs.toFixed(2)}ms 超出 300ms`);
});
