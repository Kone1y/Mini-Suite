// 俄罗斯方块核心逻辑（纯函数，与 UI 解耦）
// 10×20 棋盘；7 种方块（SRS 标准色号）；7-bag 随机

const COLS = 10, ROWS = 20

// 方块定义：每种 4 个旋转态（SRS 简化版：以 4x4/3x3 矩阵坐标表示）
// shape: 每个旋转态是 [x,y] 偏移数组
const SHAPES = {
  I: [
    [[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]],
    [[0,2],[1,2],[2,2],[3,2]], [[1,0],[1,1],[1,2],[1,3]]
  ],
  O: [
    [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]]
  ],
  T: [
    [[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]]
  ],
  S: [
    [[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]],
    [[1,1],[2,1],[0,2],[1,2]], [[0,0],[0,1],[1,1],[1,2]]
  ],
  Z: [
    [[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[1,2],[2,2]], [[1,0],[0,1],[1,1],[0,2]]
  ],
  J: [
    [[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]],
    [[0,1],[1,1],[2,1],[2,2]], [[2,0],[2,1],[1,2],[2,2]]
  ],
  L: [
    [[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]],
    [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[0,1],[0,2]]
  ]
}

// 每种方块的矩阵边长（用于旋转边界）
const BOX = { I: 4, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 }

function emptyGrid() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0))
}

// 7-bag 随机器
function makeBag() {
  const bag = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

// 新方块（出生位置：顶部居中）
function spawnPiece(type) {
  return { type, rot: 0, x: 3, y: type === 'I' ? -1 : 0 }
}

// 方块占据的绝对格子
function cellsOf(piece) {
  return SHAPES[piece.type][piece.rot].map(([cx, cy]) => [piece.x + cx, piece.y + cy])
}

// 碰撞检测（越界/叠已落块视为碰撞；y<0 允许）
function collides(grid, piece) {
  return cellsOf(piece).some(([x, y]) => (
    x < 0 || x >= COLS || y >= ROWS || (y >= 0 && grid[y][x] !== 0)
  ))
}

// 旋转（尝试 wall kick：偏移 0/-1/+1/-2/+2）
function tryRotate(grid, piece) {
  const cand = { type: piece.type, rot: (piece.rot + 1) % 4, x: piece.x, y: piece.y }
  const kicks = [0, -1, 1, -2, 2]
  for (const k of kicks) {
    cand.x = piece.x + k
    if (!collides(grid, cand)) return cand
  }
  return null
}

// 下移一格；到底返回 null
function tryDown(grid, piece) {
  const cand = Object.assign({}, piece, { y: piece.y + 1 })
  return collides(grid, cand) ? null : cand
}

// 左右移
function tryMove(grid, piece, dx) {
  const cand = Object.assign({}, piece, { x: piece.x + dx })
  return collides(grid, cand) ? null : cand
}

// 硬降（直落到底）
function hardDrop(grid, piece) {
  let p = piece
  while (true) {
    const next = tryDown(grid, p)
    if (!next) return p
    p = next
  }
}

// 锁定进棋盘，返回新棋盘与消掉的行号
function lock(grid, piece) {
  const g = grid.map(row => row.slice())
  cellsOf(piece).forEach(([x, y]) => {
    if (y >= 0) g[y][x] = piece.type
  })
  const cleared = []
  for (let r = 0; r < ROWS; r++) {
    if (g[r].every(v => v !== 0)) cleared.push(r)
  }
  cleared.forEach(r => { g.splice(r, 1); g.unshift(new Array(COLS).fill(0)) })
  return { grid: g, cleared }
}

// 落点投影（ghost piece 位置）
function ghostOf(grid, piece) {
  return hardDrop(grid, piece)
}

// 计分（任天堂近似）：1/2/3/4 行 × (40+100+300+1200)×(level+1)
function scoreOf(lines, level) {
  const base = [0, 40, 100, 300, 1200][lines] || 0
  return base * (level + 1)
}

// 等级速度（ms/格）
function speedOf(level) {
  return Math.max(80, 800 - (level - 1) * 65)
}

module.exports = {
  COLS, ROWS, SHAPES, BOX, emptyGrid, makeBag, spawnPiece,
  cellsOf, collides, tryRotate, tryDown, tryMove, hardDrop,
  lock, ghostOf, scoreOf, speedOf
}
