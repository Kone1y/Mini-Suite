// 扫雷核心逻辑（纯函数，与 UI 解耦）
// 棋盘 size×size（9/12/16），mines 颗雷；一维数组
// cell: { mine, revealed, flagged, num }

function newBoard(size = 9) {
  return Array.from({ length: size * size }, () => ({
    mine: false, revealed: false, flagged: false, num: 0
  }))
}

function neighbors(idx, size) {
  const r = Math.floor(idx / size), c = idx % size
  const out = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const nr = r + dr, nc = c + dc
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) out.push(nr * size + nc)
    }
  }
  return out
}

// 布雷：首点安全（首点及其邻居不放雷）
function placeMines(board, firstIdx, mines, size = 9) {
  const forbidden = new Set([firstIdx, ...neighbors(firstIdx, size)])
  const candidates = []
  for (let i = 0; i < board.length; i++) {
    if (!forbidden.has(i)) candidates.push(i)
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  candidates.slice(0, mines).forEach(idx => { board[idx].mine = true })
  for (let i = 0; i < board.length; i++) {
    if (board[i].mine) continue
    board[i].num = neighbors(i, size).filter(n => board[n].mine).length
  }
}

// 点开一格。返回 { board, hitMine, won }（新数组，不改原）
function reveal(board, idx, size = 9) {
  const nb = board.map(c => Object.assign({}, c))
  const cell = nb[idx]
  if (cell.revealed || cell.flagged) return { board: nb, hitMine: false, won: checkWon(nb) }
  if (cell.mine) {
    cell.revealed = true
    nb.forEach(c => { if (c.mine) c.revealed = true })
    return { board: nb, hitMine: true, won: false }
  }
  const stack = [idx]
  while (stack.length) {
    const i = stack.pop()
    const c = nb[i]
    if (c.revealed || c.flagged) continue
    c.revealed = true
    if (c.num === 0) {
      neighbors(i, size).forEach(n => {
        if (!nb[n].revealed && !nb[n].mine) stack.push(n)
      })
    }
  }
  return { board: nb, hitMine: false, won: checkWon(nb) }
}

function toggleFlag(board, idx) {
  const nb = board.map(c => Object.assign({}, c))
  if (nb[idx].revealed) return { board: nb, changed: false }
  nb[idx].flagged = !nb[idx].flagged
  return { board: nb, changed: true }
}

function checkWon(board) {
  return board.every(c => c.mine || c.revealed)
}

function flagsLeft(board, mines) {
  return mines - board.filter(c => c.flagged).length
}

module.exports = { newBoard, placeMines, reveal, toggleFlag, checkWon, flagsLeft, neighbors }
