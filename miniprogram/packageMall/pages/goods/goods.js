const { request } = require('../../../utils/request')

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
      const items = reset ? res.items : this.data.items.concat(res.items)
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
