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

// 统计一条线上的棋型：以 (x,y) 为中心（视为已落 v），方向 (dx,dy)
// 正确做法：取以中心为基准的线段数组（中心在索引 5），从中心向两侧延伸统计连长与端点。
// 允许恰好一个空格缺口（用于识别"冲四/缺口四"等必胜形），缺口须紧接 v 且可落子。
function lineScore(board, x, y, dx, dy, v) {
  // 线段：中心 ±5 格，共 11，中心视为 v
  const seg = new Array(11)
  for (let i = -5; i <= 5; i++) {
    if (i === 0) { seg[i + 5] = v; continue }
    const nx = x + dx * i, ny = y + dy * i
    if (nx < 0 || nx >= N || ny < 0 || ny >= N) seg[i + 5] = -1
    else seg[i + 5] = board[ny][nx]
  }
  const C = 5 // 中心索引
  // 从中心一侧延伸：计连续 v，允许恰好一个空格缺口（缺口后须接 v）；返回连长与端点状态
  function arm(start, step) {
    let n = 0, gapUsed = false, open = false, block = false
    let i = start
    while (i >= 0 && i <= 10) {
      const cell = seg[i]
      if (cell === v) { n++; i += step; continue }
      if (cell === 0 && !gapUsed) {
        const ni = i + step
        if (ni >= 0 && ni <= 10 && seg[ni] === v) { gapUsed = true; i += step; continue }
        open = true; break
      }
      block = true; break
    }
    if (i < 0 || i > 10) block = true
    return { n, gapUsed, open, block }
  }
  const left = arm(C - 1, -1)
  const right = arm(C + 1, 1)
  const total = 1 + left.n + right.n
  const gapUsed = left.gapUsed || right.gapUsed
  const bothOpen = left.open && right.open

  if (!gapUsed) {
    if (total >= 5) return SCORES.five
    if (total === 4) return bothOpen ? SCORES.openFour : SCORES.four
    if (total === 3) return bothOpen ? SCORES.openThree : SCORES.three
    if (total === 2) return bothOpen ? SCORES.openTwo : SCORES.two
    return bothOpen ? SCORES.two / 2 : 0
  }
  // 含一个缺口：填缺口后等价长度 = total（仍差一步成五）
  if (total >= 5) return bothOpen ? SCORES.openFour : SCORES.four
  if (total === 4) return bothOpen ? SCORES.openFour : SCORES.four
  if (total === 3) return bothOpen ? SCORES.openThree : SCORES.three
  if (total === 2) return bothOpen ? SCORES.openTwo : SCORES.two
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

// AI 选点：在已有棋子邻域 2 格内选点（休闲/旧版贪心）
function aiMove(board, ai = 2) {
  const human = ai === 1 ? 2 : 1
  const hasAny = board.some(row => row.some(c => c !== 0))
  if (!hasAny) return { x: 7, y: 7 }

  let best = null, bestScore = -1
  const visited = new Set()
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (board[y][x] === 0) continue
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

// 候选点：已有棋子邻域 2 格内的空位，按 (攻分+守分) 降序取前 K
function genMoves(board, v, k) {
  const op = v === 1 ? 2 : 1
  const visited = new Set()
  const cand = []
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (board[y][x] === 0) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue
          if (board[ny][nx] !== 0) continue
          const key = ny * N + nx
          if (visited.has(key)) continue
          visited.add(key)
          cand.push({ x: nx, y: ny, s: evalPoint(board, nx, ny, v) + evalPoint(board, nx, ny, op) * 0.9 })
        }
      }
    }
  }
  cand.sort((a, b) => b.s - a.s)
  return cand.slice(0, k || 10)
}

// ================= 局面评估（威胁感知，能识别双三/四三等必胜形） =================
// 旧版 evalBoardFast 只取"单方单点最大威胁"，会漏掉"双三/四三"这类必胜形；
// 新版对每方取"进攻价值最高的两个落点之和"，双威胁自然被放大，从而会主动制造并封堵。

// 候选落点：已有棋子邻域 2 格内的所有空位（不评分，供评估复用）
function candidateCells(board) {
  const visited = new Set()
  const cells = []
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (board[y][x] === 0) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= N || ny < 0 || ny >= N || board[ny][nx] !== 0) continue
          const key = ny * N + nx
          if (visited.has(key)) continue
          visited.add(key)
          cells.push({ x: nx, y: ny })
        }
      }
    }
  }
  return cells
}

// 双方"前两名进攻威胁之和"（衡量威胁总量，双威胁自然被放大）
function evalSides(board, ai) {
  const human = ai === 1 ? 2 : 1
  const cells = candidateCells(board)
  let a1 = 0, a2 = 0, h1 = 0, h2 = 0
  for (const c of cells) {
    const a = evalPoint(board, c.x, c.y, ai)
    const h = evalPoint(board, c.x, c.y, human)
    if (a > a1) { a2 = a1; a1 = a } else if (a > a2) { a2 = a }
    if (h > h1) { h2 = h1; h1 = h } else if (h > h2) { h2 = h }
  }
  return { a: a1 + a2, h: h1 + h2 }
}

// 局面评估（AI 视角）：越大越利于 AI
function evaluate(board, ai) {
  const { a, h } = evalSides(board, ai)
  // 即时连五：某方存在"落一子即五连"的点（evalPoint 达 five 量级）
  if (a >= SCORES.five) return 1e9
  if (h >= SCORES.five) return -1e9
  // 双威胁放大于 evalSides 已体现；再给人类威胁略高权重（偏防守）
  return a - h * 1.15
}

// 落子后立即成五检测（快路径：checkWin 只查落点）
function winsAt(board, x, y, v) {
  return checkWin(board, x, y) !== null
}

// 极小极大 + α-β（AI 视角直接写，不用 negamax 取负——避免符号混乱）
// 节点预算 budget.n 与 deadline 双保险，确保移动端不会卡死
function alphabeta(board, depth, alpha, beta, isMax, ai, budget, deadline) {
  if (budget.n <= 0 || (deadline && Date.now() > deadline)) return evaluate(board, ai)
  budget.n--
  const mover = isMax ? ai : (ai === 1 ? 2 : 1)
  const cand = genMoves(board, mover, depth >= 3 ? 12 : 9)
  if (!cand.length) return evaluate(board, ai)
  let best = isMax ? -Infinity : Infinity
  for (const c of cand) {
    board[c.y][c.x] = mover
    let val
    if (winsAt(board, c.x, c.y, mover)) {
      // 终局分：AI 赢大正，人赢大负；深度越浅（越快分出）越极端
      val = isMax ? (SCORES.five + depth * 1000) : -(SCORES.five + depth * 1000)
    } else if (depth <= 1) {
      val = evaluate(board, ai)
    } else {
      val = alphabeta(board, depth - 1, alpha, beta, !isMax, ai, budget, deadline)
    }
    board[c.y][c.x] = 0
    if (isMax) {
      if (val > best) best = val
      if (best > alpha) alpha = best
    } else {
      if (val < best) best = val
      if (best < beta) beta = best
    }
    if (alpha >= beta) break
  }
  return best
}

// 强化 AI 主入口：level 1=旧贪心(休闲) 2=标准(浅搜) 3=大师(深搜)
function aiMoveStrong(board, ai = 2, level = 2) {
  if (level <= 1) return aiMove(board, ai)
  const human = ai === 1 ? 2 : 1
  // ①一步成五：直接下
  const winNow = findImmediate(board, ai)
  if (winNow) return winNow
  // ②对方一步成五：必堵
  const blockNow = findImmediate(board, human)
  if (blockNow) return blockNow

  const depth = level === 3 ? 6 : 4
  const budget = { n: level === 3 ? 8000 : 4000 }
  const deadline = Date.now() + (level === 3 ? 900 : 600)
  const cand = genMoves(board, ai, level === 3 ? 16 : 12)
  if (!cand.length) return aiMove(board, ai)
  let best = cand[0], bestVal = -Infinity, alpha = -Infinity
  for (const c of cand) {
    board[c.y][c.x] = ai
    let val
    if (winsAt(board, c.x, c.y, ai)) val = 2 * SCORES.five
    else val = alphabeta(board, depth - 1, alpha, Infinity, false, ai, budget, deadline)
    board[c.y][c.x] = 0
    if (val > bestVal) { bestVal = val; best = c }
    if (val > alpha) alpha = val
    if (budget.n <= 0 || Date.now() > deadline) break
  }
  return { x: best.x, y: best.y }
}

// 找 v 方一步成五的点
function findImmediate(board, v) {
  const visited = new Set()
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (board[y][x] === 0) continue
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= N || ny < 0 || ny >= N || board[ny][nx] !== 0) continue
          const key = ny * N + nx
          if (visited.has(key)) continue
          visited.add(key)
          board[ny][nx] = v
          const w = winsAt(board, nx, ny, v)
          board[ny][nx] = 0
          if (w) return { x: nx, y: ny }
        }
      }
    }
  }
  return null
}

module.exports = { N, emptyBoard, canPlay, checkWin, isFull, aiMove, evalPoint, lineScore, SCORES, aiMoveStrong, genMoves, findImmediate, evaluate, candidateCells, evalSides }
