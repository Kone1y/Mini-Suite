// 数独核心逻辑：生成器（挖洞法）+ 求解器（回溯）+ 校验
// 纯函数，可单测

const SIZE = 9

function emptyGrid() {
  return Array.from({ length: SIZE }, () => new Array(SIZE).fill(0))
}

// ---- 工具 ----
function rowOK(grid, r, v) {
  for (let c = 0; c < SIZE; c++) if (grid[r][c] === v) return false
  return true
}
function colOK(grid, c, v) {
  for (let r = 0; r < SIZE; r++) if (grid[r][c] === v) return false
  return true
}
function boxOK(grid, r, c, v) {
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    if (grid[br + i][bc + j] === v) return false
  return true
}
function canPlace(grid, r, c, v) {
  return rowOK(grid, r, v) && colOK(grid, c, v) && boxOK(grid, r, c, v)
}

// ---- 生成满盘（随机回溯） ----
function generateFull() {
  const grid = emptyGrid()
  function fill(pos) {
    if (pos === 81) return true
    const r = Math.floor(pos / 9), c = pos % 9
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    // 洗牌
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[nums[i], nums[j]] = [nums[j], nums[i]]
    }
    for (const v of nums) {
      if (canPlace(grid, r, c, v)) {
        grid[r][c] = v
        if (fill(pos + 1)) return true
        grid[r][c] = 0
      }
    }
    return false
  }
  fill(0)
  return grid
}

// ---- 求解器（回溯，countSolutions 限制解数） ----
function solve(grid, limit) {
  const g = grid.map(row => row.slice())
  let solutions = 0
  const firstSolution = emptyGrid()
  function dfs(pos) {
    if (solutions >= limit) return
    if (pos === 81) {
      solutions++
      if (solutions === 1) g.forEach((row, i) => firstSolution[i] = row.slice())
      return
    }
    const r = Math.floor(pos / 9), c = pos % 9
    if (g[r][c] !== 0) { dfs(pos + 1); return }
    for (let v = 1; v <= 9; v++) {
      if (canPlace(g, r, c, v)) {
        g[r][c] = v
        dfs(pos + 1)
        g[r][c] = 0
        if (solutions >= limit) return
      }
    }
  }
  dfs(0)
  return { count: solutions, solution: firstSolution }
}

// ---- 挖洞生成谜题 ----
// difficulty: easy=35 洞 / medium=45 / hard=55
function generate(difficulty) {
  const holes = difficulty === 'easy' ? 35 : difficulty === 'medium' ? 45 : 55
  const full = generateFull()
  const puzzle = full.map(row => row.slice())
  // 随机位置顺序挖洞
  const positions = []
  for (let i = 0; i < 81; i++) positions.push(i)
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[positions[i], positions[j]] = [positions[j], positions[i]]
  }
  let dug = 0
  for (const pos of positions) {
    if (dug >= holes) break
    const r = Math.floor(pos / 9), c = pos % 9
    const backup = puzzle[r][c]
    if (backup === 0) continue
    puzzle[r][c] = 0
    const { count } = solve(puzzle, 2)
    if (count !== 1) {
      puzzle[r][c] = backup   // 多解则回填
    } else {
      dug++
    }
  }
  return { puzzle, solution: full }
}

// ---- 冲突检测（用户盘面 vs 行/列/宫约束） ----
// 返回冲突坐标集合
function conflicts(grid) {
  const marks = new Set()
  const check = (cells) => {
    const seen = {}
    cells.forEach(([r, c]) => {
      const v = grid[r][c]
      if (v === 0) return
      if (seen[v] !== undefined) { marks.add(seen[v]); marks.add(r * 9 + c) }  // !== undefined 防 0 号位 falsy 陷阱
      else seen[v] = r * 9 + c
    })
  }
  for (let r = 0; r < 9; r++) check(Array.from({ length: 9 }, (_, c) => [r, c]))
  for (let c = 0; c < 9; c++) check(Array.from({ length: 9 }, (_, r) => [r, c]))
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
    const cells = []
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cells.push([br * 3 + i, bc * 3 + j])
    check(cells)
  }
  return marks
}

// ---- 完成判定 ----
function isComplete(grid) {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (grid[r][c] === 0) return false
  return conflicts(grid).size === 0
}

module.exports = { emptyGrid, generateFull, solve, generate, conflicts, isComplete, canPlace, SIZE }
