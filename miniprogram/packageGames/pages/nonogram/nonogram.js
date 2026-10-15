const L = require('../../nonogram-logic')

const SIZES = [5, 10, 15]
// 格子三态循环：未知 → 黑(填) → 白(叉) → 未知
const CLUE_EMPTY = '0'

Page({
  data: {
    sizeIdx: 0,
    sizeLabel: '5×5',
    cellPx: 0,
    grid: [],            // 玩家盘面（0未知 1黑 2白）
    gridCols: 0,
    rowCluesView: [],    // [{text}]
    colCluesView: [],    // [{text}]
    status: '点尺寸生成一局',
    won: false,
    hintCell: null,      // { x, y } 提示闪烁格
    introOpen: false,
    generating: false
  },

  _puzzle: null,        // { pattern, rowClues, colClues }
  _winState: null,

  onLoad() {
    const W = wx.getSystemInfoSync().windowWidth
    this._winW = W
    this.computeSize(0)
  },

  computeSize(idx) {
    const size = SIZES[idx]
    // 可用宽：屏宽 - 48 页边 - 线索列宽(按位数)
    const clueW = idx === 0 ? 44 : (idx === 1 ? 56 : 64)
    const cell = Math.max(14, Math.floor((this._winW - 32 - clueW) / size))
    this.setData({ sizeIdx: idx, sizeLabel: size + '×' + size, cellPx: cell })
  },

  onSize(e) {
    const i = Number(e.detail.value)
    this.computeSize(i)
    this.setData({ grid: [], status: '已选 ' + SIZES[i] + '×' + SIZES[i] + '，点「新谜题」', won: false, hintCell: null })
    this._puzzle = null
  },

  newPuzzle() {
    const size = SIZES[this.data.sizeIdx]
    this.setData({ generating: true, status: '生成中…' })
    // 生成放 setTimeout，让状态先渲染
    setTimeout(() => {
      const t0 = Date.now()
      this._puzzle = L.generate(size)
      const dt = Date.now() - t0
      const grid = []
      for (let y = 0; y < size; y++) grid.push(new Array(size).fill(L.UNKNOWN))
      // 线索视图（空线索显示 0）
      const rowCluesView = this._puzzle.rowClues.map(c => ({ text: c.length ? c.join(' ') : CLUE_EMPTY }))
      const colCluesView = this._puzzle.colClues.map(c => ({ text: c.length ? c.join('\n') : CLUE_EMPTY }))
      this.setData({
        grid,
        gridCols: size,
        rowCluesView,
        colCluesView,
        generating: false,
        won: false,
        hintCell: null,
        status: '开始推理吧（' + dt + 'ms 生成 · 保证唯一解）'
      })
    }, 30)
  },

  // 点格：循环三态
  onCell(e) {
    if (!this._puzzle || this.data.won) return
    const idx = Number(e.currentTarget.dataset.idx)
    const x = idx % this.data.gridCols
    const y = Math.floor(idx / this.data.gridCols)
    const cur = this.data.grid[y][x]
    const next = cur === L.UNKNOWN ? L.FILLED : (cur === L.FILLED ? L.BLANK : L.UNKNOWN)
    this.setData({ ['grid[' + y + '][' + x + ']']: next, hintCell: null })
    // 全盘填满才判胜负
    if (next !== L.UNKNOWN && this.allFilled()) this.checkWinNow()
  },

  allFilled() {
    return this.data.grid.every(row => row.every(c => c !== L.UNKNOWN))
  },

  checkWinNow() {
    if (L.checkWin(this._puzzle.pattern, this.data.grid)) {
      this.setData({ won: true, status: '🎉 通关！图案正确' })
      wx.vibrateShort({ type: 'medium' })
    }
    // 不弹错误——错了继续推（数织的乐趣）
  },

  // 校验：只查已填格与线索是否有直接矛盾（行/列单线求解 ok 与否）
  verify() {
    if (!this._puzzle) return
    const h = L.hint(this._puzzle.rowClues, this._puzzle.colClues, this.data.grid)
    if (h && h.error) {
      this.setData({ status: '⚠ ' + h.error })
      wx.vibrateShort({ type: 'light' })
    } else if (h && h.x != null) {
      // 有矛盾才提示；无矛盾显示进度
      let known = 0
      this.data.grid.forEach(row => row.forEach(c => { if (c !== L.UNKNOWN) known++ }))
      const total = this.data.gridCols * this.data.gridCols
      this.setData({ status: '盘面无矛盾 · 已确定 ' + known + '/' + total + ' 格' })
    } else {
      this.setData({ status: '全部确定！' })
      this.checkWinNow()
    }
  },

  // 提示：点亮一个纯逻辑可推的格子
  giveHint() {
    if (!this._puzzle || this.data.won) return
    const h = L.hint(this._puzzle.rowClues, this._puzzle.colClues, this.data.grid)
    if (h && h.error) {
      this.setData({ status: '⚠ ' + h.error + '（先点「校验」看哪里冲突）' })
      return
    }
    if (!h || h.x == null) {
      this.setData({ status: '已全部确定！' })
      this.checkWinNow()
      return
    }
    // 展示提示格（不直接填，让玩家自己点）——闪烁 3 秒
    this.setData({ hintCell: { x: h.x, y: h.y }, status: '提示：看闪烁的格子（' + (h.value === L.FILLED ? '应填黑' : '应标空') + '）' })
    setTimeout(() => {
      if (this.data.hintCell) this.setData({ hintCell: null })
    }, 3000)
  },

  // 清空重来（同一谜题）
  clearGrid() {
    if (!this._puzzle) return
    const size = this.data.gridCols
    const grid = []
    for (let y = 0; y < size; y++) grid.push(new Array(size).fill(L.UNKNOWN))
    this.setData({ grid, won: false, hintCell: null, status: '已清空（同一谜题）' })
  },

  toggleIntro() {
    this.setData({ introOpen: !this.data.introOpen })
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
