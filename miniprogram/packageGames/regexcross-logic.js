// 正则填字：求解器（约束传播 + MRV 回溯）+ 生成器（随机解→行列正则→唯一验证）
// 字符集 A-Z。纯逻辑可单测。

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// ---------- 正则前缀候选分析 ----------
// 给定正则与位置 i，返回「长度 n 的字符串走到位置 i 时可能的前缀字符集」——
// 简化实现：枚举法（长度小），对每行/列生成所有匹配串再取每格候选交集
// 4×4/5×5 长度短，全枚举在 26^n 会爆炸——所以用「正则转 NFA 状态机按位推进」：

// 简易 NFA 构造（支持 | () [] * + ? . 字面量 ^ $）
function parseRegex(pattern) {
  // 返回 AST
  let i = 0
  function parseAlt() {
    let left = parseConcat()
    while (src[i] === '|') {
      i++
      const right = parseConcat()
      left = { type: 'alt', left, right }
    }
    return left
  }
  function parseConcat() {
    const parts = []
    while (i < src.length && src[i] !== '|' && src[i] !== ')') {
      parts.push(parseRepeat())
    }
    if (!parts.length) return { type: 'empty' }
    let node = parts[0]
    for (let k = 1; k < parts.length; k++) node = { type: 'cat', left: node, right: parts[k] }
    return node
  }
  function parseRepeat() {
    let atom = parseAtom()
    while (i < src.length && (src[i] === '*' || src[i] === '+' || src[i] === '?')) {
      const op = src[i]; i++
      atom = { type: 'rep', op, child: atom }
    }
    return atom
  }
  function parseAtom() {
    const ch = src[i]
    if (ch === '(') {
      i++
      const inner = parseAlt()
      if (src[i] === ')') i++
      return { type: 'group', child: inner }
    }
    if (ch === '[') {
      i++
      const set = []
      let neg = false
      if (src[i] === '^') { neg = true; i++ }
      while (i < src.length && src[i] !== ']') {
        if (src[i + 1] === '-' && src[i + 2] !== ']') {
          const a = src.charCodeAt(i), b = src.charCodeAt(i + 2)
          for (let c = a; c <= b; c++) set.push(String.fromCharCode(c))
          i += 3
        } else {
          set.push(src[i]); i++
        }
      }
      i++ // ]
      return { type: 'class', neg, set }
    }
    if (ch === '.') { i++; return { type: 'any' } }
    if (ch === '\\') {
      i++
      const e = src[i]; i++
      if (e === 'd') return { type: 'class', neg: false, set: '0123456789'.split('') }
      if (e === 'w') return { type: 'class', neg: false, set: (ALPHA + 'abcdefghijklmnopqrstuvwxyz0123456789_').split('') }
      if (e === 's') return { type: 'class', neg: false, set: ' \t\n'.split('') }
      return { type: 'lit', ch: e }
    }
    i++
    return { type: 'lit', ch }
  }
  const src = pattern
  const ast = parseAlt()
  return ast
}

// NFA 状态集合推进：states = Set(节点id)；构造 ε-closure 与转移
function compileNFA(pattern) {
  const ast = parseRegex(pattern)
  let id = 0
  const nodes = []    // {type, ...}
  function build(node) {
    // 返回 {start, end}（图节点 id）
    switch (node.type) {
      case 'empty': {
        const n = { type: 'eps' }; const nid = nodes.push(n) - 1
        return { start: nid, end: nid }
      }
      case 'lit': case 'any': case 'class': {
        const s = nodes.push({ type: 'eps' }) - 1
        const e = nodes.push({ type: 'eps' }) - 1
        const t = nodes.push({ type: 'trans', cond: node, next: e }) - 1
        nodes[s].next = [t]   // eps 出边（用 next 数组表示 ε 目标）
        nodes[t].prevS = s
        return { start: s, end: e }
      }
      case 'cat': {
        const a = build(node.left), b = build(node.right)
        nodes[a.end].next = [...(nodes[a.end].next || []), b.start]
        return { start: a.start, end: b.end }
      }
      case 'alt': {
        const a = build(node.left), b = build(node.right)
        const s = nodes.push({ type: 'eps' }) - 1
        const e = nodes.push({ type: 'eps' }) - 1
        nodes[s].next = [a.start, b.start]
        nodes[a.end].next = [...(nodes[a.end].next || []), e]
        nodes[b.end].next = [...(nodes[b.end].next || []), e]
        return { start: s, end: e }
      }
      case 'group': return build(node.child)
      case 'rep': {
        const c = build(node.child)
        const s = nodes.push({ type: 'eps' }) - 1
        const e = nodes.push({ type: 'eps' }) - 1
        if (node.op === '*' || node.op === '?') {
          nodes[s].next = [c.start, e]           // 可跳过整体
        } else {
          nodes[s].next = [c.start]              // + 必须走一次
        }
        nodes[c.end].next = [...(nodes[c.end].next || []), e]
        if (node.op === '*' || node.op === '+') {
          // 循环回起点（再来一轮 child）
          nodes[c.end].next.push(c.start)
        }
        return { start: s, end: e }
      }
    }
  }
  const { start, end } = build(ast)
  return { nodes, start, end }
}

// ε-closure（只沿 eps 节点的 next 数组走；trans 节点的 next 是数字跳转目标，不沿其 ε）
function closure(nfa, states) {
  const set = new Set(states)
  const stack = [...states]
  while (stack.length) {
    const id = stack.pop()
    const n = nfa.nodes[id]
    if (n.type === 'eps') {
      for (const nx of (n.next || [])) {
        if (!set.has(nx)) { set.add(nx); stack.push(nx) }
      }
    }
  }
  return set
}

// 消耗一个字符后的状态集（null 表示死路）
function step(nfa, states, ch) {
  const next = new Set()
  for (const id of states) {
    const n = nfa.nodes[id]
    if (n.type === 'trans') {
      const c = n.cond
      let ok = false
      if (c.type === 'lit') ok = c.ch === ch
      else if (c.type === 'any') ok = true
      else if (c.type === 'class') ok = c.neg ? !c.set.includes(ch) : c.set.includes(ch)
      if (ok) {
        next.add(n.next)
      }
    }
  }
  if (!next.size) return null
  return closure(nfa, next)
}

// 匹配定长串（长度 n）——用于生成器/判定
function matchNFA(nfa, str) {
  let states = closure(nfa, new Set([nfa.start]))
  for (const ch of str) {
    states = step(nfa, states, ch)
    if (!states) return false
  }
  return states.has(nfa.end)
}

// ---------- 每格候选：正则按位推进的字符可行性 ----------
// 长度 n 的行/列正则，枚举每个位置的候选字符集：
// BFS 状态集合按位置展开：posStates[i] = 集合；cand[i] = {ch: 可达后继集合}
function charCandidates(nfa, n, alpha) {
  let states = closure(nfa, new Set([nfa.start]))
  const pos = []
  for (let i = 0; i < n; i++) {
    const cand = {}
    let any = false
    const merged = new Set()
    for (const ch of alpha) {
      const nx = step(nfa, states, ch)
      if (nx) {
        cand[ch] = nx
        any = true
        for (const s of nx) merged.add(s)
      }
    }
    if (!any) return null   // 该位置无字符可走 → 无解
    // 位置 i 的「可达状态并集」作为下一层（保守近似——比精确追踪 state→char 组合简单）
    pos.push({ cand, states: merged })
    states = merged
  }
  // 最后仍要能到达 end：检查 merged 是否含 end（最后一个位置的 cand 里任一后继含 end）
  let finalReach = false
  const last = pos[n - 1]
  for (const ch in last.cand) {
    if (last.cand[ch].has(nfa.end)) { finalReach = true; break }
  }
  if (!finalReach) return null
  return pos
}

// ---------- 求解器 ----------
// rows/cols：正则数组；n：边长。返回唯一解网格或 null / 多解抛 {multi:true}
function solve(n, rows, cols, limit) {
  limit = limit || 2
  const alpha = ALPHA
  const rowNFA = rows.map(r => compileNFA(r))
  const colNFA = cols.map(c => compileNFA(c))
  // 每行每列的按位候选
  const rowCand = rowNFA.map(nfa => charCandidates(nfa, n, alpha))
  const colCand = colNFA.map(nfa => charCandidates(nfa, n, alpha))
  for (let i = 0; i < n; i++) {
    if (!rowCand[i] || !colCand[i]) return { count: 0, grid: null }
  }
  // grid[i][j] 候选 = rowCand[i][j] ∩ colCand[j][i]
  const cand = []
  for (let i = 0; i < n; i++) {
    cand.push([])
    for (let j = 0; j < n; j++) {
      const rc = rowCand[i].candAt ? rowCand[i].candAt(j) : rowCand[i][j]
      void rc
      const set = new Set()
      const rowPos = rowCand[i][j]
      const colPos = colCand[j][i]
      for (const ch of alpha) {
        if (rowPos.cand[ch] && colPos.cand[ch]) set.add(ch)
      }
      cand[i].push(set)
    }
  }
  // 回溯（MRV + 候选）
  const grid = Array.from({ length: n }, () => new Array(n).fill(null))
  let count = 0, solution = null

  function verifyFull() {
    for (let i = 0; i < n; i++) {
      const rowStr = grid[i].join('')
      if (!matchNFA(rowNFA[i], rowStr)) return false
    }
    for (let j = 0; j < n; j++) {
      const colStr = Array.from({ length: n }, (_, i) => grid[i][j]).join('')
      if (!matchNFA(colNFA[j], colStr)) return false
    }
    return true
  }

  function pick() {
    let best = null, bestSize = 99
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (grid[i][j] !== null) continue
      const sz = cand[i][j].size
      if (sz < bestSize) { bestSize = sz; best = [i, j] }
      if (sz === 0) return [i, j, 0]
    }
    return best ? [best[0], best[1], bestSize] : null
  }

  function bt() {
    if (count >= limit) return
    const p = pick()
    if (!p) {
      // 全填满
      if (verifyFull()) {
        count++
        if (!solution) solution = grid.map(r => r.slice())
      }
      return
    }
    const [i, j] = p
    if (p[2] === 0) return
    for (const ch of cand[i][j]) {
      grid[i][j] = ch
      bt()
      grid[i][j] = null
      if (count >= limit) return
    }
  }
  bt()
  return { count, grid: solution }
}

// ---------- 生成器 ----------
// 随机解网格 → 生成覆盖每行/列的正则 → 验证唯一
function generate(n, rng) {
  rng = rng || Math.random
  for (let attempt = 0; attempt < 30; attempt++) {
    // 随机网格（字母按频率加权：常见字母多）
    const common = 'ETAOINSRHLDCUMFPGWYBVKXJQZ'
    const grid = Array.from({ length: n }, () =>
      Array.from({ length: n }, () => common[Math.floor(rng() * 18)]))
    // 为每行生成正则：从行串构造"恰好匹配"的正则（多风格随机）
    const makeRegex = (str) => {
      const styles = [
        () => str,                                        // 字面量
        () => '.*',                                       // 太松（基本必多解，作废）——不放
        () => str.split('').map(ch => ch + '?').join('') + '.*',  // 每字可选
        () => '[' + [...new Set(str.split(''))].join('') + ']*',  // 字符类组
        () => '(' + str.slice(0, 2) + '|' + str.slice(2) + ')',   // 交替
      ]
      const pick = Math.floor(rng() * 4)   // 0,1,3,4 有效（跳过太松的）
      return [styles[0], styles[1], styles[3], styles[4]][pick]()
    }
    const rows = grid.map(r => makeRegex(r.join('')))
    const cols = []
    for (let j = 0; j < n; j++) {
      const colStr = Array.from({ length: n }, (_, i) => grid[i][j]).join('')
      cols.push(makeRegex(colStr))
    }
    const res = solve(n, rows, cols, 2)
    if (res.count === 1 && res.grid) {
      // 唯一——确认解就是原网格
      const same = res.grid.every((r, i) => r.every((ch, j) => ch === grid[i][j]))
      if (same) return { grid, rows, cols, solution: res.grid }
    }
  }
  // 兜底：全字面量（必有唯一解=自身）
  const grid = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 'ETAOINSRHL'[Math.floor((rng || Math.random)() * 9)]))
  const rows = grid.map(r => r.join(''))
  const cols = []
  for (let j = 0; j < n; j++) cols.push(Array.from({ length: n }, (_, i) => grid[i][j]).join(''))
  return { grid, rows, cols, solution: grid.map(r => r.slice()) }
}

// ---------- 判定 ----------
// 玩家当前网格（部分填）：返回每行/列匹配状态（用于实时高亮）
function checkLines(n, rows, cols, grid) {
  const rowNFA = rows.map(r => compileNFA(r))
  const colNFA = cols.map(c => compileNFA(c))
  const rowOk = [], colOk = []
  for (let i = 0; i < n; i++) {
    const s = grid[i].join('')
    // 部分填充：用 NFA 推进，失败=false；未填满的看「是否还活着」（可达 end 或仍有后继）——简化：未满按 false
    rowOk.push(s.indexOf(' ') < 0 ? matchNFA(rowNFA[i], s) : false)
  }
  for (let j = 0; j < n; j++) {
    const s = Array.from({ length: n }, (_, i) => grid[i][j]).join('')
    colOk.push(s.indexOf(' ') < 0 ? matchNFA(colNFA[j], s) : false)
  }
  return { rowOk, colOk }
}

module.exports = { parseRegex, compileNFA, matchNFA, solve, generate, checkLines, ALPHA }
