// Vim 键位修炼场
const L = require('../../vim-logic')

const STORE_PROGRESS = 'vim_progress_v1'

// 关卡：start（初始文本+光标）/ target（目标文本+光标）/ 允许的按键提示
const LEVELS = [
  {
    id: 1, name: 'hjkl 移动', cat: '移动',
    desc: 'h 左 j 下 k 上 l 右。把光标移到 ★ 标记的位置（第 2 行第 3 列，0 起）。',
    start: ['the quick fox', 'jumps ★over', 'the dog'], sr: 0, sc: 0,
    target: ['the quick fox', 'jumps ★over', 'the dog'], tr: 1, tc: 7,
    par: 3
  },
  {
    id: 2, name: '词间跳跃 w/b', cat: '移动',
    desc: 'w 跳到下一个词首，b 跳回上一个词首。到最后一词。',
    start: ['alpha beta gamma delta'], sr: 0, sc: 0,
    target: ['alpha beta gamma delta'], tr: 0, tc: 11,
    par: 3
  },
  {
    id: 3, name: '行首行尾 0/$', cat: '移动',
    desc: '0 到行首，$ 到行尾。先到行尾再到下一行行首。',
    start: ['first line', 'second'], sr: 0, sc: 3,
    target: ['first line', 'second'], tr: 1, tc: 0,
    par: 4
  },
  {
    id: 4, name: '文件跳转 gg/G', cat: '移动',
    desc: 'gg 回文件头，G 到文件尾。从中间直达结尾。',
    start: ['one', 'two', 'three', 'four'], sr: 1, sc: 0,
    target: ['one', 'two', 'three', 'four'], tr: 3, tc: 0,
    par: 1
  },
  {
    id: 5, name: '行内查找 f', cat: '移动',
    desc: 'f<字符> 跳到当前行下一个该字符。跳到冒号处。',
    start: ['key: value = 42'], sr: 0, sc: 0,
    target: ['key: value = 42'], tr: 0, tc: 3,
    par: 1
  },
  {
    id: 6, name: '删除字符 x', cat: '编辑',
    desc: 'x 删除光标处字符（可加计数 3x）。',
    start: ['XXhello world'], sr: 0, sc: 0,
    target: ['hello world'], tr: 0, tc: 0,
    par: 1
  },
  {
    id: 7, name: '删词 dw', cat: '编辑',
    desc: 'dw 从光标删到词尾。',
    start: ['delete me please'], sr: 0, sc: 0,
    target: ['me please'], tr: 0, tc: 0,
    par: 1
  },
  {
    id: 8, name: '删行 dd', cat: '编辑',
    desc: 'dd 删除整行（2dd 删两行）。',
    start: ['keep', 'remove me', 'and me', 'keep too'], sr: 1, sc: 0,
    target: ['keep', 'keep too'], tr: 1, tc: 0,
    par: 1
  },
  {
    id: 9, name: '复制粘贴 yy/p', cat: '编辑',
    desc: 'yy 复制当前行，p 粘贴到当前行的下一行。',
    start: ['copy me', 'target'], sr: 0, sc: 0,
    target: ['copy me', 'target', 'copy me'], tr: 2, tc: 0,
    par: 3
  },
  {
    id: 10, name: '替换 r', cat: '编辑',
    desc: 'r<字符> 替换光标处字符（不进插入模式）。',
    start: ['hellO world'], sr: 0, sc: 4,
    target: ['hello world'], tr: 0, tc: 4,
    par: 1
  },
  {
    id: 11, name: '撤销 u', cat: '编辑',
    desc: 'u 撤销上一步。删错了要会救回来。',
    start: ['precious data'], sr: 0, sc: 0,
    target: ['precious data'], tr: 0, tc: 0,
    par: 3   // x + u + （或直接不动？判定需操作序列：x 后 u）
  },
  {
    id: 12, name: '组合技 2dw', cat: '挑战',
    desc: '计数 + operator + motion。用一条命令删掉前两个词。',
    start: ['one two three four'], sr: 0, sc: 0,
    target: ['three four'], tr: 0, tc: 0,
    par: 1
  }
]

// 第 11 关特殊判定：必须先做一次修改再撤销（步数≥2 才算过）
Page({
  data: {
    screen: 'select',
    levels: [],
    cur: null,
    view: [],            // 渲染行 [{text, cur}]  cur=光标列
    keys: '',            // 当前输入的按键序列（显示用）
    steps: 0,
    status: '',
    won: false,
    err: ''
  },

  _state: null,
  _target: null,

  onLoad() {
    try {
      this._passed = JSON.parse(wx.getStorageSync(STORE_PROGRESS) || '{}')
    } catch (e) { this._passed = {} }
    this.buildList()
  },

  buildList() {
    const levels = LEVELS.map(l => ({ ...l, done: !!this._passed[l.id] }))
    this.setData({ levels })
  },

  onLevelTap(e) {
    const id = Number(e.currentTarget.dataset.id)
    const cur = LEVELS.find(l => l.id === id)
    if (!cur) return
    this.startLevel(cur)
  },

  startLevel(cur) {
    this._state = L.createState(cur.start, [cur.sr, cur.sc])
    this._target = L.serialize(L.createState(cur.target, [cur.tr, cur.tc]))
    this._modCount = 0    // 修改类命令计数（第 11 关用）
    this.setData({
      screen: 'play', cur,
      keys: '', steps: 0, won: false, err: '',
      status: '输入按键序列达到目标状态'
    })
    this.render()
  },

  render() {
    const s = this._state
    const view = s.lines.map((text, r) => {
      if (r !== s.r) return { text, cur: -1 }
      return {
        text, cur: s.c,
        before: text.slice(0, s.c),
        at: text[s.c] || ' ',
        after: text.slice(s.c + 1)
      }
    })
    this.setData({ view })
  },

  onKey(e) {
    if (this.data.won) return
    const k = e.currentTarget.dataset.k
    if (k === '⌫') {
      // 退格：去掉按键序列最后一个字符
      const keys = this.data.keys.slice(0, -1)
      this.setData({ keys, err: '' })
      return
    }
    if (k === '↵') {
      this.runCmd(this.data.keys)
      return
    }
    this.setData({ keys: this.data.keys + k, err: '' })
  },

  runCmd(cmd) {
    if (!cmd) return
    const before = L.serialize(this._state)
    const r = L.apply(this._state, cmd)
    const after = L.serialize(this._state)
    if (!r.ok) {
      this.setData({ err: r.err || '命令无效', keys: '' })
      return
    }
    if (before !== after) this._modCount++
    this.setData({ keys: '', steps: this.data.steps + 1, err: '' })
    this.render()
    this.checkWin()
  },

  checkWin() {
    const cur = this.data.cur
    let ok = L.serialize(this._state) === this._target
    if (cur.id === 11) ok = ok && this._modCount >= 2   // 必须修改过再撤销
    if (ok) {
      this._passed[cur.id] = true
      try { wx.setStorageSync(STORE_PROGRESS, JSON.stringify(this._passed)) } catch (e) { }
      this.buildList()
      this.setData({
        won: true,
        status: '🎉 过关！用了 ' + this.data.steps + ' 步（标准 ' + cur.par + ' 步）'
      })
      wx.vibrateShort({ type: 'heavy' })
    }
  },

  onResetLevel() { this.startLevel(this.data.cur) },
  onNextLevel() {
    const next = LEVELS.find(l => l.id === this.data.cur.id + 1)
    if (next) this.startLevel(next)
    else this.setData({ screen: 'select' })
  },
  backToSelect() { this.setData({ screen: 'select' }) },
  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
