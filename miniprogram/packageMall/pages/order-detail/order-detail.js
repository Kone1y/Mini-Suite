const { request } = require('../../../utils/request')

const STATUS = {
  pending: '待付款', paid: '已付款', shipped: '已发货', done: '已完成', closed: '已取消'
}

Page({
  data: {
    order: null,
    statusText: ''
  },

  onLoad(options) {
    this.no = options.no
    this.needPay = options.pay === '1'
    this.load()
  },

  load() {
    request({
      url: '/api/order/' + this.no
    }).then(order => {
      this.setData({
        order,
        statusText: STATUS[order.status] || order.status
      })
      // 从下单弹窗直达时自动拉起支付
      if (this.needPay && order.status === 'pending') {
        this.needPay = false
        this.pay()
      }
    })
  },

  pay() {
    request({
      url: '/api/order/' + this.no + '/pay',
      method: 'POST'
    }).then(() => {
      wx.showToast({ title: '支付成功', icon: 'success' })
      this.load()
    })
  },

  cancel() {
    wx.showModal({
      title: '取消订单',
      content: '确定取消该订单？',
      success: (m) => {
        if (m.confirm) {
          request({
            url: '/api/order/' + this.no + '/cancel',
            method: 'POST'
          }).then(() => this.load())
        }
      }
    })
  }
})
