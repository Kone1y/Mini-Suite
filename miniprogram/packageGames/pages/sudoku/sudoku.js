const L = require('../../sudoku-logic')

const LEVELS = [
  { key: 'easy', label: '初级 · 35 洞', holes: 35 },
  { key: 'medium', label: '中级 · 45 洞', holes: 45 },
  { key: 'hard', label: '高级 · 55 洞', holes: 55 }
]
const BEST_KEY = 'sudoku_best_'

Page({
  data: {
    levels: LEVELS.map(l => l.label),
    levelIdx: 1,
    cells: [],        // [{v, given, notes:[], error:false}]
    selected: null,   // 选中格 index
    noteMode: false,
    showLevels: false,
    elapsed: 0,
    finished: false,
    best: null,
    mistakes: 0
  },

  onLoad() {
    this._grid = null      // 用户盘面 9×9
    this._given = null     // 题面固定格
    this._solution = null
    this._timer = null
    this.applyLevel(1)
  },

  onUnload() { this.stopTimer() },
  onHide() { this.stopTimer() },

  applyLevel(idx) {
    const lv = LEVELS[idx]
    const best = wx.getStorageSync(BEST_KEY + lv.key) || null
    this.setData({
      levelIdx: idx,
      showLevels: false,
      best,
      bestText: best ? this.fmt(best) : '',
      isRecord: false,
      finished: false
    })
    this.newGame()
  },

  newGame() {
    const lv = LEVELS[this.data.levelIdx]
    wx.showLoading({ title: '生成中…', mask: true })
    // 生成较重（hard 可能 1-3 秒），让 loading 先渲染
    setTimeout(() => {
      const { puzzle, solution } = L.generate(lv.key)
      wx.hideLoading()
      this._grid = puzzle.map(r => r.slice())
      this._given = puzzle.map(r => r.map(v => v !== 0))
      this._solution = solution
      this._notes = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({})))
      this.setData({
        cells: this.buildCells(),
        selected: null,
        mistakes: 0,
        finished: false,
        elapsed: 0,
        timeText: '00:00'
      })
      this.startTimer()
    }, 50)
  },

  buildCells() {
    const out = []
    const cf = L.conflicts(this._grid)
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const v = this._grid[r][c]
      const given = this._given[r][c]
      // 错误判定：非给定格有值且与答案不符
      const error = !given && v !== 0 && v !== this._solution[r][c]
      const notes = given || v !== 0 ? [] : Object.keys(this._notes[r][c]).map(Number).sort((a, b) => a - b)
      out.push({
        v: given || v !== 0 ? v : 0,
        given,
        error,
        conflict: cf.has(r * 9 + c),
        notes,
        // 高亮同行/列/宫
        row: r, col: c
      })
    }
    return out.map((cell, i) => ({
      ...cell,
      highlight: this.isSelectedPeer(i)
    }))
  },

  isSelectedPeer(idx) {
    if (this.data.selected === null) return false
    const r = Math.floor(idx / 9), c = idx % 9
    const sr = Math.floor(this.data.selected / 9), sc = this.data.selected % 9
    return (r === sr || c === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3)))
  },

  // 重新计算所有格子的 peer 高亮（选中格变化时）
  refreshPeers() {
    const cells = this.data.cells.map((cell, i) => ({ ...cell, highlight: this.isSelectedPeer(i) }))
    this.setData({ cells })
  },

  tapCell(e) {
    const idx = e.currentTarget.dataset.idx
    const cell = this.data.cells[idx]
    if (cell.given) {
      // 给定格也可选中（用于高亮同区），但不能改
      this.setData({ selected: idx }, () => this.refreshPeers())
      return
    }
    this.setData({ selected: idx }, () => this.refreshPeers())
  },

  tapNum(e) {
    const n = Number(e.currentTarget.dataset.n)
    if (this.data.selected === null) return
    const idx = this.data.selected
    const r = Math.floor(idx / 9), c = idx % 9
    if (this._given[r][c]) return
    if (this.data.noteMode) {
      // 笔记切换
      if (this._grid[r][c] !== 0) return   // 已有正式值时不能记笔记
      if (this._notes[r][c][n]) delete this._notes[r][c][n]
      else this._notes[r][c][n] = true
      this.setData({ cells: this.buildCells() })
      return
    }
    // 正式填数
    if (this._grid[r][c] === n) {
      this._grid[r][c] = 0   // 再点同数字 = 擦除
    } else {
      this._grid[r][c] = n
      this._notes[r][c] = {}
      if (n !== this._solution[r][c]) {
        this.setData({ mistakes: this.data.mistakes + 1 })
        wx.vibrateShort({ type: 'medium' })
      }
    }
    this.setData({ cells: this.buildCells() }, () => this.refreshPeers())
    // 完成判定
    if (L.isComplete(this._grid)) this.win()
  },

  erase() {
    if (this.data.selected === null) return
    const idx = this.data.selected
    const r = Math.floor(idx / 9), c = idx % 9
    if (this._given[r][c]) return
    this._grid[r][c] = 0
    this._notes[r][c] = {}
    this.setData({ cells: this.buildCells() }, () => this.refreshPeers())
  },

  toggleNotes() {
    this.setData({ noteMode: !this.data.noteMode })
  },

  hint() {
    // 提示：填充选中格或随机一个空格的正确值
    let idx = this.data.selected
    if (idx === null || this._given[Math.floor(idx / 9)][idx % 9] || this._grid[Math.floor(idx / 9)][idx % 9] !== 0) {
      // 找第一个空格
      idx = null
      for (let i = 0; i < 81; i++) {
        const r = Math.floor(i / 9), c = i % 9
        if (!this._given[r][c] && this._grid[r][c] === 0) { idx = i; break }
      }
    }
    if (idx === null) return
    const r = Math.floor(idx / 9), c = idx % 9
    this._grid[r][c] = this._solution[r][c]
    this._notes[r][c] = {}
    wx.vibrateShort({ type: 'light' })
    this.setData({ selected: idx, cells: this.buildCells() }, () => this.refreshPeers())
    if (L.isComplete(this._grid)) this.win()
  },

  win() {
    this.stopTimer()
    const lv = LEVELS[this.data.levelIdx]
    const t = this.data.elapsed
    const best = wx.getStorageSync(BEST_KEY + lv.key)
    const isRecord = !best || t < best
    if (isRecord) wx.setStorageSync(BEST_KEY + lv.key, t)
    this.setData({
      finished: true,
      best: isRecord ? t : best,
      bestText: this.fmt(isRecord ? t : best),
      isRecord,
      selected: null
    })
  },

  startTimer() {
    this.stopTimer()
    this._timer = setInterval(() => {
      const elapsed = this.data.elapsed + 1
      this.setData({ elapsed, timeText: this.fmt(elapsed) })
    }, 1000)
  },
  stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  fmt(s) {
    const m = Math.floor(s / 60), ss = s % 60
    return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
  },

  openLevels() { this.setData({ showLevels: true }) },
  closeLevels() { this.setData({ showLevels: false }) },
  // catchtap 阻止冒泡用（空 catchtap="" 不生效，必须绑真实函数）
  stopProp() { },
  pickLevel(e) {
    this.applyLevel(Number(e.currentTarget.dataset.idx))
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
