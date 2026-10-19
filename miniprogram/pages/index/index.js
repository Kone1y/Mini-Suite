const { request } = require('../../utils/request')
const H = require('../../utils/hall-data')

Page({
  data: {
    modules: H.visibleModules(),   // 提审态自动过滤商城模块
    backendOk: null,
    greeting: { text: '', emoji: '' },
    dateLine: '',
    typed: '',            // 打字机文本
    stats: [],            // 统计
    curIdx: 0,            // 当前轮播模块索引
    picks: [],            // 当前模块精选（前 4 条，带色砖）
  },

  onLoad() {
    this.checkBackend()
    this.setData({ greeting: this.calcGreeting() })
    this.initStatic()
    this.typeWriter()
  },

  initStatic() {
    const d = new Date()
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
    const dateLine = d.getMonth() + 1 + ' 月 ' + d.getDate() + ' 日 · 星期' + week
    const total = this.data.modules.reduce((s, m) => s + m.tools.length, 0)
    const games = (H.getModule('games') || { tools: [] }).tools.length
    const tools = (H.getModule('tools') || { tools: [] }).tools.length
    this.setData({
      dateLine,
      stats: [
        { label: '全部条目', value: total },
        { label: '小游戏', value: games },
        { label: '工具', value: tools }
      ]
    })
    this.setPicks(0)
  },

  setPicks(idx) {
    const mod = this.data.modules[idx]
    if (!mod) return
    const picks = H.decorate(mod.key).slice(0, 4)
    this.setData({ curIdx: idx, picks })
  },

  // 打字机
  typeWriter() {
    const full = this.calcGreeting().text + '，欢迎回到小屋'
    let i = 0
    const tick = () => {
      i++
      this.setData({ typed: full.slice(0, i) })
      if (i < full.length && this._alive !== false) {
        this._tw = setTimeout(tick, 120)
      }
    }
    tick()
  },

  calcGreeting() {
    const h = new Date().getHours()
    if (h < 6) return { text: '夜深了', emoji: '🌙' }
    if (h < 11) return { text: '早上好', emoji: '☀️' }
    if (h < 14) return { text: '中午好', emoji: '🌞' }
    if (h < 18) return { text: '下午好', emoji: '🪴' }
    return { text: '晚上好', emoji: '🌆' }
  },

  onShow() {
    if (this._timer) clearInterval(this._timer)
    this._timer = setInterval(() => this.checkBackend(), 30000)
  },

  onHide() { if (this._timer) clearInterval(this._timer) },
  onUnload() {
    if (this._timer) clearInterval(this._timer)
    this._alive = false
    if (this._tw) clearTimeout(this._tw)
  },

  checkBackend() {
    request({ url: '/api/health' })
      .then(() => this.setData({ backendOk: true }))
      .catch(() => this.setData({ backendOk: false }))
  },

  // 轮播切换
  onSwiper(e) {
    this.setPicks(e.detail.current)
  },

  goHall(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    wx.navigateTo({ url: '/pages/hall/hall?key=' + key })
  },

  goPick(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    const mod = this.data.modules[this.data.curIdx]
    const tool = mod && mod.tools.find(t => t.url === url)
    if (tool) H.pushRecent(mod.key, tool)
    wx.navigateTo({ url })
  }
})
