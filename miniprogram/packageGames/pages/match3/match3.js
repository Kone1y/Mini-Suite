// 消消乐 Match-3 · canvas 渲染版（根治 WXML/CSS 过渡在开发者工具/真机上的闪白）
// 逻辑沿用原算法：相邻交换 → 三连检测 → 消除 → 重力下落 → 连锁；全部动画画进 canvas
const BEST_KEY = 'match3_best'
const ROWS = 8
const COLORS = ['#E36A6A', '#F2994A', '#F2CE6B', '#4CB89A', '#56CCF2', '#9B6BD9']

Page({
  data: {
    score: 0,
    best: 0,
    moves: 0
  },

  onLoad() {
    this._id = 1
    this._sel = null            // {r,c}
    this._anim = null           // 当前补间 {type:'swap'|'die'|'fall', ...}
    this._alive = true
    this.setData({ best: wx.getStorageSync(BEST_KEY) || 0 })
    this.initCanvas().then(() => {
      this.genBoard()
      this.startLoop()
    })
  },

  // ---------- canvas 初始化（尺寸按屏宽算，dpr 适配） ----------
  initCanvas() {
    return new Promise((resolve) => {
      const q = wx.createSelectorQuery()
      q.select('#stage').fields({ node: true, size: true }).exec((res) => {
        const { node, width, height } = res[0]
        const canvas = node
        const info = wx.getSystemInfoSync()
        const dpr = info.pixelRatio || 2
        canvas.width = width * dpr
        canvas.height = height * dpr
        const ctx = canvas.getContext('2d')
        ctx.scale(dpr, dpr)
        this._canvas = canvas
        this._ctx = ctx
        this._cw = width          // css px
        this._ch = height
        this._pad = 8             // 棋盘内边距 px
        this._cell = Math.min(
          (width - this._pad * 2) / ROWS,
          (height - this._pad * 2) / ROWS
        )
        this._bx = (width - this._cell * ROWS) / 2    // 棋盘左上 x
        this._by = (height - this._cell * ROWS) / 2
        resolve()
      })
    })
  },

  startLoop() {
    if (this._rafId) return
    const loop = () => {
      if (!this._alive) { this._rafId = null; return }
      this.step()
      this.render()
      this._rafId = this._canvas.requestAnimationFrame(loop)
    }
    this._rafId = this._canvas.requestAnimationFrame(loop)
  },

  onShow() {
    this._alive = true
    if (this._canvas && !this._rafId) this.startLoop()
  },
  onHide() { this.teardown() },
  onUnload() { this.teardown() },
  teardown() {
    this._alive = false
    if (this._rafId && this._canvas) {
      this._canvas.cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
  },

  // ---------- 棋盘数据 ----------
  grid: null,   // grid[r][c] = {color} | null

  genBoard() {
    const N = ROWS, pal = COLORS.length
    const grid = []
    for (let r = 0; r < N; r++) {
      grid[r] = []
      for (let c = 0; c < N; c++) {
        let color
        do {
          color = Math.floor(Math.random() * pal)
        } while (this.makesMatch(grid, r, c, color))
        grid[r][c] = { color }
      }
    }
    this.grid = grid
    this._fall = null
    this._die = null
    this._anim = null
    this.setData({ score: 0, moves: 0 })
  },

  makesMatch(grid, r, c, color) {
    const a = c >= 2 ? grid[r][c - 1] : null, b = c >= 2 ? grid[r][c - 2] : null
    if (a && b && a.color === color && b.color === color) return true
    const u = r >= 2 ? grid[r - 1][c] : null, v = r >= 2 ? grid[r - 2][c] : null
    if (u && v && u.color === color && v.color === color) return true
    return false
  },

  // ---------- 触摸（点选两格交换） ----------
  onTouchStart(e) {
    if (this._busy || this._die || this._fall) return
    const t = e.touches[0]
    const c = Math.floor((t.x - this._bx) / this._cell)
    const r = Math.floor((t.y - this._by) / this._cell)
    if (r < 0 || r >= ROWS || c < 0 || c >= ROWS) { this._sel = null; return }
    if (!this._sel) { this._sel = { r, c }; return }
    if (this._sel.r === r && this._sel.c === c) { this._sel = null; return }
    const dr = Math.abs(this._sel.r - r), dc = Math.abs(this._sel.c - c)
    if (dr + dc !== 1) { this._sel = { r, c }; return }   // 非相邻：切换选中
    const a = this._sel
    this._sel = null
    this.trySwap(a, { r, c })
  },

  // ---------- 交换 → 匹配 → 消除 → 下落 → 连锁 ----------
  trySwap(a, b) {
    const g = this.grid
    const tmp = g[a.r][a.c]
    g[a.r][a.c] = g[b.r][b.c]
    g[b.r][b.c] = tmp
    this._busy = true
    // 交换动画（两格互换位置，200ms）
    this._anim = { type: 'swap', t: 0, dur: 200, a, b }
  },

  onSwapDone(a, b, isRevert) {
    if (isRevert) {
      // 回退动画播完：棋盘已在正位，只复位状态（否则会无限来回交换）
      this._anim = null
      this._busy = false
      return
    }
    const m = this.findMatches()
    if (m.size === 0) {
      // 无匹配：换回（反向动画）
      const g = this.grid
      const tmp = g[a.r][a.c]
      g[a.r][a.c] = g[b.r][b.c]
      g[b.r][b.c] = tmp
      this._anim = { type: 'swap', t: 0, dur: 200, a: b, b: a, revert: true }
    } else {
      this._anim = null
      this.setData({ moves: this.data.moves + 1 })
      this.startClear(m, 1)
    }
  },

  findMatches() {
    const N = ROWS, g = this.grid
    const matched = new Set()
    for (let r = 0; r < N; r++) {
      let run = 1
      for (let c = 1; c <= N; c++) {
        const prev = g[r][c - 1], cur = c < N ? g[r][c] : null
        if (cur && prev && cur.color === prev.color) run++
        else {
          if (run >= 3) for (let k = c - run; k < c; k++) matched.add(r + ',' + k)
          run = 1
        }
      }
    }
    for (let c = 0; c < N; c++) {
      let run = 1
      for (let r = 1; r <= N; r++) {
        const prev = g[r - 1][c], cur = r < N ? g[r][c] : null
        if (cur && prev && cur.color === prev.color) run++
        else {
          if (run >= 3) for (let k = r - run; k < r; k++) matched.add(k + ',' + c)
          run = 1
        }
      }
    }
    return matched
  },

  // 消除动画：matched = Set('r,c')；D 是 die 状态快照（step 先清 _die 再回调，防读 null）
  startClear(matched, level) {
    this._die = { t: 0, dur: 240, matched, level }
  },

  onDieDone(D) {
    const { matched, level } = D || this._die || {}
    if (!matched) return
    const gain = matched.size * 10 * level
    const score = this.data.score + gain
    const best = Math.max(score, this.data.best)
    if (best > this.data.best) wx.setStorageSync(BEST_KEY, best)
    this.setData({ score, best })    // 清格 + 计算下落
    const g = this.grid
    for (const key of matched) {
      const [r, c] = key.split(',').map(Number)
      g[r][c] = null
    }
    const falls = []   // [{r0,c,r1,color}] 起止行
    for (let c = 0; c < ROWS; c++) {
      let write = ROWS - 1
      for (let r = ROWS - 1; r >= 0; r--) {
        if (g[r][c]) {
          if (write !== r) {
            falls.push({ r0: r, r1: write, c, color: g[r][c].color, isNew: false })
            g[write][c] = g[r][c]
            g[r][c] = null
          }
          write--
        }
      }
      // 新块从顶部生成
      let spawn = 0
      for (let r = write; r >= 0; r--) {
        const color = Math.floor(Math.random() * COLORS.length)
        falls.push({ r0: -1 - (write - r), r1: r, c, color, isNew: true })
        g[r][c] = { color }
        spawn++
      }
    }
    this._fall = { t: 0, dur: 220, falls, level }
  },

  onFallDone() {
    const m = this.findMatches()
    if (m.size) {
      // 连锁等级随 _fall 传递（此时 _die 已清空，不能回头读）
      const nextLevel = (this._fall && this._fall.level ? this._fall.level : 1) + 1
      this._fall = null
      this.startClear(m, nextLevel)
    } else {
      this._die = null
      this._fall = null
      this._busy = false
    }
  },

  // ---------- 帧推进 ----------
  step() {
    const now = Date.now()
    if (this._anim && this._anim.type === 'swap') {
      const A = this._anim
      if (!A.start) A.start = now
      A.t = now - A.start
      if (A.t >= A.dur) {
        this._anim = null
        this.onSwapDone(A.a, A.b, A.revert)
      }
      return
    }
    if (this._die) {
      const D = this._die
      if (!D.start) D.start = now
      D.t = now - D.start
      if (D.t >= D.dur) {
        this._die = null
        this.onDieDone(D)   // 把快照传入，回调内不读 this._die（已为 null）
      }
      return
    }
    if (this._fall) {
      const F = this._fall
      if (!F.start) F.start = now
      F.t = now - F.start
      if (F.t >= F.dur) {
        this.onFallDone()
      }
    }
  },

  // ---------- 绘制 ----------
  render() {
    const ctx = this._ctx
    if (!ctx) return
    const W = this._cw, H = this._ch
    ctx.clearRect(0, 0, W, H)
    // 棋盘底
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    this.roundRect(ctx, this._bx - 4, this._by - 4, this._cell * ROWS + 8, this._cell * ROWS + 8, 10)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.stroke()

    const cell = this._cell
    const cx = (c) => this._bx + c * cell + cell / 2
    const cy = (r) => this._by + r * cell + cell / 2

    // 下落动画中的棋盘：静态块（未参与下落的）+ 运动块
    if (this._fall) {
      const F = this._fall
      const k = Math.min(1, F.t / F.dur)
      const ke = 1 - Math.pow(1 - k, 2)   // ease-out
      const moving = {}
      for (const f of F.falls) moving[f.r1 + ',' + f.c] = f
      // 静态块
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < ROWS; c++) {
          if (!moving[r + ',' + c] && this.grid[r][c]) this.drawTile(ctx, cx(c), cy(r), this.grid[r][c].color, 1)
        }
      }
      // 运动块
      for (const f of F.falls) {
        const r = f.r0 + (f.r1 - f.r0) * ke
        this.drawTile(ctx, cx(f.c), cy(r), f.color, 1)
      }
      this.drawHud()
      return
    }

    // 消除动画：缩小+发亮
    if (this._die) {
      const D = this._die
      const k = Math.min(1, D.t / D.dur)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < ROWS; c++) {
          if (!this.grid[r][c]) continue
          if (D.matched.has(r + ',' + c)) {
            this.drawTile(ctx, cx(c), cy(r), this.grid[r][c].color, 1 - k, 0.6 + 0.4 * (1 - k))
          } else {
            this.drawTile(ctx, cx(c), cy(r), this.grid[r][c].color, 1)
          }
        }
      }
      this.drawHud()
      return
    }

    // 交换动画
    if (this._anim && this._anim.type === 'swap') {
      const A = this._anim
      const k = Math.min(1, A.t / A.dur)
      const g = this.grid
      // 参与交换的两格从原位滑到对方（a 显示在 b 处）
      const ax0 = cx(A.a.c), ay0 = cy(A.a.r), bx0 = cx(A.b.c), by0 = cy(A.b.r)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < ROWS; c++) {
          if (r === A.a.r && c === A.a.c) continue
          if (r === A.b.r && c === A.b.c) continue
          if (g[r][c]) this.drawTile(ctx, cx(c), cy(r), g[r][c].color, 1)
        }
      }
      // 交换时数据已互换：a 位置的块滑向 b
      const aColor = g[A.a.r][A.a.c] ? g[A.a.r][A.a.c].color : 0
      const bColor = g[A.b.r][A.b.c] ? g[A.b.r][A.b.c].color : 0
      const ax = ax0 + (bx0 - ax0) * k, ay = ay0 + (by0 - ay0) * k
      const bx = bx0 + (ax0 - bx0) * k, by = by0 + (ay0 - by0) * k
      this.drawTile(ctx, ax, ay, aColor, 1)
      this.drawTile(ctx, bx, by, bColor, 1)
      this.drawHud()
      return
    }

    // 静态棋盘
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < ROWS; c++) {
        if (!this.grid[r][c]) continue
        const sel = this._sel && this._sel.r === r && this._sel.c === c
        this.drawTile(ctx, cx(c), cy(r), this.grid[r][c].color, 1, sel ? 1.06 : 1, sel)
      }
    }
    this.drawHud()
  },

  drawTile(ctx, x, y, colorIdx, alpha, scale, selected) {
    const cell = this._cell
    const s = (scale || 1) * (cell - 6)
    ctx.save()
    ctx.globalAlpha = alpha
    // 底色
    ctx.fillStyle = COLORS[colorIdx] || '#888'
    this.roundRect(ctx, x - s / 2, y - s / 2, s, s, s * 0.16)
    ctx.fill()
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    this.roundRect(ctx, x - s / 2 + s * 0.08, y - s / 2 + s * 0.08, s * 0.84, s * 0.3, s * 0.12)
    ctx.fill()
    if (selected) {
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 3
      this.roundRect(ctx, x - s / 2 - 2, y - s / 2 - 2, s + 4, s + 4, s * 0.16 + 2)
      ctx.stroke()
    }
    ctx.restore()
  },

  drawHud() {
    // 分数等已在 WXML 顶部栏，canvas 无需重复（保留给后续可能的连击提示）
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  },

  restart() {
    this._sel = null
    this._busy = false
    this._anim = null
    this._die = null
    this._fall = null
    this.genBoard()
    wx.showToast({ title: '已重开', icon: 'none' })
  }
})
