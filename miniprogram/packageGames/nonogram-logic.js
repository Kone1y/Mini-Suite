// 数织（Nonogram）核心逻辑：纯函数，与页面解耦，可单测
// 格子三态：0=未知 1=黑(填) 2=白(空)
// 单行求解用「枚举合法放置求交集」；全盘求解用约束传播至不动点（+ 唯一解验证）

const UNKNOWN = 0, FILLED = 1, BLANK = 2

// 线索（如 [2,3] 表示该行有两段黑：长度2和3，中间至少1空）
// 空线索 [] 表示全空行

// ---- 单行：枚举所有合法放置，返回每格「在所有合法放置中是否恒为黑/恒为白」----
// line: 当前已知状态数组；clue: 线索数组
// 返回 { ok, line } ok=false 表示当前状态与线索矛盾（无合法放置）
function solveLine(line, clue) {
  const n = line.length
  // 生成所有放置：递归放每一段
  const placements = []
  function place(segIdx, pos, acc) {
    if (placements.length > 50000) return   // 防爆（5×5~15×15 不会超）
    if (segIdx === clue.length) {
      // 尾部全空
      for (let i = pos; i < n; i++) {
        if (line[i] === FILLED) return      // 与已知黑冲突
        acc[i] = BLANK
      }
      placements.push(acc.slice())
      acc.length = n
      acc.length = n
      return
    }
    const len = clue[segIdx]
    // 尝试从 pos 到最右可放位置
    const remaining = clue.slice(segIdx).reduce((a, b) => a + b, 0) + (clue.length - segIdx - 1) // 后续所需最小长度
    for (let start = pos; start + remaining <= n; start++) {
      // start 前必须全空（且不与已知黑冲突）
      let bad = false
      for (let i = pos; i < start; i++) {
        if (line[i] === FILLED) { bad = true; break }
        acc[i] = BLANK
      }
      if (bad) break   // 一旦越过一个已知黑，start 不能再大
      // 段内必须全黑
      for (let i = start; i < start + len; i++) {
        if (line[i] === BLANK) { bad = true; break }
        acc[i] = FILLED
      }
      if (!bad) {
        // 段后一格（若有）必须空——在下一轮 place 或尾部处理
        if (start + len < n && line[start + len] === FILLED) bad = true
        else {
          if (start + len < n) acc[start + len] = BLANK
          place(segIdx + 1, start + len + 1, acc)
          // 回溯：acc 由后续覆盖，无需显式清除（长度恒 n）
        }
      }
    }
  }
  const acc = new Array(n).fill(UNKNOWN)
  if (clue.length === 0) {
    // 空线索：全白
    for (let i = 0; i < n; i++) {
      if (line[i] === FILLED) return { ok: false }
      acc[i] = BLANK
    }
    placements.push(acc)
  } else {
    place(0, 0, acc)
  }
  if (placements.length === 0) return { ok: false }
  // 交集：所有放置中相同的值可确定
  const out = new Array(n).fill(UNKNOWN)
  for (let i = 0; i < n; i++) {
    const v = placements[0][i]
    let same = true
    for (let p = 1; p < placements.length; p++) {
      if (placements[p][i] !== v) { same = false; break }
    }
    out[i] = same ? v : UNKNOWN
  }
  return { ok: true, line: out }
}

// ---- 提取一行/列的线索 ----
function extractClue(line) {
  const clue = []
  let run = 0
  for (const c of line) {
    if (c === FILLED) run++
    else { if (run > 0) { clue.push(run); run = 0 } }
  }
  if (run > 0) clue.push(run)
  return clue
}

// 取列
function colOf(grid, x) {
  const col = []
  for (let y = 0; y < grid.length; y++) col.push(grid[y][x])
  return col
}

// 从图案生成谜题（返回行列线索）
function cluesFromPattern(pattern) {
  const rows = pattern.length, cols = pattern[0].length
  const rowClues = [], colClues = []
  for (let y = 0; y < rows; y++) rowClues.push(extractClue(pattern[y]))
  for (let x = 0; x < cols; x++) colClues.push(extractClue(colOf(pattern, x)))
  return { rowClues, colClues }
}

// ---- 全盘求解：约束传播至不动点 ----
// state: rows×cols 二维数组（UNKNOWN/FILLED/BLANK）
// 返回 { solved, state, contradiction }
function propagate(rowClues, colClues, state) {
  const rows = rowClues.length, cols = colClues.length
  let progress = true
  let contradiction = false
  while (progress && !contradiction) {
    progress = false
    // 行
    for (let y = 0; y < rows && !contradiction; y++) {
      const r = solveLine(state[y], rowClues[y])
      if (!r.ok) { contradiction = true; break }
      for (let x = 0; x < cols; x++) {
        if (state[y][x] === UNKNOWN && r.line[x] !== UNKNOWN) {
          state[y][x] = r.line[x]
          progress = true
        }
      }
    }
    // 列
    for (let x = 0; x < cols && !contradiction; x++) {
      const col = colOf(state, x)
      const r = solveLine(col, colClues[x])
      if (!r.ok) { contradiction = true; break }
      for (let y = 0; y < rows; y++) {
        if (state[y][x] === UNKNOWN && r.line[y] !== UNKNOWN) {
          state[y][x] = r.line[y]
          progress = true
        }
      }
    }
  }
  const solved = !contradiction && state.every(row => row.every(c => c !== UNKNOWN))
  return { solved, state, contradiction }
}

// ---- 求解（含猜测回溯，处理传播卡住的谜题）----
function solve(rowClues, colClues) {
  const rows = rowClues.length, cols = colClues.length
  const mk = () => {
    const s = []
    for (let y = 0; y < rows; y++) s.push(new Array(cols).fill(UNKNOWN))
    return s
  }
  const r = propagate(rowClues, colClues, mk())
  if (r.contradiction) return { solved: false, state: null, unique: false }
  if (r.solved) {
    // 唯一性验证：把第一格翻转强推，若无矛盾则多解
    return { solved: true, state: r.state, unique: isUnique(rowClues, colClues, r.state) }
  }
  // 猜测回溯：找第一个未知格，两种假设都试
  const result = backtrack(rowClues, colClues, r.state, 0)
  return result
}

function backtrack(rowClues, colClues, state, depth) {
  if (depth > 64) return { solved: false, state: null, unique: false }
  // 找第一个未知格
  let ux = -1, uy = -1
  outer:
  for (let y = 0; y < state.length; y++) {
    for (let x = 0; x < state[0].length; x++) {
      if (state[y][x] === UNKNOWN) { ux = x; uy = y; break outer }
    }
  }
  if (ux < 0) {
    return { solved: true, state, unique: isUnique(rowClues, colClues, state) }
  }
  const solutions = []
  for (const guess of [FILLED, BLANK]) {
    const st2 = state.map(row => row.slice())
    st2[uy][ux] = guess
    const r = propagate(rowClues, colClues, st2)
    if (r.contradiction) continue
    if (r.solved) { solutions.push(r.state); continue }
    const sub = backtrack(rowClues, colClues, r.state, depth + 1)
    if (sub.solved) solutions.push(sub.state)
    if (solutions.length >= 2) break   // 多解即停
  }
  if (solutions.length === 0) return { solved: false, state: null, unique: false }
  return { solved: true, state: solutions[0], unique: solutions.length === 1 }
}

// 唯一解验证：翻转任一已定格必导致矛盾
function isUnique(rowClues, colClues, solution) {
  const rows = rowClues.length, cols = colClues.length
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const st = solution.map(row => row.slice())
      st[y][x] = st[y][x] === FILLED ? BLANK : FILLED
      const r = propagate(rowClues, colClues, st)
      if (!r.contradiction) return false   // 翻转后仍可推 = 多解
    }
  }
  return true
}

// ---- 谜题生成：随机图案 → 提取线索 → 非唯一则修补 ----
// density: 0.5~0.65 容易出唯一解
function generate(size, density) {
  density = density || 0.58
  let pattern = null
  for (let attempt = 0; attempt < 30; attempt++) {
    const p = []
    for (let y = 0; y < size; y++) {
      const row = []
      for (let x = 0; x < size; x++) row.push(Math.random() < density ? FILLED : BLANK)
      p.push(row)
    }
    const { rowClues, colClues } = cluesFromPattern(p)
    const r = solve(rowClues, colClues)
    if (r.solved && r.unique) { pattern = p; break }
    // 非唯一：往"多解区域"补黑格再试（简化：随机翻几个白→黑）
    if (r.solved && !r.unique) {
      for (let k = 0; k < Math.max(2, size >> 2); k++) {
        const x = Math.floor(Math.random() * size), y = Math.floor(Math.random() * size)
        p[y][x] = FILLED
      }
    }
  }
  if (!pattern) {
    // 兜底：全黑（必唯一）——实际到不了这里
    pattern = []
    for (let y = 0; y < size; y++) pattern.push(new Array(size).fill(FILLED))
  }
  const { rowClues, colClues } = cluesFromPattern(pattern)
  return { pattern, rowClues, colClues }
}

// ---- 提示：找玩家当前盘面下一个"纯逻辑可确定"的格子 ----
// 返回 { x, y, value } 或 null
function hint(rowClues, colClues, state) {
  // 校验当前盘面无矛盾
  for (let y = 0; y < state.length; y++) {
    const r = solveLine(state[y], rowClues[y])
    if (!r.ok) return { error: '第 ' + (y + 1) + ' 行与线索矛盾' }
    for (let x = 0; x < state[0].length; x++) {
      if (state[y][x] === UNKNOWN && r.line[x] !== UNKNOWN) {
        return { x, y, value: r.line[x] }
      }
    }
  }
  for (let x = 0; x < state[0].length; x++) {
    const r = solveLine(colOf(state, x), colClues[x])
    if (!r.ok) return { error: '第 ' + (x + 1) + ' 列与线索矛盾' }
    for (let y = 0; y < state.length; y++) {
      if (state[y][x] === UNKNOWN && r.line[y] !== UNKNOWN) {
        return { x, y, value: r.line[y] }
      }
    }
  }
  return null
}

// ---- 校验玩家盘面（已完成时与答案比对）----
function checkWin(pattern, state) {
  for (let y = 0; y < pattern.length; y++) {
    for (let x = 0; x < pattern[0].length; x++) {
      const want = pattern[y][x] === FILLED ? FILLED : BLANK
      if (state[y][x] !== want) return false
    }
  }
  return true
}

module.exports = {
  UNKNOWN, FILLED, BLANK,
  solveLine, extractClue, cluesFromPattern, propagate, solve, isUnique, generate, hint, checkWin, colOf
}
