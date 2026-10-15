// 打地鼠页面：30 秒限时反应街机
const BEST_KEY = 'whack_best'
const DURATION = 30          // 秒
const HOLES = 9              // 3×3

Page({
  data: {
    holes: Array.from({ length: HOLES }, (_, i) => ({ idx: i, mole: false, bonked: false })),
    running: false,
    timeLeft: DURATION,
    score: 0,
    combo: 0,
    bestCombo: 0,
    best: 0,
    over: false,
    timeBarPct: 100
  },

  onLoad() {
    this.setData({ best: wx.getStorageSync(BEST_KEY) || 0 })
  },

  onUnload() { this.cleanup() },
  onHide() { this.cleanup() },

  start() {
    this.cleanup()
    this._spawnTimer = null
    this._moleTimer = null
    this.setData({ running: true, over: false, score: 0, combo: 0, bestCombo: 0, timeLeft: DURATION, timeBarPct: 100, holes: this.freshHoles() })
    // 倒计时
    this._tick = setInterval(() => {
      const t = this.data.timeLeft - 1
      this.setData({ timeLeft: t, timeBarPct: Math.round(t / DURATION * 100) })
      if (t <= 0) this.finish()
    }, 1000)
    this.spawnLoop()
  },

  freshHoles() {
    return Array.from({ length: HOLES }, (_, i) => ({ idx: i, mole: false, bonked: false }))
  },

  spawnLoop() {
    if (!this.data.running) return
    // 间隔随分数加快：1200ms → 450ms
    const gap = Math.max(450, 1200 - this.data.score * 18)
    this._spawnTimer = setTimeout(() => {
      this.spawnMole()
      this.spawnLoop()
    }, gap)
  },

  spawnMole() {
    if (!this.data.running) return
    // 清掉已被打但还在显示 bonked 的洞
    const holes = this.data.holes.map(h => ({ ...h, bonked: false }))
    // 随机选一个没地鼠的洞
    const empty = holes.filter(h => !h.mole)
    if (!empty.length) return
    const pick = empty[Math.floor(Math.random() * empty.length)]
    holes[pick.idx].mole = true
    this.setData({ holes })
    // 地鼠停留时间随分数缩短：1100ms → 550ms
    const stay = Math.max(550, 1100 - this.data.score * 12)
    this._moleTimer = setTimeout(() => {
      // 超时未打：缩回，连击清零
      const holes2 = this.data.holes
      if (holes2[pick.idx].mole) {
        holes2[pick.idx].mole = false
        this.setData({ holes: holes2.map(h => ({ ...h })), combo: 0 })
      }
    }, stay)
  },

  whack(e) {
    if (!this.data.running) return
    const idx = e.currentTarget.dataset.idx
    const hole = this.data.holes[idx]
    if (!hole.mole || hole.bonked) return
    // 命中：连击 +1，得分 = 1 + 连击加成（每 3 连 +1）
    const combo = this.data.combo + 1
    const gain = 1 + Math.floor(combo / 3)
    const score = this.data.score + gain
    const holes = this.data.holes.map((h, i) => i === idx ? { ...h, bonked: true, mole: false } : { ...h })
    wx.vibrateShort({ type: 'light' })
    this.setData({
      holes,
      score,
      combo,
      bestCombo: Math.max(this.data.bestCombo, combo)
    })
    // bonked 动画 250ms 后清除
    setTimeout(() => {
      const holes2 = this.data.holes
      if (holes2[idx].bonked) {
        holes2[idx].bonked = false
        this.setData({ holes: holes2.map(h => ({ ...h })) })
      }
    }, 250)
  },

  finish() {
    this.cleanup()
    const best = Math.max(this.data.score, this.data.best)
    if (best > this.data.best) wx.setStorageSync(BEST_KEY, best)
    this.setData({ running: false, over: true, best, holes: this.freshHoles() })
  },

  cleanup() {
    if (this._tick) { clearInterval(this._tick); this._tick = null }
    if (this._spawnTimer) { clearTimeout(this._spawnTimer); this._spawnTimer = null }
    if (this._moleTimer) { clearTimeout(this._moleTimer); this._moleTimer = null }
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
