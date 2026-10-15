// 正则填字 Regex Crossword
const L = require('../../regexcross-logic')

const STORE_BEST = 'regexcross_best_v1'

Page({
  data: {
    n: 4,
    rows: [],             // 行正则
    cols: [],             // 列正则
    grid: [],             // 玩家网格（' '=空）
    cellPx: 56,
    boardPx: 0,
    sel: null,            // 选中格 {r,c}
    rowOk: [], colOk: [],
    generating: true,
    elapsed: 0,
    won: false,
    helpOpen: false,
    alphaRows: []         // 字母键盘行
  },

  _timer: null,
  _solution: null,
  _start: 0,
  _elapsedBase: 0,

  onLoad() {
    const W = wx.getSystemInfoSync().windowWidth
    this._winW = W
    this.setData({
      alphaRows: ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ'],
      helpOpen: !wx.getStorageSync('regexcross_help_seen')
    })
    if (!this.data.helpOpen) {
      try { wx.setStorageSync('regexcross_help_seen', '1') } catch (e) { }
    }
    this.newPuzzle()
  },

  onUnload() { this.clearTimer() },
  onHide() {
    if (this._start && !this.data.won) {
      this._elapsedBase += Date.now() - this._start
      this._start = 0
    }
    this.clearTimer()
  },
  onShow() {
    if (this._solution && !this.data.won && !this.data.generating) {
      if (!this._start) this._start = Date.now()
      this.tickTimer()
    }
  },

  clearTimer() { if (this._timer) { clearInterval(this._timer); this._timer = null } },
  tickTimer() {
    this.clearTimer()
    this._timer = setInterval(() => {
      if (!this.data.won) {
        const total = this._elapsedBase + (this._start ? Date.now() - this._start : 0)
        this.setData({ elapsed: Math.floor(total / 1000) })
      }
    }, 1000)
  },

  onSize(e) {
    const n = Number(e.currentTarget.dataset.n)
    if (n === this.data.n) return
    this.setData({ n })
    this.newPuzzle()
  },

  newPuzzle() {
    this.setData({ generating: true, won: false })
    this.clearTimer()
    setTimeout(() => {
      const n = this.data.n
      let g = null
      for (let i = 0; i < 6 && !g; i++) {
        const cand = L.generate(n)
        // 再验唯一
        const v = L.solve(n, cand.rows, cand.cols, 2)
        if (v.count === 1) g = cand
      }
      if (!g) g = L.generate(n)
      this._solution = g.solution
      const cell = Math.max(38, Math.floor((this._winW - 140) / n))
      this.setData({
        rows: g.rows,
        cols: g.cols,
        grid: Array.from({ length: n }, () => new Array(n).fill(' ')),
        cellPx: cell,
        boardPx: cell * n,
        generating: false,
        sel: null,
        rowOk: new Array(n).fill(false),
        colOk: new Array(n).fill(false),
        elapsed: 0
      })
      this._start = Date.now()
      this._elapsedBase = 0
      this.tickTimer()
    }, 50)
  },

  onCell(e) {
    if (this.data.won || this.data.generating) return
    const r = Number(e.currentTarget.dataset.r), c = Number(e.currentTarget.dataset.c)
    this.setData({ sel: { r, c } })
  },

  onAlpha(e) {
    if (this.data.won || !this.data.sel) return
    const ch = e.currentTarget.dataset.ch
    const { r, c } = this.data.sel
    const grid = this.data.grid.map(row => row.slice())
    // 同字母再点 = 清除（切换）
    grid[r][c] = grid[r][c] === ch ? ' ' : ch
    this.setData({ grid })
    // 自动推进到下一格
    const n = this.data.n
    let nr = r, nc = c + 1
    if (nc >= n) { nc = 0; nr = (nr + 1) % n }
    this.setData({ sel: { r: nr, c: nc } })
    this.checkLines()
  },

  checkLines() {
    const n = this.data.n
    const res = L.checkLines(n, this.data.rows, this.data.cols, this.data.grid)
    this.setData({ rowOk: res.rowOk, colOk: res.colOk })
    // 全满且全过 = 胜利
    const full = this.data.grid.every(row => row.every(ch => ch !== ' '))
    if (full && res.rowOk.every(Boolean) && res.colOk.every(Boolean)) {
      this.clearTimer()
      // 记录最佳
      const key = 'best' + n
      try {
        const best = JSON.parse(wx.getStorageSync(STORE_BEST) || '{}')
        if (!best[key] || this.data.elapsed < best[key]) {
          best[key] = this.data.elapsed
          wx.setStorageSync(STORE_BEST, JSON.stringify(best))
        }
      } catch (e) { }
      this.setData({ won: true })
      wx.vibrateShort({ type: 'heavy' })
    }
  },

  onHint() {
    if (this.data.won || !this._solution) return
    // 找一个错误/未填的格子揭示
    const n = this.data.n
    let fixed = false
    for (let i = 0; i < n * n && !fixed; i++) {
      const r = Math.floor(i / n), c = i % n
      if (this.data.grid[r][c] !== this._solution[r][c]) {
        const grid = this.data.grid.map(row => row.slice())
        grid[r][c] = this._solution[r][c]
        this.setData({ grid, sel: { r, c } })
        this.checkLines()
        wx.showToast({ title: '揭示 (' + (r + 1) + ',' + (c + 1) + ')', icon: 'none' })
        fixed = true
      }
    }
    if (!fixed) wx.showToast({ title: '已全部正确！', icon: 'none' })
  },

  toggleHelp() {
    this.setData({ helpOpen: !this.data.helpOpen })
    try { wx.setStorageSync('regexcross_help_seen', '1') } catch (e) { }
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
