// 关卡定义：3 关递进 + 第 4 关瞬间记忆（开局预览 2 秒）
const LEVELS = [
  { pairs: 8,  cols: 4, label: '第 1 关 · 8 对' },
  { pairs: 10, cols: 5, label: '第 2 关 · 10 对' },
  { pairs: 12, cols: 6, label: '第 3 关 · 12 对' },
  { pairs: 8,  cols: 4, label: '第 4 关 · 瞬间记忆', flash: true }
]

// 计时挑战模式：限时配对，连击加分
const TIME_MODE = {
  base: 60,            // 基础倒计时（秒），按 pairs 缩放
  perPair: 4,          // 每对额外秒数
  matchScore: 10,      // 每对基础分
  comboBonus: 5        // 连击每层额外分（combo n → +10+5n）
}

const EMOJI_POOL = ['🍎', '🍇', '🍑', '🍒', '🥑', '🍋', '🥕', '🍉', '🍍', '🥝', '🍓', '🍌']
const PROGRESS_KEY = 'memory_progress'   // 已解锁关卡
const BEST_KEY_PREFIX = 'memory_best_l'
const TIME_BEST_KEY = 'memory_time_best' // 计时挑战最佳分
const TIME_MODE_KEY = 'memory_time_mode' // 上次模式选择

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
    showLevelPicker: false,
    // 计时挑战
    timed: false,    // 当前是否计时模式
    timeLeft: 0,     // 剩余秒
    timeScore: 0,    // 计时模式得分
    combo: 0,        // 当前连击（连续配对成功）
    maxCombo: 0,
    timeBest: 0,     // 计时模式最佳分
    timeUp: false    // 时间到结算
  },

  onLoad(options) {
    const unlocked = wx.getStorageSync(PROGRESS_KEY) || 1
    let idx = Number(options.level) || 0
    if (idx >= unlocked) idx = 0   // 未解锁的关回落到第 1 关
    // 真实屏宽（px），用于精确计算卡片尺寸
    try { this._winW = wx.getSystemInfoSync().windowWidth } catch (e) { this._winW = 375 }
    this.setData({
      unlocked,
      timed: wx.getStorageSync(TIME_MODE_KEY) === true,
      timeBest: wx.getStorageSync(TIME_BEST_KEY) || 0
    })
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

  // ================= 模式切换 =================
  toggleTimed() {
    const timed = !this.data.timed
    wx.setStorageSync(TIME_MODE_KEY, timed)
    this.setData({ timed })
    this.restart()
  },

  timeLimitOf(pairs) {
    return TIME_MODE.base + pairs * TIME_MODE.perPair
  },

  startTimer() {
    this.stopTimer()
    this._timer = setInterval(() => {
      if (this.data.won || this.data.timeUp) { this.stopTimer(); return }
      const t = this.data.timeLeft - 1
      if (t <= 0) {
        this.setData({ timeLeft: 0 })
        this.stopTimer()
        this.onTimeUp()
      } else {
        this.setData({ timeLeft: t })
      }
    }, 1000)
  },

  stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  onTimeUp() {
    // 时间到：结算（未完成的局直接结束，不翻完）
    this.stopTimer()
    this.setData({ timeUp: true, locked: true })
    this.saveTimeBest()
    wx.vibrateShort({ type: 'medium' })
  },

  saveTimeBest() {
    const s = this.data.timeScore
    if (s > 0 && s > (wx.getStorageSync(TIME_BEST_KEY) || 0)) {
      wx.setStorageSync(TIME_BEST_KEY, s)
      this.setData({ timeBest: s })
    }
  },

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
    this.stopTimer()
    const cards = deck.map(e => ({ emoji: e, flipped: false, matched: false }))
    this.setData({
      cards,
      steps: 0,
      matchedCount: 0,
      won: false,
      locked: false,
      flashing: false,
      combo: 0,
      maxCombo: 0,
      timeUp: false,
      timeScore: 0,
      timeLeft: this.data.timed ? this.timeLimitOf(lv.pairs) : 0
    })
    // 瞬间记忆关：全部翻开预览 2 秒后盖回（计时模式预览结束才起表，公平）
    if (lv.flash) {
      this.setData({ cards: cards.map(c => Object.assign({}, c, { flipped: true })), flashing: true, locked: true })
      this._flashTimer = setTimeout(() => {
        this.setData({
          cards: this.data.cards.map(c => Object.assign({}, c, { flipped: false })),
          flashing: false,
          locked: false
        })
        wx.vibrateShort({ type: 'light' })
        if (this.data.timed && !this.data.won) this.startTimer()
      }, 2000)
    }
    // 计时模式起表（flash 关预览完才开始更公平——flash 关在预览结束时起表）
    if (this.data.timed && !lv.flash) this.startTimer()
  },

  tapCard(e) {
    if (this.data.locked || this.data.won || this.data.timeUp) return
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
      const combo = this.data.combo + 1
      const gained = TIME_MODE.matchScore + TIME_MODE.comboBonus * (combo - 1)
      const patch = {
        [`cards[${first}].matched`]: true,
        [`cards[${idx}].matched`]: true,
        matchedCount: this.data.matchedCount + 1,
        combo,
        maxCombo: Math.max(this.data.maxCombo, combo)
      }
      if (this.data.timed) patch.timeScore = this.data.timeScore + gained
      this.setData(patch)
      wx.vibrateShort({ type: 'light' })
      const matched = this.data.matchedCount
      if (matched === this.data.level.pairs) {
        // 通关
        this.stopTimer()
        this.setData({ won: true })
        // 计时模式：剩余时间奖励（每秒 ×2 分）
        if (this.data.timed) {
          const bonus = this.data.timeLeft * 2
          this.setData({ timeScore: this.data.timeScore + bonus })
          this.saveTimeBest()
        } else {
          this.saveBest()
        }
        this.unlockNext()
        wx.vibrateShort({ type: 'medium' })
      }
    } else {
      // 不匹配：短暂展示后一起翻回；连击断
      this.setData({ locked: true, combo: 0 })
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
    this.stopTimer()
  },

  goHome() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) })
  }
})
