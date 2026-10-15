const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
const SEG_COLORS = ['#6A5AE0', '#E86A5E', '#3DA97C', '#E8A33D', '#4A90D9', '#B86BC4']

Page({
  data: {
    // 模式
    mode: 'dice',    // dice | yesno | draw | wheel
    modes: [
      { key: 'dice', name: '骰子', icon: '🎲' },
      { key: 'yesno', name: 'Yes/No', icon: '🤔' },
      { key: 'draw', name: '抽签', icon: '🥢' },
      { key: 'wheel', name: '转盘', icon: '🎡' }
    ],
    // 骰子
    diceFace: '⚄',
    rolling: false,
    diceHistory: [],
    // yesno
    answer: '',
    ansColor: '',
    // 抽签
    drawItems: '选项A\n选项B\n选项C',
    drawResult: '',
    // 转盘（自定义 2~6 项，均分概率）
    wheelItems: '火锅\n烧烤\n日料\n麦当劳',
    wheelResult: '',
    wheelRotating: false,
    wheelDeg: 0,
    wheelSegs: [],      // [{ label, color, start, end, mid, labelRot, labelLeft }]
    wheelCount: 4
  },

  onLoad() {
    this.rebuildWheel(this.data.wheelItems)
  },

  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.key })
  },

  // ===== 骰子 =====
  rollDice() {
    if (this.data.rolling) return
    this.setData({ rolling: true })
    let n = 0
    const iv = setInterval(() => {
      this.setData({ diceFace: DICE_FACES[Math.floor(Math.random() * 6)] })
      if (++n >= 10) {
        clearInterval(iv)
        const idx = Math.floor(Math.random() * 6)
        this.setData({
          diceFace: DICE_FACES[idx],
          rolling: false,
          diceHistory: [idx + 1].concat(this.data.diceHistory).slice(0, 10)
        })
        wx.vibrateShort({ type: 'medium' })
      }
    }, 70)
  },

  // ===== Yes/No =====
  rollYesNo() {
    const yes = Math.random() < 0.5
    this.setData({
      answer: yes ? 'YES！去做吧' : 'NO，算了',
      ansColor: yes ? '#0F6E56' : '#993C1D'
    })
    wx.vibrateShort({ type: 'light' })
  },

  // ===== 抽签 =====
  onDrawInput(e) { this.setData({ drawItems: e.detail.value }) },
  rollDraw() {
    const items = this.data.drawItems.split('\n').map(s => s.trim()).filter(Boolean)
    if (items.length < 2) {
      wx.showToast({ title: '至少输入 2 个选项（每行一个）', icon: 'none' })
      return
    }
    this.setData({ drawResult: items[Math.floor(Math.random() * items.length)] })
    wx.vibrateShort({ type: 'medium' })
  },

  // ===== 转盘 =====
  onWheelInput(e) {
    this.setData({ wheelItems: e.detail.value })
    this.rebuildWheel(e.detail.value)
  },

  rebuildWheel(text) {
    const items = text.split('\n').map(s => s.trim()).filter(Boolean)
    const count = items.length
    const segs = items.map((label, i) => {
      const start = (i * 360) / count
      const end = ((i + 1) * 360) / count
      const mid = (start + end) / 2
      return {
        label,
        color: SEG_COLORS[i % SEG_COLORS.length],
        start, end, mid,
        // 标签：放在扇形中线、半径 62% 处，随扇形旋转
        labelRot: mid,
        labelLeft: 50 + 62 * Math.sin((mid * Math.PI) / 180),
        labelTop: 50 - 62 * Math.cos((mid * Math.PI) / 180)
      }
    })
    // conic-gradient：CSS 角度从顶部顺时针，与扇区 start/end 一致
    const gradient = segs.map(s =>
      `${s.color} ${s.start.toFixed(2)}deg ${s.end.toFixed(2)}deg`
    ).join(', ')
    this.setData({
      wheelSegs: segs,
      wheelCount: count,
      pieGradient: gradient,
      wheelProbability: count >= 2 ? Math.round(1000 / count) / 10 : 0,
      wheelResult: ''
    })
  },

  applyWheel() {
    const items = this.data.wheelItems.split('\n').map(s => s.trim()).filter(Boolean)
    if (items.length < 2) {
      wx.showToast({ title: '至少 2 个选项', icon: 'none' })
      return
    }
    if (items.length > 6) {
      wx.showToast({ title: '最多 6 个选项', icon: 'none' })
      return
    }
    this.rebuildWheel(this.data.wheelItems)
    wx.showToast({ title: '转盘已更新', icon: 'success' })
  },

  spinWheel() {
    if (this.data.wheelRotating) return
    const items = this.data.wheelItems.split('\n').map(s => s.trim()).filter(Boolean)
    if (items.length < 2) {
      wx.showToast({ title: '至少 2 个选项', icon: 'none' })
      return
    }
    const count = items.length
    // 均分概率：每项 1/count。随机取段
    const pick = Math.floor(Math.random() * count)
    const seg = 360 / count
    // 指针固定在顶部(12点=0°)。转盘顺时针转 deg 后，第 pick 段中心到指针需要：
    // 段中心角 = pick*seg + seg/2（从顶部顺时针数）。转盘需转 (360 - 段中心角) 的绝对角度
    // 加随机偏移 ±seg*0.35 避免每次都停在正中
    const jitter = (Math.random() - 0.5) * seg * 0.7
    const targetAbs = 360 - (pick * seg + seg / 2) - jitter
    const extra = 360 * 5   // 多转 5 圈
    const cur = this.data.wheelDeg % 360
    const deg = this.data.wheelDeg + extra + ((targetAbs - cur) % 360 + 360) % 360
    this.setData({ wheelRotating: true, wheelDeg: deg, wheelResult: '' })
    setTimeout(() => {
      this.setData({ wheelResult: items[pick], wheelRotating: false })
      wx.vibrateShort({ type: 'medium' })
    }, 3400)
  }
})
