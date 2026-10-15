const { request } = require('../../../utils/request')

const STATUS = {
  pending: { text: '待付款', color: '#854F0B', bg: '#FAEEDA' },
  paid: { text: '已付款', color: '#0F6E56', bg: '#E1F5EE' },
  shipped: { text: '已发货', color: '#185FA5', bg: '#E6F1FB' },
  done: { text: '已完成', color: '#534AB7', bg: '#EEEDFE' },
  closed: { text: '已取消', color: '#888780', bg: '#F1EFE8' }
}

Page({
  data: {
    orders: [],
    loading: true
  },

  onShow() {
    this.load()
  },

  onPullDownRefresh() {
    this.load(() => wx.stopPullDownRefresh())
  },

  load(done) {
    request({
      url: '/api/orders'
    }).then(res => {
      const orders = (res.items || []).map(o => Object.assign({}, o, {
        statusText: (STATUS[o.status] || {}).text || o.status,
        statusColor: (STATUS[o.status] || {}).color || '#2C2C2A',
        statusBg: (STATUS[o.status] || {}).bg || '#F1EFE8'
      }))
      this.setData({ orders, loading: false })
    }).catch(() => this.setData({ loading: false }))
      .finally(() => done && done())
  },

  goDetail(e) {
    wx.navigateTo({ url: '/packageMall/pages/order-detail/order-detail?no=' + e.currentTarget.dataset.no })
  },

  pay(e) {
    const no = e.currentTarget.dataset.no
    request({
      url: '/api/order/' + no + '/pay',
      method: 'POST'
    }).then(() => {
      wx.showToast({ title: '支付成功', icon: 'success' })
      this.load()
    })
  },

  cancel(e) {
    const no = e.currentTarget.dataset.no
    wx.showModal({
      title: '取消订单',
      content: '确定取消该订单？',
      success: (m) => {
        if (m.confirm) {
          request({
            url: '/api/order/' + no + '/cancel',
            method: 'POST'
          }).then(() => this.load())
        }
      }
    })
  }
})
