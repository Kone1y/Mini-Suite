const { request } = require('../../../utils/request')
const app = getApp()

Page({
  data: {
    items: [],
    loading: true
  },

  onLoad() {
    this.load()
  },

  load() {
    request({
      url: '/api/media',
      data: { type: 'emoji' }
    }).then(res => {
      this.setData({ items: res.items || [], loading: false })
      this.allUrls = (res.items || []).map(i => app.globalData.apiBase + i.path)
    }).catch(() => this.setData({ loading: false }))
  },

  preview(e) {
    const path = e.currentTarget.dataset.path
    wx.previewImage({
      current: app.globalData.apiBase + path,
      urls: this.allUrls || []
    })
  },

  save(e) {
    const path = e.currentTarget.dataset.path
    wx.showLoading({ title: '下载中' })
    wx.downloadFile({
      url: app.globalData.apiBase + path,
      success: (res) => {
        wx.hideLoading()
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => wx.showToast({ title: '已保存', icon: 'success' }),
          fail: () => wx.showToast({ title: '未授权相册', icon: 'none' })
        })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '下载失败', icon: 'none' })
      }
    })
  },

  fav(e) {
    const path = e.currentTarget.dataset.path
    request({
      url: '/api/favorite',
      method: 'POST',
      data: { kind: 'emoji', ref_id: path }
    }).then(res => {
      wx.showToast({ title: res.already ? '已在收藏' : '已收藏', icon: 'none' })
    })
  }
})
