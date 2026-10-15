const app = getApp()

Page({
  data: {
    testing: false,
    rounds: [],        // 每轮 { mbps }
    avg: null,         // 平均 Mbps
    best: null,
    progress: 0,       // 当前第几轮/总轮
    totalRounds: 4,
    sizeKB: 2048,      // 每轮下载 2MB
    error: ''
  },

  start() {
    if (this.data.testing) return
    this.setData({ testing: true, rounds: [], avg: null, best: null, progress: 0, error: '' })
    this.runRound(0)
  },

  runRound(i) {
    if (i >= this.data.totalRounds) {
      const mbps = this.data.rounds.map(r => r.mbps)
      const avg = mbps.reduce((a, b) => a + b, 0) / mbps.length
      const best = Math.max.apply(null, mbps)
      this.setData({
        testing: false,
        avg: Math.round(avg * 100) / 100,
        best: Math.round(best * 100) / 100,
        levelText: this.fmtLevel(Math.round(avg * 100) / 100)
      })
      return
    }
    this.setData({ progress: i + 1 })

    const url = app.globalData.apiBase + '/api/speedtest?size=' + this.data.sizeKB + '&t=' + Date.now()
    const t0 = Date.now()
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode !== 200) {
          this.setData({ testing: false, error: '服务返回 ' + res.statusCode })
          return
        }
        const seconds = (Date.now() - t0) / 1000
        const mb = this.data.sizeKB / 1024
        const mbps = Math.round((mb * 8 / seconds) * 100) / 100
        const rounds = this.data.rounds.concat([{ mbps }])
        // 条形图百分比：以当前最大值为 100%
        const maxV = Math.max.apply(null, rounds.map(r => r.mbps))
        rounds.forEach(r => { r.pct = Math.max(6, Math.round(r.mbps / maxV * 100)) })
        this.setData({ rounds }, () => this.runRound(i + 1))
      },
      fail: (err) => {
        this.setData({ testing: false, error: '下载失败：后端未启动或网络不通' })
      }
    })
  },

  fmtLevel(v) {
    if (v >= 100) return '🚀 极速'
    if (v >= 30) return '⚡ 很快'
    if (v >= 10) return '✅ 良好'
    return '🐢 一般'
  }
})
