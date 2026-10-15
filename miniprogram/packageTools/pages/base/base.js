const L = require('../../base-logic')

const BASE_OPTIONS = [2, 8, 10, 16, 36]
const BIT_OPS = ['&', '|', '^', '<<', '>>', '~']

Page({
  data: {
    inputVal: '255',
    baseIdx: 2,                 // 默认 10 进制
    baseOptions: BASE_OPTIONS,
    conversions: [],
    convError: '',

    aVal: '170',
    bVal: '85',
    bitOpIdx: 0,
    bitOps: BIT_OPS,
    bitOpText: '&',
    bitResults: null,
    bitError: '',

    charInput: 'A',
    charInfo: null,
    codeInput: '65',
    codeInfo: null
  },

  onLoad() {
    this.recalcBase()
    this.recalcBit()
    this.recalcChar()
    this.recalcCode()
  },

  onInputVal(e) { this.setData({ inputVal: e.detail.value }); this.recalcBase() },
  onPickBase(e) { this.setData({ baseIdx: +e.detail.value }); this.recalcBase() },
  recalcBase() {
    const base = BASE_OPTIONS[this.data.baseIdx]
    const parsed = L.fromBase(this.data.inputVal, base)
    if (!parsed.ok) {
      this.setData({ conversions: [], convError: parsed.error })
      return
    }
    const v = parsed.value
    const conversions = BASE_OPTIONS.filter(b => b !== base).map(b => ({ base: b, text: L.toBase(v, b) }))
    this.setData({ conversions, convError: '' })
  },

  onA(e) { this.setData({ aVal: e.detail.value }); this.recalcBit() },
  onB(e) { this.setData({ bVal: e.detail.value }); this.recalcBit() },
  onPickBitOp(e) {
    const idx = +e.detail.value
    this.setData({ bitOpIdx: idx, bitOpText: BIT_OPS[idx] })
    this.recalcBit()
  },
  recalcBit() {
    const a = parseInt(this.data.aVal, 10)
    const b = parseInt(this.data.bVal, 10)
    const op = BIT_OPS[this.data.bitOpIdx]
    if (!Number.isFinite(a) || (!Number.isFinite(b) && op !== '~')) {
      this.setData({ bitResults: null, bitError: '请输入整数' })
      return
    }
    const r = L.bitwise(a, b, op)
    this.setData({
      bitResults: {
        dec: r,
        hex: '0x' + (r >>> 0).toString(16).toUpperCase(),
        bin: (r >>> 0).toString(2),
        aBin: (a >>> 0).toString(2),
        bBin: (b >>> 0).toString(2)
      },
      bitError: ''
    })
  },

  onChar(e) { this.setData({ charInput: e.detail.value }); this.recalcChar() },
  recalcChar() {
    const info = L.charToCode(this.data.charInput)
    this.setData({ charInfo: info })
  },
  onCode(e) { this.setData({ codeInput: e.detail.value }); this.recalcCode() },
  recalcCode() {
    const info = L.codeToChar(this.data.codeInput)
    this.setData({ codeInfo: info })
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
