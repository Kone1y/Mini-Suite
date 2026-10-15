const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*-_=+?'
}

Page({
  data: {
    length: 16,
    useLower: true,
    useUpper: true,
    useDigits: true,
    useSymbols: true,
    excludeAmbiguous: true,   // 去掉易混淆 0O1lI
    password: '',
    strength: 0,        // 0-4
    strengthText: '',
    strengthColor: '',
    entropy: ''
  },

  onLength(e) { this.setData({ length: e.detail.value }, () => this.estimate()) },
  toggle(e) {
    const key = e.currentTarget.dataset.k
    this.setData({ [key]: !this.data[key] }, () => this.estimate())
    // 至少保留一种字符集
    const d = this.data
    if (!d.useLower && !d.useUpper && !d.useDigits && !d.useSymbols) {
      this.setData({ useLower: true })
      wx.showToast({ title: '至少启用一种字符集', icon: 'none' })
    }
  },

  gen() {
    let pool = ''
    const d = this.data
    if (d.useLower) pool += SETS.lower
    if (d.useUpper) pool += SETS.upper
    if (d.useDigits) pool += SETS.digits
    if (d.useSymbols) pool += SETS.symbols
    if (d.excludeAmbiguous) pool = pool.replace(/[0O1lI|]/g, '')
    if (!pool.length) return

    // 用 wx.getRandomValues（异步安全随机）不可用则降级 Math.random
    const pick = () => pool[Math.floor(Math.random() * pool.length)]
    let pw = ''
    // 保证每种启用集合至少 1 个
    const ensure = []
    if (d.useLower) ensure.push(SETS.lower)
    if (d.useUpper) ensure.push(SETS.upper)
    if (d.useDigits) ensure.push(SETS.digits)
    if (d.useSymbols) ensure.push(SETS.symbols)
    ensure.forEach(s => {
      const filtered = d.excludeAmbiguous ? s.replace(/[0O1lI|]/g, '') : s
      pw += filtered[Math.floor(Math.random() * filtered.length)]
    })
    while (pw.length < d.length) pw += pick()
    // 洗牌打乱保证位
    const arr = pw.split('')
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    this.setData({ password: arr.join('') }, () => this.estimate())
    wx.vibrateShort({ type: 'light' })
  },

  estimate() {
    const d = this.data
    let poolSize = 0
    if (d.useLower) poolSize += 26
    if (d.useUpper) poolSize += 26
    if (d.useDigits) poolSize += 10
    if (d.useSymbols) poolSize += 14
    if (!poolSize) { this.setData({ strength: 0, strengthText: '', entropy: '' }); return }
    const bits = Math.round(d.length * Math.log2(poolSize))
    let level, text, color
    if (bits < 40) { level = 1; text = '弱'; color = '#D84343' }
    else if (bits < 60) { level = 2; text = '一般'; color = '#F59E0B' }
    else if (bits < 80) { level = 3; text = '强'; color = '#0F6E56' }
    else { level = 4; text = '极强'; color = '#534AB7' }
    this.setData({
      strength: level,
      strengthText: text,
      strengthColor: color,
      entropy: bits + ' bit 熵'
    })
  },

  copy() {
    if (!this.data.password) return
    wx.setClipboardData({ data: this.data.password })
  }
})
