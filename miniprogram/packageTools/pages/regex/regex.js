const L = require('../../regex-logic')

Page({
  data: {
    pattern: '',
    flags: 'g',
    gOn: true, iOn: false, mOn: false,
    text: '',
    result: null,     // { ok, count, matches:[{index,value,groups}] }
    html: '',
    error: ''
  },

  onPattern(e) { this.setData({ pattern: e.detail.value }); this.run() },
  onText(e) { this.setData({ text: e.detail.value }); this.run() },

  toggleFlag(e) {
    const f = e.currentTarget.dataset.f
    let flags = this.data.flags
    flags = flags.indexOf(f) >= 0 ? flags.split('').filter(x => x !== f).join('') : (flags + f)
    const patch = { flags }
    if (f === 'g') patch.gOn = !this.data.gOn
    if (f === 'i') patch.iOn = !this.data.iOn
    if (f === 'm') patch.mOn = !this.data.mOn
    this.setData(patch)
    this.run()
  },

  run() {
    const r = L.runRegex(this.data.pattern, this.data.flags, this.data.text)
    if (!r.ok) {
      this.setData({ result: null, html: '', error: r.error })
      return
    }
    const h = L.highlight(this.data.pattern, this.data.flags, this.data.text)
    this.setData({ result: r, html: h.html || '', error: '' })
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
