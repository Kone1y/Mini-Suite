// 关卡定义：3 关递进 + 第 4 关瞬间记忆（开局预览 2 秒）
const LEVELS = [
  { pairs: 8,  cols: 4, label: '第 1 关 · 8 对' },
  { pairs: 10, cols: 5, label: '第 2 关 · 10 对' },
  { pairs: 12, cols: 6, label: '第 3 关 · 12 对' },
  { pairs: 8,  cols: 4, label: '第 4 关 · 瞬间记忆', flash: true }
]

const EMOJI_POOL = ['🍎', '🍇', '🍑', '🍒', '🥑', '🍋', '🥕', '🍉', '🍍', '🥝', '🍓', '🍌']
const PROGRESS_KEY = 'memory_progress'   // 已解锁关卡
const BEST_KEY_PREFIX = 'memory_best_l'

Page({
  data: {
    cards: [],      // { emoji, flipped, matched }
    steps: 0,
    matchedCount: 0,
    best: null,
    won: false,
    flashing: false,
    locked: false,
    // 关卡
    levelIdx: 0,
    level: LEVELS[0],
    unlocked: 1,     // 已解锁到第几关（1-based）
    isLastLevel: false,
    showLevelPicker: false
  },

  onLoad(options) {
    const unlocked = wx.getStorageSync(PROGRESS_KEY) || 1
    let idx = Number(options.level) || 0
    if (idx >= unlocked) idx = 0   // 未解锁的关回落到第 1 关
    // 真实屏宽（px），用于精确计算卡片尺寸
    try { this._winW = wx.getSystemInfoSync().windowWidth } catch (e) { this._winW = 375 }
    this.setData({ unlocked })
    this.applyLevel(idx)
  },

  applyLevel(idx) {
    const level = LEVELS[idx]
    const best = wx.getStorageSync(BEST_KEY_PREFIX + idx)
    // 按 px 精确计算卡宽：屏宽 - 页边距(24rpx×2) - 列间距(gap×(cols-1))，再均分
    const winW = this._winW || 375
    const rpx = winW / 750
    const pagePad = 24 * rpx
    const gapPx = Math.round(14 * rpx)
    const cardW = Math.floor((winW - pagePad * 2 - gapPx * (level.cols - 1)) / level.cols)
    const cardH = Math.round(cardW * 1.2)
    this.setData({
      levelIdx: idx,
      level,
      best: best || null,
      isLastLevel: idx === LEVELS.length - 1,
      showLevelPicker: false,
      cardW, cardH, gapPx,
      backFontPx: Math.round(cardW * 0.34),
      frontFontPx: Math.round(cardW * 0.5)
    })
    this.restart()
  },

  // 从分享/入口带 level 参数进入
  onShow() {},

  restart() {
    const lv = this.data.level
    // 取前 pairs 个 emoji，复制成对后洗牌
    const pool = EMOJI_POOL.slice(0, lv.pairs)
    const deck = pool.concat(pool)
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    this._first = null    // 用 null 显式表示未选（修复 0 号牌 falsy bug）
    if (this._flashTimer) { clearTimeout(this._flashTimer); this._flashTimer = null }
    const cards = deck.map(e => ({ emoji: e, flipped: false, matched: false }))
    this.setData({
      cards,
      steps: 0,
      matchedCount: 0,
      won: false,
      locked: false,
      flashing: false
    })
    // 瞬间记忆关：全部翻开预览 2 秒后盖回
    if (lv.flash) {
      this.setData({ cards: cards.map(c => Object.assign({}, c, { flipped: true })), flashing: true, locked: true })
      this._flashTimer = setTimeout(() => {
        this.setData({
          cards: this.data.cards.map(c => Object.assign({}, c, { flipped: false })),
          flashing: false,
          locked: false
        })
        wx.vibrateShort({ type: 'light' })
      }, 2000)
    }
  },

  tapCard(e) {
    if (this.data.locked || this.data.won) return
    const idx = Number(e.currentTarget.dataset.idx)
    const card = this.data.cards[idx]
    if (card.flipped || card.matched) return

    // 第一张（this._first === null 表示未选）
    if (this._first === null) {
      this._first = idx
      this.flip(idx, true)
      return
    }

    // 第二张
    const first = this._first
    this._first = null
    this.flip(idx, true)
    this.setData({ steps: this.data.steps + 1 })

    const cards = this.data.cards
    if (cards[first].emoji === cards[idx].emoji) {
      // 配对成功：标记 matched（matched 卡保持正面）
      this.setData({
        [`cards[${first}].matched`]: true,
        [`cards[${idx}].matched`]: true,
        matchedCount: this.data.matchedCount + 1
      })
      wx.vibrateShort({ type: 'light' })
      const matched = this.data.matchedCount
      if (matched === this.data.level.pairs) {
        // 通关
        this.setData({ won: true })
        this.saveBest()
        this.unlockNext()
        wx.vibrateShort({ type: 'medium' })
      }
    } else {
      // 不匹配：短暂展示后一起翻回
      this.setData({ locked: true })
      setTimeout(() => {
        this.flip(first, false)
        this.flip(idx, false)
        this.setData({ locked: false })
      }, 650)
    }
  },

  flip(idx, val) {
    this.setData({ ['cards[' + idx + '].flipped']: val })
  },

  saveBest() {
    const s = this.data.steps
    const key = BEST_KEY_PREFIX + this.data.levelIdx
    const best = wx.getStorageSync(key)
    if (!best || s < best) {
      wx.setStorageSync(key, s)
      this.setData({ best: s })
    }
  },

  unlockNext() {
    const next = this.data.levelIdx + 2   // 解锁到下一关（1-based）
    if (next > this.data.unlocked && next <= LEVELS.length) {
      wx.setStorageSync(PROGRESS_KEY, next)
      this.setData({ unlocked: next })
    }
  },

  // 弹层：下一关
  nextLevel() {
    if (this.data.levelIdx < LEVELS.length - 1) {
      this.applyLevel(this.data.levelIdx + 1)
    }
  },

  switchLevel(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    if (idx >= this.data.unlocked) {
      wx.showToast({ title: '先通过前面的关卡解锁', icon: 'none' })
      return
    }
    this.applyLevel(idx)
  },

  togglePicker() {
    this.setData({ showLevelPicker: !this.data.showLevelPicker })
  },

  onUnload() {
    if (this._flashTimer) clearTimeout(this._flashTimer)
  },

  goHome() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) })
  }
})
