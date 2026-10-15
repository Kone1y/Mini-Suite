// Diff 对比核心逻辑：纯函数，可单测
// 文本模式：Myers O(ND) 最短编辑脚本（SES）行级 diff —— git 同款算法
// JSON 模式：递归结构化对比（按键路径分类）

// ============ Myers diff ============
// 返回 edits: [{ type: 'equal'|'add'|'remove', line, oldNo, newNo }]
function diffLines(aText, bText) {
  const a = aText.split('\n')
  const b = bText.split('\n')
  const N = a.length, M = b.length
  // trim 共同前缀/后缀（Myers 标准优化）
  let pre = 0
  while (pre < N && pre < M && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < N - pre && suf < M - pre && a[N - 1 - suf] === b[M - 1 - suf]) suf++
  const midA = a.slice(pre, N - suf)
  const midB = b.slice(pre, M - suf)

  const edits = []
  // 前缀
  for (let i = 0; i < pre; i++) edits.push({ type: 'equal', line: a[i], oldNo: i + 1, newNo: i + 1 })
  // 中段：Myers
  const midEdits = myers(midA, midB, pre)
  edits.push(...midEdits)
  // 后缀
  for (let i = 0; i < suf; i++) edits.push({ type: 'equal', line: a[N - suf + i], oldNo: N - suf + i + 1, newNo: M - suf + i + 1 })
  return edits
}

// 纯中段 Myers：oldNo/newNo 基于 offset 偏移
function myers(A, B, offset) {
  const N = A.length, M = B.length
  if (N === 0 && M === 0) return []
  if (N === 0) return B.map((l, j) => ({ type: 'add', line: l, oldNo: null, newNo: j + offset + 1 }))
  if (M === 0) return A.map((l, i) => ({ type: 'remove', line: l, oldNo: i + offset + 1, newNo: null }))

  const MAX = N + M
  const size = 2 * MAX + 1
  // v[k] = 到达对角线 k 的最大 x
  let v = new Array(size).fill(0)
  const trace = []   // 每轮的 v 快照
  const VIDX = k => k + MAX

  let dFound = -1
  for (let d = 0; d <= MAX; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x
      if (k === -d || (k !== d && v[VIDX(k + 1)] > v[VIDX(k - 1)])) {
        x = v[VIDX(k + 1)]        // 向下（插入 B）
      } else {
        x = v[VIDX(k - 1)] + 1    // 向右（删除 A）
      }
      let y = x - k
      // 沿对角线滑
      while (x < N && y < M && A[x] === B[y]) { x++; y++ }
      v[VIDX(k)] = x
      if (x >= N && y >= M) { dFound = d; break }
    }
    if (dFound >= 0) break
  }

  // 回溯路径
  const path = []
  let x = N, y = M
  for (let d = dFound; d > 0; d--) {
    const vPrev = trace[d]
    const k = x - y
    let prevK
    if (k === -d || (k !== d && vPrev[VIDX(k + 1)] > vPrev[VIDX(k - 1)])) prevK = k + 1
    else prevK = k - 1
    const prevX = vPrev[VIDX(prevK)]
    const prevY = prevX - prevK
    // 对角滑动段
    while (x > prevX && y > prevY) { path.push({ t: 'equal', x: x - 1, y: y - 1 }); x--; y-- }
    if (x > prevX) { path.push({ t: 'remove', x: prevX, y: null }); x = prevX }
    else if (y > prevY) { path.push({ t: 'add', x: null, y: prevY }); y = prevY }
    else { x = prevX; y = prevY }
  }
  // d=0 剩余对角线
  while (x > 0 && y > 0) { path.push({ t: 'equal', x: x - 1, y: y - 1 }); x--; y-- }
  while (x > 0) { path.push({ t: 'remove', x: x - 1, y: null }); x-- }
  while (y > 0) { path.push({ t: 'add', x: null, y: y - 1 }); y-- }
  path.reverse()

  return path.map(p => {
    if (p.t === 'equal') return { type: 'equal', line: A[p.x], oldNo: p.x + offset + 1, newNo: p.y + offset + 1 }
    if (p.t === 'remove') return { type: 'remove', line: A[p.x], oldNo: p.x + offset + 1, newNo: null }
    return { type: 'add', line: B[p.y], oldNo: null, newNo: p.y + offset + 1 }
  })
}

// 统计
function stats(edits) {
  let added = 0, removed = 0, same = 0
  for (const e of edits) {
    if (e.type === 'add') added++
    else if (e.type === 'remove') removed++
    else same++
  }
  const total = added + removed + same
  const similarity = total === 0 ? 100 : Math.round(same / total * 100)
  return { added, removed, same, similarity }
}

// ============ JSON 结构化对比 ============
// 返回 [{ path, type: 'added'|'removed'|'changed'|'type-changed', oldVal, newVal }]
function diffJson(aText, bText) {
  let A, B
  try { A = JSON.parse(aText) } catch (e) {
    return { error: '左侧 JSON 无效：' + e.message }
  }
  try { B = JSON.parse(bText) } catch (e) {
    return { error: '右侧 JSON 无效：' + e.message }
  }
  const diffs = []
  walk(A, B, '$', diffs)
  return { diffs }
}

function fmtVal(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'Array(' + v.length + ')'
  if (typeof v === 'object') return '{…}'
  return JSON.stringify(v)
}

function walk(A, B, path, diffs) {
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
  if (isObj(A) && isObj(B)) {
    const keys = new Set([...Object.keys(A), ...Object.keys(B)])
    for (const k of keys) {
      const inA = k in A, inB = k in B
      const p = path + '.' + k
      if (inA && !inB) diffs.push({ path: p, type: 'removed', oldVal: fmtVal(A[k]), newVal: '' })
      else if (!inA && inB) diffs.push({ path: p, type: 'added', oldVal: '', newVal: fmtVal(B[k]) })
      else walk(A[k], B[k], p, diffs)
    }
  } else if (Array.isArray(A) && Array.isArray(B)) {
    const n = Math.max(A.length, B.length)
    for (let i = 0; i < n; i++) {
      const p = path + '[' + i + ']'
      if (i >= A.length) diffs.push({ path: p, type: 'added', oldVal: '', newVal: fmtVal(B[i]) })
      else if (i >= B.length) diffs.push({ path: p, type: 'removed', oldVal: fmtVal(A[i]), newVal: '' })
      else walk(A[i], B[i], p, diffs)
    }
  } else {
    // 叶子（或类型混合）
    if (A === B) return
    const typeChanged = typeof A !== typeof B || (Array.isArray(A) !== Array.isArray(B)) || (A === null) !== (B === null)
    diffs.push({
      path,
      type: typeChanged ? 'type-changed' : 'changed',
      oldVal: fmtVal(A),
      newVal: fmtVal(B)
    })
  }
}

module.exports = { diffLines, stats, diffJson }
