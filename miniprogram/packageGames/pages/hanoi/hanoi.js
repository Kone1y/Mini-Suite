const L = require('../../hanoi-logic')

// 根据尺寸生成紫色渐变背景（尺寸越大越深，便于区分）
function discBg(size, n) {
  const ratio = n <= 1 ? 0 : (size - 1) / (n - 1)
  const lTop = 70 - ratio * 22          // 70% -> 48%
  const lBot = lTop - 14
  const top = 'hsl(255, 56%, ' + lTop + '%)'
  const bot = 'hsl(256, 58%, ' + lBot + '%)'
  return 'linear-gradient(160deg, ' + top + ' 0%, ' + bot + ' 100%)'
}

Page({
  data: {
    n: 3,                       // 盘数
    pegs: [[], [], []],         // 逻辑状态：三维数组，元素为尺寸
    pegsView: [],               // 渲染视图：[{id, discs:[{size,w,h,bg,grabbable,held,moving}]}]
    selectedPeg: null,          // 手动模式已抓取的源柱（null/0/1/2）
    steps: 0,                   // 步数
    autoPlaying: false,         // 是否自动播放中
    // 预计算文本（WXML 里不调用函数）
    stepsText: '步数 0',
    nText: '3 盘',
    modeText: '手动模式 · 选源柱',
    // 布局 px（JS 算好，WXML 仅内联使用）
    boardW: 0,
    boardH: 0,
    pegW: 0,
    pegH: 0
  },

  // 实例字段
  moves: [],
  _autoIndex: 0,
  _timer: null,
  windowWidth: 0,
  unitW: 0,
  discH: 0,

  onLoad() {
    const info = wx.getSystemInfoSync()
    this.windowWidth = info.windowWidth
    this.computeLayout()
    this.resetBoard()
  },

  onUnload() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },
  // 切后台自动暂停（定时器在后台被冻结但不会被清除，回前台会补跳帧）
  onHide() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    if (this.data.autoPlaying) this.setData({ autoPlaying: false }, () => this.syncView())
  },

  // ---- 布局：用 windowWidth 算 px，绝不用 calc 混 rpx ----
  computeLayout() {
    const W = this.windowWidth
    const margin = 16
    const boardW = W - margin * 2
    const pegGap = 6
    const pegW = Math.floor((boardW - pegGap * 2) / 3)
    const pegH = Math.floor(pegW * 1.5)
    const boardH = pegH + 16
    const n = this.data.n
    const maxDiscW = pegW * 0.92
    const unitW = maxDiscW / n
    const discH = Math.max(10, Math.floor((pegH * 0.94) / n))
    this.pegW = pegW
    this.pegH = pegH
    this.unitW = unitW
    this.discH = discH
    this.setData({ boardW, boardH, pegW, pegH, n })
  },

  // ---- 重建视图：从 data.pegs + 布局生成 pegsView 与文本 ----
  // 注意：pegs 逻辑数组是「从底到顶」（index0=最大盘）；
  // flex column 自上而下渲染，数组首元素会画在视觉顶部 → 渲染前反转，保证视觉顶=逻辑顶盘（最小盘在上）
  syncView(opts) {
    opts = opts || {}
    const n = this.data.n
    const sel = this.data.selectedPeg
    const auto = this.data.autoPlaying
    const pegsView = this.data.pegs.map((peg, pi) => {
      const discs = peg.slice().reverse().map((size, di) => {
        // 反转后：di===0 是视觉最上（= 逻辑顶盘），di===peg.length-1 是底部
        const isTop = di === 0
        return {
          size,
          w: Math.round(size * this.unitW),
          h: Math.round(this.discH),
          bg: discBg(size, n),
          grabbable: isTop && sel === null && !auto,
          held: isTop && sel === pi,
          moving: opts.movingPeg === pi && isTop
        }
      })
      return { id: pi, discs }
    })
    this.setData({
      pegsView,
      stepsText: '步数 ' + this.data.steps,
      nText: n + ' 盘',
      modeText: auto ? '自动播放中…' : (sel === null ? '手动模式 · 选源柱' : '已抓盘 · 点目标柱放下')
    })
  },

  // ---- 重置到初始局面（保留当前盘数）----
  resetBoard() {
    const n = this.data.n
    this._autoIndex = 0
    this.moves = []
    this.setData({
      pegs: L.initialState(n),
      selectedPeg: null,
      steps: 0,
      autoPlaying: false
    })
    this.syncView()
  },

  // ---- 盘数滑杆 ----
  onDiscChange(e) {
    if (this.data.autoPlaying) return
    const n = e.detail.value
    if (typeof n !== 'number') return
    this.setData({ n }, () => {
      this.computeLayout()
      this.resetBoard()
    })
  },

  // ---- 点柱子：手动抓放 ----
  onPegTap(e) {
    if (this.data.autoPlaying) return
    let peg = e.currentTarget.dataset.peg
    peg = (typeof peg === 'number') ? peg : parseInt(peg, 10)
    const sel = this.data.selectedPeg

    if (sel === null) {
      // 抓取：源柱非空才能抓
      if (this.data.pegs[peg].length === 0) {
        wx.showToast({ title: '这柱是空的', icon: 'none' })
        return
      }
      this.setData({ selectedPeg: peg }, () => this.syncView())
      return
    }

    if (sel === peg) {
      // 再次点同一根 = 取消抓取
      this.setData({ selectedPeg: null }, () => this.syncView())
      return
    }

    if (L.legalMove(this.data.pegs, sel, peg) === false) {
      wx.showToast({ title: '不能把大盘放小盘上', icon: 'none' })
      return
    }

    const state = L.applyMove(this.data.pegs, sel, peg)
    const steps = this.data.steps + 1
    this.setData({ pegs: state, selectedPeg: null, steps }, () => {
      this.syncView({ movingPeg: peg })
    })
    if (L.isSolved(state, this.data.n)) {
      wx.vibrateShort({ type: 'medium' })
      wx.showToast({ title: '🎉 完成！', icon: 'success' })
    }
  },

  // ---- 自动播放 ----
  startAuto() {
    if (this.data.autoPlaying) return
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    const n = this.data.n
    this.moves = L.solve(n)
    this._autoIndex = 0
    this.setData({
      pegs: L.initialState(n),
      selectedPeg: null,
      steps: 0,
      autoPlaying: true
    }, () => {
      this.syncView()
      this._timer = setInterval(() => this.autoStep(), 450)
    })
  },

  autoStep() {
    if (this._autoIndex >= this.moves.length) { this.stopAuto(); return }
    const mv = this.moves[this._autoIndex]
    const state = L.applyMove(this.data.pegs, mv.from, mv.to)
    this._autoIndex++
    const steps = this._autoIndex
    this.setData({ pegs: state, steps }, () => {
      this.syncView({ movingPeg: mv.to })
    })
    if (this._autoIndex >= this.moves.length) {
      this.stopAuto()
      wx.vibrateShort({ type: 'medium' })
      wx.showToast({ title: '🎉 完成！', icon: 'success' })
    }
  },

  // ---- 暂停 ----
  pause() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    if (this.data.autoPlaying) this.setData({ autoPlaying: false }, () => this.syncView())
  },

  // ---- 停止自动播放（保留当前局面）----
  stopAuto() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    if (this.data.autoPlaying) {
      this.setData({ autoPlaying: false }, () => this.syncView())
      return
    }
    this.syncView()
  },

  // ---- 重置 ----
  reset() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    this.resetBoard()
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
