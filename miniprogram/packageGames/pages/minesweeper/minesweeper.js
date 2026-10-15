const L = require('../../minesweeper-logic')

const BEST_KEY_PREFIX = 'minesweeper_best_time_'

// 三档难度
const LEVELS = {
  easy:   { key: 'easy',   label: '初级 9×9',   size: 9,  mines: 10 },
  medium: { key: 'medium', label: '中级 12×12', size: 12, mines: 24 },
  hard:   { key: 'hard',   label: '高级 16×16', size: 16, mines: 50 }
}

Page({
  data: {
    level: LEVELS.easy,
    cells: [],
    size: 9,
    flagsLeft: 10,
    time: 0,
    started: false,
    over: false,
    won: false,
    best: null,
    showLevelPicker: false,
    // 数字配色（经典扫雷色系）
    numColors: ['', '#185FA5', '#0F6E56', '#D84343', '#534AB7', '#993C1D', '#1F9E8E', '#2C2C2A', '#888780']
  },

  onLoad(options) {
    const lv = LEVELS[options.level] || LEVELS.easy
    this.applyLevel(lv)
  },

  applyLevel(lv) {
    const best = wx.getStorageSync(BEST_KEY_PREFIX + lv.key)
    this.setData({
      level: lv,
      size: lv.size,
      best: best || null,
      showLevelPicker: false,
      // 字号随棋盘密度缩放
      cellFont: lv.size >= 16 ? '22rpx' : lv.size >= 12 ? '26rpx' : '32rpx'
    })
    this.restart()
  },

  switchLevel(e) {
    this.applyLevel(LEVELS[e.currentTarget.dataset.lv])
  },

  togglePicker() {
    this.setData({ showLevelPicker: !this.data.showLevelPicker })
  },

  restart() {
    if (this._timer) clearInterval(this._timer)
    this._timer = null
    this._board = L.newBoard(this.data.level.size)
    this._minesPlaced = false
    this.setData({
      cells: this._board,
      flagsLeft: this.data.level.mines,
      time: 0,
      started: false,
      over: false,
      won: false
    })
  },

  startTimer() {
    this._timer = setInterval(() => {
      this.setData({ time: this.data.time + 1 })
    }, 1000)
  },

  tapCell(e) {
    if (this.data.over) return
    const idx = Number(e.currentTarget.dataset.idx)
    const cell = this._board[idx]
    if (cell.flagged) return

    if (!this._minesPlaced) {
      L.placeMines(this._board, idx, this.data.level.mines, this.data.level.size)
      this._minesPlaced = true
      this.setData({ started: true })
      this.startTimer()
    }

    const { board, hitMine, won } = L.reveal(this._board, idx, this.data.level.size)
    this._board = board
    this.setData({ cells: board, over: hitMine || won, won })
    if (hitMine) {
      this.stopTimer()
      wx.vibrateShort({ type: 'heavy' })
    } else if (won) {
      this.stopTimer()
      this.saveBest()
      wx.vibrateShort({ type: 'medium' })
    }
  },

  longPressCell(e) {
    if (this.data.over || !this._minesPlaced) return
    const idx = Number(e.currentTarget.dataset.idx)
    const { board, changed } = L.toggleFlag(this._board, idx)
    if (!changed) return
    this._board = board
    this.setData({ cells: board, flagsLeft: L.flagsLeft(board, this.data.level.mines) })
    wx.vibrateShort({ type: 'light' })
  },

  stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  saveBest() {
    const t = this.data.time
    const key = BEST_KEY_PREFIX + this.data.level.key
    const best = wx.getStorageSync(key)
    if (!best || t < best) {
      wx.setStorageSync(key, t)
      this.setData({ best: t })
    }
  },

  onUnload() { this.stopTimer() },
  onHide() { this.stopTimer() },

  goHome() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) })
  }
})
