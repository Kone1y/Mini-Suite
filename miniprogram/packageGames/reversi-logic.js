// 黑白棋（Reversi/Othello）核心逻辑：纯函数，与页面解耦，可单测
// 棋盘：8×8 一维数组，0=空 1=黑 2=白；黑先行
// 坐标：idx = y*8+x

const SIZE = 8
const EMPTY = 0, BLACK = 1, WHITE = 2

// 8 方向
const DIRS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1], [0, 1], [1, 1]
]

// 初始局面：中心 2×2 交错
function initialBoard() {
  const b = new Array(64).fill(EMPTY)
  b[27] = WHITE; b[28] = BLACK
  b[35] = BLACK; b[36] = WHITE
  return b
}

function opponent(player) { return player === BLACK ? WHITE : BLACK }

function inBounds(x, y) { return x >= 0 && x < SIZE && y >= 0 && y < SIZE }

// 落子 (x,y) 对 player 的被翻转格列表（不含自身）；非法返回 null
function flipsFor(board, x, y, player) {
  if (!inBounds(x, y)) return null
  const idx = y * SIZE + x
  if (board[idx] !== EMPTY) return null
  const opp = opponent(player)
  const flips = []
  for (const [dx, dy] of DIRS) {
    const line = []
    let cx = x + dx, cy = y + dy
    // 沿方向收集连续对手棋子
    while (inBounds(cx, cy) && board[cy * SIZE + cx] === opp) {
      line.push(cy * SIZE + cx)
      cx += dx; cy += dy
    }
    // 尾随必须是己方棋子才成夹
    if (line.length > 0 && inBounds(cx, cy) && board[cy * SIZE + cx] === player) {
      flips.push(...line)
    }
  }
  return flips.length > 0 ? flips : null
}

// 全部合法落子位（返回 idx 数组）
function validMoves(board, player) {
  const moves = []
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[y * SIZE + x] === EMPTY && flipsFor(board, x, y, player)) {
        moves.push(y * SIZE + x)
      }
    }
  }
  return moves
}

// 应用落子（返回新棋盘，不改原局面）
function applyMove(board, idx, player) {
  const x = idx % SIZE, y = Math.floor(idx / SIZE)
  const flips = flipsFor(board, x, y, player)
  if (!flips) return null
  const next = board.slice()
  next[idx] = player
  for (const f of flips) next[f] = player
  return next
}

// 双方棋子数
function countPieces(board) {
  let black = 0, white = 0
  for (const c of board) {
    if (c === BLACK) black++
    else if (c === WHITE) white++
  }
  return { black, white }
}

// ============ AI ============

// 位置权重表（经典）：角=100，角邻格=负分（送角），边=10
const WEIGHTS = (() => {
  const w = new Array(64)
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let v = 1
      const isCorner = (x === 0 || x === 7) && (y === 0 || y === 7)
      const isEdge = x === 0 || x === 7 || y === 0 || y === 7
      const isAdjacentCorner =
        (x <= 1 && y <= 1 && !(x === 0 && y === 0)) ||   // 左上角邻域(不含角)
        (x >= 6 && y <= 1 && !(x === 7 && y === 0)) ||   // 右上
        (x <= 1 && y >= 6 && !(x === 0 && y === 7)) ||   // 左下
        (x >= 6 && y >= 6 && !(x === 7 && y === 7))      // 右下
      if (isCorner) v = 120
      else if (isAdjacentCorner) v = -40
      else if (isEdge) v = 15
      else v = 3
      w[y * 8 + x] = v
    }
  }
  return w
})()

// 是否为"已占角旁的角邻格"——若角已被己方占，角邻格不再是负分
function evalBoard(board, player) {
  const opp = opponent(player)
  // 1) 位置权重差
  let posScore = 0
  for (let i = 0; i < 64; i++) {
    if (board[i] === player) posScore += WEIGHTS[i]
    else if (board[i] === opp) posScore -= WEIGHTS[i]
  }
  // 角被占后，其邻格降级惩罚（简单处理：角是己方时邻格惩罚减半，是对方时加倍）
  const cornerAdj = [[0, 1, 8, 9], [7, 6, 14, 15], [56, 48, 57, 49], [63, 62, 55, 54]]
  for (const [corner, ...adjs] of cornerAdj) {
    if (board[corner] === player) {
      for (const a of adjs) {
        if (board[a] === player) posScore += 30       // 自己角旁的己子不再糟
        else if (board[a] === opp) posScore -= 15
      }
    } else if (board[corner] === opp) {
      for (const a of adjs) {
        if (board[a] === player) posScore -= 30       // 送对方角的格子更糟
      }
    }
  }
  // 2) 行动力差（可落子数差）×8
  const myMob = validMoves(board, player).length
  const oppMob = validMoves(board, opp).length
  const mobScore = (myMob - oppMob) * 8
  // 3) 角落占有
  let cornerScore = 0
  for (const c of [0, 7, 56, 63]) {
    if (board[c] === player) cornerScore += 60
    else if (board[c] === opp) cornerScore -= 60
  }
  return posScore + mobScore + cornerScore
}

// 局面阶段（按空位数）
function gamePhase(board) {
  const empty = board.filter(c => c === EMPTY).length
  if (empty > 44) return 'early'
  if (empty > 12) return 'mid'
  return 'end'
}

// 残局精确分（终局用子数差最大化）
function finalScore(board, player) {
  const { black, white } = countPieces(board)
  const diff = player === BLACK ? black - white : white - black
  return diff > 0 ? 100000 + diff : (diff < 0 ? -100000 + diff : 0)
}

// Negamax + α-β 剪枝
// 返回 { score, move }；depth=0 时评估
function search(board, player, depth, alpha, beta, passed) {
  const moves = validMoves(board, player)
  // 终局：双无子可下
  if (moves.length === 0) {
    if (passed) {
      return { score: finalScore(board, player), move: -1 }
    }
    // 无子可下→跳过（pass 一手），深度不减（对手面临同样局面）
    const r = search(board, opponent(player), depth, -beta, -alpha, true)
    return { score: -r.score, move: -1 }
  }
  if (depth <= 0) {
    // 残局空位少时直接算到底（分支小）
    const empty = board.filter(c => c === EMPTY).length
    if (empty <= 10 && gamePhase(board) === 'end') {
      const r = searchEnd(board, player, alpha, beta, false)
      return { score: r.score, move: r.move }
    }
    return { score: evalBoard(board, player), move: moves[0] }
  }
  // 走法排序：先试角与高分位（提升剪枝率）
  const ordered = moves.slice().sort((a, b) => WEIGHTS[b] - WEIGHTS[a])
  let best = -Infinity, bestMove = ordered[0]
  for (const mv of ordered) {
    const next = applyMove(board, mv, player)
    const r = search(next, opponent(player), depth - 1, -beta, -alpha, false)
    const v = -r.score
    if (v > best) { best = v; bestMove = mv }
    if (v > alpha) alpha = v
    if (alpha >= beta) break   // β 剪枝
  }
  return { score: best, move: bestMove }
}

// 残局完全搜索（不再用深度限制，直接到终局）
function searchEnd(board, player, alpha, beta, passed) {
  const moves = validMoves(board, player)
  if (moves.length === 0) {
    if (passed) return { score: finalScore(board, player), move: -1 }
    const r = searchEnd(board, opponent(player), -beta, -alpha, true)
    return { score: -r.score, move: -1 }
  }
  let best = -Infinity, bestMove = moves[0]
  for (const mv of moves) {
    const next = applyMove(board, mv, player)
    const r = searchEnd(next, opponent(player), -beta, -alpha, false)
    const v = -r.score
    if (v > best) { best = v; bestMove = mv }
    if (v > alpha) alpha = v
    if (alpha >= beta) break
  }
  return { score: best, move: bestMove }
}

// AI 走子入口：depth 为搜索层数（难度）
function aiMove(board, player, depth) {
  depth = Math.max(1, depth | 0)
  const r = search(board, player, depth, -Infinity, Infinity, false)
  return r.move
}

// 对局是否结束（双方均无子可下）
function isOver(board) {
  return validMoves(board, BLACK).length === 0 && validMoves(board, WHITE).length === 0
}

module.exports = {
  SIZE, EMPTY, BLACK, WHITE, DIRS,
  initialBoard, opponent, flipsFor, validMoves, applyMove, countPieces,
  evalBoard, WEIGHTS, aiMove, search, isOver, gamePhase
}
