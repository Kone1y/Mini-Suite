// 点灯 Akari（Light Up）核心逻辑：纯函数，可单测
// 规则：白格放灯泡；灯照亮同行同列直到黑墙；任意两灯不能互相照亮；
//       数字黑格的上下左右白格中灯数=数字；全盘白格被照亮即胜
//
// 求解建模（经典）：把每个"横向连续白格段"和"纵向连续白格段"视为节点，
// 每个白格 = 一个横段×纵段的交叉点 → 0/1 规划：格上放灯 = 选中该交叉边
//   约束1：每段最多 1 灯（同段两灯互射）
//   约束2：数字墙相邻格的灯数精确
//   目标：覆盖所有段（每段至少 1 灯 → 该段所有格被照亮）
// 回溯 + 约束传播

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- 盘面结构 ----------
// grid: rows×cols，-2=无数字黑墙 -1=白格 0..4=数字黑墙
// 行段/列段编号：H[r][c] / V[r][c]

function buildSegments(rows, cols, grid) {
  // 行段
  const H = []
  for (let r = 0; r < rows; r++) H.push(new Array(cols).fill(-1))
  let hCount = 0
  for (let r = 0; r < rows; r++) {
    let c = 0
    while (c < cols) {
      if (grid[r][c] === -1) {
        let c2 = c
        while (c2 < cols && grid[r][c2] === -1) { H[r][c2] = hCount; c2++ }
        hCount++
        c = c2
      } else c++
    }
  }
  // 列段
  const V = []
  for (let r = 0; r < rows; r++) V.push(new Array(cols).fill(-1))
  let vCount = 0
  for (let c = 0; c < cols; c++) {
    let r = 0
    while (r < rows) {
      if (grid[r][c] === -1) {
        let r2 = r
        while (r2 < rows && grid[r2][c] === -1) { V[r2][c] = vCount; r2++ }
        vCount++
        r = r2
      } else r++
    }
  }
  return { H, V, hCount, vCount }
}

// 每格 ↔ (hSeg, vSeg)；格子列表
function cellList(rows, cols, grid) {
  const cells = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (grid[r][c] === -1) cells.push({ r, c })
  return cells
}

// 数字墙的相邻白格
function numberedWalls(rows, cols, grid) {
  const walls = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (grid[r][c] >= 0) walls.push({ r, c, n: grid[r][c] })
  return walls
}

// ---------- 求解器：数解个数（到 limit 停） ----------
// 返回 { count(≤limit), solution }
function solve(rows, cols, grid, limit) {
  limit = limit || 2
  const { H, V, hCount, vCount } = buildSegments(rows, cols, grid)
  const cells = cellList(rows, cols, grid)
  const walls = numberedWalls(rows, cols, grid)
  const cellIdx = new Map()
  cells.forEach((cell, i) => cellIdx.set(cell.r + ',' + cell.c, i))

  // 灯状态：-1 未知 0 无灯 1 有灯
  const bulb = cells.map(() => -1)
  // 段覆盖需求：每段需要 ≥1 灯（照亮）
  const hLit = new Array(hCount).fill(false)
  const vLit = new Array(vCount).fill(false)
  // 数字墙约束：{wall → [cellIdx...]}
  const wallCells = walls.map(w => ({
    n: w.n,
    idxs: [[-1, 0], [1, 0], [0, -1], [0, 1]]
      .map(([dr, dc]) => {
        const key = (w.r + dr) + ',' + (w.c + dc)
        return cellIdx.has(key) ? cellIdx.get(key) : -1
      })
      .filter(i => i >= 0)
  }))

  let solutions = 0
  let firstSolution = null

  // 传播：从已确定状态推必然结果，返回 false 若矛盾
  function propagate() {
    let changed = true
    while (changed) {
      changed = false
      // 段约束：段里 ≥2 灯 = 矛盾（互射）；已有灯 → 其余格无灯；段只剩一个未知且未照亮 → 必有灯
      // H 段
      for (let s = 0; s < hCount; s++) {
        const idxs = cells.map((_, i) => i).filter(i => H[cells[i].r][cells[i].c] === s)
        const bulbCnt = idxs.filter(i => bulb[i] === 1).length
        if (bulbCnt > 1) return false   // 同段两灯互射
        const unknown = idxs.filter(i => bulb[i] === -1)
        if (bulbCnt === 1) {
          for (const i of unknown) { bulb[i] = 0; changed = true }
        }
      }
      // V 段
      for (let s = 0; s < vCount; s++) {
        const idxs = cells.map((_, i) => i).filter(i => V[cells[i].r][cells[i].c] === s)
        const bulbCnt = idxs.filter(i => bulb[i] === 1).length
        if (bulbCnt > 1) return false   // 同段两灯互射
        const unknown = idxs.filter(i => bulb[i] === -1)
        if (bulbCnt === 1) {
          for (const i of unknown) { bulb[i] = 0; changed = true }
        }
      }
      // 数字墙约束
      for (const w of wallCells) {
        const cnt = w.idxs.filter(i => bulb[i] === 1).length
        const free = w.idxs.filter(i => bulb[i] === -1)
        const noBulb = w.idxs.filter(i => bulb[i] === 0).length
        if (cnt > w.n || cnt + free.length < w.n) return false   // 矛盾
        if (cnt === w.n && free.length > 0) {
          for (const i of free) { bulb[i] = 0; changed = true }
        }
        if (cnt + free.length === w.n && free.length > 0) {
          for (const i of free) {
            bulb[i] = 1
            hLit[H[cells[i].r][cells[i].c]] = true
            vLit[V[cells[i].r][cells[i].c]] = true
          }
          changed = true
        }
      }
    }
    return true
  }

  function complete() {
    // 全格有值；每格被照亮（其行段或列段有灯）；全墙满足
    for (let i = 0; i < bulb.length; i++) if (bulb[i] === -1) return false
    for (let i = 0; i < cells.length; i++) {
      const h = H[cells[i].r][cells[i].c]
      const v = V[cells[i].r][cells[i].c]
      if (!hLit[h] && !vLit[v]) return false   // 该格行段列段都无灯 → 未照亮
    }
    for (const w of wallCells) {
      if (w.idxs.filter(i => bulb[i] === 1).length !== w.n) return false
    }
    return true
  }

  function backtrack() {
    if (solutions >= limit) return
    if (!propagate()) return
    if (complete()) {
      solutions++
      if (!firstSolution) firstSolution = bulb.slice()
      return
    }
    // 选一个未知格：优先「未照亮」的格（其行/列段都无灯 → 它必须自己或邻格承载灯，分支最有效）
    let pick = -1
    for (let i = 0; i < bulb.length; i++) {
      if (bulb[i] === -1) {
        const h = H[cells[i].r][cells[i].c]
        const v = V[cells[i].r][cells[i].c]
        if (!hLit[h] && !vLit[v]) { pick = i; break }
      }
    }
    if (pick < 0) {
      for (const w of wallCells) {
        const free = w.idxs.filter(i => bulb[i] === -1)
        if (free.length > 0) { pick = free[0]; break }
      }
    }
    if (pick < 0) {
      for (let i = 0; i < bulb.length; i++) if (bulb[i] === -1) { pick = i; break }
    }
    if (pick < 0) return
    // 分支：放灯 / 不放灯
    const saveBulb = bulb.slice()
    const saveH = hLit.slice(), saveV = vLit.slice()

    // 试放灯
    bulb[pick] = 1
    hLit[H[cells[pick].r][cells[pick].c]] = true
    vLit[V[cells[pick].r][cells[pick].c]] = true
    backtrack()
    if (solutions >= limit) return

    // 复原试不放
    for (let i = 0; i < bulb.length; i++) bulb[i] = saveBulb[i]
    for (let s = 0; s < hCount; s++) hLit[s] = saveH[s]
    for (let s = 0; s < vCount; s++) vLit[s] = saveV[s]
    bulb[pick] = 0
    backtrack()
    // 复原（对上层无影响，调用方都有自己的存档）
    for (let i = 0; i < bulb.length; i++) bulb[i] = saveBulb[i]
    for (let s = 0; s < hCount; s++) hLit[s] = saveH[s]
    for (let s = 0; s < vCount; s++) vLit[s] = saveV[s]
  }

  backtrack()
  // 把解转成 r,c 集合
  let solutionCells = null
  if (firstSolution) {
    solutionCells = new Set()
    firstSolution.forEach((b, i) => { if (b === 1) solutionCells.add(cells[i].r + ',' + cells[i].c) })
  }
  return { count: solutions, solution: solutionCells }
}

// ---------- 生成器（构造式：solution-first）----------
// 1) 先随机放灯：逐段照亮法——遍历所有行段，未照亮的段选一格放灯（保证行段全亮），
//    再检查未照亮列段补灯；全过程中保证不互射（同段已有灯跳过）
// 2) 由灯布置导出墙位置（灯照不到的格当墙 + 随机墙）——不行，墙决定段……
//    正确顺序：先随机墙布局 → 用"逐段照亮"构造合法灯布置（构造必成：每行段放灯即可，列段顺带被照亮，
//    剩余未照亮列段单独补灯；若补灯位置互射则该布局弃）→ 依灯标墙数字 → 唯一性验证/升级
function generate(rows, cols, rng, opts) {
  rng = rng || mulberry32((Math.random() * 1e9) | 0)
  opts = opts || {}
  const wallDensity = opts.wallDensity || 0.24
  const numberRatio = opts.numberRatio || 0.75
  const minNumbers = opts.minNumbers || Math.max(4, Math.floor(rows * cols * 0.06))
  const maxAttempts = opts.maxAttempts || 60

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 1) 随机墙
    const grid = []
    for (let r = 0; r < rows; r++) {
      const row = []
      for (let c = 0; c < cols; c++) row.push(rng() < wallDensity ? -2 : -1)
      grid.push(row)
    }
    // 2) 构造灯布置：迭代到不动点——
    //    a. 记录每格是否已照亮（行段有灯 或 列段有灯）
    //    b. 行段里只剩一个未照亮格 → 该格必须放灯（若其列段已有灯则死锁弃）
    //    c. 无强推时随机挑一个未照亮行段放灯（列段无灯的格优先）
    const bulbs = new Set()
    const { H, V, hCount, vCount } = buildSegments(rows, cols, grid)
    const hHasBulb = new Array(hCount).fill(false)
    const vHasBulb = new Array(vCount).fill(false)
    let constructFail = false
    for (let round = 0; round < rows * cols * 2 && !constructFail; round++) {
      // 未照亮格
      let allLit = true
      const dark = []
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (grid[r][c] === -1 && !hHasBulb[H[r][c]] && !vHasBulb[V[r][c]]) {
            allLit = false
            dark.push([r, c])
          }
      if (allLit) break
      // 强推：某行段未照亮格恰好 1 → 必放灯
      let forced = false
      const hDarkCount = new Array(hCount).fill(0)
      for (const [r, c] of dark) hDarkCount[H[r][c]]++
      for (const [r, c] of dark) {
        if (hDarkCount[H[r][c]] === 1) {
          if (vHasBulb[V[r][c]]) { constructFail = true; break }   // 唯一格的列段已有灯 → 死锁
          bulbs.add(r + ',' + c)
          hHasBulb[H[r][c]] = true
          vHasBulb[V[r][c]] = true
          forced = true
          break   // 每轮只推一个，重新扫
        }
      }
      if (constructFail || forced) continue
      // 随机：挑一个未照亮行段（未照亮格最多的），从中选列段无灯的格放灯
      let bestSeg = -1, bestCnt = -1
      for (let s = 0; s < hCount; s++) {
        const cnt = hDarkCount[s]
        if (cnt > bestCnt) { bestCnt = cnt; bestSeg = s }
      }
      const cands = dark.filter(([r, c]) => H[r][c] === bestSeg && !vHasBulb[V[r][c]])
      if (cands.length === 0) { constructFail = true; break }   // 该段所有格列段都有灯且行段无灯 → 死锁
      const pick = cands[Math.floor(rng() * cands.length)]
      bulbs.add(pick[0] + ',' + pick[1])
      hHasBulb[H[pick[0]][pick[1]]] = true
      vHasBulb[V[pick[0]][pick[1]]] = true
    }
    if (constructFail) continue

    // 3) 数字墙抽样 + 按灯布置标数
    const nGrid = grid.map(row => row.slice())
    const wallCands = []
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (nGrid[r][c] === -2 && rng() < numberRatio) wallCands.push({ r, c })
    if (wallCands.length < minNumbers) continue
    for (const w of wallCands) {
      let cnt = 0
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (bulbs.has((w.r + dr) + ',' + (w.c + dc))) cnt++
      }
      nGrid[w.r][w.c] = cnt
    }

    // 4) 唯一性：循环「找另一解 → 放一面能区分它的数字墙」直至唯一（破对称的关键：
    //    给 r' 与构造解灯数不同的墙标上构造解的数，直接排除 r'）
    let guard = 0
    let uniq = false
    while (guard++ < 40) {
      const r2 = solve(rows, cols, nGrid, 2)
      if (r2.count === 0) break          // 异常（构造解应恒满足）
      if (r2.count === 1) { uniq = true; break }
      // r2.solution 是「另一个解」或构造解本身；若是构造解，需要第三个解——limit 提到 3 找差异解
      const r3 = solve(rows, cols, nGrid, 3)
      let other = null
      const sols = []
      if (r3.count >= 2) {
        // solve 只返回第一个解；用排除法：把构造解的格逐个禁灯重解太贵。
        // 简化可靠方案：逐面试墙——找一面墙 W：构造解在 W 邻域灯数 = a，
        // 把 W 标为 a 后立即重解；若仍多解，换下一面。等价于「升级并即时验证」，
        // 但只挑「紧邻构造解灯」的墙（信息量最大）。
      }
      void other; void sols
      // 收集候选墙：与构造解的灯相邻的（这些墙的数字信息量最大）
      const cands = []
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (nGrid[r][c] === -2) {
            let near = false
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
              if (bulbs.has((r + dr) + ',' + (c + dc))) near = true
            }
            if (near) cands.push({ r, c })
          }
      if (cands.length === 0) break
      // 洗牌取一面标数
      const w = cands[Math.floor(rng() * cands.length)]
      let cnt = 0
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (bulbs.has((w.r + dr) + ',' + (w.c + dc))) cnt++
      }
      nGrid[w.r][w.c] = cnt
    }
    if (!uniq) continue

    // 5) 抹数字（每抹验证唯一；保底 minNumbers）
    const allNumbered = []
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (nGrid[r][c] >= 0) allNumbered.push({ r, c })
    const order = allNumbered.slice()
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    let nNums = allNumbered.length
    for (const w of order) {
      if (nNums <= minNumbers + 1) break
      const saved = nGrid[w.r][w.c]
      nGrid[w.r][w.c] = -2
      const r3 = solve(rows, cols, nGrid, 2)
      if (r3.count !== 1) { nGrid[w.r][w.c] = saved }
      else nNums--
    }

    // 6) 终验（唯一 + 解合法）
    const fin = solve(rows, cols, nGrid, 2)
    if (fin.count === 1 && fin.solution) {
      const chk = check(rows, cols, nGrid, fin.solution)
      if (chk.ok) return { grid: nGrid, solution: fin.solution, numberedCount: nNums }
    }
  }
  return null
}

// ---------- 玩家操作校验 ----------
// bulbs: Set('r,c')
// 返回 { ok, reasons:[] }（ok=true 表示完全合法且照亮全盘）
function check(rows, cols, grid, bulbs) {
  const reasons = []
  const { H, V } = buildSegments(rows, cols, grid)
  // 灯互射（同段两灯）
  const hSeen = new Set(), vSeen = new Set()
  for (const key of bulbs) {
    const [r, c] = key.split(',').map(Number)
    if (grid[r][c] !== -1) { reasons.push('黑墙上不能放灯'); break }
    const h = H[r][c], v = V[r][c]
    if (hSeen.has(h)) { reasons.push('有两盏灯互相照射'); }
    if (vSeen.has(v)) { reasons.push('有两盏灯互相照射'); }
    hSeen.add(h); vSeen.add(v)
  }
  // 数字墙
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] >= 0) {
        let cnt = 0
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          if (bulbs.has((r + dr) + ',' + (c + dc))) cnt++
        }
        if (cnt !== grid[r][c]) reasons.push('数字墙不满足')
      }
    }
  }
  // 照亮全盘
  const lit = new Set()
  for (const key of bulbs) {
    const [r, c] = key.split(',').map(Number)
    // 四方向扩散
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      let rr = r + dr, cc = c + dc
      while (rr >= 0 && rr < rows && cc >= 0 && cc < cols && grid[rr][cc] === -1) {
        lit.add(rr + ',' + cc); rr += dr; cc += dc
      }
    }
    lit.add(r + ',' + c)
  }
  let allLit = true
  for (let r = 0; r < rows && allLit; r++)
    for (let c = 0; c < cols; c++)
      if (grid[r][c] === -1 && !lit.has(r + ',' + c)) { allLit = false; break }
  if (!allLit) reasons.push('还有格子未被照亮')
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)], lit }
}

// 提示：返回一盏应放的灯（在解中但玩家未放），或一盏应撤的灯
function hint(rows, cols, grid, solution, bulbs) {
  // 有错灯优先提示撤
  for (const key of bulbs) {
    if (!solution.has(key)) return { type: 'remove', key }
  }
  for (const key of solution) {
    if (!bulbs.has(key)) return { type: 'place', key }
  }
  return null
}

module.exports = { mulberry32, buildSegments, solve, generate, check, hint }
