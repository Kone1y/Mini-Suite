// 番茄钟：25 分钟专注 + 5 分钟休息循环
const FOCUS_MIN = 25
const BREAK_MIN = 5
const STATS_KEY = 'pomodoro_stats'   // { date: 'YYYY-MM-DD', count, minutes }

Page({
  data: {
    mode: 'idle',          // idle | focus | break | paused
    focusLen: FOCUS_MIN,
    breakLen: BREAK_MIN,
    leftSec: FOCUS_MIN * 60,
    totalSec: FOCUS_MIN * 60,
    isFocus: true,         // 当前阶段是否专注
    ringColor: '#534AB7',
    btnText: '开始专注',
    todayCount: 0,
    todayMinutes: 0,
    doneSessions: 0,       // 本次进入页面后完成的番茄数
    showSettings: false,
    // 环形进度 SVG 参数（预计算进 data 避免模板运算）
    dashArray: '0 100'
  },

  onLoad() {
    this.loadStats()
    this.setData({ timeText: this.fmt(this.data.leftSec) })
    this.applyRing(1)
  },

  fmt(sec) {
    const m = Math.floor(sec / 60), s = sec % 60
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
  },

  onUnload() { this.stopTick() },
  onHide() {
    // 小程序切后台定时器会被暂停——记录剩余时间戳，回来时校正（简单策略：退出即暂停）
    if (this.data.mode === 'focus' || this.data.mode === 'break') this.pause()
  },

  loadStats() {
    const today = this.todayStr()
    const s = wx.getStorageSync(STATS_KEY)
    if (s && s.date === today) {
      this.setData({ todayCount: s.count, todayMinutes: s.minutes })
    } else if (s) {
      this.setData({ todayCount: 0, todayMinutes: 0 })
    }
  },

  saveStats() {
    wx.setStorageSync(STATS_KEY, {
      date: this.todayStr(),
      count: this.data.todayCount,
      minutes: this.data.todayMinutes
    })
  },

  todayStr() {
    const d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  },

  applyRing(ratio) {
    // 周长按 stroke-dasharray 百分比：2πr，用 pathLength=100 归一
    const filled = Math.round(ratio * 100)
    this.setData({ dashArray: filled + ' ' + (100 - filled) })
  },

  mainBtn() {
    const mode = this.data.mode
    if (mode === 'idle' || mode === 'paused') {
      if (mode === 'idle') {
        this.setData({
          mode: 'focus',
          isFocus: true,
          leftSec: this.data.focusLen * 60,
          timeText: this.fmt(this.data.focusLen * 60),
          totalSec: this.data.focusLen * 60,
          ringColor: '#534AB7',
          btnText: '暂停'
        })
      } else {
        this.setData({ mode: this.data.isFocus ? 'focus' : 'break', btnText: '暂停' })
      }
      this.startTick()
    } else {
      this.pause()
    }
  },

  pause() {
    this.stopTick()
    this.setData({ mode: 'paused', btnText: '继续' })
  },

  reset() {
    this.stopTick()
    this.setData({
      mode: 'idle',
      isFocus: true,
      leftSec: this.data.focusLen * 60,
      timeText: this.fmt(this.data.focusLen * 60),
      totalSec: this.data.focusLen * 60,
      ringColor: '#534AB7',
      btnText: '开始专注',
      doneSessions: 0
    })
    this.applyRing(1)
  },

  startTick() {
    this.stopTick()
    this._timer = setInterval(() => {
      const left = this.data.leftSec - 1
      if (left <= 0) {
        this.phaseDone()
        return
      }
      this.setData({ leftSec: left, timeText: this.fmt(left) })
      this.applyRing(left / this.data.totalSec)
    }, 1000)
  },
  stopTick() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  phaseDone() {
    this.stopTick()
    wx.vibrateShort({ type: 'heavy' })
    if (this.data.isFocus) {
      // 专注完成：记一个番茄
      const count = this.data.todayCount + 1
      const minutes = this.data.todayMinutes + this.data.focusLen
      this.setData({ todayCount: count, todayMinutes: minutes, doneSessions: this.data.doneSessions + 1 })
      this.saveStats()
      wx.showToast({ title: '🍅 专注完成！休息一下', icon: 'none', duration: 2500 })
      // 进入休息
      this.setData({
        mode: 'break',
        isFocus: false,
        leftSec: this.data.breakLen * 60,
        timeText: this.fmt(this.data.breakLen * 60),
        totalSec: this.data.breakLen * 60,
        ringColor: '#0F8B6D',
        btnText: '暂停'
      })
      this.applyRing(1)
      this.startTick()
    } else {
      // 休息完成
      wx.showToast({ title: '☕ 休息结束，开始新番茄', icon: 'none', duration: 2500 })
      this.setData({
        mode: 'focus',
        isFocus: true,
        leftSec: this.data.focusLen * 60,
        timeText: this.fmt(this.data.focusLen * 60),
        totalSec: this.data.focusLen * 60,
        ringColor: '#534AB7',
        btnText: '暂停'
      })
      this.applyRing(1)
      this.startTick()
    }
  },

  // 设置
  openSettings() { this.setData({ showSettings: true }) },
  closeSettings() { this.setData({ showSettings: false }) },
  // 阻止面板内部点击冒泡到遮罩（空 catchtap 在微信里不生效，必须绑真实函数）
  stopProp() {},
  onFocusLen(e) {
    const v = Math.max(5, Math.min(60, Number(e.detail.value) || FOCUS_MIN))
    if (this.data.mode === 'idle') {
      this.setData({ focusLen: v, leftSec: v * 60, timeText: this.fmt(v * 60), totalSec: v * 60 })
      this.applyRing(1)
    } else {
      this.setData({ focusLen: v })
    }
  },
  onBreakLen(e) {
    const v = Math.max(1, Math.min(30, Number(e.detail.value) || BREAK_MIN))
    this.setData({ breakLen: v })
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
