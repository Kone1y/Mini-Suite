const { request, absUrl } = require('../../../utils/request')

Page({
  data: {
    tabs: [
      { key: 'poetry', name: '诗词' },
      { key: 'wallpaper', name: '壁纸' },
      { key: 'emoji', name: '表情' }
    ],
    current: 'poetry',
    items: [],
    loading: true
  },

  onShow() {
    this.load()
  },

  switchTab(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ current: key }, () => this.load())
  },

  load() {
    this.setData({ loading: true })
    request({
      url: '/api/favorites/detail',
      data: { kind: this.data.current }
    }).then(res => {
      // 壁纸/表情的 path 是后端相对路径，渲染/预览都要拼绝对地址
      const items = (res.items || []).map(i => Object.assign({}, i, { path: i.path ? absUrl(i.path) : '' }))
      this.setData({ items, loading: false })
    }).catch(() => this.setData({ loading: false, items: [] }))
  },

  open(e) {
    const item = e.currentTarget.dataset.item
    if (item.kind === 'poetry') {
      if (item.subtitle) {
        wx.navigateTo({ url: '/packageContent/pages/poetry-detail/poetry-detail?id=' + item.ref_id })
      } else {
        wx.showToast({ title: '该诗词已被删除', icon: 'none' })
      }
    } else {
      wx.previewImage({
        current: item.path,
        urls: [item.path]
      })
    }
  },

  remove(e) {
    const item = e.currentTarget.dataset.item
    request({
      url: '/api/favorite?kind=' + item.kind + '&ref_id=' + encodeURIComponent(item.ref_id),
      method: 'DELETE'
    }).then(() => this.load())
  }
})
