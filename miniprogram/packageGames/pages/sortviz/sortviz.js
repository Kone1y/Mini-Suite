const L = require('../../sortviz-logic')

const COUNT = 20          // 柱子数量（≤40，避免步骤爆炸）
const MAX_VAL = 100       // 随机值上限
const SIDE_PAD = 32       // px 舞台左右内边距
const GAP = 4             // px 柱子间隙

// 状态色（紫色主题）
const C_DEFAULT = '#534AB7'   // 默认紫
const C_COMPARE = '#E8923A'   // 比较 橙
const C_SWAP = '#E0524B'      // 交换 红
const C_SORTED = '#2FA86A'    // 已就位 绿

Page({
  data: {
    algos: L.ALGOS,
    algoIndex: 0,
    algoName: '冒泡',
    bars: [],            // [{ w, h, color }]
    barW: 14,
    gap: GAP,
    stageH: 360,
    stepIndex: 0,
    totalSteps: 0,
    playing: false,
    speed: 55,           // 1..100，越大越快
    status: '准备就绪',
    done: false
  },

  onLoad() {
    const info = wx.getSystemInfoSync()
    this._winW = info.windowWidth
    this._winH = info.windowHeight
    this._timer = null
    this._steps = []
    this._original = []
    this.setDims(COUNT)
    this.genArray()
  },

  // 计算 px 尺寸并写入 data
  setDims(count) {
    const avail = this._winW - SIDE_PAD - GAP * (count - 1)
    const w = Math.max(4, Math.floor(avail / count))
    const maxH = Math.min(Math.round(this._winH * 0.42), 440)
    this.setData({ barW: w, stageH: maxH })
  },

  // 生成随机数组并展示静态柱状图
  genArray() {
    this.stopTimer()
    const arr = L.randomArray(COUNT, MAX_VAL)
    this._original = arr
    this.renderStatic(arr)
    this.setData({ totalSteps: 0, stepIndex: 0, done: false, status: '随机数组已生成' })
  },

  // 静态渲染（全紫）
  renderStatic(arr) {
    const maxVal = Math.max.apply(null, arr.concat([1]))
    const bars = arr.map(v => ({
      w: this.data.barW,
      h: Math.max(8, Math.round(v / maxVal * this.data.stageH)),
      color: C_DEFAULT
    }))
    this.setData({ bars })
  },

  // 按某个 step 快照渲染（含状态着色）
  renderStep(step) {
    const maxVal = Math.max.apply(null, step.array.concat([1]))
    const sortedSet = new Set(step.sorted)
    const compareSet = new Set(step.compare)
    // falsy 陷阱：swap 可能为 null，也可能为 [0,0]，用显式判断
    const swapSet = step.swap === null ? new Set() : new Set(step.swap)
    const bars = step.array.map((v, i) => {
      let color = C_DEFAULT
      if (sortedSet.has(i)) color = C_SORTED
      else if (swapSet.has(i)) color = C_SWAP
      else if (compareSet.has(i)) color = C_COMPARE
      return {
        w: this.data.barW,
        h: Math.max(8, Math.round(v / maxVal * this.data.stageH)),
        color
      }
    })
    this.setData({ bars })
  },

  // 由当前数组构建 steps
  buildSteps() {
    const key = L.ALGOS[this.data.algoIndex].key + 'Sort'
    const res = L[key](this._original)
    this._steps = res.steps
    this.setData({ totalSteps: res.steps.length, stepIndex: 0, done: false })
    this.renderStep(res.steps[0])
  },

  // 速度 -> 间隔（ms）：越快间隔越短
  interval() {
    return 20 + (100 - this.data.speed) * 12
  },

  startTimer() {
    this.stopTimer()
    this.setData({ playing: true, status: '播放中…' })
    this._timer = setInterval(() => this.tick(), this.interval())
  },

  tick() {
    const next = this.data.stepIndex + 1
    if (next >= this._steps.length) {
      this.finish()
      return
    }
    this.setData({ stepIndex: next })
    this.renderStep(this._steps[next])
  },

  finish() {
    this.stopTimer()
    this.setData({ playing: false, done: true, status: '✅ 排序完成' })
    wx.vibrateShort({ type: 'medium' })
  },

  stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  // ---------- 交互 ----------
  onAlgoChange(e) {
    const idx = Number(e.detail.value)
    this.stopTimer()
    // 切算法必须作废旧步骤，否则播放的还是上一个算法的快照
    this._steps = []
    this.setData({ algoIndex: idx, algoName: L.ALGOS[idx].name, playing: false, stepIndex: 0, totalSteps: 0, done: false, status: '已切换到「' + L.ALGOS[idx].name + '」，点播放开始' })
    if (this._original.length) this.renderStatic(this._original)
  },

  generateTap() { this.genArray() },

  playPause() {
    if (this.data.playing) { this.pause(); return }
    // 尚未构建或已播放到末尾 -> 重建
    if (this._steps.length === 0 || this.data.done || this.data.stepIndex >= this._steps.length - 1) {
      this.buildSteps()
    }
    this.startTimer()
  },

  pause() {
    this.stopTimer()
    this.setData({ playing: false, status: '已暂停' })
  },

  stepOnce() {
    if (this.data.playing) this.pause()
    if (this._steps.length === 0) { this.buildSteps(); return }
    if (this.data.done) return
    const next = this.data.stepIndex + 1
    if (next >= this._steps.length) { this.finish(); return }
    this.setData({ stepIndex: next })
    this.renderStep(this._steps[next])
  },

  reset() {
    this.stopTimer()
    this.renderStatic(this._original)
    this.setData({ stepIndex: 0, totalSteps: 0, done: false, status: '已重置' })
  },

  onSpeedChange(e) {
    const speed = Number(e.detail.value)
    this.setData({ speed })
    if (this.data.playing) this.startTimer()  // 以新间隔重启
  },

  // catchtap 必须绑真实函数（空 catchtap="" 不生效）
  stopProp() {},

  goHome() { wx.switchTab({ url: '/pages/index/index' }) },

  onUnload() { this.stopTimer() },
  // 切后台停表后按钮仍显示"播放中"——恢复时同步 UI 为暂停态
  onShow() {
    if (this.data.playing) this.setData({ playing: false, status: '已暂停（切后台自动暂停）' })
  },
  onHide() { this.stopTimer() }
})
