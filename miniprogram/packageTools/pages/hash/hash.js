const L = require('./hash-logic')

const ALGOS = [
  { key: 'md5', label: 'MD5', len: 32 },
  { key: 'sha1', label: 'SHA-1', len: 40 },
  { key: 'sha256', label: 'SHA-256', len: 64 }
]

Page({
  data: {
    input: '',
    algos: ALGOS,
    algo: 'sha256',
    output: '',
    msg: '',
    msgType: ''   // 'ok' | 'err'
  },

  onInput(e) { this.setData({ input: e.detail.value }) },

  setAlgo(e) {
    const algo = e.currentTarget.dataset.algo
    this.setData({ algo })
    if (this.data.input) this.compute()
  },

  compute() {
    const input = this.data.input
    if (!input) {
      this.setData({ output: '', msg: '请先输入文本', msgType: 'err' })
      return
    }
    const out = L.hashText(input, this.data.algo)
    this.setData({ output: out, msg: this.data.algo.toUpperCase() + ' 计算完成 · ' + out.length + ' 位', msgType: 'ok' })
  },

  copy() {
    if (!this.data.output) return
    wx.setClipboardData({ data: this.data.output })
  },

  clear() {
    this.setData({ input: '', output: '', msg: '', msgType: '' })
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
