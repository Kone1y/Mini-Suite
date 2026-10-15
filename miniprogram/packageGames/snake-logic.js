// 贪吃蛇核心逻辑（纯函数部分，便于单测）
// 20×20 网格；蛇 = 位置数组 [head, ..., tail]；食物 = idx

const SIZE = 20

function eq(a, b) { return a[0] === b[0] && a[1] === b[1] }

function randomFood(snake) {
  const occupied = new Set(snake.map(p => p[0] * SIZE + p[1]))
  const empties = []
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (!occupied.has(i)) empties.push(i)
  }
  if (!empties.length) return null   // 满盘
  const pick = empties[Math.floor(Math.random() * empties.length)]
  return [Math.floor(pick / SIZE), pick % SIZE]
}

// 一步移动。dir: {dx, dy}，dx=列增量、dy=行增量（位置是 [行,列]）。
// 返回 { snake, food, ate, dead }
function step(snake, food, dir) {
  const head = snake[0]
  const nh = [head[0] + dir.dy, head[1] + dir.dx]
  // 撞墙
  if (nh[0] < 0 || nh[0] >= SIZE || nh[1] < 0 || nh[1] >= SIZE) {
    return { snake, food, ate: false, dead: true }
  }
  // 撞己（注意：如果尾巴将移走，尾格是合法的——先判断是否吃食物）
  const willEat = eq(nh, food)
  const bodyToCheck = willEat ? snake : snake.slice(0, -1)
  if (bodyToCheck.some(p => eq(p, nh))) {
    return { snake, food, ate: false, dead: true }
  }
  const ns = [nh].concat(willEat ? snake : snake.slice(0, -1))
  let nf = food
  if (willEat) nf = randomFood(ns)
  return { snake: ns, food: nf, ate: willEat, dead: false }
}

function initSnake() {
  // 初始 3 节，头在中间偏左，向右移动
  return [[10, 10], [10, 9], [10, 8]]
}

// 方向反转判定（不能 180° 掉头）
function isOpposite(a, b) {
  return a.dx === -b.dx && a.dy === -b.dy
}

module.exports = { SIZE, initSnake, randomFood, step, isOpposite, eq }
