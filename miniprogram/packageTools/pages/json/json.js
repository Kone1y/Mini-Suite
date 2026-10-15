const L = require('../../json-logic')

Page({
  data: {
    input: '',
    output: '',
    msg: '',
    msgType: ''   // 'ok' | 'err'
  },

  onInput(e) { this.setData({ input: e.detail.value }) },

  doFormat() {
    const r = L.format(this.data.input)
    if (!r.ok) return this.showErr(r)
    this.setData({ output: r.pretty, msg: '格式化成功', msgType: 'ok' })
  },
  doMinify() {
    const r = L.minify(this.data.input)
    if (!r.ok) return this.showErr(r)
    this.setData({ output: r.minified, msg: '已压缩', msgType: 'ok' })
  },
  doValidate() {
    const r = L.validate(this.data.input)
    if (!r.ok) return this.showErr(r)
    this.setData({ output: this.data.input, msg: 'JSON 合法 ✓', msgType: 'ok' })
  },

  showErr(r) {
    let m = '解析失败：' + r.error
    if (r.line != null) m += '（第 ' + r.line + ' 行，第 ' + r.col + ' 列）'
    this.setData({ output: '', msg: m, msgType: 'err' })
  },

  copy() {
    if (!this.data.output) return
    wx.setClipboardData({ data: this.data.output })
  },
  clear() { this.setData({ input: '', output: '', msg: '', msgType: '' }) },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
