const L = require('../../tetris-logic')

const BEST_KEY = 'tetris_best_score'

// 赛博朋克配色：每种方块一个霓虹色（主色 + 辉光色）
const NEON = {
  I: { main: '#00F0FF', glow: '#00F0FF' },   // 青
  O: { main: '#FFE600', glow: '#FFD000' },   // 电光黄
  T: { main: '#BF00FF', glow: '#BF00FF' },   // 品紫
  S: { main: '#00FF66', glow: '#00FF66' },   // 荧光绿
  Z: { main: '#FF003C', glow: '#FF003C' },   // 霓虹红
  J: { main: '#2B6BFF', glow: '#2B6BFF' },   // 电蓝
  L: { main: '#FF7A00', glow: '#FF7A00' }    // 赛博橙
}

Page({
  data: {
    score: 0,
    best: 0,
    lines: 0,
    level: 1,
    running: false,
    over: false,
    paused: false,
    combo: 0
  },

  onLoad() {
    this.setData({ best: wx.getStorageSync(BEST_KEY) || 0 })
    this.initCanvas()
    this.reset()
  },

  onReady() {
    this.draw()
  },

  initCanvas() {
    // 高度驱动布局：棋盘尺寸 = min(宽度上限, 高度上限)，保证完整可见且尽量大
    let winW = 375, winH = 667
    try {
      const info = wx.getSystemInfoSync()
      winW = info.windowWidth; winH = info.windowHeight
    } catch (e) {}
    this._winW = winW
    // 可用高度 = 屏高 - 顶栏(52) - 方向键(46) - 按钮行(40) - 间距(36)
    const availH = winH - 52 - 46 - 40 - 36
    const availW = winW - 28   // 页面左右 padding
    this._cell = Math.max(15, Math.min(Math.floor(availW / L.COLS), Math.floor(availH / L.ROWS)))
    const bw = this._cell * L.COLS
    const bh = this._cell * L.ROWS
    this._bw = bw; this._bh = bh
    this.setData({ bw, bh, nextSize: 44 })
    this._ctx = wx.createCanvasContext('tetris', this)
    this._nextCtx = wx.createCanvasContext('next', this)
  },

  reset() {
    this.stopLoop()
    this._grid = L.emptyGrid()
    this._bag = []
    this._piece = this.nextFromBag()
    this._next = this.nextFromBag()
    this._dropTimer = null
    this._lastDrop = 0
    this.setData({ score: 0, lines: 0, level: 1, running: false, over: false, paused: false, combo: 0 })
    this.draw()
  },

  nextFromBag() {
    if (!this._bag.length) this._bag = L.makeBag()
    return L.spawnPiece(this._bag.pop())
  },

  start() {
    if (this.data.over) { this.reset(); return }
    if (this.data.running) return
    this.setData({ running: true, paused: false })
    this._lastDrop = Date.now()
    this.loop()
  },

  loop() {
    this.stopLoop()
    this._raf = setTimeout(() => {
      if (this.data.running && !this.data.paused) this.tick()
      if (this.data.running) this.loop()
    }, 30)   // 30ms 刷新率，落块节奏由 tick 内部控制
  },

  stopLoop() {
    if (this._raf) { clearTimeout(this._raf); this._raf = null }
  },

  tick() {
    const now = Date.now()
    const interval = L.speedOf(this.data.level)
    if (now - this._lastDrop >= interval) {
      this._lastDrop = now
      this.softStep()
    }
    this.draw()
  },

  softStep() {
    const next = L.tryDown(this._grid, this._piece)
    if (next) {
      this._piece = next
    } else {
      this.lockPiece()
    }
  },

  lockPiece() {
    const { grid, cleared } = L.lock(this._grid, this._piece)
    this._grid = grid
    if (cleared.length) {
      const gained = L.scoreOf(cleared.length, this.data.level)
      const lines = this.data.lines + cleared.length
      const level = Math.floor(lines / 10) + 1
      const combo = this.data.combo + 1
      this.setData({ score: this.data.score + gained, lines, level, combo })
      wx.vibrateShort({ type: cleared.length >= 3 ? 'medium' : 'light' })
      if (cleared.length === 4) this.flash('TETRIS!')
      else if (cleared.length >= 2) this.flash(cleared.length + ' 连消!')
    } else {
      this.setData({ combo: 0 })
    }
    // 换下一块；出生即碰撞 = 结束
    this._piece = this._next
    this._next = this.nextFromBag()
    if (L.collides(this._grid, this._piece)) {
      this.gameOver()
    }
  },

  gameOver() {
    this.stopLoop()
    const best = Math.max(this.data.score, this.data.best)
    if (best > this.data.best) wx.setStorageSync(BEST_KEY, best)
    this.setData({ running: false, over: true, best })
    wx.vibrateShort({ type: 'heavy' })
    this.draw()
  },

  flash(text) {
    this.setData({ flashText: text })
    setTimeout(() => this.setData({ flashText: '' }), 800)
  },

  // ===== 操作 =====
  moveLeft() { if (!this.canAct()) return; const p = L.tryMove(this._grid, this._piece, -1); if (p) { this._piece = p; this.draw() } },
  moveRight() { if (!this.canAct()) return; const p = L.tryMove(this._grid, this._piece, 1); if (p) { this._piece = p; this.draw() } },
  rotate() {
    if (!this.canAct()) return
    const p = L.tryRotate(this._grid, this._piece)
    if (p) { this._piece = p; wx.vibrateShort({ type: 'light' }); this.draw() }
  },
  softDrop() { if (!this.canAct()) return; this.softStep(); this._lastDrop = Date.now(); this.draw() },
  hardDrop() {
    if (!this.canAct()) return
    this._piece = L.hardDrop(this._grid, this._piece)
    wx.vibrateShort({ type: 'medium' })
    this.lockPiece()
    this._lastDrop = Date.now()
    this.draw()
  },
  canAct() { return this.data.running && !this.data.paused && !this.data.over },

  pause() {
    if (!this.data.running) return
    this.setData({ paused: !this.data.paused })
    if (!this.data.paused) this._lastDrop = Date.now()
    this.draw()
  },

  // 触屏：左右滑移动、下滑软降、快速下滑硬降、点击旋转
  onTouchStart(e) {
    const t = e.touches[0]
    this._sx = t.clientX; this._sy = t.clientY
    this._st = Date.now()
    this._moved = false
  },
  onTouchMove(e) {
    if (!this.canAct()) return
    const t = e.touches[0]
    const dx = t.clientX - this._sx
    if (Math.abs(dx) > this._cell * 0.9) {
      dx > 0 ? this.moveRight() : this.moveLeft()
      this._sx = t.clientX; this._moved = true
    }
  },
  onTouchEnd(e) {
    if (!this.canAct()) return
    const t = e.changedTouches[0]
    const dx = t.clientX - this._sx, dy = t.clientY - this._sy
    const dt = Date.now() - this._st
    if (dy > 60 && Math.abs(dx) < 40 && dt < 260) {
      this.hardDrop()   // 快速下滑 = 硬降
    } else if (dy > 40) {
      this.softDrop()
    } else if (!this._moved && Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 300) {
      this.rotate()     // 轻点 = 旋转
    }
  },

  goHome() {
    this.stopLoop()
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) })
  },
  onUnload() { this.stopLoop() },
  onHide() { if (this.data.running && !this.data.paused) this.pause() },

  // ===== 赛博朋克渲染 =====
  draw() {
    const ctx = this._ctx
    if (!ctx) return
    const cell = this._cell, W = this._bw, H = this._bh

    // 背景深空黑
    ctx.setFillStyle('#0A0A14')
    ctx.fillRect(0, 0, W, H)

    // 网格微光线
    ctx.setStrokeStyle('rgba(0, 240, 255, 0.06)')
    ctx.setLineWidth(0.5)
    for (let c = 1; c < L.COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * cell, 0); ctx.lineTo(c * cell, H); ctx.stroke()
    }
    for (let r = 1; r < L.ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * cell); ctx.lineTo(W, r * cell); ctx.stroke()
    }

    // 已锁定块：霓虹描边 + 半透明芯 + 高光
    for (let r = 0; r < L.ROWS; r++) {
      for (let c = 0; c < L.COLS; c++) {
        const t = this._grid[r][c]
        if (t) this.drawCell(ctx, c * cell, r * cell, cell, NEON[t], 0.85)
      }
    }

    if (this._piece && this.data.running && !this.data.over) {
      // ghost 投影（落点虚影）
      const ghost = L.ghostOf(this._grid, this._piece)
      L.cellsOf(ghost).forEach(([x, y]) => {
        if (y >= 0) this.drawGhost(ctx, x * cell, y * cell, cell, NEON[ghost.type])
      })
      // 当前块（全亮）
      L.cellsOf(this._piece).forEach(([x, y]) => {
        if (y >= 0) this.drawCell(ctx, x * cell, y * cell, cell, NEON[this._piece.type], 1)
      })
    }

    ctx.draw()
    this.drawNext()
  },

  // NEXT 预览（居中绘制，尺寸由 nextSize 注入）
  drawNext() {
    const ctx = this._nextCtx
    if (!ctx || !this._next) return
    const S = this.data.nextSize || 44
    ctx.clearRect(0, 0, S, S)
    const cells = L.cellsOf(this._next)
    // 归一化到 0 起
    const xs = cells.map(c => c[0]), ys = cells.map(c => c[1])
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs)
    const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys)
    const spanX = maxX - minX + 1, spanY = maxY - minY + 1
    const cell = Math.floor(Math.min(S / 4.4, (S - 6) / Math.max(spanX, spanY)))
    const offX = (S - spanX * cell) / 2
    const offY = (S - spanY * cell) / 2
    cells.forEach(([x, y]) => {
      this.drawCell(ctx, offX + (x - minX) * cell, offY + (y - minY) * cell, cell, NEON[this._next.type], 1)
    })
    ctx.draw()
  },

  drawCell(ctx, px, py, size, color, alpha) {
    const pad = Math.max(1, size * 0.08)
    const x = px + pad, y = py + pad, s = size - pad * 2
    // 辉光（旧版 canvas 无 shadowBlur，用外层半透明描边模拟）
    ctx.setGlobalAlpha(alpha * 0.25)
    ctx.setFillStyle(color.glow)
    ctx.fillRect(x - 2, y - 2, s + 4, s + 4)
    // 芯（深色内嵌）
    ctx.setGlobalAlpha(alpha)
    ctx.setFillStyle(color.main)
    ctx.fillRect(x, y, s, s)
    // 内芯暗化制造"霓虹管"感
    ctx.setGlobalAlpha(alpha * 0.55)
    ctx.setFillStyle('#0A0A14')
    ctx.fillRect(x + s * 0.18, y + s * 0.18, s * 0.64, s * 0.64)
    // 边框亮线
    ctx.setGlobalAlpha(1)
    ctx.setStrokeStyle(color.main)
    ctx.setLineWidth(1.5)
    ctx.strokeRect(x, y, s, s)
    // 左上高光点
    ctx.setGlobalAlpha(alpha)
    ctx.setFillStyle('#FFFFFF')
    ctx.fillRect(x + 2, y + 2, Math.max(2, s * 0.12), Math.max(2, s * 0.12))
    ctx.setGlobalAlpha(1)
  },

  drawGhost(ctx, px, py, size, color) {
    const pad = Math.max(1, size * 0.08)
    const x = px + pad, y = py + pad, s = size - pad * 2
    ctx.setGlobalAlpha(0.28)
    ctx.setStrokeStyle(color.glow)
    ctx.setLineWidth(1.2)
    ctx.strokeRect(x + 1, y + 1, s - 2, s - 2)
    ctx.setGlobalAlpha(1)
  }
})
