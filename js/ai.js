/**
 * 五子棋简单 AI（P1 增强项）。
 *
 * 决策模型见 docs/gomoku-design.md 6.5 节：
 *   1) 候选点只取已有棋子周围 SEARCH_RADIUS 格内的空点，空盘首手走天元；
 *   2) 对每个候选点分别按"己方落子后"与"对方落子后"的棋型打分；
 *   3) score = attack * 1.0 + defense * 0.9，同分时偏向棋盘中心；
 *   4) 短路规则：己方有成五点直接下；对方有成五点必须堵。
 *
 * 约束：不读写 DOM、不使用 Math.random、不依赖计时，便于复盘与测试。
 * UMD 兼容：浏览器挂载到 window.GomokuAI，Node 下通过 require 引入。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'));
  } else {
    root.GomokuAI = factory(root.GomokuCore);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';

  var EMPTY = Core.EMPTY;
  var BLACK = Core.BLACK;
  var WHITE = Core.WHITE;
  var idx = Core.idx;
  var inBounds = Core.inBounds;

  var SEARCH_RADIUS = 2;
  var DEFENSE_WEIGHT = 0.9;

  // 棋型分值，与设计文档 6.5 节表格一致。
  var PATTERN = {
    FIVE: 10000000,
    OPEN_FOUR: 1000000,
    FOUR: 100000,
    OPEN_THREE: 10000,
    THREE: 1000,
    OPEN_TWO: 100,
    TWO: 10
  };

  var DIRECTIONS = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];

  function opponentOf(color) {
    return color === BLACK ? WHITE : BLACK;
  }

  /** 连续同色子数与两端开放度 → 棋型分。 */
  function shapeScore(count, openEnds) {
    if (count >= 5) {
      return PATTERN.FIVE;
    }
    if (count === 4) {
      if (openEnds === 2) return PATTERN.OPEN_FOUR;
      if (openEnds === 1) return PATTERN.FOUR;
      return 0;
    }
    if (count === 3) {
      if (openEnds === 2) return PATTERN.OPEN_THREE;
      if (openEnds === 1) return PATTERN.THREE;
      return 0;
    }
    if (count === 2) {
      if (openEnds === 2) return PATTERN.OPEN_TWO;
      if (openEnds === 1) return PATTERN.TWO;
      return 0;
    }
    return openEnds === 2 ? 1 : 0;
  }

  /**
   * 评估空点 (x, y) 落下 color 后，某一方向上的棋型分。
   * 只考虑"连续同色 + 两端是否为空"的轻量分类，满足简单难度需要。
   */
  function directionScore(board, size, x, y, color, dx, dy) {
    var forward = 0;
    var nx = x + dx;
    var ny = y + dy;
    while (inBounds(nx, ny, size) && board[idx(nx, ny, size)] === color) {
      forward += 1;
      nx += dx;
      ny += dy;
    }
    var openForward = inBounds(nx, ny, size) && board[idx(nx, ny, size)] === EMPTY ? 1 : 0;

    var backward = 0;
    nx = x - dx;
    ny = y - dy;
    while (inBounds(nx, ny, size) && board[idx(nx, ny, size)] === color) {
      backward += 1;
      nx -= dx;
      ny -= dy;
    }
    var openBackward = inBounds(nx, ny, size) && board[idx(nx, ny, size)] === EMPTY ? 1 : 0;

    // +1 表示落在 (x, y) 的这颗子本身。
    return shapeScore(1 + forward + backward, openForward + openBackward);
  }

  /**
   * 评估在空点 (x, y) 落 color 子后四个方向的棋型分之和。
   * @returns {number}
   */
  function evaluatePoint(board, size, x, y, color) {
    var total = 0;
    for (var d = 0; d < DIRECTIONS.length; d += 1) {
      total += directionScore(board, size, x, y, color, DIRECTIONS[d][0], DIRECTIONS[d][1]);
    }
    return total;
  }

  /** 生成候选点：已有棋子周围 SEARCH_RADIUS 格内的空点；空棋盘返回天元。 */
  function candidateMoves(game) {
    var size = game.size;
    var board = game.board;
    var center = Math.floor(size / 2);
    if (game.history.length === 0) {
      return [{ x: center, y: center }];
    }
    var seen = new Set();
    var result = [];
    for (var i = 0; i < game.history.length; i += 1) {
      var move = game.history[i];
      for (var dy = -SEARCH_RADIUS; dy <= SEARCH_RADIUS; dy += 1) {
        for (var dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx += 1) {
          var x = move.x + dx;
          var y = move.y + dy;
          if (!inBounds(x, y, size) || board[idx(x, y, size)] !== EMPTY) {
            continue;
          }
          var key = y * size + x;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          result.push({ x: x, y: y });
        }
      }
    }
    return result;
  }

  /** 在候选点中取离棋盘中心最近的一个（用于必堵点同分时的取舍）。 */
  function nearestToCenter(cells, size) {
    var center = (size - 1) / 2;
    var best = cells[0];
    var bestDist = Math.abs(best.x - center) + Math.abs(best.y - center);
    for (var i = 1; i < cells.length; i += 1) {
      var dist = Math.abs(cells[i].x - center) + Math.abs(cells[i].y - center);
      if (dist < bestDist) {
        best = cells[i];
        bestDist = dist;
      }
    }
    return { x: best.x, y: best.y };
  }

  /**
   * 选择落子点，不修改 game。
   * @param {object} game GameState
   * @param {'simple'} [level] 难度，目前仅实现 simple（启发式）
   * @returns {{x:number, y:number}|null} 无合法点时返回 null
   */
  function chooseMove(game, level) {
    if (!game || game.status !== 'playing') {
      return null;
    }
    var candidates = candidateMoves(game);
    if (candidates.length === 0) {
      return null;
    }
    var color = game.turn;
    var opponent = opponentOf(color);
    var i;
    var cell;

    // 短路 1：己方能成五，直接获胜。
    for (i = 0; i < candidates.length; i += 1) {
      cell = candidates[i];
      if (evaluatePoint(game.board, game.size, cell.x, cell.y, color) >= PATTERN.FIVE) {
        return { x: cell.x, y: cell.y };
      }
    }

    // 短路 2：对方下一步能成五，必须封堵。
    var threats = [];
    for (i = 0; i < candidates.length; i += 1) {
      cell = candidates[i];
      if (evaluatePoint(game.board, game.size, cell.x, cell.y, opponent) >= PATTERN.FIVE) {
        threats.push(cell);
      }
    }
    if (threats.length > 0) {
      return nearestToCenter(threats, game.size);
    }

    // 常规打分：进攻 + 防守（防守权重 0.9 缓解"只顾进攻"）。
    var center = (game.size - 1) / 2;
    var best = null;
    var bestScore = -Infinity;
    var bestDist = Infinity;
    for (i = 0; i < candidates.length; i += 1) {
      cell = candidates[i];
      var attack = evaluatePoint(game.board, game.size, cell.x, cell.y, color);
      var defense = evaluatePoint(game.board, game.size, cell.x, cell.y, opponent);
      var score = attack + defense * DEFENSE_WEIGHT;
      var dist = Math.abs(cell.x - center) + Math.abs(cell.y - center);
      if (score > bestScore || (score === bestScore && dist < bestDist)) {
        best = cell;
        bestScore = score;
        bestDist = dist;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  return {
    PATTERN: PATTERN,
    SEARCH_RADIUS: SEARCH_RADIUS,
    DEFENSE_WEIGHT: DEFENSE_WEIGHT,
    shapeScore: shapeScore,
    evaluatePoint: evaluatePoint,
    candidateMoves: candidateMoves,
    chooseMove: chooseMove
  };
});
