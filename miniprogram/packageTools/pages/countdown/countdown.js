const KEY = 'countdown_items'

function fmtDiff(ms) {
  if (ms < 0) ms = 0
  const d = Math.floor(ms / 86400000)
  const h = Math.floor(ms / 3600000) % 24
  const m = Math.floor(ms / 60000) % 60
  const s = Math.floor(ms / 1000) % 60
  return { d, h, m, s }
}

Page({
  data: {
    items: [],
    title: '',
    date: '',
    minDate: ''
  },

  onLoad() {
    const now = new Date()
    const pad = n => (n < 10 ? '0' + n : '' + n)
    this.setData({
      minDate: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()),
      items: wx.getStorageSync(KEY) || []
    })
    this.refresh()
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer)
  },

  onHide() {
    if (this.timer) clearInterval(this.timer)
  },

  onShow() {
    this.refresh()
    this.timer = setInterval(() => this.refresh(), 1000)
  },

  refresh() {
    const items = (this.data.items || []).map(it => {
      const target = new Date(it.date + 'T00:00:00').getTime()
      const diff = target - Date.now()
      return Object.assign({}, it, {
        expired: diff <= 0,
        remain: fmtDiff(diff)
      })
    })
    this.setData({ items })
  },

  onTitle(e) {
    this.setData({ title: e.detail.value })
  },

  onDate(e) {
    this.setData({ date: e.detail.value })
  },

  add() {
    const title = (this.data.title || '').trim()
    if (!title) return wx.showToast({ title: '请输入名称', icon: 'none' })
    if (!this.data.date) return wx.showToast({ title: '请选择日期', icon: 'none' })
    const items = this.data.items.concat([{
      id: Date.now(),
      title,
      date: this.data.date
    }])
    this.setData({ items, title: '', date: '' })
    wx.setStorageSync(KEY, items)
  },

  remove(e) {
    const id = e.currentTarget.dataset.id
    const items = this.data.items.filter(it => it.id !== id)
    this.setData({ items })
    wx.setStorageSync(KEY, items)
  }
})
