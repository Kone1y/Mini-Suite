// 模块数据（首页与大厅页共享）
// 每个模块：key/标题/主题色/渐变/图标/描述 + tools（含分类 tags）

const MODULES = [
  {
    key: 'tools',
    title: '工具合集',
    short: '工具',
    desc: '日常效率，一应俱全',
    icon: '🧰',
    color: '#534AB7',
    color2: '#7A6FE8',
    bg: '#EEEDFE',
    cats: [
      { key: 'all', label: '全部' },
      { key: 'image', label: '图像' },
      { key: 'dev', label: '开发者' },
      { key: 'life', label: '生活' },
      { key: 'fun', label: '趣味' }
    ],
    tools: [
      { name: '二维码生成', sub: '文本/网址转码', icon: '🔳', url: '/packageTools/pages/qrcode/qrcode', cat: 'image' },
      { name: '二维码扫描', sub: '相机识别', icon: '📷', url: '/packageTools/pages/scan/scan', cat: 'image' },
      { name: '图片压缩', sub: '批量瘦身', icon: '🖼️', url: '/packageTools/pages/compress/compress', cat: 'image' },
      { name: '色值转换', sub: 'HEX/RGB/HSL', icon: '🎨', url: '/packageTools/pages/color/color', cat: 'image' },
      { name: '进制转换', sub: '位运算速查', icon: '🔢', url: '/packageTools/pages/base/base', cat: 'dev' },
      { name: '时间戳', sub: '日期互转', icon: '⏱️', url: '/packageTools/pages/timestamp/timestamp', cat: 'dev' },
      { name: 'JSON 工具', sub: '格式化/校验', icon: '🧾', url: '/packageTools/pages/json/json', cat: 'dev' },
      { name: '正则测试', sub: '匹配高亮', icon: '🔍', url: '/packageTools/pages/regex/regex', cat: 'dev' },
      { name: 'Diff 对比', sub: 'Myers 算法', icon: '🔀', url: '/packageTools/pages/diff/diff', cat: 'dev' },
      { name: 'SQL 练习场', sub: '沙箱闯关', icon: '🗄', url: '/packageTools/pages/sql/sql', cat: 'dev' },
      { name: '十六进制', sub: '魔数识别', icon: '🔬', url: '/packageTools/pages/hex/hex', cat: 'dev' },
      { name: 'Hacker Typer', sub: '装逼神器', icon: '🕶', url: '/packageTools/pages/hacker/hacker', cat: 'fun' },
      { name: '倒计时', sub: '纪念日', icon: '⏳', url: '/packageTools/pages/countdown/countdown', cat: 'life' },
      { name: '单位换算', sub: '7 类单位', icon: '📐', url: '/packageTools/pages/convert/convert', cat: 'life' },
      { name: '房贷计算', sub: '本息/本金', icon: '🏠', url: '/packageTools/pages/mortgage/mortgage', cat: 'life' },
      { name: '亲戚计算', sub: '称呼神器', icon: '👪', url: '/packageTools/pages/relatives/relatives', cat: 'life' },
      { name: '番茄钟', sub: '专注计时', icon: '🍅', url: '/packageTools/pages/pomodoro/pomodoro', cat: 'life' },
      { name: '天空卡片', sub: '实时天气', icon: '⛅', url: '/packageTools/pages/weather/weather', cat: 'life' },
      { name: '网络测速', sub: '四轮测速', icon: '📶', url: '/packageTools/pages/speedtest/speedtest', cat: 'fun' },
      { name: '分贝仪', sub: '环境噪音', icon: '🔊', url: '/packageTools/pages/decibel/decibel', cat: 'fun' },
      { name: '随机决定', sub: '骰子转盘', icon: '🎲', url: '/packageTools/pages/random/random', cat: 'fun' },
      { name: '密码生成', sub: '高强度', icon: '🔐', url: '/packageTools/pages/password/password', cat: 'fun' }
    ]
  },
  {
    key: 'games',
    title: '趣味游戏',
    short: '游戏',
    desc: '碎片时间，来一局',
    icon: '🎮',
    color: '#1F5E9E',
    color2: '#3E86D9',
    bg: '#E5EFFA',
    cats: [
      { key: 'all', label: '全部' },
      { key: 'casual', label: '休闲街机' },
      { key: 'puzzle', label: '棋类解谜' },
      { key: 'algo', label: '算法演示' },
      { key: 'action', label: '弹幕动作' }
    ],
    tools: [
      { name: '2048', sub: '合并冲分', icon: '🎮', url: '/packageGames/pages/g2048/g2048', cat: 'casual' },
      { name: '贪吃蛇', sub: '经典街机', icon: '🐍', url: '/packageGames/pages/snake/snake', cat: 'casual' },
      { name: '霓虹方块', sub: '赛博朋克', icon: '🟪', url: '/packageGames/pages/tetris/tetris', cat: 'casual' },
      { name: '打地鼠', sub: '反应挑战', icon: '🐹', url: '/packageGames/pages/whack/whack', cat: 'casual' },
      { name: '记忆翻牌', sub: '闯关', icon: '🃏', url: '/packageGames/pages/memory/memory', cat: 'casual' },
      { name: '24 点', sub: '算 24', icon: '🧮', url: '/packageGames/pages/game24/game24', cat: 'puzzle' },
      { name: '扫雷', sub: '推理排雷', icon: '💣', url: '/packageGames/pages/minesweeper/minesweeper', cat: 'puzzle' },
      { name: '数独', sub: '三档难度', icon: '🔠', url: '/packageGames/pages/sudoku/sudoku', cat: 'puzzle' },
      { name: '数织', sub: '逻辑像素', icon: '🧩', url: '/packageGames/pages/nonogram/nonogram', cat: 'puzzle' },
      { name: '华容道', sub: '滑块复原', icon: '🏮', url: '/packageGames/pages/klotski/klotski', cat: 'puzzle' },
      { name: '推箱子', sub: '10 关解谜', icon: '📦', url: '/packageGames/pages/sokoban/sokoban', cat: 'puzzle' },
      { name: '五子棋', sub: '人机对战', icon: '⚫', url: '/packageGames/pages/gomoku/gomoku', cat: 'puzzle' },
      { name: '黑白棋 AI', sub: 'α-β 剪枝', icon: '⚪', url: '/packageGames/pages/reversi/reversi', cat: 'puzzle' },
      { name: '点灯 Akari', sub: '唯一解谜题', icon: '💡', url: '/packageGames/pages/akari/akari', cat: 'puzzle' },
      { name: '成语挑战', sub: '四种玩法', icon: '🔤', url: '/packageGames/pages/idiom/idiom', cat: 'puzzle' },
      { name: '汉诺塔', sub: '自动演示', icon: '🗼', url: '/packageGames/pages/hanoi/hanoi', cat: 'algo' },
      { name: '排序可视化', sub: '算法动画', icon: '📊', url: '/packageGames/pages/sortviz/sortviz', cat: 'algo' },
      { name: '迷宫寻路', sub: 'BFS/A*', icon: '🌀', url: '/packageGames/pages/maze/maze', cat: 'algo' },
      { name: '生命游戏', sub: '元胞自动', icon: '🧬', url: '/packageGames/pages/life/life', cat: 'algo' },
      { name: 'Git 修炼场', sub: '命令闯关', icon: '🌳', url: '/packageGames/pages/gitgame/gitgame', cat: 'algo' },
      { name: 'Vim 修炼场', sub: '键位闯关', icon: '⌨️', url: '/packageGames/pages/vim/vim', cat: 'algo' },
      { name: '正则填字', sub: 'NP 谜题', icon: '🔢', url: '/packageGames/pages/regexcross/regexcross', cat: 'puzzle' },
      { name: '星陨突袭', sub: '弹幕闯关', icon: '🚀', url: '/packageGames/pages/shmup/shmup', cat: 'action' }
    ]
  },
  {
    key: 'content',
    title: '内容馆',
    short: '内容',
    desc: '浏览 · 收藏 · 分享',
    icon: '📖',
    color: '#0F6E56',
    color2: '#2BA383',
    bg: '#E1F5EE',
    cats: [{ key: 'all', label: '全部' }],
    tools: [
      { name: '古诗词', sub: '2334 首', icon: '📖', url: '/packageContent/pages/poetry/poetry', cat: 'all' },
      { name: '成语词典', sub: '29000+ 查询', icon: '🔤', url: '/packageGames/pages/guess/guess?dict=1', cat: 'all' },
      { name: '壁纸', sub: '瀑布流', icon: '🌸', url: '/packageContent/pages/wallpaper/wallpaper', cat: 'all' },
      { name: '表情包', sub: '斗图必备', icon: '😄', url: '/packageContent/pages/emoji/emoji', cat: 'all' },
      { name: '我的收藏', sub: '聚合', icon: '⭐', url: '/packageContent/pages/favorites/favorites', cat: 'all' }
    ]
  },
  {
    key: 'mall',
    title: '演示商城',
    short: '商城',
    desc: '商品 · 购物车 · 订单',
    icon: '🛍️',
    color: '#993C1D',
    color2: '#C96B45',
    bg: '#FAECE7',
    cats: [{ key: 'all', label: '全部' }],
    tools: [
      { name: '逛商城', sub: '好物', icon: '🛍️', url: '/packageMall/pages/goods/goods', cat: 'all' },
      { name: '购物车', sub: '结算', icon: '🛒', url: '/packageMall/pages/cart/cart', cat: 'all' },
      { name: '我的订单', sub: '物流', icon: '📦', url: '/packageMall/pages/order/order', cat: 'all' }
    ]
  }
]

function getModule(key) {
  return MODULES.find(m => m.key === key) || null
}

// ---------- 最近使用（storage，每模块最多 4 条） ----------
const RECENT_PREFIX = 'hall_recent_'

function loadRecent(key) {
  try {
    const v = JSON.parse(wx.getStorageSync(RECENT_PREFIX + key) || 'null')
    if (Array.isArray(v)) return v.filter(t => t && t.url)
  } catch (e) { }
  return []
}

function pushRecent(key, tool) {
  if (!tool || !tool.url) return
  let list = loadRecent(key).filter(t => t.url !== tool.url)
  list.unshift({ name: tool.name, icon: tool.icon, url: tool.url })
  list = list.slice(0, 4)
  try { wx.setStorageSync(RECENT_PREFIX + key, JSON.stringify(list)) } catch (e) { }
}

// ---------- 多彩色砖（8 色系循环，活力多彩风） ----------
const BRICKS = [
  { c1: '#6A5AE0', c2: '#8F7BFF' },   // 紫
  { c1: '#2F80ED', c2: '#56CCF2' },   // 蓝
  { c1: '#27AE60', c2: '#6FCF97' },   // 绿
  { c1: '#F2994A', c2: '#FBB86B' },   // 橙
  { c1: '#EB5757', c2: '#F29B9B' },   // 红
  { c1: '#BB6BD9', c2: '#D9A6F5' },   // 粉紫
  { c1: '#00A8A8', c2: '#54D6C8' },   // 青
  { c1: '#D9A62E', c2: '#F2CE6B' }    // 金
]

// 给条目附加色砖（按全局顺序循环分配，同模块内颜色尽量错开）
function decorate(key) {
  const m = getModule(key)
  if (!m) return []
  const start = ['tools', 'games', 'content', 'mall'].indexOf(key) * 2
  return m.tools.map((t, i) => ({
    ...t,
    brick: BRICKS[(start + i) % BRICKS.length]
  }))
}

module.exports = { MODULES, getModule, loadRecent, pushRecent, decorate, BRICKS }
