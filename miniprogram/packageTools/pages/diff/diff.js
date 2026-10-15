const L = require('../../diff-logic')

Page({
  data: {
    mode: 'text',          // 'text' | 'json'
    aText: '',
    bText: '',
    result: null,          // 文本模式: { edits, stats }；JSON 模式: { diffs }
    error: '',
    // 文本模式渲染数据（上下文折叠：只展示差异 ±3 行上下文）
    viewRows: [],
    collapsedCount: 0,
    statsView: null,
    // JSON 模式渲染
    jsonDiffs: [],
    jsonSummary: '',
    jsonSummary: ''
  },

  onA(e) { this.setData({ aText: e.detail.value }) },
  onB(e) { this.setData({ bText: e.detail.value }) },

  switchMode(e) {
    const m = e.currentTarget.dataset.m
    if (m === this.data.mode) return
    this.setData({ mode: m, result: null, viewRows: [], statsView: null, jsonDiffs: [], jsonSummary: '', error: '' })
  },

  run() {
    this.setData({ error: '' })
    if (this.data.mode === 'text') this.runText()
    else this.runJson()
  },

  runText() {
    const edits = L.diffLines(this.data.aText, this.data.bText)
    const stats = L.stats(edits)
    // 上下文折叠：等值连续段 > 8 行时只留前后 3 行
    const CTX = 3, KEEP = 8
    const rows = []
    let collapsed = 0
    let i = 0
    while (i < edits.length) {
      if (edits[i].type === 'equal') {
        // 找连续等值段
        let j = i
        while (j < edits.length && edits[j].type === 'equal') j++
        const len = j - i
        if (len > KEEP) {
          // 前 3 后 3
          for (let k = i; k < i + CTX; k++) rows.push(this.rowOf(edits[k]))
          collapsed += len - CTX * 2
          rows.push({ type: 'skip', count: len - CTX * 2 })
          for (let k = j - CTX; k < j; k++) rows.push(this.rowOf(edits[k]))
        } else {
          for (let k = i; k < j; k++) rows.push(this.rowOf(edits[k]))
        }
        i = j
      } else {
        rows.push(this.rowOf(edits[i]))
        i++
      }
    }
    const statsView = stats.added + stats.removed === 0
      ? '完全一致 ✓'
      : '+' + stats.added + ' 行 · −' + stats.removed + ' 行 · 相似度 ' + stats.similarity + '%'
    this.setData({ viewRows: rows, collapsedCount: collapsed, statsView, result: { edits, stats }, jsonDiffs: [] })
  },

  rowOf(e) {
    return {
      type: e.type,
      text: e.line === '' ? ' ' : e.line,   // 空行占位避免塌陷
      oldNo: e.oldNo === null ? '' : e.oldNo,
      newNo: e.newNo === null ? '' : e.newNo
    }
  },

  runJson() {
    const r = L.diffJson(this.data.aText, this.data.bText)
    if (r.error) {
      this.setData({ error: r.error, jsonDiffs: [], viewRows: [], statsView: null })
      return
    }
    const counts = { added: 0, removed: 0, changed: 0, 'type-changed': 0 }
    for (const d of r.diffs) counts[d.type]++
    const parts = []
    if (counts.added) parts.push('+' + counts.added)
    if (counts.removed) parts.push('−' + counts.removed)
    if (counts.changed) parts.push('改 ' + counts.changed)
    if (counts['type-changed']) parts.push('类型 ' + counts['type-changed'])
    const jsonSummary = parts.length ? parts.join(' · ') : '完全一致 ✓'
    this.setData({ jsonDiffs: r.diffs, jsonSummary, viewRows: [], statsView: null, result: r })
  },

  copyResult() {
    if (!this.data.result) return   // 无结果防御
    let out = ''
    if (this.data.mode === 'text') {
      out = this.data.result.edits.map(e =>
        (e.type === 'add' ? '+ ' : e.type === 'remove' ? '- ' : '  ') + e.line
      ).join('\n')
    } else {
      out = this.data.jsonDiffs.map(d => d.path + ': ' + d.type + ' (' + d.oldVal + ' → ' + d.newVal + ')').join('\n')
    }
    if (out) wx.setClipboardData({ data: out })
  },

  // 示例数据（快速体验）
  loadDemo() {
    if (this.data.mode === 'text') {
      this.setData({
        aText: 'const greet = (name) => {\n  console.log("hello " + name)\n}\ngreet("world")\n// end',
        bText: 'const greet = (name) => {\n  console.log(`hello ${name}`)\n  console.log("bye")\n}\ngreet("world")\n// done'
      })
    } else {
      this.setData({
        aText: '{\n  "name": "mini-suite",\n  "version": "1.0.0",\n  "deps": {\n    "fastapi": "^0.100"\n  },\n  "tags": ["tools", "games"]\n}',
        bText: '{\n  "name": "mini-suite",\n  "version": "1.1.0",\n  "deps": {\n    "fastapi": "^0.110",\n    "uvicorn": "^0.23"\n  },\n  "tags": ["tools", "games", "utils"]\n}'
      })
    }
  },

  clear() {
    this.setData({ aText: '', bText: '', result: null, viewRows: [], statsView: null, jsonDiffs: [], error: '' })
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
