const { request, absUrl } = require('../../../utils/request')

const CART_KEY = 'mall_cart'

Page({
  data: {
    goods: null,
    current: 0,
    qty: 1
  },

  onLoad(options) {
    this.id = options.id
    this.load()
  },

  load() {
    request({
      url: '/api/goods/' + this.id
    }).then(goods => {
      // images 是后端相对路径，swiper image src 需要绝对地址
      goods.images = (goods.images || []).map(absUrl)
      this.setData({ goods })
      wx.setNavigationBarTitle({ title: goods.name })
    })
  },

  onSwiper(e) {
    this.setData({ current: e.detail.current })
  },

  addQty() {
    const max = this.data.goods.stock || 999
    if (this.data.qty < max) this.setData({ qty: this.data.qty + 1 })
  },

  subQty() {
    if (this.data.qty > 1) this.setData({ qty: this.data.qty - 1 })
  },

  getCart() {
    return wx.getStorageSync(CART_KEY) || []
  },

  setCart(cart) {
    wx.setStorageSync(CART_KEY, cart)
  },

  addCart() {
    const cart = this.getCart()
    const g = this.data.goods
    const exist = cart.find(c => c.goods_id === g.id)
    if (exist) {
      exist.qty += this.data.qty
    } else {
      cart.push({ goods_id: g.id, name: g.name, price: g.price, cover: (g.images || [])[0] || '', qty: this.data.qty })    }
    this.setCart(cart)
    wx.showToast({ title: '已加入购物车', icon: 'success' })
  },

  buyNow() {
    const g = this.data.goods
    this.submitOrder([{ goods_id: g.id, qty: this.data.qty }])
  },

  submitOrder(items) {
    request({
      url: '/api/order',
      method: 'POST',
      data: { items }
    }).then(res => {
      wx.showModal({
        title: '下单成功',
        content: '订单 ' + res.order_no + '，合计 ¥' + res.total + '。去模拟支付？',
        confirmText: '去支付',
        cancelText: '稍后',
        success: (m) => {
          if (m.confirm) {
            wx.navigateTo({ url: '/packageMall/pages/order-detail/order-detail?no=' + res.order_no + '&pay=1' })
          } else {
            wx.navigateTo({ url: '/packageMall/pages/order-detail/order-detail?no=' + res.order_no })
          }
        }
      })
    })
  }
})
