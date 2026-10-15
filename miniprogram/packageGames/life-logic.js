// 生命游戏（Conway's Game of Life）核心逻辑：纯函数，可单测
// 网格约定：grid 为 h×w 的二维数组 grid[y][x]，0=死，1=活。
// 边界外视为死细胞。

// 生成 h×w、全 0 的网格
function makeGrid(w, h) {
  const g = []
  for (let y = 0; y < h; y++) {
    const row = []
    for (let x = 0; x < w; x++) row.push(0)
    g.push(row)
  }
  return g
}

// 深拷贝网格（不改原网格）
function cloneGrid(grid) {
  return grid.map(row => row.slice())
}

// 按 density(0~1) 随机置 1，返回新网格（深拷贝）
function randomize(grid, density) {
  return grid.map(row => row.map(() => (Math.random() < density ? 1 : 0)))
}

// 翻转 (x,y)，返回新网格（深拷贝）
function toggle(grid, x, y) {
  return grid.map((row, ry) =>
    row.map((v, rx) => (rx === x && ry === y ? (v ? 0 : 1) : v))
  )
}

// 统计存活细胞数
function countLive(grid) {
  let c = 0
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]
    for (let x = 0; x < row.length; x++) c += row[x]
  }
  return c
}

// 按 Conway 规则推进一代：
// - 活细胞：邻居恰为 2 或 3 时续活，否则死
// - 死细胞：邻居恰为 3 时成活
// - 边界外视为死
function step(grid) {
  const h = grid.length
  if (h === 0) return makeGrid(0, 0)
  const w = grid[0].length
  const next = makeGrid(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const ny = y + dy, nx = x + dx
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue // 越界 = 死
          n += grid[ny][nx]
        }
      }
      const alive = grid[y][x] === 1
      if (alive) next[y][x] = (n === 2 || n === 3) ? 1 : 0
      else next[y][x] = (n === 3) ? 1 : 0
    }
  }
  return next
}

// 预设图案（相对坐标 [x, y]）
// 滑翔机
const glider = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]
// 闪烁（周期 2 振荡器，竖线）
const blinker = [[1, 0], [1, 1], [1, 2]]
// 脉冲星（周期 3 振荡器，13×13 包围盒，48 活细胞，标准图案）
const pulsar = [
  [2, 0], [3, 0], [4, 0], [8, 0], [9, 0], [10, 0],
  [0, 2], [5, 2], [7, 2], [12, 2],
  [0, 3], [5, 3], [7, 3], [12, 3],
  [0, 4], [5, 4], [7, 4], [12, 4],
  [2, 5], [3, 5], [4, 5], [8, 5], [9, 5], [10, 5],
  [2, 7], [3, 7], [4, 7], [8, 7], [9, 7], [10, 7],
  [0, 8], [5, 8], [7, 8], [12, 8],
  [0, 9], [5, 9], [7, 9], [12, 9],
  [0, 10], [5, 10], [7, 10], [12, 10],
  [2, 12], [3, 12], [4, 12], [8, 12], [9, 12], [10, 12]
]

const PRESETS = { glider, blinker, pulsar }

// 把预设相对坐标叠加到网格 (ox, oy) 起点，返回新网格（深拷贝）
function stampPreset(grid, preset, ox, oy) {
  const g = cloneGrid(grid)
  for (const [dx, dy] of preset) {
    const x = ox + dx, y = oy + dy
    if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = 1
  }
  return g
}

module.exports = {
  makeGrid, cloneGrid, randomize, toggle, countLive, step, PRESETS, stampPreset
}
