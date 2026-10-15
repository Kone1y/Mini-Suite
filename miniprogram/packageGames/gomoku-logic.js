// 五子棋核心逻辑（纯函数）：15×15，启发式 AI
// 玩家=1（黑），AI=2（白）

const N = 15

function emptyBoard() {
  return Array.from({ length: N }, () => new Array(N).fill(0))
}

// 落子合法性
function canPlay(board, x, y) {
  return x >= 0 && x < N && y >= 0 && y < N && board[y][x] === 0
}

// 胜负判定：返回 0=无胜负 / {win: 1|2, line: 五连坐标}
function checkWin(board, x, y) {
  const v = board[y][x]
  if (!v) return null
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]]
  for (const [dx, dy] of dirs) {
    const line = [[x, y]]
    for (const sign of [1, -1]) {
      let nx = x + dx * sign, ny = y + dy * sign
      while (nx >= 0 && nx < N && ny >= 0 && ny < N && board[ny][nx] === v) {
        line.push([nx, ny])
        nx += dx * sign; ny += dy * sign
      }
    }
    if (line.length >= 5) return { win: v, line }
  }
  return null
}

// 是否满盘
function isFull(board) {
  return board.every(row => row.every(c => c !== 0))
}

// ===== AI：棋型评分 =====
// 对某点落子后，计算该点四个方向上己方形成的棋型分数 + 阻断对方的分数
const SCORES = {
  five: 10000000,      // 连五
  openFour: 1000000,   // 活四
  four: 100000,        // 冲四
  openThree: 50000,    // 活三
  three: 5000,         // 眠三
  openTwo: 1000,       // 活二
  two: 200             // 眠二
}

// 统计一条线上的棋型：以 (x,y) 为中心，方向 (dx,dy)，落 v 后
function lineScore(board, x, y, dx, dy, v) {
  // 取该方向前后各 4 格的状态串（-1 出界，0 空，v 己方，对方记为 3）
  const seq = []
  for (let i = -4; i <= 4; i++) {
    if (i === 0) { seq.push(v); continue }
    const nx = x + dx * i, ny = y + dy * i
    if (nx < 0 || nx >= N || ny < 0 || ny >= N) seq.push(-1)
    else seq.push(board[ny][nx])
  }
  const S = seq.join(',')
  const me = v, op = v === 1 ? 2 : 1
  // 以中心为界检查连长与端点
  const isMe = i => seq[i] === me
  const isEmpty = i => seq[i] === 0
  const isBlock = i => seq[i] === op || seq[i] === -1

  // 从中心向两边延伸的连长
  let cnt = 1
  let i = 1
  while (i <= 4 && isMe(i)) { cnt++; i++ }
  const leftEnd = i <= 4 ? seq[i] : -1
  let j = -1
  while (j >= -4 && isMe(j)) { cnt++; j-- }
  const rightEnd = j >= -4 ? seq[j] : -1

  if (cnt >= 5) return SCORES.five
  const leftOpen = leftEnd === 0
  const rightOpen = rightEnd === 0
  const bothOpen = leftOpen && rightOpen
  if (cnt === 4) return bothOpen ? SCORES.openFour : (leftOpen || rightOpen ? SCORES.four : 0)
  if (cnt === 3) {
    if (bothOpen) return SCORES.openThree
    return leftOpen || rightOpen ? SCORES.three : 0
  }
  if (cnt === 2) {
    if (bothOpen) return SCORES.openTwo
    return leftOpen || rightOpen ? SCORES.two : 0
  }
  // 单子：看两端
  return bothOpen ? SCORES.two / 2 : 0
}

// 评估点 (x,y) 对 v 的价值（四方向棋型分之和）
function evalPoint(board, x, y, v) {
  let total = 0
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    total += lineScore(board, x, y, dx, dy, v)
  }
  return total
}

// AI 选点：在已有棋子邻域 2 格内选点
// 评分 = 进攻分（自己落） + 防守分（对方落此点的价值）× 0.9
function aiMove(board, ai = 2) {
  const human = ai === 1 ? 2 : 1
  // 首手：中心
  const hasAny = board.some(row => row.some(c => c !== 0))
  if (!hasAny) return { x: 7, y: 7 }

  let best = null, bestScore = -1
  const visited = new Set()
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (board[y][x] === 0) continue
      // 邻域 2 格
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue
          if (board[ny][nx] !== 0) continue
          const key = ny * N + nx
          if (visited.has(key)) continue
          visited.add(key)
          const attack = evalPoint(board, nx, ny, ai)
          const defend = evalPoint(board, nx, ny, human)
          const score = attack + defend * 0.9
          if (score > bestScore) {
            bestScore = score
            best = { x: nx, y: ny }
          }
        }
      }
    }
  }
  return best || { x: 7, y: 7 }
}

module.exports = { N, emptyBoard, canPlay, checkWin, isFull, aiMove, evalPoint, lineScore, SCORES }
