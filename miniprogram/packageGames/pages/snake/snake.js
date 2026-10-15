const L = require('../../snake-logic')

const BEST_KEY = 'snake_best_score'
const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 }
}
const TICK_MS = 320   // 移动间隔，吃到食物逐渐加速

Page({
  data: {
    size: L.SIZE,
    grid: [],        // 渲染：size*size 个 { t }  t: 0空 1蛇身 2蛇头 3食物
    score: 0,
    best: 0,
    running: false,
    over: false,
    speedLabel: '正常'
  },

  onLoad() {
    this.setData({ best: wx.getStorageSync(BEST_KEY) || 0 })
    this.reset()
  },

  reset() {
    this.stopLoop()
    this._snake = L.initSnake()
    this._food = L.randomFood(this._snake)
    this._dir = DIRS.right
    this._nextDir = DIRS.right
    this.setData({
      score: 0,
      running: false,
      over: false,
      speedLabel: '正常',
      grid: this.buildGrid()
    })
  },

  // 渲染标记：t=0空 4头 9食物；蛇身为 1（带 per-cell 连接感知圆角 r）
  // r: "左上 右上 右下 左下"——只在与相邻节不相连的角保留圆角，形成连贯蛇身
  buildGrid() {
    const n = L.SIZE
    const marks = new Array(n * n)
    const s = this._snake
    const idxOf = p => p[0] * n + p[1]

    // 计算每节的连接方向（与前一节/后一节）
    const conn = s.map((p, i) => {
      const up = false
      let u = false, d = false, l = false, r = false
      const link = (a, b) => {
        if (!b) return
        if (b[0] === a[0] - 1) u = true
        else if (b[0] === a[0] + 1) d = true
        else if (b[1] === a[1] - 1) l = true
        else if (b[1] === a[1] + 1) r = true
      }
      link(p, s[i - 1]); link(p, s[i + 1])
      return { u, d, l, r }
    })

    const R = 9   // 圆角 rpx
    for (let i = 0; i < n * n; i++) marks[i] = { t: 0, r: '' }
    s.forEach((p, i) => {
      const c = conn[i]
      const tl = (!c.u && !c.l) ? R + 'rpx' : '0'
      const tr = (!c.u && !c.r) ? R + 'rpx' : '0'
      const br = (!c.d && !c.r) ? R + 'rpx' : '0'
      const bl = (!c.d && !c.l) ? R + 'rpx' : '0'
      marks[idxOf(p)] = { t: i === 0 ? 4 : 1, r: `${tl} ${tr} ${br} ${bl}` }
    })
    if (this._food) marks[idxOf(this._food)] = { t: 9, r: '' }
    return marks
  },

  start() {
    if (this.data.running) return
    if (this.data.over) { this.reset(); return }
    this.setData({ running: true })
    this._tick = TICK_MS
    this.loop()
  },

  loop() {
    this.stopLoop()
    this._timer = setTimeout(() => {
      this.oneStep()
      if (this.data.running) this.loop()
    }, this._tick)
  },

  stopLoop() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
  },

  oneStep() {
    if (!L.isOpposite(this._nextDir, this._dir)) this._dir = this._nextDir
    const { snake, food, ate, dead } = L.step(this._snake, this._food, this._dir)
    if (dead) {
      this.stopLoop()
      this.setData({ running: false, over: true })
      wx.vibrateShort({ type: 'heavy' })
      return
    }
    this._snake = snake
    this._food = food
    if (ate) {
      const score = this.data.score + 1
      const best = Math.max(score, this.data.best)
      if (best > this.data.best) wx.setStorageSync(BEST_KEY, best)
      this._tick = Math.max(160, TICK_MS - score * 6)
      const speedLabel = this._tick < 200 ? '飞快' : this._tick < 260 ? '较快' : '正常'
      this.setData({ score, best, speedLabel })
      this.maybeMilestone(score)
    }
    this.setData({ grid: this.buildGrid() })
  },

  pause() {
    if (!this.data.running) return
    this.stopLoop()
    this.setData({ running: false })
  },

  // 点击棋盘：未开始→开始；暂停→继续
  boardTap() {
    if (this.data.over) return
    if (!this.data.running) this.start()
  },

  // 吃到食物的里程碑提示
  maybeMilestone(score) {
    const milestones = [5, 10, 15, 20, 30, 50]
    if (milestones.includes(score)) {
      wx.showToast({ title: '🎉 ' + score + ' 分！', icon: 'none', duration: 900 })
      wx.vibrateShort({ type: 'light' })
    }
  },

  onTouchStart(e) {
    const t = e.touches[0]
    this._sx = t.clientX
    this._sy = t.clientY
  },
  onTouchEnd(e) {
    const t = e.changedTouches[0]
    const dx = t.clientX - this._sx, dy = t.clientY - this._sy
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return
    let dir
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left'
    else dir = dy > 0 ? 'down' : 'up'
    this.setDir(dir)
  },

  onDir(e) {
    this.setDir(e.currentTarget.dataset.dir)
  },

  setDir(name) {
    const d = DIRS[name]
    if (!d) return
    if (!L.isOpposite(d, this._dir)) this._nextDir = d
  },

  goHome() {
    this.stopLoop()
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) })
  },

  onUnload() { this.stopLoop() },
  onHide() { this.pause() }
})
