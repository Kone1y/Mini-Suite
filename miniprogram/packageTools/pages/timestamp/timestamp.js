const L = require('../../timestamp-logic')

Page({
  data: {
    tsInput: '',
    tsParts: null,
    tsError: '',
    y: '', mo: '', d: '', h: '', mi: '', s: '',
    tsResult: null,
    dateError: ''
  },

  onTsInput(e) { this.setData({ tsInput: e.detail.value }) },
  convertTs() {
    const raw = this.data.tsInput.trim()
    const ts = Number(raw)
    if (!raw || !Number.isFinite(ts)) {
      this.setData({ tsParts: null, tsError: '请输入数字时间戳' })
      return
    }
    const parts = L.tsToParts(ts)
    if (!parts) {
      this.setData({ tsParts: null, tsError: '时间戳无效' })
      return
    }
    this.setData({ tsParts: parts, tsError: '' })
  },
  fillNow() {
    const n = L.nowTs()
    this.setData({ tsInput: String(n.seconds), tsParts: L.tsToParts(n.seconds), tsError: '' })
  },

  onField(e) {
    const f = e.currentTarget.dataset.f
    this.setData({ [f]: e.detail.value })
  },
  toTs() {
    const f = k => parseInt(this.data[k], 10)
    const y = f('y'), mo = f('mo'), d = f('d')
    if (![y, mo, d].every(Number.isFinite)) {
      this.setData({ tsResult: null, dateError: '请至少填写年/月/日' })
      return
    }
    const h = Number.isFinite(f('h')) ? f('h') : 0
    const mi = Number.isFinite(f('mi')) ? f('mi') : 0
    const s = Number.isFinite(f('s')) ? f('s') : 0
    const r = L.dateToTs(y, mo, d, h, mi, s)
    if (!r) {
      this.setData({ tsResult: null, dateError: '日期无效' })
      return
    }
    this.setData({ tsResult: r, dateError: '' })
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
