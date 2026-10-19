const app = getApp()
const { request } = require('../../utils/request')
const H = require('../../utils/hall-data')

Page({
  data: {
    userInfo: null,
    cartCount: 0,
    entries: [],
    mallOn: H.MALL_ENABLED,   // 提审态：商城相关入口隐藏
    stats: [
      { key: 'fav', name: '收藏', num: '—' },
      { key: 'order', name: '订单', num: '—' },
      { key: 'tool', name: '工具', num: 8 }
    ]
  },

  onShow() {
    this.setData({ userInfo: app.globalData.userInfo })
    this.buildEntries()
    if (H.MALL_ENABLED) {
      this.refreshCart()
      this.refreshStats()
    } else {
      this.setStat('order', '—')
    }
  },

  // 入口列表按开关动态构建（提审态无任何商城入口）
  buildEntries() {
    const entries = [
      { name: '我的收藏', desc: '诗词 · 壁纸 · 表情', icon: '⭐', color: '#0F6E56', bg: '#E1F5EE', url: '/packageContent/pages/favorites/favorites' }
    ]
    if (H.MALL_ENABLED) {
      entries.push(
        { name: '我的订单', desc: '查看物流与状态', icon: '📦', color: '#1F5E9E', bg: '#E5EFFA', url: '/packageMall/pages/order/order' },
        { name: '购物车', desc: '待结算好物', icon: '🛒', color: '#993C1D', bg: '#FAECE7', badge: true, url: '/packageMall/pages/cart/cart' }
      )
    }
    this.setData({ entries })
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
    if (H.MALL_ENABLED) {
      request({ url: '/api/orders' }).then(res => {
        this.setStat('order', res.items ? res.items.length : 0)
      }).catch(() => {})
    }
  },

  setStat(key, num) {
    const stats = this.data.stats.map(s => s.key === key ? Object.assign({}, s, { num }) : s)
    this.setData({ stats })
  },

  goEntry(e) {
    const url = e.currentTarget.dataset.url
    if (url) wx.navigateTo({ url })
  },

  // 彩蛋：提审态下连点脚注 5 次唤出商城直达（仅本次会话有效，不落盘）
  onEggTap() {
    if (H.MALL_ENABLED) return
    this._eggCount = (this._eggCount || 0) + 1
    if (this._eggCount < 5) {
      if (this._eggCount >= 3) wx.showToast({ title: '再点 ' + (5 - this._eggCount) + ' 次…', icon: 'none' })
      return
    }
    this._eggCount = 0
    wx.showActionSheet({
      itemList: ['🛍️ 进入演示商城（仅本次会话）'],
      success: (res) => {
        if (res.tapIndex === 0) wx.navigateTo({ url: '/packageMall/pages/goods/goods' })
      }
    })
  }
})

