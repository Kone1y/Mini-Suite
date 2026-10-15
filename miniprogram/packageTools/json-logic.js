// JSON 工具核心逻辑（纯函数，可单测）
// 兼容两种运行时报错格式：
//   旧 V8 / JSC（小程序真机）: "Unexpected token b in JSON at position 8"
//   新 V8 (Node 20+): "... at position 11 (line 3 column 1)" 或无位置的 "Unexpected token 'x', \"...\" is not valid JSON"
function parseWithPos(str) {
  try {
    const value = JSON.parse(str)
    return { ok: true, value }
  } catch (e) {
    const msg = e.message || String(e)
    let pos = null
    let line = null, col = null
    // 优先直接提取 line/column（新 V8）
    const ml = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i)
    if (ml) {
      line = parseInt(ml[1], 10)
      col = parseInt(ml[2], 10)
    }
    // 从 position 计算行列（旧 V8/JSC 或新 V8 未带 line 时）
    const m = msg.match(/position\s+(\d+)/i)
    if (m) {
      pos = parseInt(m[1], 10)
      if (line == null) {
        const before = str.slice(0, pos)
        const lines = before.split('\n')
        line = lines.length
        col = lines[lines.length - 1].length + 1
      }
    }
    // 兜底：新 V8「Unexpected token 'x'」无 position —— 用出错 token 在源串中首次定位（尽力而为）
    if (line == null) {
      const mt = msg.match(/Unexpected (?:token|identifier) '([^']*)'/i)
      if (mt) {
        const token = mt[1]
        const i = str.indexOf(token)
        if (i >= 0) {
          pos = i
          const before = str.slice(0, pos)
          const lines = before.split('\n')
          line = lines.length
          col = lines[lines.length - 1].length + 1
        }
      }
    }
    return { ok: false, error: msg, line, col, pos }
  }
}

function format(str) {
  const v = parseWithPos(str)
  if (!v.ok) return v
  let pretty
  try {
    pretty = JSON.stringify(v.value, null, 2)
  } catch (e) {
    return { ok: false, error: '序列化失败：' + (e.message || e) }
  }
  return { ok: true, value: v.value, pretty }
}

function minify(str) {
  const v = parseWithPos(str)
  if (!v.ok) return v
  return { ok: true, value: v.value, minified: JSON.stringify(v.value) }
}

function validate(str) {
  return parseWithPos(str)
}

module.exports = { format, minify, validate, parseWithPos }
