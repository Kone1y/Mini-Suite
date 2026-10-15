const L = require('../../life-logic')

// 网格规模：cols×rows ≤ ~500
const COLS = 30
const ROWS = 16
const DENSITY = 0.22          // 随机填充密度
const EDGE_PX = 28            // 预留左右边距（px）

Page({
  data: {
    introOpen: false,          // 玩法说明展开态
    cols: COLS,
    rows: ROWS,
    s: 10,                    // 单元格边长 px（onLoad 计算）
    boardW: 300,              // 棋盘总宽 px（onLoad 计算）
    cells: [],                // 扁平化后的 0/1 数组，长度 = cols*rows
    generation: 0,
    liveCount: 0,
    running: false,
    speed: 250,               // 推进间隔 ms（滑杆）
    speedText: '250ms'
  },

  onLoad() {
    // 缓存屏幕宽度，按可用宽度算单元格 px，避免 rpx + calc 混用
    let windowWidth = 375
    try {
      windowWidth = wx.getSystemInfoSync().windowWidth
    } catch (e) { /* 兜底 */ }
    const s = Math.floor((windowWidth - EDGE_PX) / COLS)
    const size = Math.max(6, s)            // 兜底最小尺寸
    this._cols = COLS
    this._rows = ROWS
    // 初始化网格（实例持有，data 仅放可序列化渲染数据）
    this.grid = L.makeGrid(COLS, ROWS)
    this._timer = null
    this._gen = 0
    this.setData({
      s: size,
      boardW: size * COLS,
      cells: this.flatten(this.grid),
      generation: 0,
      liveCount: 0,
      running: false
    })
  },

  onShow() {
    // 切回前台时，若之前在播放则恢复定时器
    if (this.data.running && !this._timer) this.startTimer()
  },

  onHide() { this.stopTimer() },
  onUnload() { this.stopTimer() },

  // ---- 工具 ----
  // 二维网格 -> 扁平数组（渲染用）
  flatten(grid) {
    const out = []
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y]
      for (let x = 0; x < row.length; x++) out.push(row[x])
    }
    return out
  },

  // 由扁平下标反推 (x,y)
  idxToXY(idx) {
    const x = idx % this._cols
    const y = Math.floor(idx / this._cols)
    return { x, y }
  },

  // 刷新棋盘渲染数据（整体替换二维数组）
  refresh() {
    this.setData({
      cells: this.flatten(this.grid),
      liveCount: L.countLive(this.grid)
    })
  },

  // 空 catchtap 处理器（catchtap 必须绑真实函数，否则不生效）
  stopProp() {},

  // 折叠/展开玩法说明
  toggleIntro() {
    this.setData({ introOpen: !this.data.introOpen })
  },

  // ---- 交互 ----
  // 点击格子切换（仅在暂停时允许）
  tapCell(e) {
    if (this.data.running) return
    const idx = e.currentTarget.dataset.idx
    const { x, y } = this.idxToXY(idx)
    this.grid = L.toggle(this.grid, x, y)
    this.refresh()
  },

  // 播放 / 暂停
  playPause() {
    if (this.data.running) {
      this.stopTimer()
      this.setData({ running: false })
    } else {
      this.setData({ running: true })
      this.startTimer()
    }
  },

  startTimer() {
    if (this._timer) clearInterval(this._timer)
    const self = this
    this._timer = setInterval(() => {
      self.grid = L.step(self.grid)
      self._gen += 1
      self.setData({
        cells: self.flatten(self.grid),
        liveCount: L.countLive(self.grid),
        generation: self._gen
      })
    }, this.data.speed)
  },

  stopTimer() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  // 调速：间隔滑杆
  onSpeed(e) {
    const speed = e.detail.value
    this.setData({ speed, speedText: speed + 'ms' })
    if (this.data.running) this.startTimer()  // 用新间隔重启
  },

  // 随机
  randomize() {
    this.stopTimer()
    this.grid = L.randomize(this.grid, DENSITY)
    this._gen = 0
    this.setData({ running: false, generation: 0 })
    this.refresh()
  },

  // 清空
  clearGrid() {
    this.stopTimer()
    this.grid = L.makeGrid(COLS, ROWS)
    this._gen = 0
    this.setData({ running: false, generation: 0 })
    this.refresh()
  },

  // 预设：点后在网格中央 stamp（先清空，保证图案清晰）
  applyPreset(e) {
    const name = e.currentTarget.dataset.name
    const preset = L.PRESETS[name]
    if (!preset) return
    this.stopTimer()
    // 计算包围盒以居中
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [dx, dy] of preset) {
      if (dx < minX) minX = dx
      if (dx > maxX) maxX = dx
      if (dy < minY) minY = dy
      if (dy > maxY) maxY = dy
    }
    const pw = maxX - minX + 1
    const ph = maxY - minY + 1
    const ox = Math.floor((COLS - pw) / 2) - minX
    const oy = Math.floor((ROWS - ph) / 2) - minY
    const base = L.makeGrid(COLS, ROWS)
    this.grid = L.stampPreset(base, preset, ox, oy)
    this._gen = 0
    this.setData({ running: false, generation: 0 })
    this.refresh()
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
