// 打砖块 Breakout：全屏 canvas 直绘，挡板跟随触摸、小球反弹、砖块阵列、生命/关卡
const BEST_KEY = 'breakout_best'
const ROWS = 5
const COLS = 8
const BRICK_H = 22
const GAP = 6
const MARGIN = 16
const PADDLE_W = 96
const PADDLE_H = 14
const BALL_R = 8
const BRICK_COLORS = ['#E36A6A', '#F2994A', '#F2CE6B', '#4CB89A', '#56CCF2']

Page({
  data: { screen: 'title', score: 0, best: 0 },

  onLoad() {
    this._alive = true
    this._winW = wx.getSystemInfoSync().windowWidth
    this._winH = wx.getSystemInfoSync().windowHeight
    this.setData({ best: wx.getStorageSync(BEST_KEY) || 0 })
  },

  onReady() { this.initCanvas() },

  initCanvas() {
    const q = wx.createSelectorQuery()
    q.select('#stage').fields({ node: true, size: true }).exec(res => {
      const canvas = res[0].node
      const dpr = wx.getSystemInfoSync().pixelRatio || 2
      canvas.width = this._winW * dpr
      canvas.height = this._winH * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      this._canvas = canvas
      this._ctx = ctx
      this.startLoop()
    })
  },

  // ---------- 循环（_alive 守卫，避免页面销毁后继续 setData） ----------
  startLoop() {
    if (this._rafId) return
    const loop = (t) => {
      if (!this._alive) { this._rafId = null; return }
      this._rafId = this._canvas.requestAnimationFrame(loop)
      const dt = this._lastT ? Math.min(0.033, (t - this._lastT) / 1000) : 0.016
      this._lastT = t
      if (this._game && this.data.screen === 'playing') this.update(dt)
      this.render()
    }
    this._rafId = this._canvas.requestAnimationFrame(loop)
  },

  newGame() {
    this._game = {
      bricks: this.makeBricks(1),
      paddle: { x: this._winW / 2 - PADDLE_W / 2, y: this._winH - 56, w: PADDLE_W, h: PADDLE_H },
      ball: { x: this._winW / 2, y: this._winH - 80, vx: 0, vy: 0, r: BALL_R },
      score: 0,
      lives: 3,
      level: 1,
      speed: 240
    }
    this.resetBall(true)
    this.setData({ screen: 'playing', score: 0 })
  },

  makeBricks(level) {
    const W = this._winW
    const totalW = W - MARGIN * 2 - GAP * (COLS - 1)
    const bw = totalW / COLS
    const bricks = []
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        bricks.push({
          x: MARGIN + c * (bw + GAP),
          y: 110 + r * (BRICK_H + GAP),
          w: bw,
          h: BRICK_H,
          alive: true,
          color: BRICK_COLORS[r % BRICK_COLORS.length]
        })
      }
    }
    return bricks
  },

  resetBall(initial) {
    const g = this._game
    const p = g.paddle
    g.ball.x = p.x + p.w / 2
    g.ball.y = p.y - BALL_R - 2
    const sp = g.speed
    const ang = (Math.random() * 0.5 - 0.25) * Math.PI   // 略带角度向上
    g.ball.vx = Math.sin(ang) * sp
    g.ball.vy = -Math.cos(ang) * sp
  },

  nextLevel() {
    const g = this._game
    g.level++
    g.speed += 24
    g.lives++   // 过关奖励 1 命
    g.bricks = this.makeBricks(g.level)
    this.resetBall(true)
    wx.showToast({ title: '第 ' + g.level + ' 关', icon: 'none' })
  },

  onGameOver() {
    const best = Math.max(this._game.score, this.data.best)
    if (best > this.data.best) wx.setStorageSync(BEST_KEY, best)
    this.setData({ screen: 'gameover', best })
  },

  update(dt) {
    const g = this._game, W = this._winW, H = this._winH, r = g.ball.r
    const b = g.ball, p = g.paddle
    b.x += b.vx * dt
    b.y += b.vy * dt
    // 墙
    if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) }
    if (b.x > W - r) { b.x = W - r; b.vx = -Math.abs(b.vx) }
    if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy) }
    // 挡板
    if (b.vy > 0 && b.y + r >= p.y && b.y - r <= p.y + p.h && b.x >= p.x - r && b.x <= p.x + p.w + r) {
      b.y = p.y - r
      const hit = (b.x - (p.x + p.w / 2)) / (p.w / 2)   // -1..1
      const sp = g.speed
      b.vx = hit * sp * 0.8
      b.vy = -Math.sqrt(Math.max(1, sp * sp - b.vx * b.vx))
    }
    // 砖块
    for (const br of g.bricks) {
      if (!br.alive) continue
      if (b.x + r > br.x && b.x - r < br.x + br.w && b.y + r > br.y && b.y - r < br.y + br.h) {
        br.alive = false
        g.score += 10 * g.level
        const ox = Math.min(b.x + r - br.x, br.x + br.w - (b.x - r))
        const oy = Math.min(b.y + r - br.y, br.y + br.h - (b.y - r))
        if (ox < oy) b.vx = -b.vx; else b.vy = -b.vy
        break
      }
    }
    this.setData({ score: g.score })
    // 落底
    if (b.y - r > H) {
      g.lives--
      if (g.lives <= 0) { this.onGameOver(); return }
      this.resetBall(true)
      return
    }
    // 过关
    if (g.bricks.every(br => !br.alive)) this.nextLevel()
  },

  render() {
    const ctx = this._ctx, W = this._winW, H = this._winH
    ctx.fillStyle = '#0A0A14'
    ctx.fillRect(0, 0, W, H)
    const scr = this.data.screen
    if (scr === 'playing' || scr === 'gameover') {
      const g = this._game
      // 砖块
      for (const br of g.bricks) {
        if (!br.alive) continue
        ctx.fillStyle = br.color
        ctx.fillRect(br.x, br.y, br.w, br.h)
      }
      // 挡板
      ctx.fillStyle = '#6A5AE0'
      ctx.fillRect(g.paddle.x, g.paddle.y, g.paddle.w, g.paddle.h)
      // 球
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      ctx.arc(g.ball.x, g.ball.y, g.ball.r, 0, Math.PI * 2)
      ctx.fill()
      // HUD
      ctx.fillStyle = '#E8E7F0'
      ctx.font = 'bold 20px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('分数 ' + g.score, 16, 36)
      ctx.textAlign = 'right'
      ctx.fillText('♥×' + g.lives + '  L' + g.level, W - 16, 36)
    }
    if (scr === 'title') {
      ctx.textAlign = 'center'
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 46px sans-serif'
      ctx.fillText('打 砖 块', W / 2, H * 0.4)
      ctx.fillStyle = '#8B9BD4'
      ctx.font = '18px sans-serif'
      ctx.fillText('拖动屏幕移动挡板 · 点击开始', W / 2, H * 0.4 + 44)
      ctx.fillText('最高分 ' + this.data.best, W / 2, H * 0.4 + 76)
    } else if (scr === 'gameover') {
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(10,10,20,0.7)'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#FF6B6B'
      ctx.font = 'bold 42px sans-serif'
      ctx.fillText('游 戏 结 束', W / 2, H * 0.4)
      ctx.fillStyle = '#E8E7F0'
      ctx.font = '24px monospace'
      ctx.fillText('得分 ' + this._game.score, W / 2, H * 0.4 + 48)
      ctx.fillStyle = '#8B9BD4'
      ctx.font = '18px sans-serif'
      ctx.fillText('点击重来', W / 2, H * 0.4 + 84)
    }
  },

  // ---------- 触摸 ----------
  onTouchStart() {
    if (this.data.screen === 'title') this.newGame()
    else if (this.data.screen === 'gameover') this.newGame()
  },
  onTouchMove(e) {
    if (this.data.screen !== 'playing' || !this._game) return
    const x = e.touches[0].x
    const p = this._game.paddle
    p.x = Math.max(0, Math.min(this._winW - p.w, x - p.w / 2))
  },
  onTouchEnd() {},

  onHide() { this._alive = false; this.cancelRaf() },
  onShow() {
    this._alive = true
    if (this._canvas && !this._rafId) this.startLoop()
  },
  onUnload() {
    this._alive = false
    this.cancelRaf()
  },
  cancelRaf() {
    if (this._canvas && this._rafId) { this._canvas.cancelAnimationFrame(this._rafId); this._rafId = null }
  }
})
