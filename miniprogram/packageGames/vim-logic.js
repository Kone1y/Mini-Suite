// Vim 键位引擎：文本缓冲区 + 普通模式命令解析（motion + operator + count）
// 纯逻辑可单测。

function createState(lines, cursor) {
  return {
    lines: lines.slice(),            // string[]
    r: cursor ? cursor[0] : 0,       // 行
    c: cursor ? cursor[1] : 0,       // 列
    _history: [],                    // 撤销栈
    _reg: ''                         // 复制寄存器
  }
}

function cloneState(s) {
  return { lines: s.lines.slice(), r: s.r, c: s.c, _history: s._history, _reg: s._reg }
}

// 规范化（判定用）：文本 + 光标
function serialize(s) {
  return s.lines.join('\n') + '#' + s.r + ',' + s.c
}

// 光标夹紧到合法位置
function clampCursor(s) {
  if (s.lines.length === 0) s.lines = ['']
  s.r = Math.max(0, Math.min(s.r, s.lines.length - 1))
  const maxC = Math.max(0, s.lines[s.r].length - 1)   // vim 普通模式光标最大在 len-1（空行为 0）
  s.c = Math.max(0, Math.min(s.c, maxC))
}

// ---------- word motion 辅助 ----------
function charClass(ch) {
  if (/[a-zA-Z0-9_]/.test(ch)) return 'w'
  if (/\s/.test(ch)) return 's'
  return 'p'
}

// 找下一个词首（w）
function nextWordStart(s) {
  let c = s.c, r = s.r
  // 第一阶段：跳过当前词的字符（类相同的连续段）
  const line = s.lines[r] || ''
  if (c >= line.length) {
    // 光标在行尾虚拟位：直接去下一行
    r++; c = 0
    if (r >= s.lines.length) return null
  } else {
    const cls = charClass(line[c])
    while (c < line.length && charClass(line[c]) === cls) c++
    if (c >= line.length) {
      r++; c = 0
      if (r >= s.lines.length) return null
      // 跨行后：新行首字符若同类也不再继续跳（新词开始）——vim 语义里 w 计一次词
      return _skipSpacesAndReturn(r, c, s)
    }
  }
  return _skipSpacesAndReturn(r, c, s)
}

function _skipSpacesAndReturn(r, c, s) {
  while (true) {
    const line = s.lines[r] || ''
    if (c >= line.length) {
      r++; c = 0
      if (r >= s.lines.length) return null
      continue
    }
    if (charClass(line[c]) !== 's') return { r, c }
    c++
  }
}

// 当前词末（e）
function wordEnd(s) {
  let c = s.c + 1, r = s.r
  // 跳过空白
  while (true) {
    const ch = (s.lines[r] || '')[c]
    if (ch === undefined) { r++; c = 0; if (r >= s.lines.length) return null; continue }
    if (charClass(ch) !== 's') break
    c++
  }
  // 走到同类末尾
  const cls = charClass((s.lines[r] || '')[c] || ' ')
  while (true) {
    const next = (s.lines[r] || '')[c + 1]
    if (next === undefined || charClass(next) !== cls) break
    c++
  }
  return { r, c }
}

// 上一个词首（b）
function prevWordStart(s) {
  let c = s.c - 1, r = s.r
  if (c < 0) {
    if (r === 0) return { r: 0, c: 0 }
    r--; c = (s.lines[r] || '').length - 1
    if (c < 0) return { r, c: 0 }
  }
  // 跳过空白
  while (charClass((s.lines[r] || '')[c] || ' ') === 's') {
    c--
    if (c < 0) {
      if (r === 0) return { r: 0, c: 0 }
      r--; c = (s.lines[r] || '').length - 1
      if (c < 0) return { r, c: 0 }
    }
  }
  // 走到同类开头
  const cls = charClass((s.lines[r] || '')[c])
  while (c > 0 && charClass((s.lines[r] || '')[c - 1]) === cls) c--
  return { r, c }
}

// ---------- motion 解析 ----------
// 输入：key 序列（如 "w" "3w" "$" "0" "gg" "G" "f x"）
// 返回：{type:'move', to:{r,c}} 或 {type:'moveLines', delta} 或 null
function parseMotion(keys, s) {
  if (!keys.length) return null
  const k = keys[0]
  switch (k) {
    case 'h': return { type: 'move', to: { r: s.r, c: Math.max(0, s.c - 1) } }
    case 'l': return { type: 'move', to: { r: s.r, c: s.c + 1 } }   // clamp 在 apply 时
    case 'j': return { type: 'move', to: { r: s.r + 1, c: s.c } }
    case 'k': return { type: 'move', to: { r: s.r - 1, c: s.c } }
    case '0': return { type: 'move', to: { r: s.r, c: 0 } }
    case '$': return { type: 'move', to: { r: s.r, c: Math.max(0, (s.lines[s.r] || '').length - 1) } }
    case 'w': return { type: 'moveTo', finder: nextWordStart }
    case 'e': return { type: 'moveTo', finder: wordEnd }
    case 'b': return { type: 'moveTo', finder: prevWordStart }
    case 'g': return keys[1] === 'g' ? { type: 'move', to: { r: 0, c: 0 } } : null
    case 'G': return { type: 'move', to: { r: s.lines.length - 1, c: 0 } }
    case 'f':
      if (keys[1]) return { type: 'f', ch: keys[1] }
      return null
    default: return null
  }
}

// ---------- 删除/复制区域计算 ----------
// operator 作用区域：motion 目标与当前光标之间的字符（行内简化）
function regionBetween(s, from, to) {
  if (from.r !== to.r) return null   // 跨行删除简化为整行集合
  return { r: from.r, c0: Math.min(from.c, to.c), c1: Math.max(from.c, to.c) }
}

// ---------- 命令应用 ----------
// 输入完整按键序列（字符串，如 "dw" "3dd" "yy" "p" "x" "u" "2w" "f x"→"fx"）
// 返回 {ok, err?}；s 原地修改
function apply(s, input, history) {
  if (!history) history = s._history
  const keys = input.split('')
  let i = 0
  // count 前缀
  let count = 1
  const numMatch = input.match(/^(\d+)(.*)$/)
  let rest = input
  if (numMatch && numMatch[1] !== '0') {
    count = parseInt(numMatch[1], 10)
    rest = numMatch[2]
    keys.length = 0
    for (const ch of rest) keys.push(ch)
  }
  if (!rest.length) return { ok: false, err: '空命令' }
  const op = keys[0]
  const motionKeys = keys.slice(1)

  switch (op) {
    case 'h': case 'l': case 'j': case 'k': case '0': case '$': case 'w': case 'e': case 'b': case 'G': {
      // 纯 motion × count
      for (let n = 0; n < count; n++) {
        const m = parseMotion(keys, s)
        if (!m) return { ok: false, err: '未知 motion：' + keys.join('') }
        if (m.type === 'move') { s.r = m.to.r; s.c = m.to.c; clampCursor(s) }
        else if (m.type === 'moveTo') { const t = m.finder(s); if (t) { s.r = t.r; s.c = t.c; clampCursor(s) } }
        else if (m.type === 'f') {
          const idx = s.lines[s.r].indexOf(m.ch, s.c + 1)
          if (idx < 0) return { ok: false, err: '当前行没有 ' + m.ch }
          s.c = idx
        }
      }
      return { ok: true }
    }
    case 'g':
      if (keys[1] === 'g') { s.r = 0; s.c = 0; return { ok: true } }
      return { ok: false, err: '未知：g' + (keys[1] || '') }
    case 'f': {
      const ch = keys[1]
      if (!ch) return { ok: false, err: 'f 需要一个字符' }
      const idx = s.lines[s.r].indexOf(ch, s.c + 1)
      if (idx < 0) return { ok: false, err: '当前行没有 ' + ch }
      s.c = idx
      return { ok: true }
    }
    case 'x': {
      // 删 count 个字符（压 history 支持 u 撤销）
      const line0 = s.lines[s.r]
      const text = line0.slice(s.c, s.c + count)
      if (text) history.push({ type: 'chars', r: s.r, c: s.c, text, reg: text })
      s.lines[s.r] = line0.slice(0, s.c) + line0.slice(s.c + count)
      clampCursor(s)
      return { ok: true }
    }
    case 'r': {
      const ch = keys[1]
      if (!ch) return { ok: false, err: 'r 需要一个字符' }
      const line = s.lines[s.r]
      const old = line[s.c]
      if (old !== undefined) history.push({ type: 'chars', r: s.r, c: s.c, text: old, reg: old })
      s.lines[s.r] = line.slice(0, s.c) + ch + line.slice(s.c + 1)
      return { ok: true }
    }
    case 'd': {
      // dd / dw / d$ / d0 / dG ...
      const mk = motionKeys
      if (mk[0] === 'd' || op === 'd' && !mk.length) {
        // dd：删 count 行
        if (mk[0] !== 'd') return { ok: false, err: 'd 需要 motion 或 dd' }
        history.push({ type: 'lines', from: s.r, to: Math.min(s.r + count - 1, s.lines.length - 1), lines: s.lines.slice(s.r, Math.min(s.r + count, s.lines.length)), reg: s.lines.slice(s.r, Math.min(s.r + count, s.lines.length)).join('\n') })
        s.lines.splice(s.r, count)
        if (!s.lines.length) s.lines = ['']
        clampCursor(s)
        return { ok: true }
      }
      const m = parseMotion(mk, s)
      if (!m) return { ok: false, err: '未知 motion：' + mk.join('') }
      if (m.type === 'move') {
        if (m.to.r !== s.r) {
          // 行级删除（如 dG）：删 s.r..m.to.r
          const from = Math.min(s.r, m.to.r), to = Math.max(s.r, m.to.r)
          history.push({ type: 'lines', from, to, lines: s.lines.slice(from, to + 1), reg: s.lines.slice(from, to + 1).join('\n') })
          s.lines.splice(from, to - from + 1)
          if (!s.lines.length) s.lines = ['']
          s.r = from
          clampCursor(s)
          return { ok: true }
        }
        // 行内删除：朝 motion 方向删到目标（含目标，不含光标自身）
        // d0：删 [0, s.c)；d$：删 [s.c, 行尾]——按方向定界
        let c0, c1
        if (m.to.c < s.c) { c0 = m.to.c; c1 = s.c - 1 }      // 向左（d0）：不含光标
        else { c0 = s.c; c1 = m.to.c }                        // 向右（d$）：含光标到目标
        const line = s.lines[s.r]
        const text = line.slice(c0, c1 + 1)
        s.lines[s.r] = line.slice(0, c0) + line.slice(c1 + 1)
        s.c = c0
        history.push({ type: 'chars', r: s.r, c: c0, text, reg: text })
        clampCursor(s)
        return { ok: true }
      }
      if (m.type === 'moveTo') {
        // 词 motion（w/e/b）× count
        for (let n = 0; n < count; n++) {
          const t = m.finder(s)
          if (!t) break
          if (t.r !== s.r) {
            const from = Math.min(s.r, t.r), to = Math.max(s.r, t.r)
            history.push({ type: 'lines', from, to, lines: s.lines.slice(from, to + 1), reg: s.lines.slice(from, to + 1).join('\n') })
            s.lines.splice(from, to - from + 1)
            if (!s.lines.length) s.lines = ['']
            s.r = from
            clampCursor(s)
            return { ok: true }
          }
          const reg = { r: s.r, c0: Math.min(s.c, t.c), c1: Math.max(s.c, t.c) - (mk[0] === 'e' ? 0 : 1) }
          if (mk[0] === 'w' && t.c > s.c) reg.c1 = t.c - 1
          if (reg.c1 < reg.c0) reg.c1 = reg.c0
          const line = s.lines[s.r]
          const text = line.slice(reg.c0, reg.c1 + 1)
          s.lines[s.r] = line.slice(0, reg.c0) + line.slice(reg.c1 + 1)
          s.c = reg.c0
          history.push({ type: 'chars', r: s.r, c: reg.c0, text, reg: text })
          clampCursor(s)
        }
        return { ok: true }
      }
      return { ok: false, err: '不支持的 d 组合' }
    }
    case 'y': {
      // yy 复制当前行
      if (motionKeys[0] !== 'y') return { ok: false, err: '本关只支持 yy' }
      s._reg = s.lines.slice(s.r, Math.min(s.r + count, s.lines.length)).join('\n')
      return { ok: true }
    }
    case 'p': {
      // 粘贴寄存器（行级）
      const text = s._reg
      if (!text) return { ok: false, err: '寄存器为空' }
      const lines = text.split('\n')
      s.lines.splice(s.r + 1, 0, ...lines)
      s.r = s.r + 1
      clampCursor(s)
      return { ok: true }
    }
    case 'u': {
      // 撤销
      const h = history.pop()
      if (!h) return { ok: false, err: '无可撤销' }
      if (h.type === 'chars') {
        const line = s.lines[h.r]
        s.lines[h.r] = line.slice(0, h.c) + h.text + line.slice(h.c)
        s.r = h.r; s.c = h.c
      } else if (h.type === 'lines') {
        s.lines.splice(h.from, 0, ...h.lines)
        s.r = h.from
      }
      clampCursor(s)
      return { ok: true }
    }
    default:
      return { ok: false, err: '未知命令：' + op }
  }
}

module.exports = { createState, cloneState, serialize, apply, clampCursor }
