const L = require('../../sokoban-logic')

const PROGRESS_KEY = 'sokoban_progress'

Page({
  data: {
    levelIdx: 0,
    levelName: '',
    w: 0, h: 0,
    tiles: [],      // 渲染：{ t } t: wall/floor/goal/box/boxOnGoal/player/playerOnGoal
    steps: 0,
    pushes: 0,
    done: 0,
    total: 0,
    won: false,
    unlocked: 1
  },

  onLoad(options) {
    const unlocked = wx.getStorageSync(PROGRESS_KEY) || 1
    let idx = Number(options.level) || 0
    if (idx >= unlocked) idx = 0
    try { this._winW = wx.getSystemInfoSync().windowWidth } catch (e) { this._winW = 375 }
    this.setData({ unlocked })
    this.loadLevel(idx)
  },

  loadLevel(idx) {
    const raw = L.parseLevel(L.LEVELS[idx].map)
    this._lv = raw
    this._history = []
    this.setData({
      levelIdx: idx,
      levelName: L.LEVELS[idx].name,
      w: raw.w,
      h: raw.h,
      steps: 0,
      pushes: 0,
      done: L.doneCount(raw),
      total: raw.boxes.length,
      won: false,
      tiles: this.buildTiles()
    })
  },

  buildTiles() {
    const lv = this._lv
    const tiles = []
    for (let y = 0; y < lv.h; y++) {
      for (let x = 0; x < lv.w; x++) {
        let t = 'floor'
        if (L.isWall(lv, x, y)) t = 'wall'
        const box = L.boxAt(lv, x, y)
        const goal = L.isGoal(lv, x, y)
        if (lv.player[0] === x && lv.player[1] === y) t = goal ? 'playerOnGoal' : 'player'
        else if (box) t = goal ? 'boxOnGoal' : 'box'
        else if (goal) t = 'goal'
        tiles.push({ t })
      }
    }
    return tiles
  },

  onDir(e) {
    const map = { up: {dx:0,dy:-1}, down: {dx:0,dy:1}, left: {dx:-1,dy:0}, right: {dx:1,dy:0} }
    this.doMove(map[e.currentTarget.dataset.dir])
  },

  // 滑动操控
  onTouchStart(e) {
    const t = e.touches[0]
    this._sx = t.clientX; this._sy = t.clientY
  },
  onTouchEnd(e) {
    const t = e.changedTouches[0]
    const dx = t.clientX - this._sx, dy = t.clientY - this._sy
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return
    let dir
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left'
    else dir = dy > 0 ? 'down' : 'up'
    const map = { up: {dx:0,dy:-1}, down: {dx:0,dy:1}, left: {dx:-1,dy:0}, right: {dx:1,dy:0} }
    this.doMove(map[dir])
  },

  doMove(dir) {
    if (this.data.won) return
    // 历史快照（撤销）
    this._history.push({
      player: this._lv.player.slice(),
      boxes: this._lv.boxes.map(b => b.slice())
    })
    if (this._history.length > 100) this._history.shift()

    const r = L.move(this._lv, dir)
    if (!r) { this._history.pop(); return }

    this._lv.player = r.player
    this._lv.boxes = r.boxes
    if (r.pushed) wx.vibrateShort({ type: 'light' })

    const won = r.won
    if (won) {
      // 解锁下一关
      const next = this.data.levelIdx + 2
      if (next > this.data.unlocked && next <= L.LEVELS.length) {
        wx.setStorageSync(PROGRESS_KEY, next)
        this.setData({ unlocked: next })
      }
      wx.vibrateShort({ type: 'medium' })
    }
    this.setData({
      tiles: this.buildTiles(),
      steps: this.data.steps + 1,
      pushes: this.data.pushes + (r.pushed ? 1 : 0),
      done: L.doneCount(this._lv),
      won
    })
  },

  undo() {
    if (!this._history || !this._history.length) return
    const last = this._history.pop()
    this._lv.player = last.player
    this._lv.boxes = last.boxes
    this.setData({
      tiles: this.buildTiles(),
      done: L.doneCount(this._lv),
      won: false
    })
  },

  restartLevel() { this.loadLevel(this.data.levelIdx) },

  nextLevel() {
    if (this.data.levelIdx < L.LEVELS.length - 1) this.loadLevel(this.data.levelIdx + 1)
  },

  prevLevel() {
    if (this.data.levelIdx > 0) this.loadLevel(this.data.levelIdx - 1)
  },

  goHome() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) })
  }
})
