const C = require('../../color-logic')

Page({
  data: {
    hex: '#534AB7',
    rgbText: '83, 74, 183',
    hslText: '245, 42%, 50%',
    // RGB 滑杆
    r: 83, g: 74, b: 183,
    // 预览
    previewBg: '#534AB7',
    previewTextLight: true,   // 亮底黑字/暗底白字
    history: []
  },

  onLoad() { this.syncFromRgb(83, 74, 183) },

  // ---- HEX 输入 ----
  // 输入时：原样镜像 + 实时更新 RGB/HSL，但绝不重写 HEX 框（避免删除简写 #555 被展开回 #555555）
  onHexInput(e) {
    const v = e.detail.value
    this.setData({ hex: v })
    const rgb = C.hexToRgb(v)
    if (rgb) this.syncFromRgb(rgb.r, rgb.g, rgb.b, false, 'hex')
  },
  onHexBlur(e) {
    const rgb = C.hexToRgb(e.detail.value)
    if (rgb) this.syncFromRgb(rgb.r, rgb.g, rgb.b, true)  // 失焦时规范化
  },

  // ---- RGB 文本输入 ----
  onRgbInput(e) {
    const v = String(e.detail.value || '').trim()
    const m = v.match(/^(\d{1,3})\s*[,，\s]\s*(\d{1,3})\s*[,，\s]\s*(\d{1,3})$/)
    this.setData({ rgbText: v })
    if (m) {
      const r = Math.min(255, +m[1]), g = Math.min(255, +m[2]), b = Math.min(255, +m[3])
      this.syncFromRgb(r, g, b, false, 'rgb')
    }
  },
  onRgbBlur(e) {
    const m = String(e.detail.value || '').trim().match(/^(\d{1,3})\s*[,，\s]\s*(\d{1,3})\s*[,，\s]\s*(\d{1,3})$/)
    if (m) this.syncFromRgb(Math.min(255, +m[1]), Math.min(255, +m[2]), Math.min(255, +m[3]), true)
  },

  // ---- HSL 文本输入 ----
  onHslInput(e) {
    const v = String(e.detail.value || '').trim()
    const m = v.match(/^(\d{1,3})\s*[,，\s]\s*(\d{1,3})\s*[%％]\s*[,，\s]\s*(\d{1,3})\s*[%％]$/)
    this.setData({ hslText: v })
    if (m) {
      const rgb = C.hslToRgb(+m[1], +m[2], +m[3])
      this.syncFromRgb(rgb.r, rgb.g, rgb.b, false, 'hsl')
    }
  },
  onHslBlur(e) {
    const m = String(e.detail.value || '').trim().match(/^(\d{1,3})\s*[,，\s]\s*(\d{1,3})\s*[%％]\s*[,，\s]\s*(\d{1,3})\s*[%％]$/)
    if (m) {
      const rgb = C.hslToRgb(+m[1], +m[2], +m[3])
      this.syncFromRgb(rgb.r, rgb.g, rgb.b, true)
    }
  },

  // ---- RGB 滑杆：拖动不记录、松手入历史 ----
  onRDrag(e) { this.syncFromRgb(+e.detail.value, this.data.g, this.data.b, false) },
  onGDrag(e) { this.syncFromRgb(this.data.r, +e.detail.value, this.data.b, false) },
  onBDrag(e) { this.syncFromRgb(this.data.r, this.data.g, +e.detail.value, false) },
  onRSet(e) { this.syncFromRgb(+e.detail.value, this.data.g, this.data.b, true) },
  onGSet(e) { this.syncFromRgb(this.data.r, +e.detail.value, this.data.b, true) },
  onBSet(e) { this.syncFromRgb(this.data.r, this.data.g, +e.detail.value, true) },

  // ---- 核心：从 RGB 同步所有表示 ----
  // lock: 输入过程中锁定正在编辑的文本框（'hex'|'rgb'|'hsl'|null），避免"输入即重写"导致删不动
  syncFromRgb(r, g, b, pushHistory = true, lock = null) {
    const hex = C.rgbToHex(r, g, b)
    const hsl = C.rgbToHsl(r, g, b)
    const lum = C.luminance(r, g, b)
    const patch = { r, g, b, previewBg: hex, previewTextLight: lum < 0.35 }
    if (lock !== 'hex') patch.hex = hex
    if (lock !== 'rgb') patch.rgbText = r + ', ' + g + ', ' + b
    if (lock !== 'hsl') patch.hslText = hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%'
    if (pushHistory) {
      const history = [hex].concat(this.data.history.filter(h => h !== hex)).slice(0, 8)
      patch.history = history
    }
    this.setData(patch)
  },

  randomColor() {
    const r = Math.floor(Math.random() * 256)
    const g = Math.floor(Math.random() * 256)
    const b = Math.floor(Math.random() * 256)
    this.syncFromRgb(r, g, b)
  },

  copyHex() {
    wx.setClipboardData({ data: this.data.hex })
  },
  copyRgb() {
    wx.setClipboardData({ data: 'rgb(' + this.data.rgbText + ')' })
  },
  copyHsl() {
    wx.setClipboardData({ data: 'hsl(' + this.data.hslText + ')' })
  },

  tapHistory(e) {
    const hex = e.currentTarget.dataset.hex
    const rgb = C.hexToRgb(hex)
    if (rgb) this.syncFromRgb(rgb.r, rgb.g, rgb.b, false)
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
