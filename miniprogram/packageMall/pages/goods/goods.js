const { request, absUrl } = require('../../../utils/request')

Page({
  data: {
    items: [],
    page: 1,
    total: 0,
    loading: false,
    noMore: false
  },

  onLoad() {
    this.load(true)
  },

  onPullDownRefresh() {
    this.load(true, () => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (!this.data.noMore && !this.data.loading) this.load(false)
  },

  load(reset, done) {
    if (this.data.loading) return
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true })
    request({
      url: '/api/goods',
      data: { page, size: 10 }
    }).then(res => {
      // cover 是后端相对路径，image src 需要绝对地址
      const fresh = (res.items || []).map(i => Object.assign({}, i, { cover: absUrl(i.cover) }))
      const items = reset ? fresh : this.data.items.concat(fresh)
      this.setData({
        items,
        page,
        total: res.total,
        loading: false,
        noMore: items.length >= res.total
      })
    }).catch(() => {
      this.setData({ loading: false })
    }).finally(() => done && done())
  },

  goDetail(e) {
    wx.navigateTo({ url: '/packageMall/pages/goods-detail/goods-detail?id=' + e.currentTarget.dataset.id })
  },

  goCart() {
    wx.navigateTo({ url: '/packageMall/pages/cart/cart' })
  }
})
