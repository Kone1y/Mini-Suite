const HISTORY_KEY = 'qrscan_history'
const MAX_HISTORY = 10

Page({
  data: {
    result: null,      // { raw, isUrl, time }
    history: [],
    copied: false
  },

  onLoad() {
    this.loadHistory()
  },

  loadHistory() {
    const h = wx.getStorageSync(HISTORY_KEY) || []
    this.setData({ history: h })
  },

  saveToHistory(raw) {
    let h = wx.getStorageSync(HISTORY_KEY) || []
    h = h.filter(it => it.raw !== raw)
    h.unshift({
      raw,
      isUrl: /^https?:\/\//i.test(raw),
      time: new Date().toLocaleString('zh-CN', { hour12: false })
    })
    if (h.length > MAX_HISTORY) h = h.slice(0, MAX_HISTORY)
    wx.setStorageSync(HISTORY_KEY, h)
    this.setData({ history: h })
  },

  scan() {
    wx.scanCode({
      success: (res) => {
        const raw = res.result || ''
        if (!raw) {
          wx.showToast({ title: '未识别到内容', icon: 'none' })
          return
        }
        this.setData({
          result: {
            raw,
            isUrl: /^https?:\/\//i.test(raw),
            scanType: res.scanType || '',
            time: new Date().toLocaleString('zh-CN', { hour12: false })
          },
          copied: false
        })
        this.saveToHistory(raw)
      },
      fail: (err) => {
        // 用户取消扫码不提示
        if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) return
        wx.showToast({ title: '扫码失败', icon: 'none' })
      }
    })
  },

  copy() {
    if (!this.data.result) return
    wx.setClipboardData({
      data: this.data.result.raw,
      success: () => this.setData({ copied: true })
    })
  },

  copyHistory(e) {
    const raw = e.currentTarget.dataset.raw
    wx.setClipboardData({ data: raw })
  },

  useHistory(e) {
    const raw = e.currentTarget.dataset.raw
    // 跳到生成器并回填（生成器 onLoad 读取 options.text）
    wx.navigateTo({ url: '/packageTools/pages/qrcode/qrcode?text=' + encodeURIComponent(raw) })
  },

  clearHistory() {
    if (!this.data.history.length) return
    wx.showModal({
      title: '清空历史',
      content: '确定清空全部 ' + this.data.history.length + ' 条扫描历史吗？',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync(HISTORY_KEY, [])
          this.setData({ history: [] })
        }
      }
    })
  },

  clearResult() {
    this.setData({ result: null })
  }
})
