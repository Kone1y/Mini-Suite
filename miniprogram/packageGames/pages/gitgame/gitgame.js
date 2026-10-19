// Git 修炼场
const L = require('../../git-logic')
const { LEVELS } = require('../../git-levels')

const STORE_PROGRESS = 'gitgame_progress_v1'   // {passed:{id:true}, bestCmds:{id:n}}
const LANE_COLORS = ['#5B8DEF', '#4C9E64', '#D9A62E', '#C0564B', '#9A5BC4', '#3FB5A5', '#E07850']

Page({
  data: {
    screen: 'select',       // select | play
    levels: [],             // 关卡列表（带通过状态）
    cur: null,              // 当前关（LEVELS 条目）
    cmdInput: '',
    outputs: [],            // 命令输出 [{cmd, out, ok}]
    cmdCount: 0,
    status: '',
    won: false,
    quickCmds: [],          // 快捷命令 chips
    goalOpen: false,
    boardPx: 0,
    boardPy: 0
  },

  _repo: null,
  _canvas: null,
  _ctx: null,
  _raf: null,
  _blink: 0,

  onLoad() {
    try {
      this._progress = JSON.parse(wx.getStorageSync(STORE_PROGRESS) || '{}')
    } catch (e) { this._progress = {} }
    if (!this._progress.passed) this._progress.passed = {}
    if (!this._progress.bestCmds) this._progress.bestCmds = {}
    this.buildLevelList()
  },
  onReady() { this.initCanvas() },
  onUnload() { if (this._raf) cancelAnimationFrame(this._raf) },

  initCanvas() {
    const q = wx.createSelectorQuery()
    q.select('#gitCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return
      const canvas = res[0].node
      const sys = wx.getSystemInfoSync()
      const dpr = sys.pixelRatio || 2
      const w = res[0].width, h = res[0].height
      canvas.width = w * dpr
      canvas.height = h * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      this._canvas = canvas
      this._ctx = ctx
      this._cw = w
      this._ch = h
      this.drawTree()
      // 分支标签呼吸动画（低频）
      const loop = () => {
        this._blink++
        if (this.data.screen === 'play' && this._ctx) this.drawTree()
        this._raf = canvas.requestAnimationFrame(loop)
      }
      loop()
    })
  },

  buildLevelList() {
    const cats = ['基础', '合并', '进阶', '挑战']
    const levels = LEVELS.map(lv => ({
      ...lv,
      passed: !!this._progress.passed[lv.id],
      best: this._progress.bestCmds[lv.id] || null
    }))
    this.setData({ levels })
    void cats
  },

  // ---------- 关卡流程 ----------
  onLevelTap(e) {
    const id = Number(e.currentTarget.dataset.id)
    const lv = LEVELS.find(l => l.id === id)
    if (!lv) return
    this.startLevel(lv)
  },

  startLevel(lv) {
    // 构建起始仓库
    const repo = L.createRepo()
    for (const c of lv.setup) L.exec(repo, c)
    // 目标快照
    const targetRepo = L.createRepo()
    for (const c of lv.target) L.exec(targetRepo, c)
    this._repo = repo
    this._targetSerialize = L.serialize(targetRepo)
    this._disabled = lv.disable ? lv.disable.split(',').map(s => s.trim()) : []
    // 快捷命令：本关可用
    const all = ['commit', 'branch <名>', 'checkout <名|id>', 'switch -c <名>', 'merge <名>', 'rebase <名>', 'cherry-pick <id>', 'reset <id>', 'revert <id>', 'undo']
    this.setData({
      screen: 'play',
      cur: lv,
      outputs: [],
      cmdCount: 0,
      won: false,
      cmdInput: '',
      goalOpen: false,
      status: '在下方输入 git 命令，让仓库达到目标结构',
      quickCmds: this.quickCmdsFor(lv.cat)
    })
  },

  // 按关卡类别给快捷命令（远程关多 push/pull/fetch）
  quickCmdsFor(cat) {
    const base = ['commit', 'branch dev', 'checkout main', 'checkout dev', 'merge dev', 'rebase main', 'undo']
    if (cat === '远程') return ['commit', 'checkout main', 'fetch', 'pull', 'push', 'remote', 'undo']
    return base
  },

  onQuickCmd(e) {
    const c = e.currentTarget.dataset.cmd
    this.setData({ cmdInput: c })
  },

  onCmdInput(e) {
    this.setData({ cmdInput: e.detail.value })
  },

  onRun() {
    if (this.data.won) return
    const line = this.data.cmdInput.trim()
    if (!line) return
    // 禁用命令检查
    const base = line.split(/\s+/)[0]
    if (this._disabled.indexOf(base) >= 0) {
      this.pushOut(line, '本关禁用了 ' + base, false)
      return
    }
    const out = L.exec(this._repo, line)
    this.pushOut(line, out.out, out.ok)
    this.setData({ cmdInput: '', cmdCount: this._repo.cmdCount })
    this.drawTree()
    if (out.ok) this.checkWin()
  },

  pushOut(cmd, out, ok) {
    const outputs = this.data.outputs.concat([{ cmd, out, ok }]).slice(-8)
    this.setData({ outputs })
  },

  checkWin() {
    if (L.serialize(this._repo) === this._targetSerialize) {
      const lv = this.data.cur
      const cmds = this._repo.cmdCount
      this._progress.passed[lv.id] = true
      const prevBest = this._progress.bestCmds[lv.id]
      const newBest = !prevBest || cmds < prevBest
      if (newBest) this._progress.bestCmds[lv.id] = cmds
      try { wx.setStorageSync(STORE_PROGRESS, JSON.stringify(this._progress)) } catch (e) { }
      this.buildLevelList()
      this.setData({
        won: true,
        status: '🎉 过关！用了 ' + cmds + ' 条命令' + (newBest ? '（新纪录！）' : '（最佳 ' + this._progress.bestCmds[lv.id] + '）')
      })
      wx.vibrateShort({ type: 'heavy' })
    }
  },

  onResetLevel() {
    this.startLevel(this.data.cur)
  },

  onNextLevel() {
    const next = LEVELS.find(l => l.id === this.data.cur.id + 1)
    if (next) this.startLevel(next)
    else this.backToSelect()
  },

  backToSelect() {
    this.setData({ screen: 'select' })
    this._repo = null
  },

  toggleGoal() {
    this.setData({ goalOpen: !this.data.goalOpen })
  },

  // ---------- canvas 绘制 ----------
  drawTree() {
    const ctx = this._ctx
    if (!ctx || !this._repo) return
    const W = this._cw, H = this._ch
    ctx.clearRect(0, 0, W, H)
    // 背景
    ctx.fillStyle = '#14131C'
    ctx.fillRect(0, 0, W, H)
    // 网格点装饰
    ctx.fillStyle = 'rgba(255,255,255,.03)'
    for (let gx = 20; gx < W; gx += 28) for (let gy = 20; gy < H; gy += 28) ctx.fillRect(gx, gy, 1.5, 1.5)

    const lay = L.layout(this._repo)
    const n = lay.nodes.length
    if (n === 0) {
      ctx.fillStyle = '#776F9E'
      ctx.font = '13px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('（空仓库 · 输入 commit 开始）', W / 2, H / 2)
      return
    }
    const padX = 58, padTop = 34, padBottom = 30
    const dx = n > 1 ? (W - padX * 2) / (n - 1) : 0
    const laneH = Math.min(46, (H - padTop - padBottom) / Math.max(1, lay.height))
    const x0 = n > 1 ? padX : W / 2
    const pos = new Map()
    for (const nd of lay.nodes) {
      pos.set(nd.id, { x: x0 + nd.x * dx, y: padTop + nd.y * laneH + laneH / 2 })
    }
    // 边
    for (const nd of lay.nodes) {
      const p0 = pos.get(nd.id)
      for (const pid of nd.parents) {
        const p1 = pos.get(pid)
        if (!p1) continue
        ctx.strokeStyle = 'rgba(139,155,212,.5)'
        ctx.lineWidth = 2
        ctx.beginPath()
        // 折线：子→父（x 差大时先水平后斜）
        if (Math.abs(p0.y - p1.y) < 2) {
          ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y)
        } else {
          const midX = (p0.x + p1.x) / 2
          ctx.moveTo(p0.x, p0.y)
          ctx.lineTo(midX, p0.y)
          ctx.lineTo(midX, p1.y)
          ctx.lineTo(p1.x, p1.y)
        }
        ctx.stroke()
      }
    }
    // 节点
    for (const nd of lay.nodes) {
      const p = pos.get(nd.id)
      const color = LANE_COLORS[nd.y % LANE_COLORS.length]
      // 光晕
      ctx.save()
      ctx.shadowColor = color
      ctx.shadowBlur = 8
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      // id 标签
      ctx.fillStyle = '#C9C0FF'
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(nd.id, p.x, p.y - 14)
      // 分支标签（HEAD 标签呼吸）
      let ly = p.y + 22
      for (const lab of nd.labels) {
        const isHead = lab.indexOf('HEAD') >= 0
        const alpha = isHead ? (0.55 + 0.45 * Math.abs(Math.sin(this._blink / 20))) : 1
        ctx.globalAlpha = alpha
        ctx.fillStyle = isHead ? '#FFD66B' : '#8B9BD4'
        ctx.font = (isHead ? 'bold ' : '') + '10px monospace'
        ctx.fillText(lab.replace('HEAD→', 'HEAD → '), p.x, ly)
        ctx.globalAlpha = 1
        ly += 13
      }
    }
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
