const L = require('../../game24-logic')

const OP_ICONS = { '+': '＋', '-': '－', '*': '×', '/': '÷' }

Page({
  data: {
    cards: [],        // [{n, used}]  4 张牌
    expr: [],         // 操作序列可视化：['3', '×', '8', ...]
    current: null,    // 已选中的牌下标
    curVal: null,     // 当前累计值（有理数 {n,d} 的文本）
    curValText: '',
    pendingOp: null,  // 待选运算符
    solved: false,
    solution: '',
    showSolution: false,
    round: 1,
    solvedCount: 0,
    steps: 0
  },

  onLoad() { this.newRound() },

  newRound() {
    const { nums, solution } = L.deal()
    this.setData({
      cards: nums.map(n => ({ n, used: false })),
      expr: [],
      current: null,
      curVal: null,
      curValText: '',
      pendingOp: null,
      solved: false,
      solution,
      showSolution: false,
      steps: 0
    })
  },

  reset() {
    this.setData({
      cards: this.data.cards.map(c => ({ ...c, used: false })),
      expr: [],
      current: null,
      curVal: null,
      curValText: '',
      pendingOp: null,
      solved: false,
      showSolution: false,
      steps: 0
    })
  },

  tapCard(e) {
    if (this.data.solved) return
    const idx = e.currentTarget.dataset.idx
    const card = this.data.cards[idx]
    if (card.used) return
    if (this.data.pendingOp === null && this.data.curVal !== null) return   // 需先选运算符

    if (this.data.curVal === null) {
      // 第一张
      this.setData({
        current: idx,
        cards: this.data.cards.map((c, i) => i === idx ? { ...c, used: true } : { ...c }),
        curVal: { n: card.n, d: 1 },
        curValText: String(card.n),
        expr: this.data.expr.concat(String(card.n))
      })
      return
    }
    // 已有累计值 + 待选运算符：归约
    this.applyOp(card.n, idx)
  },

  tapOp(e) {
    if (this.data.solved || this.data.curVal === null) return
    const op = e.currentTarget.dataset.op
    this.setData({ pendingOp: op })
  },

  applyOp(n, cardIdx) {
    const op = this.data.pendingOp
    const a = this.data.curVal
    const b = { n, d: 1 }
    // 有理数运算（与逻辑模块一致）
    const gcd = (x, y) => y === 0 ? x : gcd(y, x % y)
    const simplify = f => {
      if (f.d === 0) return f
      let g = gcd(Math.abs(f.n), Math.abs(f.d)) || 1
      if (f.d < 0) g = -g
      return { n: f.n / g, d: f.d / g }
    }
    let r
    if (op === '+') r = simplify({ n: a.n * b.d + b.n * a.d, d: a.d * b.d })
    else if (op === '-') r = simplify({ n: a.n * b.d - b.n * a.d, d: a.d * b.d })
    else if (op === '*') r = simplify({ n: a.n * b.n, d: a.d * b.d })
    else {
      if (b.n === 0) {
        wx.showToast({ title: '不能除以 0', icon: 'none' })
        this.setData({ pendingOp: null })
        return
      }
      r = simplify({ n: a.n * b.d, d: a.d * b.n })
    }
    if (r.d === 0) {
      wx.showToast({ title: '不能除以 0', icon: 'none' })
      this.setData({ pendingOp: null })
      return
    }
    const valText = r.d === 1 ? String(r.n) : r.n + '/' + r.d
    const expr = this.data.expr.concat([OP_ICONS[op], String(n)])
    this.setData({
      cards: this.data.cards.map((c, i) => i === cardIdx ? { ...c, used: true } : { ...c }),
      curVal: r,
      curValText: valText,
      expr,
      pendingOp: null,
      steps: this.data.steps + 1,
      current: cardIdx
    })
    // 判定：4 张全用完
    if (this.data.cards.every(c => c.used)) {
      if (r.d === 1 && r.n === 24) {
        wx.vibrateShort({ type: 'medium' })
        this.setData({ solved: true, solvedCount: this.data.solvedCount + 1 })
      } else {
        wx.showToast({ title: '得 ' + valText + '，不对哦', icon: 'none' })
      }
    }
  },

  undo() {
    // 简化实现：全部重置（表达式栈撤销较复杂，24 点重开一局成本低）
    this.reset()
  },

  reveal() {
    this.setData({ showSolution: !this.data.showSolution })
  },

  next() {
    this.setData({ round: this.data.round + 1 })
    this.newRound()
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
