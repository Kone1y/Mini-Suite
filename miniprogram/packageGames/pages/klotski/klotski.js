const L = require('../../klotski-logic')

const BEST_KEY_PREFIX = 'klotski_best_l'
const LEVELS = {
  easy:   { key: 'easy',   label: '4×4',  n: 4 },
  medium: { key: 'medium', label: '5×5',  n: 5 },
  hard:   { key: 'hard',   label: '6×6',  n: 6 }
}

Page({
  data: {
    cells: [],
    steps: 0,
    best: null,
    won: false,
    level: LEVELS.easy,
    n: 4,
    showLevelPicker: false
  },

  onLoad(options) {
    const lv = LEVELS[options.level] || LEVELS.easy
    this.applyLevel(lv)
  },

  applyLevel(lv) {
    const best = wx.getStorageSync(BEST_KEY_PREFIX + lv.key)
    this.setData({
      level: lv,
      n: lv.n,
      best: best || null,
      showLevelPicker: false,
      tileFont: lv.n >= 6 ? '34rpx' : lv.n >= 5 ? '42rpx' : '52rpx'
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
    this._board = L.shuffle(this.data.level.n)
    this.setData({
      cells: this._board.map(v => ({ v })),
      steps: 0,
      won: false
    })
  },

  tapCell(e) {
    if (this.data.won) return
    const idx = Number(e.currentTarget.dataset.idx)
    const moved = L.swapWithBlank(this._board, idx, this.data.level.n)
    if (moved[idx] !== 0) return

    this._board = moved
    const steps = this.data.steps + 1
    const won = L.isSolved(moved, this.data.level.n)
    this.setData({
      cells: moved.map(v => ({ v })),
      steps,
      won
    })
    if (won) {
      this.saveBest()
      wx.vibrateShort({ type: 'medium' })
    }
  },

  saveBest() {
    const s = this.data.steps
    const key = BEST_KEY_PREFIX + this.data.level.key
    const best = wx.getStorageSync(key)
    if (!best || s < best) {
      wx.setStorageSync(key, s)
      this.setData({ best: s })
    }
  },

  goHome() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) })
  }
})
