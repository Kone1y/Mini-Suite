const QRCode = require('../../weapp-qrcode')

const HISTORY_KEY = 'qrgen_history'
const MAX_HISTORY = 10

Page({
  data: {
    text: '',
    size: 260,
    darkColor: '#000000',
    lightColor: '#ffffff',
    generated: false,
    history: []
  },

  onLoad(options) {
    this.loadHistory()
    // 从扫码页/历史回填
    if (options && options.text) {
      this.setData({ text: decodeURIComponent(options.text) })
    }
  },

  loadHistory() {
    const h = wx.getStorageSync(HISTORY_KEY) || []
    this.setData({ history: h })
  },

  saveToHistory(text) {
    let h = wx.getStorageSync(HISTORY_KEY) || []
    h = h.filter(it => it !== text)
    h.unshift(text)
    if (h.length > MAX_HISTORY) h = h.slice(0, MAX_HISTORY)
    wx.setStorageSync(HISTORY_KEY, h)
    this.setData({ history: h })
  },

  clearHistory() {
    if (!this.data.history.length) return
    wx.showModal({
      title: '清空历史',
      content: '确定清空全部生成历史吗？',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync(HISTORY_KEY, [])
          this.setData({ history: [] })
        }
      }
    })
  },

  useHistory(e) {
    const text = e.currentTarget.dataset.text
    this.setData({ text }, () => this.generate())
  },

  onTextinput(e) {
    this.setData({ text: e.detail.value })
  },

  onSizeChange(e) {
    this.setData({ size: e.detail.value })
  },

  onDarkColor(e) {
    this.setData({ darkColor: e.detail.value })
  },

  onLightColor(e) {
    this.setData({ lightColor: e.detail.value })
  },

  generate() {
    const text = (this.data.text || '').trim()
    if (!text) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    this.saveToHistory(text)
    const draw = () => {
      this.qrcode = new QRCode('qrcanvas', {
        text,
        width: this.data.size,
        height: this.data.size,
        colorDark: this.data.darkColor,
        colorLight: this.data.lightColor,
        correctLevel: QRCode.CorrectLevel.H
      })
    }
    if (!this.data.generated) {
      // canvas 是 wx:if 条件渲染：先让节点渲染出来再绘制，否则首次画到不存在的 canvas 上
      this.setData({ generated: true }, () => setTimeout(draw, 50))
    } else {
      draw()
    }
  },

  save() {
    if (!this.qrcode) {
      wx.showToast({ title: '请先生成二维码', icon: 'none' })
      return
    }
    this.qrcode.exportImage((tempPath) => {
      wx.saveImageToPhotosAlbum({
        filePath: tempPath,
        success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
        fail: (err) => {
          if (err.errMsg && err.errMsg.includes('auth')) {
            wx.showToast({ title: '请在设置中授权相册', icon: 'none' })
          }
        }
      })
    })
  }
})
