const { request } = require('./utils/request')

App({
  globalData: {
    // 后端地址：开发者工具本机调试用 localhost；真机预览改成电脑局域网 IP
    apiBase: 'http://localhost:8790',
    userInfo: null,
    openid: ''
  },
  onLaunch() {
    this.mockLogin()
  },
  // mock 登录：后端按 openid 生成/查找用户，不接真实 wx.login（个人主体演示态）
  mockLogin() {
    let openid = wx.getStorageSync('mock_openid')
    if (!openid) {
      openid = 'demo_' + Math.random().toString(36).slice(2, 10)
      wx.setStorageSync('mock_openid', openid)
    }
    this.globalData.openid = openid
    request({
      url: '/api/user/login',
      method: 'POST',
      data: { openid }
    }).then(res => {
      this.globalData.userInfo = res.data
    }).catch(() => {
      // 后端未启动时静默，各页面自行处理
    })
  }
})
