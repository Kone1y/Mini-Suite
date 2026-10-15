// 迷宫生成 + 自动寻路（BFS / A*）
// 纯函数，与页面解耦，可单测
// 约定：格子坐标 (x, y)，x 为列、y 为行；方向 n/e/s/w 分别对应 上/右/下/左

// 方向与位移
const DIRS = ['n', 'e', 's', 'w']
const DELTA = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0]
}

// 相邻方向反方向（打通通道时同时去掉两侧墙）
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' }

function inBounds(maze, x, y) {
  return x >= 0 && y >= 0 && x < maze.cols && y < maze.rows
}

// 生成"完美迷宫"：递归回溯（迭代栈实现，避免大尺寸爆栈）
// 返回 { cols, rows, cells }，cells 为 rows×cols 数组，每格 = { walls:{n,e,s,w} }（true=有墙）
function generate(cols, rows) {
  cols = Math.max(1, cols | 0)
  rows = Math.max(1, rows | 0)
  const cells = []
  for (let y = 0; y < rows; y++) {
    const row = []
    for (let x = 0; x < cols; x++) {
      row.push({ walls: { n: true, e: true, s: true, w: true } })
    }
    cells.push(row)
  }
  const maze = { cols, rows, cells }

  const visited = []
  for (let y = 0; y < rows; y++) visited.push(new Array(cols).fill(false))

  // 从 (0,0) 出发
  const stack = [[0, 0]]
  visited[0][0] = true

  while (stack.length) {
    const [x, y] = stack[stack.length - 1]
    // 收集未访问的相邻格
    const cand = []
    for (const d of DIRS) {
      const nx = x + DELTA[d][0]
      const ny = y + DELTA[d][1]
      if (inBounds(maze, nx, ny) && !visited[ny][nx]) cand.push([d, nx, ny])
    }
    if (!cand.length) {
      stack.pop()
      continue
    }
    // 随机选一个方向打通
    const pick = cand[Math.floor(Math.random() * cand.length)]
    const d = pick[0], nx = pick[1], ny = pick[2]
    maze.cells[y][x].walls[d] = false
    maze.cells[ny][nx].walls[OPP[d]] = false
    visited[ny][nx] = true
    stack.push([nx, ny])
  }

  return maze
}

// 判断从 (x,y) 朝 dir 方向是否无墙可通行（需墙已打通且目标在界内）
function passable(maze, x, y, dir) {
  if (!inBounds(maze, x, y)) return false
  if (maze.cells[y][x].walls[dir]) return false
  const nx = x + DELTA[dir][0]
  const ny = y + DELTA[dir][1]
  return inBounds(maze, nx, ny)
}

// 返回 (x,y) 四个方向中"无墙可通行"的相邻坐标数组 [[nx,ny],...]
function neighbors(maze, x, y) {
  const res = []
  for (const d of DIRS) {
    if (passable(maze, x, y, d)) {
      res.push([x + DELTA[d][0], y + DELTA[d][1]])
    }
  }
  return res
}

function keyOf(x, y) { return x + ',' + y }

// BFS：从 (0,0) 到 (cols-1,rows-1)
// 返回 { path:[[x,y]...起点→终点], visited:[[x,y]...探索过的格子（含路径）] }
function solveBFS(maze) {
  const { cols, rows } = maze
  const start = [0, 0]
  const end = [cols - 1, rows - 1]
  const ek = keyOf(end[0], end[1])

  const prev = {}
  const seen = new Set()
  const visited = []
  const queue = [start]
  seen.add(keyOf(0, 0))

  let found = false
  while (queue.length) {
    const cur = queue.shift()
    visited.push(cur)
    const ck = keyOf(cur[0], cur[1])
    if (ck === ek) { found = true; break }
    for (const nb of neighbors(maze, cur[0], cur[1])) {
      const nk = keyOf(nb[0], nb[1])
      if (!seen.has(nk)) {
        seen.add(nk)
        prev[nk] = cur
        queue.push(nb)
      }
    }
  }

  if (!found) return { path: [], visited }
  const path = []
  let node = end
  while (node) {
    path.unshift(node)
    node = prev[keyOf(node[0], node[1])]
  }
  return { path, visited }
}

// A*：曼哈顿距离启发，从 (0,0) 到 (cols-1,rows-1)
// 返回与 BFS 相同结构的 { path, visited }
function solveAStar(maze) {
  const { cols, rows } = maze
  const end = [cols - 1, rows - 1]
  const ek = keyOf(end[0], end[1])
  const h = (x, y) => Math.abs(x - end[0]) + Math.abs(y - end[1])

  const gScore = {}
  const cameFrom = {}
  const closed = new Set()
  const inOpen = new Set()
  const visited = []
  const open = []

  gScore[keyOf(0, 0)] = 0
  open.push({ x: 0, y: 0, f: h(0, 0) })
  inOpen.add(keyOf(0, 0))
  visited.push([0, 0])

  let found = false
  while (open.length) {
    // 取 f 最小的节点（节点规模小，线性扫描足够）
    let bi = 0
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bi].f) bi = i
    }
    const cur = open.splice(bi, 1)[0]
    const ck = keyOf(cur.x, cur.y)
    inOpen.delete(ck)
    if (closed.has(ck)) continue
    closed.add(ck)
    if (ck === ek) { found = true; break }

    for (const nb of neighbors(maze, cur.x, cur.y)) {
      const nk = keyOf(nb[0], nb[1])
      if (closed.has(nk)) continue
      const tentativeG = gScore[ck] + 1
      if (gScore[nk] === undefined || tentativeG < gScore[nk]) {
        gScore[nk] = tentativeG
        cameFrom[nk] = [cur.x, cur.y]
        open.push({ x: nb[0], y: nb[1], f: tentativeG + h(nb[0], nb[1]) })
        if (!inOpen.has(nk)) {
          inOpen.add(nk)
          visited.push([nb[0], nb[1]])
        }
      }
    }
  }

  if (!found) return { path: [], visited }
  const path = []
  let node = end
  while (node) {
    path.unshift(node)
    node = cameFrom[keyOf(node[0], node[1])]
  }
  return { path, visited }
}

module.exports = { generate, passable, neighbors, solveBFS, solveAStar, DIRS, DELTA }
