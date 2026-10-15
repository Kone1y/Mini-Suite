const L = require('../../akari-logic')

const SIZES = [
  { label: '7×7', n: 7 },
  { label: '10×10', n: 10 }
]

Page({
  data: {
    sizeIdx: 0,
    sizeLabel: '7×7',
    N: 7,
    cellPx: 44,
    boardPx: 308,
    cells: [],           // [{r,c,type,hasBulb,lit,bad}]
    placedCount: 0,
    status: '点白格放灯泡，把全盘照亮',
    won: false,
    generating: false,
    elapsed: 0,
    hintCell: null
  },

  _grid: null,
  _solution: null,
  _bulbs: null,
  _timer: null,
  _start: 0,
  _hint: null,

  onLoad() {
    const W = wx.getSystemInfoSync().windowWidth
    this._winW = W
    this.computeSize(0)   // 首屏按屏宽算 cellPx（默认 44px 会让小屏一行挤 8 格）
    this.newPuzzle()
  },

  onUnload() { if (this._timer) clearInterval(this._timer) },
  onHide() {
    // 切后台记录已玩秒数（回来继续累计，不把后台时间算进去）
    if (this._start && !this.data.won) {
      this._elapsedBase = (this._elapsedBase || 0) + (Date.now() - this._start)
      this._start = 0
    }
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },
  onShow() {
    if (!this.data.won && this._grid) {
      if (!this._start) this._start = Date.now()
      this.tickTimer()
    }
  },

  tickTimer() {
    if (this._timer) clearInterval(this._timer)
    this._timer = setInterval(() => {
      if (!this.data.won) this.setData({ elapsed: Math.floor((Date.now() - this._start) / 1000) })
    }, 1000)
  },

  computeSize(idx) {
    const n = SIZES[idx].n
    const cell = Math.max(24, Math.floor((this._winW - 48) / n))
    this.setData({ sizeIdx: idx, sizeLabel: SIZES[idx].label, N: n, cellPx: cell, boardPx: cell * n })
  },

  onSize(e) {
    this.computeSize(Number(e.detail.value))
    this.newPuzzle()
  },

  newPuzzle() {
    this.setData({ generating: true, status: '生成中…' })
    // 生成失败自动重试（换随机种子，最多 3 次）
    const attemptGen = (tries) => {
      setTimeout(() => {
        const g = L.generate(this.data.N, this.data.N)
        if (!g) {
          if (tries > 0) { attemptGen(tries - 1); return }
          this.setData({ generating: false, status: '生成失败，点「新谜题」重试' })
          return
        }
        this._grid = g.grid
        this._solution = g.solution
        this._bulbs = new Set()
        this._start = Date.now()
        this._elapsedBase = 0
        this.setData({ generating: false, won: false, elapsed: 0, placedCount: 0, hintCell: null, status: '点白格放灯 · 数字墙约束灯数' })
        this.rebuild()
        this.tickTimer()
      }, 30)
    }
    attemptGen(3)
  },

  rebuild() {
    const N = this.data.N
    const res = L.check(N, N, this._grid, this._bulbs)
    // 每格视图：type（-2 无字墙/-1 白/0..4 数字墙）、hasBulb、lit、bad（互射/墙超数的灯标红）
    const bad = new Set()
    // 互射灯
    const { H, V } = L.buildSegments(N, N, this._grid)
    const hCnt = {}, vCnt = {}
    for (const k of this._bulbs) {
      const [r, c] = k.split(',').map(Number)
      const h = H[r][c], v = V[r][c]
      hCnt[h] = (hCnt[h] || 0) + 1
      vCnt[v] = (vCnt[v] || 0) + 1
    }
    for (const k of this._bulbs) {
      const [r, c] = k.split(',').map(Number)
      if (hCnt[H[r][c]] > 1 || vCnt[V[r][c]] > 1) bad.add(k)
    }
    const wallBad = new Set()
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (this._grid[r][c] >= 0) {
        let cnt = 0
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          if (this._bulbs.has((r + dr) + ',' + (c + dc))) cnt++
        }
        if (cnt > this._grid[r][c]) wallBad.add(r + ',' + c)
      }
    }
    const cells = []
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const k = r + ',' + c
        cells.push({
          r, c,
          type: this._grid[r][c],
          hasBulb: this._bulbs.has(k),
          lit: res.lit.has(k),
          bad: bad.has(k),
          wallBad: wallBad.has(k)
        })
      }
    }
    this.setData({ cells, placedCount: this._bulbs.size })
  },

  onCell(e) {
    if (this.data.won) return
    const idx = Number(e.currentTarget.dataset.idx)
    const cell = this.data.cells[idx]
    if (cell.type !== -1) return   // 墙不可点
    const k = cell.r + ',' + cell.c
    if (this._bulbs.has(k)) this._bulbs.delete(k)
    else this._bulbs.add(k)
    wx.vibrateShort({ type: 'light' })
    this.rebuild()
    this.checkWin()
  },

  checkWin() {
    const N = this.data.N
    const res = L.check(N, N, this._grid, this._bulbs)
    if (res.ok) {
      if (this._timer) clearInterval(this._timer)
      this.setData({ won: true, status: '🎉 全盘照亮！用时 ' + this.data.elapsed + 's · ' + this._bulbs.size + ' 盏灯' })
      wx.vibrateShort({ type: 'heavy' })
    } else if (res.reasons.length && this._bulbs.size > 0) {
      this.setData({ status: res.reasons[0] })
    } else {
      this.setData({ status: '灯 ' + this._bulbs.size + ' 盏' })
    }
  },

  giveHint() {
    if (this.data.won || !this._solution) return
    const N = this.data.N
    const h = L.hint(N, N, this._grid, this._solution, this._bulbs)
    if (!h) { this.setData({ status: '已完成！' }); return }
    if (h.type === 'remove') {
      this._bulbs.delete(h.key)
      this.rebuild()
      const [r, c] = h.key.split(',').map(Number)
      wx.showToast({ title: '撤掉 (' + (c + 1) + ',' + (r + 1) + ') 的灯', icon: 'none' })
      this.checkWin()
    } else {
      const [r, c] = h.key.split(',').map(Number)
      this.setData({ hintCell: { r, c } })
      setTimeout(() => this.setData({ hintCell: null }), 2500)
      wx.showToast({ title: '看闪烁的格子', icon: 'none' })
    }
  },

  toggleHelp() {
    this.setData({ helpOpen: !this.data.helpOpen })
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
