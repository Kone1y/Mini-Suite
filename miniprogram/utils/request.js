// 统一请求封装：自动拼 apiBase、带 openid、统一错误提示
// 注意：getApp() 必须在函数内调用——app.js 顶层 require 本模块时 App() 尚未执行，
// 模块级调用会拿到 undefined 并永久缓存，导致所有请求失败
function request(options) {
  const app = getApp()
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.apiBase + options.url,
      method: options.method || 'GET',
      data: Object.assign(
        { openid: app.globalData.openid },
        options.data || {}
      ),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          const msg = (res.data && res.data.detail) || ('请求失败 ' + res.statusCode)
          wx.showToast({ title: msg, icon: 'none' })
          reject(new Error(msg))
        }
      },
      fail(err) {
        wx.showToast({ title: '后端未启动或不可达', icon: 'none' })
        reject(err)
      }
    })
  })
}

// 后端静态资源路径转绝对 URL：/static/xxx -> http://host/static/xxx
// 小程序 image 组件不会自动拼域名，直接把后端相对路径塞 src 会被当包内本地资源（500）
function absUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//.test(path) || /^wxfile:/.test(path)) return path
  const app = getApp()
  return app.globalData.apiBase + path
}

module.exports = { request, absUrl }
