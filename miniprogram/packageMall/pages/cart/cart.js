const { request, absUrl } = require('../../../utils/request')

const CART_KEY = 'mall_cart'

Page({
  data: {
    items: [],
    total: 0
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const items = wx.getStorageSync(CART_KEY) || []
    // 兼容旧缓存里的相对路径 cover
    const shown = items.map(it => Object.assign({}, it, { cover: absUrl(it.cover) }))
    const total = items.reduce((s, it) => s + it.price * it.qty, 0)
    this.setData({ items: shown, total: Math.round(total * 100) / 100 })
  },

  add(e) {
    const idx = e.currentTarget.dataset.index
    const items = this.data.items
    items[idx].qty += 1
    this.persist(items)
  },

  sub(e) {
    const idx = e.currentTarget.dataset.index
    const items = this.data.items
    if (items[idx].qty > 1) {
      items[idx].qty -= 1
      this.persist(items)
    }
  },

  remove(e) {
    const idx = e.currentTarget.dataset.index
    const items = this.data.items
    items.splice(idx, 1)
    this.persist(items)
  },

  persist(items) {
    wx.setStorageSync(CART_KEY, items)
    this.refresh()
  },

  clear() {
    wx.showModal({
      title: '清空购物车',
      content: '确定清空所有商品？',
      success: (m) => {
        if (m.confirm) this.persist([])
      }
    })
  },

  checkout() {
    if (!this.data.items.length) {
      wx.showToast({ title: '购物车是空的', icon: 'none' })
      return
    }
    const items = this.data.items.map(it => ({ goods_id: it.goods_id, qty: it.qty }))
    request({
      url: '/api/order',
      method: 'POST',
      data: { items }
    }).then(res => {
      this.persist([])
      wx.showModal({
        title: '下单成功',
        content: '订单 ' + res.order_no + '，合计 ¥' + res.total + '。去模拟支付？',
        confirmText: '去支付',
        cancelText: '稍后',
        success: (m) => {
          const url = '/packageMall/pages/order-detail/order-detail?no=' + res.order_no + (m.confirm ? '&pay=1' : '')
          wx.navigateTo({ url })
        }
      })
    })
  }
})
