// 推箱子核心逻辑（纯函数）
// 地图字符：# 墙, ' ' 地板, . 目标点, $ 箱子, * 箱子在目标点, @ 玩家, + 玩家在目标点

function parseLevel(text) {
  const rows = text.trim().split('\n').map(r => r.replace(/\r/, ''))
  let player = null, boxes = [], goals = [], walls = []
  const h = rows.length, w = Math.max(...rows.map(r => r.length))
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]
      if (c === '#') walls.push([x, y])
      else if (c === '.') goals.push([x, y])
      else if (c === '$') boxes.push([x, y])
      else if (c === '*') { boxes.push([x, y]); goals.push([x, y]) }
      else if (c === '@') player = [x, y]
      else if (c === '+') { player = [x, y]; goals.push([x, y]) }
    }
  })
  return { w, h, walls, goals, boxes, player }
}

// 10 关：难度递进（经典微型关卡，手工校验可解）
const LEVELS = [
  // 1 入门：1 箱
  { name: '第 1 关 · 初试身手', map: `
#####
#@ $.#
#####` },
  // 2 两箱
  { name: '第 2 关 · 双箱', map: `
######
#@ $ .#
# $  .#
######` },
  // 3 转角推（宽走廊，验证可解）
  { name: '第 3 关 · 转角', map: `
#######
#     #
# .   #
# $   #
#@    #
#######` },
  // 4 推入凹槽
  { name: '第 4 关 · 凹槽', map: `
########
#  #   #
#  $ $ #
#@ . . #
#  #   #
########` },
  // 5 经典 microban
  { name: '第 5 关 · 回廊', map: `
########
#  # . #
#  $   #
#@ $ . #
########` },
  // 6 三箱
  { name: '第 6 关 · 三箱', map: `
#########
#   #   #
# $ $ $ #
#  .@ . #
#   .   #
#########` },
  // 7 仓库
  { name: '第 7 关 · 小仓库', map: `
########
#. #   #
#  $ $ #
#  .$@ #
##.#  #
########` },
  // 8 三箱直推（宽走廊）
  { name: '第 8 关 · 三连推', map: `
#########
#       #
# $ $ $ #
#       #
# . . . #
#   @   #
#########` },
  // 9 双排（错位目标）
  { name: '第 9 关 · 错位', map: `
#########
#   #   #
# $ $ $ #
#  @    #
#  . . .#
#   #   #
#########` },
  // 10 大师试炼（3 箱 3 目标，混合路线）
  { name: '第 10 关 · 大师试炼', map: `
##########
#        #
# $ $ $  #
#   ..   #
# @  .   #
##########` }
]

const isWall = (lv, x, y) => lv.walls.some(([wx, wy]) => wx === x && wy === y)
const isGoal = (lv, x, y) => lv.goals.some(([gx, gy]) => gx === x && gy === y)
const boxAt = (lv, x, y) => lv.boxes.find(([bx, by]) => bx === x && by === y)

// 移动。dir: {dx,dy}。返回 { boxes, player, pushed, won }（新数组）
function move(lv, dir) {
  const [px, py] = lv.player
  const nx = px + dir.dx, ny = py + dir.dy
  if (isWall(lv, nx, ny)) return null
  const box = boxAt(lv, nx, ny)
  let boxes = lv.boxes
  if (box) {
    const bx = nx + dir.dx, by = ny + dir.dy
    if (isWall(lv, bx, by) || boxAt(lv, bx, by)) return null
    boxes = lv.boxes.map(b => (b === box ? [bx, by] : b.slice()))
  }
  const won = boxes.every(([bx, by]) => isGoal(lv, bx, by))
  return { player: [nx, ny], boxes, pushed: !!box, won }
}

// 统计已完成目标数
function doneCount(lv) {
  return lv.boxes.filter(([bx, by]) => isGoal(lv, bx, by)).length
}

module.exports = { LEVELS, parseLevel, move, doneCount, isWall, isGoal, boxAt }
