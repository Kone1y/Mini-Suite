const app = getApp()
const { request } = require('../../utils/request')

Page({
  data: {
    userInfo: null,
    cartCount: 0,
    entries: [
      { name: '我的收藏', desc: '诗词 · 壁纸 · 表情', icon: '⭐', color: '#0F6E56', bg: '#E1F5EE', url: '/packageContent/pages/favorites/favorites' },
      { name: '我的订单', desc: '查看物流与状态', icon: '📦', color: '#1F5E9E', bg: '#E5EFFA', url: '/packageMall/pages/order/order' },
      { name: '购物车', desc: '待结算好物', icon: '🛒', color: '#993C1D', bg: '#FAECE7', badge: true, url: '/packageMall/pages/cart/cart' }
    ],
    stats: [
      { key: 'fav', name: '收藏', num: '—' },
      { key: 'order', name: '订单', num: '—' },
      { key: 'tool', name: '工具', num: 8 }
    ]
  },

  onShow() {
    this.setData({ userInfo: app.globalData.userInfo })
    this.refreshCart()
    this.refreshStats()
  },

  refreshCart() {
    const cart = wx.getStorageSync('mall_cart') || []
    this.setData({ cartCount: cart.reduce((s, it) => s + it.qty, 0) })
  },

  refreshStats() {
    // 后端未启动时保持 '—'
    request({ url: '/api/favorites' }).then(res => {
      this.setStat('fav', res.items ? res.items.length : 0)
    }).catch(() => {})
    request({ url: '/api/orders' }).then(res => {
      this.setStat('order', res.items ? res.items.length : 0)
    }).catch(() => {})
  },

  setStat(key, num) {
    const stats = this.data.stats.map(s => s.key === key ? Object.assign({}, s, { num }) : s)
    this.setData({ stats })
  },

  goEntry(e) {
    const url = e.currentTarget.dataset.url
    if (url) wx.navigateTo({ url })
  }
})

