const L = require('../../maze-logic')

// 可选尺寸（≤20 列/行）
const SIZES = [10, 15, 20]
const WALL_COLOR = '#3A3550'

Page({
  data: {
    sizeIndex: 0,
    sizeOptions: SIZES,
    sizeLabel: '10×10',
    cols: 10,
    rows: 10,
    cellSize: 30,          // 每格 px（JS 计算，不用 calc）
    boardStyle: '',
    cells: [],             // [{ x, y, cls, style }]
    steps: 0,
    status: '点「生成」开始',
    solving: false,
    manual: false,
    intervalMs: 40,
    intervalLabel: '40ms'
  },

  onLoad() {
    const sys = wx.getSystemInfoSync()
    this._winW = sys.windowWidth || 375
    this._timer = null
    this._maze = null
    this._player = null
    this._reach = null
    this._solveCtx = null
    this.computeCellSize(SIZES[0])
  },

  onUnload() { this.clearTimer() },
  onHide() { this.clearTimer() },
  onShow() {
    // 求解动画被切后台打断：若 solving 仍为 true 且有未完成上下文，从断点恢复
    if (this.data.solving && this._solveCtx) this.resumeSolve()
  },

  // ---- 尺寸与布局 ----
  computeCellSize(size) {
    // 左右各留 24px 边距（合计 48），避免超屏
    const c = Math.floor((this._winW - 48) / size)
    this.setData({
      cellSize: c,
      cols: size,
      rows: size,
      boardStyle: 'grid-template-columns: repeat(' + size + ', ' + c + 'px);'
    })
  },

  onSizeChange(e) {
    const i = Number(e.detail.value)
    const size = SIZES[i]
    this.clearTimer()
    this._solveCtx = null      // 尺寸切换即废弃未完成的求解动画
    this.computeCellSize(size)
    this._maze = null
    this._player = null
    this._reach = null
    this.setData({
      sizeIndex: i,
      sizeLabel: size + '×' + size,
      cells: [],
      steps: 0,
      solving: false,
      manual: false,
      status: '已选 ' + size + '×' + size + '，点「生成」'
    })
  },

  onSpeedChange(e) {
    const v = Number(e.detail.value)
    this.setData({ intervalMs: v, intervalLabel: v + 'ms' })
  },

  // ---- 生成 ----
  generate() {
    this.clearTimer()
    this._solveCtx = null      // 重生成即废弃未完成的求解动画
    const size = this.data.sizeOptions[this.data.sizeIndex]
    const maze = L.generate(size, size)
    this._maze = maze
    this.buildCells(maze)
    this.resetPlayer()
    this.setData({
      status: '已生成 ' + size + '×' + size + '（绿=起点 红=终点）',
      solving: false,
      manual: false,
      steps: 0
    })
  },

  // 构造渲染用 cell 数组（边框由 walls 预计算为内联 style，避免 WXML 调函数）
  buildCells(maze) {
    const cs = this.data.cellSize
    const lastX = maze.cols - 1
    const lastY = maze.rows - 1
    const cells = []
    for (let y = 0; y < maze.rows; y++) {
      for (let x = 0; x < maze.cols; x++) {
        const cls = this.baseCls(x, y, lastX, lastY)
        cells.push({ x, y, cls, style: this.cellStyle(maze, x, y, cs) })
      }
    }
    this.setData({
      cells,
      cols: maze.cols,
      rows: maze.rows,
      boardStyle: 'grid-template-columns: repeat(' + maze.cols + ', ' + cs + 'px);'
    })
  },

  baseCls(x, y, lastX, lastY) {
    const cls = ['cell']
    if (x === 0 && y === 0) cls.push('start')
    if (x === lastX && y === lastY) cls.push('end')
    return cls.join(' ')
  },

  cellStyle(maze, x, y, cs) {
    const w = maze.cells[y][x].walls
    const b = side => (w[side] ? '2px solid ' + WALL_COLOR : '0')
    return [
      'border-top:' + b('n') + ';',
      'border-right:' + b('e') + ';',
      'border-bottom:' + b('s') + ';',
      'border-left:' + b('w') + ';',
      'width:' + cs + 'px;',
      'height:' + cs + 'px;'
    ].join('')
  },

  // 把全部 cell 还原到基础态（保留起点/终点色）
  resetCellStates() {
    if (!this._maze) return
    const lastX = this._maze.cols - 1
    const lastY = this._maze.rows - 1
    const cells = this.data.cells.map(c => ({ ...c, cls: this.baseCls(c.x, c.y, lastX, lastY) }))
    this.setData({ cells })
  },

  // ---- 求解动画（先 visited 后 path） ----
  solveBFS() {
    if (!this._maze) { this.setData({ status: '请先生成迷宫' }); return }
    this.animateSolve(L.solveBFS(this._maze), 'BFS')
  },
  solveAStar() {
    if (!this._maze) { this.setData({ status: '请先生成迷宫' }); return }
    this.animateSolve(L.solveAStar(this._maze), 'A*')
  },

  animateSolve(result, algo) {
    this.clearTimer()
    if (!result.path.length) {
      this.setData({ status: algo + '：未找到路径' })
      return
    }
    this.setData({ solving: true, manual: false, status: algo + ' 求解中…' })
    this.resetCellStates()

    // 求解上下文：进度(vi/pi)承载在 ctx 上，切后台打断后可从断点恢复
    this._solveCtx = { algo, visited: result.visited, path: result.path, vi: 0, pi: 0 }
    this._timer = setInterval(() => this._solveTick(), this.data.intervalMs)
  },

  // 单次推进：先染色 visited，再染色 path，完成后清上下文
  _solveTick() {
    const ctx = this._solveCtx
    if (!ctx || !this._maze) { this.clearTimer(); return }
    const cols = this._maze.cols
    const lastX = cols - 1
    const lastY = this._maze.rows - 1
    if (ctx.vi < ctx.visited.length) {
      const [x, y] = ctx.visited[ctx.vi]; ctx.vi++
      // 起点/终点保持原色
      if (!(x === 0 && y === 0) && !(x === lastX && y === lastY)) {
        const idx = y * cols + x
        this.setData({ ['cells[' + idx + '].cls']: 'cell v' })
      }
    } else if (ctx.pi < ctx.path.length) {
      const [x, y] = ctx.path[ctx.pi]; ctx.pi++
      if (!(x === 0 && y === 0) && !(x === lastX && y === lastY)) {
        const idx = y * cols + x
        this.setData({ ['cells[' + idx + '].cls']: 'cell p' })
      }
    } else {
      this.clearTimer()
      this._solveCtx = null
      this.setData({ solving: false, status: ctx.algo + ' 完成 · 路径 ' + ctx.path.length + ' 步' })
    }
  },

  // 切后台/被清理打断后，从断点恢复求解动画
  resumeSolve() {
    const ctx = this._solveCtx
    if (!ctx || !this._maze || this._timer) return
    this.setData({ solving: true, status: ctx.algo + ' 求解中…（恢复）' })
    this._timer = setInterval(() => this._solveTick(), this.data.intervalMs)
  },

  // ---- 手动模式 ----
  toggleManual() {
    if (!this._maze) { this.setData({ status: '请先生成迷宫' }); return }
    const m = !this.data.manual
    this.clearTimer()
    this.setData({ manual: m, solving: false })
    if (m) {
      this.resetPlayer()
      this.setData({ status: '手动模式：走到红格（黄=可走，点击移动）' })
    } else {
      this.resetCellStates()
      this.setData({ status: '已退出手动模式' })
    }
  },

  resetPlayer() {
    this._player = [0, 0]
    this._reach = new Set()
    this.resetCellStates()
    this.markPlayer()
    this.setData({ steps: 0 })
  },

  markPlayer() {
    if (!this._maze) return
    const cols = this._maze.cols
    this.resetCellStates()
    const nbs = L.neighbors(this._maze, this._player[0], this._player[1])
    this._reach = new Set()
    const patch = {}
    for (const n of nbs) {
      this._reach.add(n[0] + ',' + n[1])
      const idx = n[1] * cols + n[0]
      patch['cells[' + idx + '].cls'] = 'cell reach'
    }
    const pidx = this._player[1] * cols + this._player[0]
    patch['cells[' + pidx + '].cls'] = 'cell player'
    this.setData(patch)
  },

  // catchtap 绑真实函数，禁止空 catchtap=""
  movePlayer(e) {
    if (!this.data.manual || !this._maze) return
    const idx = Number(e.currentTarget.dataset.idx)
    const x = idx % this._maze.cols
    const y = Math.floor(idx / this._maze.cols)
    if (!this._reach.has(x + ',' + y)) return   // 仅允许走到"可通行相邻格"

    const steps = this.data.steps + 1
    this._player = [x, y]
    this.setData({ steps })

    if (x === this._maze.cols - 1 && y === this._maze.rows - 1) {
      this.clearTimer()
      this.setData({ manual: false, status: '🎉 到达终点！用了 ' + steps + ' 步' })
      return
    }
    this.markPlayer()
  },

  clearTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
