// 数字华容道核心逻辑（纯函数）
// n×n 一维数组，0 表示空格（支持 4/5/6）

function solved(n = 4) {
  return Array.from({ length: n * n }, (_, i) => (i + 1) % (n * n))
}

function neighborsOfBlank(b, n) {
  const i = b.indexOf(0), r = Math.floor(i / n), c = i % n, out = []
  if (r > 0) out.push(i - n)
  if (r < n - 1) out.push(i + n)
  if (c > 0) out.push(i - 1)
  if (c < n - 1) out.push(i + 1)
  return out
}

// 从目标态做 N 次随机合法移动（天然可解）
function shuffle(n = 4, times = 0) {
  const T = times || (n === 4 ? 200 : n === 5 ? 400 : 800)
  let b = solved(n)
  let last = -1
  for (let i = 0; i < T; i++) {
    const opts = neighborsOfBlank(b, n)
    const filtered = opts.filter(x => x !== last)
    const pool = filtered.length ? filtered : opts
    const pick = pool[Math.floor(Math.random() * pool.length)]
    b = swapWithBlank(b, pick, n)
    last = pick
  }
  if (b.every((v, i) => v === solved(n)[i])) return shuffle(n, times)
  return b
}

function swapWithBlank(b, idx, n = 4) {
  const nb = b.slice()
  const bi = nb.indexOf(0)
  if (!neighborsOfBlank(nb, n).includes(idx)) return nb
  nb[bi] = nb[idx]
  nb[idx] = 0
  return nb
}

function isSolved(b, n = 4) {
  const s = solved(n)
  return b.every((v, i) => v === s[i])
}

module.exports = { solved, shuffle, swapWithBlank, isSolved, neighborsOfBlank }
