// 汉诺塔核心逻辑：纯函数，与页面解耦，可单测
// 状态约定：3 根柱子，state = [peg0, peg1, peg2]
// 每根柱子是「从底到顶」的尺寸数组，底大顶小；尺寸 1..n（1 最小）

// 初始状态：0 号柱底大顶小放满 n 个盘，其余两柱为空
function initialState(n) {
  const peg = []
  for (let i = n; i >= 1; i--) peg.push(i)
  return [peg, [], []]
}

// 经典递归汉诺塔：n 盘从 from 移到 to，借助 aux
// 返回移动序列 [{from, to}, ...]，from/to ∈ 0,1,2
function solve(n) {
  const moves = []
  function hanoi(k, from, to, aux) {
    if (k <= 0) return
    hanoi(k - 1, from, aux, to)
    moves.push({ from, to })
    hanoi(k - 1, aux, to, from)
  }
  hanoi(n, 0, 2, 1)
  return moves
}

// 判断能否把 from 柱顶盘移动到 to 柱
// 规则：from 非空，且（to 为空 或 to 顶盘尺寸 > from 顶盘尺寸）
function legalMove(state, from, to) {
  const f = state[from]
  const t = state[to]
  if (f.length === 0) return false        // from 空，不能取
  const topFrom = f[f.length - 1]
  if (t.length === 0) return true         // to 空，可放
  const topTo = t[t.length - 1]
  return topTo > topFrom
}

// 应用移动，返回【新】状态（深拷贝，不改原状态）
function applyMove(state, from, to) {
  const next = state.map(peg => peg.slice())
  const disc = next[from][next[from].length - 1]
  next[from].pop()
  next[to].push(disc)
  return next
}

// 是否已完成：2 号柱已放满全部 n 个盘
function isSolved(state, n) {
  return state[2].length === n
}

module.exports = { initialState, solve, legalMove, applyMove, isSolved }
