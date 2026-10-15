// 24 点核心逻辑：可解性判定 + 求一个解
// 纯函数，可单测

// 全排列（去重）
function permutations(arr) {
  const res = []
  function perm(cur, rest) {
    if (!rest.length) { res.push(cur.slice()); return }
    const used = new Set()
    rest.forEach((v, i) => {
      if (used.has(v)) return
      used.add(v)
      cur.push(v)
      perm(cur, rest.slice(0, i).concat(rest.slice(i + 1)))
      cur.pop()
    })
  }
  perm([], arr)
  return res
}

// 运算（除法允许分数：用 {n, d} 有理数运算避免浮点误差）
function frac(a, b) { return { n: a, d: b } }
function simplify(f) {
  if (f.d === 0) return f   // 除零标记
  const gcd = (x, y) => y === 0 ? x : gcd(y, x % y)
  let g = gcd(Math.abs(f.n), Math.abs(f.d)) || 1
  if (f.d < 0) { g = -g }
  return { n: f.n / g, d: f.d / g }
}
const ops = {
  '+': (a, b) => simplify({ n: a.n * b.d + b.n * a.d, d: a.d * b.d }),
  '-': (a, b) => simplify({ n: a.n * b.d - b.n * a.d, d: a.d * b.d }),
  '*': (a, b) => simplify({ n: a.n * b.n, d: a.d * b.d }),
  '/': (a, b) => b.n === 0 ? { n: 1, d: 0 } : simplify({ n: a.n * b.d, d: a.d * b.n }),
}

// 求解：返回表达式字符串或 null
// 策略：枚举数字排列 × 运算符组合 × 5 种括号结构（波兰式等价 a op b op c op d 的全部二叉树）
function solve24(nums) {
  const target = frac(24, 1)
  const opNames = ['+', '-', '*', '/']

  // 递归合并：cards 是有理数数组 + 表达式数组
  function search(vals, exprs) {
    if (vals.length === 1) {
      const v = vals[0]
      if (v.d !== 0 && v.d === 1 && v.n === 24) return exprs[0]
      return null
    }
    for (let i = 0; i < vals.length; i++) {
      for (let j = 0; j < vals.length; j++) {
        if (i === j) continue
        for (const op of opNames) {
          // 跳过等价重复：a+b / a*b 交换律只需 i<j
          if ((op === '+' || op === '*') && i > j) continue
          // 减 0 / 乘 1 / 除 1 冗余剪枝
          const nv = ops[op](vals[i], vals[j])
          if (nv.d === 0) continue
          const restVals = [nv]
          const restExprs = ['(' + exprs[i] + op + exprs[j] + ')']
          for (let k = 0; k < vals.length; k++) {
            if (k !== i && k !== j) { restVals.push(vals[k]); restExprs.push(exprs[k]) }
          }
          const r = search(restVals, restExprs)
          if (r) return r
        }
      }
    }
    return null
  }

  for (const perm of permutations(nums)) {
    const vals = perm.map(n => frac(n, 1))
    const exprs = perm.map(n => String(n))
    const r = search(vals, exprs)
    if (r) return r
  }
  return null
}

// 随机发牌（保证可解）
function deal() {
  for (;;) {
    const nums = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 13))
    const sol = solve24(nums)
    if (sol) return { nums, solution: sol }
  }
}

// 用户算式求值（中缀 → 逐对归约的简单模型由页面负责，这里只提供可解性）
module.exports = { solve24, deal, permutations }
