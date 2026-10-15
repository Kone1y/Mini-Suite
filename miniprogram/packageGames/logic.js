// 2048 核心逻辑（纯函数，与 UI 解耦，可直接单测）
// 棋盘：4x4 一维数组，0 为空格

function emptyBoard() {
  return new Array(16).fill(0)
}

// 随机放一个新数字（90% 为 2，10% 为 4）
function spawnTile(board) {
  const empties = []
  for (let i = 0; i < 16; i++) if (board[i] === 0) empties.push(i)
  if (!empties.length) return -1
  const idx = empties[Math.floor(Math.random() * empties.length)]
  board[idx] = Math.random() < 0.9 ? 2 : 4
  return idx
}

function initBoard() {
  const board = emptyBoard()
  spawnTile(board)
  spawnTile(board)
  return board
}

// 提取第 row 行（4 个元素）
function getRow(board, row) {
  return [board[row * 4], board[row * 4 + 1], board[row * 4 + 2], board[row * 4 + 3]]
}
function setRow(board, row, vals) {
  for (let c = 0; c < 4; c++) board[row * 4 + c] = vals[c]
}
// 提取第 col 列
function getCol(board, col) {
  return [board[col], board[4 + col], board[8 + col], board[12 + col]]
}
function setCol(board, col, vals) {
  for (let r = 0; r < 4; r++) board[r * 4 + col] = vals[r]
}

// 核心：把一行向左滑动合并。
// 返回 { line, gained, moved }：新行、本轮得分、是否有位移
function slideLine(line) {
  const nums = line.filter(v => v !== 0)
  const out = []
  let gained = 0
  for (let i = 0; i < nums.length; i++) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      const merged = nums[i] * 2
      out.push(merged)
      gained += merged
      i++   // 跳过已合并的下一个
    } else {
      out.push(nums[i])
    }
  }
  while (out.length < 4) out.push(0)
  const moved = out.some((v, i) => v !== line[i])
  return { line: out, gained, moved }
}

// 方向移动：left/right/up/down，返回 { board, gained, moved }
// slideLine 一律向 index 0 滑动：right/down 需先翻转、滑完再翻回
function move(board, dir) {
  const nb = board.slice()
  let gained = 0, moved = false
  const needReverse = (dir === 'right' || dir === 'down')
  for (let i = 0; i < 4; i++) {
    let line
    if (dir === 'left' || dir === 'right') line = getRow(nb, i)
    else line = getCol(nb, i)
    if (needReverse) line.reverse()
    const r = slideLine(line)
    gained += r.gained
    if (r.moved) moved = true
    let out = r.line
    if (needReverse) out = out.slice().reverse()
    if (dir === 'left' || dir === 'right') setRow(nb, i, out)
    else setCol(nb, i, out)
  }
  return { board: nb, gained, moved }
}

function canMove(board) {
  if (board.some(v => v === 0)) return true
  const b = board
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const v = b[r * 4 + c]
      if (c < 3 && b[r * 4 + c + 1] === v) return true
      if (r < 3 && b[(r + 1) * 4 + c] === v) return true
    }
  }
  return false
}

function hasWon(board) {
  return board.some(v => v >= 2048)
}

module.exports = { emptyBoard, spawnTile, initBoard, move, canMove, hasWon }
