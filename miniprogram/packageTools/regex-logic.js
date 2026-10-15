// 正则测试核心逻辑（纯函数，可单测）
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// 运行正则，返回所有匹配（含捕获组）
function runRegex(pattern, flags, text) {
  if (!pattern) return { ok: false, error: '请输入正则表达式' }
  let re
  try {
    re = new RegExp(pattern, flags)
  } catch (e) {
    return { ok: false, error: '正则语法错误：' + (e.message || e) }
  }
  const matches = []
  if (!re.global) {
    const m = re.exec(text)
    if (m) matches.push(buildMatch(m))
  } else {
    let m
    let guard = 0
    while ((m = re.exec(text)) !== null) {
      matches.push(buildMatch(m))
      if (m.index === re.lastIndex) re.lastIndex++   // 避免零宽匹配死循环
      if (++guard > 10000) break
    }
  }
  return { ok: true, matches, count: matches.length }
}

function buildMatch(m) {
  return {
    index: m.index,
    value: m[0],
    groups: m.slice(1).map((g, i) => ({ i: i + 1, value: g === undefined ? null : g }))
  }
}

// 生成高亮 HTML（<mark> 标匹配，带内联样式确保 rich-text 渲染）
function highlight(pattern, flags, text) {
  const r = runRegex(pattern, flags, text)
  if (!r.ok) return r
  if (!r.count) return { ok: true, count: 0, html: escapeHtml(text) }
  const spans = []
  let cursor = 0
  for (const m of r.matches) {
    const start = m.index
    const end = start + m.value.length
    if (start > cursor) spans.push(escapeHtml(text.slice(cursor, start)))
    spans.push('<mark style="background:#FFE08A;color:#333;border-radius:3px;padding:0 2px;">' + escapeHtml(m.value) + '</mark>')
    cursor = end
  }
  if (cursor < text.length) spans.push(escapeHtml(text.slice(cursor)))
  return { ok: true, count: r.count, html: spans.join('') }
}

module.exports = { runRegex, highlight, escapeHtml }
