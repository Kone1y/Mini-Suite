const KEY = 'ledger_records'
const EXPENSE_CATS = ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '学习', '其他']
const INCOME_CATS = ['工资', '兼职', '理财', '红包', '其他']

function pad2(n) { return String(n).padStart(2, '0') }
function nowMonth() { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) }
function monthOf(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) }
function fmtDate(ts) {
  const d = new Date(ts)
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

Page({
  data: {
    type: 'out',
    expenseCats: EXPENSE_CATS,
    incomeCats: INCOME_CATS,
    cats: EXPENSE_CATS,
    category: '餐饮',
    amount: '',
    note: '',
    month: '',
    monthLabel: '',
    summary: { in: 0, out: 0, bal: 0 },
    list: [],
    bars: []
  },

  onLoad() {
    this._records = this.loadRecords()
    this.setData({ month: nowMonth() })
    this.recompute()
  },

  loadRecords() {
    try { return JSON.parse(wx.getStorageSync(KEY) || '[]') } catch (e) { return [] }
  },
  saveRecords() {
    try { wx.setStorageSync(KEY, JSON.stringify(this._records || [])) } catch (e) { }
  },

  onType(e) {
    const t = e.currentTarget.dataset.type
    const cats = t === 'out' ? EXPENSE_CATS : INCOME_CATS
    this.setData({ type: t, cats, category: cats[0] })
  },
  onAmount(e) { this.setData({ amount: e.detail.value }) },
  onNote(e) { this.setData({ note: e.detail.value }) },
  onCat(e) { this.setData({ category: e.currentTarget.dataset.cat }) },

  prevMonth() {
    const [y, mo] = this.data.month.split('-').map(Number)
    let ny = y, nmo = mo - 1
    if (nmo < 1) { nmo = 12; ny-- }
    this.setData({ month: ny + '-' + pad2(nmo) })
    this.recompute()
  },
  nextMonth() {
    const [y, mo] = this.data.month.split('-').map(Number)
    let ny = y, nmo = mo + 1
    if (nmo > 12) { nmo = 1; ny++ }
    const nm = ny + '-' + pad2(nmo)
    if (nm > nowMonth()) return
    this.setData({ month: nm })
    this.recompute()
  },

  add() {
    const amount = parseFloat(this.data.amount)
    if (!(amount > 0)) { wx.showToast({ title: '金额无效', icon: 'none' }); return }
    const rec = {
      id: Date.now() + '_' + Math.floor(Math.random() * 1e4),
      type: this.data.type,
      amount: Math.round(amount * 100) / 100,
      category: this.data.category,
      note: this.data.note,
      ts: Date.now()
    }
    this._records.unshift(rec)
    this.saveRecords()
    this.setData({ amount: '', note: '' })
    this.recompute()
    wx.showToast({ title: '已记录', icon: 'success' })
  },

  del(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除',
      content: '确定删除这条记录？',
      success: (r) => {
        if (r.confirm) {
          this._records = this._records.filter(x => x.id !== id)
          this.saveRecords()
          this.recompute()
        }
      }
    })
  },

  recompute() {
    const month = this.data.month
    const inMonth = this._records.filter(r => monthOf(r.ts) === month)
    let sin = 0, sout = 0
    for (const r of inMonth) { if (r.type === 'in') sin += r.amount; else sout += r.amount }
    const list = inMonth.slice().sort((a, b) => b.ts - a.ts).map(r => ({
      ...r,
      date: fmtDate(r.ts),
      amountText: (r.type === 'in' ? '+' : '-') + r.amount.toFixed(2)
    }))
    this.setData({
      monthLabel: month,
      summary: { in: sin, out: sout, bal: sin - sout },
      list,
      bars: this.computeBars(month)
    })
  },

  computeBars(curMonth) {
    const [y, mo] = curMonth.split('-').map(Number)
    const months = []
    for (let i = 5; i >= 0; i--) {
      let yy = y, mm = mo - i
      while (mm < 1) { mm += 12; yy-- }
      months.push(yy + '-' + pad2(mm))
    }
    const agg = months.map(m => {
      let i = 0, o = 0
      for (const r of this._records) {
        if (monthOf(r.ts) === m) { if (r.type === 'in') i += r.amount; else o += r.amount }
      }
      return { m, in: i, out: o }
    })
    const max = Math.max(1, ...agg.map(a => Math.max(a.in, a.out)))
    return agg.map(a => ({
      label: a.m.slice(2),
      inH: Math.round(a.in / max * 100),
      outH: Math.round(a.out / max * 100),
      inA: a.in.toFixed(0),
      outA: a.out.toFixed(0),
      zero: a.in === 0 && a.out === 0
    }))
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
