// 寻路可视化 Pathfinding：网格编辑 + BFS/Dijkstra/A* 动画对比
// 与「迷宫寻路」(maze) 的区别：本页由用户自由绘制墙与加权地形，并对比三种算法的探索过程

const COLS = 20
const ROWS = 20
const SLOW_WEIGHT = 5   // 慢速地形权重（仅 Dijkstra/A* 计入，BFS 忽略）

// 二叉最小堆（按 f 值）
class MinHeap {
  constructor() { this.ids = []; this.fs = [] }
  isEmpty() { return this.ids.length === 0 }
  push(id, f) {
    this.ids.push(id); this.fs.push(f)
    let i = this.ids.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.fs[p] <= this.fs[i]) break
      this._swap(i, p); i = p
    }
  }
  pop() {
    const n = this.ids.length
    const id = this.ids[0], f = this.fs[0]
    const lastId = this.ids.pop(), lastF = this.fs.pop()
    if (n > 1) {
      this.ids[0] = lastId; this.fs[0] = lastF
      let i = 0
      for (;;) {
        let l = 2 * i + 1, r = 2 * i + 2, sm = i
        if (l < this.ids.length && this.fs[l] < this.fs[sm]) sm = l
        if (r < this.ids.length && this.fs[r] < this.fs[sm]) sm = r
        if (sm === i) break
        this._swap(i, sm); i = sm
      }
    }
    return { id, f }
  }
  _swap(i, j) {
    const a = this.ids[i], b = this.fs[i]
    this.ids[i] = this.ids[j]; this.fs[i] = this.fs[j]
    this.ids[j] = a; this.fs[j] = b
  }
}

Page({
  data: {
    algo: 'astar',     // bfs | dijkstra | astar
    speed: 'mid',      // slow | mid | fast
    mode: 'wall',      // start | end | wall | slow | erase
    status: 'edit',    // edit | running | done
    visitCount: 0,
    pathLen: 0,
    found: false
  },

  onLoad() {
    this._alive = true
    this._winW = wx.getSystemInfoSync().windowWidth
    this._winH = wx.getSystemInfoSync().windowHeight
  },

  onReady() { this.initCanvas() },

  initCanvas() {
    const q = wx.createSelectorQuery()
    q.select('#stage').fields({ node: true, size: true }).exec(res => {
      if (!res || !res[0] || !res[0].node) return
      const canvas = res[0].node
      const dpr = wx.getSystemInfoSync().pixelRatio || 2
      this._cssW = res[0].width
      this._cssH = res[0].height
      canvas.width = this._cssW * dpr
      canvas.height = this._cssH * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      this._canvas = canvas
      this._ctx = ctx
      this.reset()
      this.startLoop()
    })
  },

  // ---------- 网格模型 ----------
  reset() {
    const grid = []
    for (let r = 0; r < ROWS; r++) {
      const row = []
      for (let c = 0; c < COLS; c++) row.push({ wall: false, weight: 1 })
      grid.push(row)
    }
    this._grid = grid
    this._start = { r: (ROWS >> 1), c: 2 }
    this._end = { r: (ROWS >> 1), c: COLS - 3 }
    this._visited = null
    this._path = null
    this._found = false
    this._animIndex = 0
    this._pathIndex = 0
    this._playState = 'idle'
    this._acc = 0
    this.setData({ status: 'edit', visitCount: 0, pathLen: 0, found: false })
  },

  clearWalls() {
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) { this._grid[r][c].wall = false; this._grid[r][c].weight = 1 }
    this._visited = this._path = null
    this.setData({ status: 'edit', visitCount: 0, pathLen: 0, found: false })
  },

  randomWalls() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const isEndpoint = (r === this._start.r && c === this._start.c) || (r === this._end.r && c === this._end.c)
        if (isEndpoint) { this._grid[r][c].wall = false; this._grid[r][c].weight = 1; continue }
        const v = Math.random()
        this._grid[r][c].wall = v < 0.28
        this._grid[r][c].weight = 1
      }
    }
    this._visited = this._path = null
    this.setData({ status: 'edit', visitCount: 0, pathLen: 0, found: false })
  },

  // ---------- 布局 ----------
  cellSize() {
    return Math.floor(Math.min(this._cssW / COLS, this._cssH / ROWS))
  },
  gridOrigin() {
    const cs = this.cellSize()
    const gw = cs * COLS, gh = cs * ROWS
    return { x: Math.floor((this._cssW - gw) / 2), y: Math.floor((this._cssH - gh) / 2), cs, gw, gh }
  },

  // ---------- 交互：触摸落子 ----------
  onTouchStart(e) { this.handleTouch(e) },
  onTouchMove(e) {
    const m = this.data.mode
    if (m === 'wall' || m === 'slow' || m === 'erase') this.handleTouch(e)
  },
  onTouchEnd() {},
  handleTouch(e) {
    if (this.data.status === 'running') return
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
    if (!t) return
    const o = this.gridOrigin()
    const c = Math.floor((t.x - o.x) / o.cs)
    const r = Math.floor((t.y - o.y) / o.cs)
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return
    this.applyAt(r, c)
  },
  applyAt(r, c) {
    const cell = this._grid[r][c]
    const mode = this.data.mode
    if (mode === 'start') {
      if (cell.wall) return
      this._start = { r, c }
    } else if (mode === 'end') {
      if (cell.wall) return
      this._end = { r, c }
    } else if (mode === 'wall') {
      if ((r === this._start.r && c === this._start.c) || (r === this._end.r && c === this._end.c)) return
      cell.wall = true; cell.weight = 1
    } else if (mode === 'slow') {
      if ((r === this._start.r && c === this._start.c) || (r === this._end.r && c === this._end.c)) return
      cell.wall = false; cell.weight = SLOW_WEIGHT
    } else if (mode === 'erase') {
      cell.wall = false; cell.weight = 1
    }
  },

  // ---------- 搜索 ----------
  runSearch() {
    const algo = this.data.algo
    const grid = this._grid
    const idx = (r, c) => r * COLS + c
    const s = this._start, e = this._end
    const visitedOrder = []
    const prev = new Array(ROWS * COLS).fill(-1)
    const g = new Array(ROWS * COLS).fill(Infinity)
    const inVisited = new Array(ROWS * COLS).fill(false)
    const neighbors = (r, c) => {
      const res = []
      const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]]
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue
        if (grid[nr][nc].wall) continue
        res.push([nr, nc])
      }
      return res
    }
    const h = (r, c) => Math.abs(r - e.r) + Math.abs(c - e.c)  // 曼哈顿
    const fOf = (i, r, c) => (algo === 'astar' ? g[i] + h(r, c) : g[i])

    const sI = idx(s.r, s.c), eI = idx(e.r, e.c)
    g[sI] = 0
    const heap = new MinHeap()
    heap.push(sI, fOf(sI, s.r, s.c))
    let found = false
    while (!heap.isEmpty()) {
      const cur = heap.pop()
      const curI = cur.id
      if (inVisited[curI]) continue
      inVisited[curI] = true
      const cr = Math.floor(curI / COLS), cc = curI % COLS
      visitedOrder.push(curI)
      if (curI === eI) { found = true; break }
      for (const [nr, nc] of neighbors(cr, cc)) {
        const ni = idx(nr, nc)
        if (inVisited[ni]) continue
        // BFS 忽略地形权重（每步代价=1），Dijkstra/A* 计入慢速地形代价
        const w = (algo === 'bfs') ? 1 : grid[nr][nc].weight
        const ng = g[curI] + w
        if (ng < g[ni]) {
          g[ni] = ng
          prev[ni] = curI
          heap.push(ni, fOf(ni, nr, nc))
        }
      }
    }
    const path = []
    if (found) {
      let p = eI
      while (p !== -1) { path.push(p); p = prev[p] }
      path.reverse()
    }
    return { visitedOrder, path, found }
  },

  // ---------- 控制 ----------
  onAlgo(e) { this.setData({ algo: e.currentTarget.dataset.v }) },
  onSpeed(e) { this.setData({ speed: e.currentTarget.dataset.v }) },
  onMode(e) { this.setData({ mode: e.currentTarget.dataset.v }) },

  onStart() {
    if (this.data.status === 'running') return
    const res = this.runSearch()
    this._visited = res.visitedOrder
    this._path = res.path
    this._found = res.found
    this._animIndex = 0
    this._pathIndex = 0
    this._acc = 0
    if (!this._found || this._path.length === 0) {
      this._playState = 'done'
      this.setData({ status: 'done', found: false, pathLen: 0, visitCount: this._visited.length })
    } else {
      this._playState = 'visiting'
      this.setData({ status: 'running' })
    }
  },

  onReset() { this.reset() },
  onClear() { this.clearWalls() },
  onRandom() { this.randomWalls() },

  // ---------- 循环（_alive 守卫） ----------
  startLoop() {
    if (this._rafId) return
    const loop = (t) => {
      if (!this._alive) { this._rafId = null; return }
      this._rafId = this._canvas.requestAnimationFrame(loop)
      const dt = this._lastT ? Math.min(0.05, (t - this._lastT) / 1000) : 0.016
      this._lastT = t
      this.update(dt)
      this.render()
    }
    this._rafId = this._canvas.requestAnimationFrame(loop)
  },

  update(dt) {
    if (this.data.status !== 'running') return
    const intervalMap = { slow: 55, mid: 22, fast: 7 }   // 每格探索耗时(ms)
    const interval = intervalMap[this.data.speed] || 22
    this._acc += dt * 1000
    if (this._acc < interval) return
    this._acc = 0
    if (this._playState === 'visiting') {
      this._animIndex++
      this.setData({ visitCount: Math.min(this._animIndex, this._visited.length) })
      if (this._animIndex >= this._visited.length) {
        if (!this._found || this._path.length === 0) {
          this._playState = 'done'
          this.setData({ status: 'done', found: false, pathLen: 0 })
        } else {
          this._playState = 'pathing'
          this._pathIndex = 0
        }
      }
    } else if (this._playState === 'pathing') {
      this._pathIndex++
      if (this._pathIndex >= this._path.length) {
        this._playState = 'done'
        this.setData({ status: 'done', pathLen: this._path.length, found: true })
      } else {
        this.setData({ pathLen: this._pathIndex + 1 })
      }
    }
  },

  render() {
    const ctx = this._ctx
    if (!ctx) return
    const W = this._cssW, H = this._cssH
    ctx.fillStyle = '#0A0A14'
    ctx.fillRect(0, 0, W, H)
    const o = this.gridOrigin()
    const cs = o.cs
    const grid = this._grid

    // 已探索 / 路径 集合（用于快速查询）
    const visitedSet = {}
    if (this._visited) {
      const n = Math.min(this._animIndex, this._visited.length)
      for (let i = 0; i < n; i++) visitedSet[this._visited[i]] = true
    }
    const pathSet = {}
    if (this._path) {
      const n = Math.min(this._pathIndex, this._path.length)
      for (let i = 0; i < n; i++) pathSet[this._path[i]] = true
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = o.x + c * cs, y = o.y + r * cs
        const cell = grid[r][c]
        const i = r * COLS + c
        let fill = '#15151F'
        if (cell.wall) fill = '#3A3A4E'
        else if (cell.weight > 1) fill = 'rgba(242,153,74,0.28)'
        else if (pathSet[i]) fill = '#F2CE6B'
        else if (visitedSet[i]) fill = 'rgba(47,128,237,0.55)'
        ctx.fillStyle = fill
        ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2)
      }
    }

    // 终点（先画起点再画终点，避免覆盖）
    this._drawMarker(ctx, o, this._start, '#27AE60', 'S')
    this._drawMarker(ctx, o, this._end, '#EB5757', 'E')

    // 网格边框
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(o.x + c * cs, o.y); ctx.lineTo(o.x + c * cs, o.y + o.gh); ctx.stroke()
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(o.x, o.y + r * cs); ctx.lineTo(o.x + o.gw, o.y + r * cs); ctx.stroke()
    }
  },

  _drawMarker(ctx, o, p, color, label) {
    const cs = o.cs
    const x = o.x + p.c * cs, y = o.y + p.r * cs
    ctx.fillStyle = color
    ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2)
    ctx.fillStyle = '#0A0A14'
    ctx.font = 'bold ' + Math.floor(cs * 0.55) + 'px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + cs / 2, y + cs / 2 + 1)
  },

  onHide() { this._alive = false; this.cancelRaf() },
  onShow() {
    this._alive = true
    if (this._canvas && !this._rafId) this.startLoop()
  },
  onUnload() {
    this._alive = false
    this.cancelRaf()
  },
  cancelRaf() {
    if (this._canvas && this._rafId) { this._canvas.cancelAnimationFrame(this._rafId); this._rafId = null }
  }
})
