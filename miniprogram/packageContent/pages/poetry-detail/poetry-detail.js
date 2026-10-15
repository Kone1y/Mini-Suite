const { request } = require('../../../utils/request')
const app = getApp()

Page({
  data: {
    poem: null,
    lines: [],
    faved: false
  },

  onLoad(options) {
    this.id = options.id
    this.load()
  },

  load() {
    request({
      url: '/api/poetry/' + this.id
    }).then(poem => {
      this.setData({
        poem,
        lines: (poem.content || '').split('\n').filter(Boolean)
      })
      this.checkFav()
      wx.setNavigationBarTitle({ title: poem.title })
    })
  },

  checkFav() {
    request({
      url: '/api/favorites',
      data: { kind: 'poetry' }
    }).then(res => {
      const faved = (res.items || []).some(f => f.ref_id === String(this.id))
      this.setData({ faved })
    }).catch(() => {})
  },

  toggleFav() {
    if (this.data.faved) {
      request({
        url: '/api/favorite?kind=poetry&ref_id=' + this.id,
        method: 'DELETE'
      }).then(() => {
        this.setData({ faved: false })
        wx.showToast({ title: '已取消收藏', icon: 'none' })
      })
    } else {
      request({
        url: '/api/favorite',
        method: 'POST',
        data: { kind: 'poetry', ref_id: String(this.id) }
      }).then(() => {
        this.setData({ faved: true })
        wx.showToast({ title: '已收藏', icon: 'success' })
      })
    }
  },

  copy() {
    const p = this.data.poem
    const text = '《' + p.title + '》 ' + p.dynasty + '·' + p.author + '\n' + this.data.lines.join('\n')
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  },

  onShareAppMessage() {
    const p = this.data.poem
    return {
      title: '《' + (p ? p.title : '') + '》 ' + (p ? p.author : ''),
      path: '/packageContent/pages/poetry-detail/poetry-detail?id=' + this.id
    }
  }
})
