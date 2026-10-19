const L = require('../../gomoku-logic')

Page({
  data: {
    n: L.N,
    cells: [],        // { v, win } 渲染
    turn: 1,          // 1 黑(玩家) 2 白(AI)
    playerFirst: true,
    over: false,
    winner: 0,        // 0无 1玩家 2AI 3和
    moves: 0,
    thinking: false,
    canUndo: false,
    last: null,       // AI 最后一手
    aiLevel: 2        // AI 难度：1休闲 2标准 3大师
  },

  onLoad(options) {
    // 棋盘尺寸按屏算（15 路 + 边距）
    try { this._winW = wx.getSystemInfoSync().windowWidth } catch (e) { this._winW = 375 }
    const bw = this._winW - 56
    this._cell = Math.floor(bw / L.N)
    this._bw = this._cell * L.N
    this.setData({
      bw: this._bw, stoneFont: Math.round(this._cell * 0.5),
      aiLevel: wx.getStorageSync('gomoku_ai_level') || 2
    })
    this.newGame(options.first !== 'ai')
  },

  // 难度切换（对局中切换需重开）
  setLevel(e) {
    const lv = Number(e.currentTarget.dataset.lv) || 2
    if (lv === this.data.aiLevel) return
    wx.setStorageSync('gomoku_ai_level', lv)
    this.setData({ aiLevel: lv })
    if (this.data.moves > 0) {
      wx.showToast({ title: '难度已切换，下局生效', icon: 'none' })
    }
  },

  newGame(playerFirst) {
    // bindtap 直接调用时入参是事件对象（truthy）——只认布尔
    if (typeof playerFirst !== 'boolean') playerFirst = true
    this._board = L.emptyBoard()
    this._history = []
    this.setData({
      cells: this.buildCells(),
      turn: 1,
      playerFirst,
      over: false,
      winner: 0,
      moves: 0,
      thinking: false,
      canUndo: false,
      last: null
    })
    // AI 先手
    if (!playerFirst) this.aiTurn()
  },

  buildCells(winLine) {
    const cells = []
    for (let y = 0; y < L.N; y++) {
      for (let x = 0; x < L.N; x++) {
        const inWin = winLine && winLine.some(([wx, wy]) => wx === x && wy === y)
        cells.push({ v: this._board[y][x], win: !!inWin })
      }
    }
    return cells
  },

  tapCell(e) {
    if (this.data.over || this.data.thinking || this.data.turn !== 1) return
    const idx = Number(e.currentTarget.dataset.idx)
    const x = idx % L.N, y = Math.floor(idx / L.N)
    if (!L.canPlay(this._board, x, y)) return

    this.place(x, y, 1)
    if (!this.data.over) {
      this.aiTurn()
    }
  },

  place(x, y, v) {
    this._board[y][x] = v
    this._history.push([x, y])
    const res = L.checkWin(this._board, x, y)
    const moves = this.data.moves + 1
    if (res) {
      this.setData({
        cells: this.buildCells(res.line),
        over: true,
        winner: res.win,
        moves,
        last: v === 2 ? { x, y } : this.data.last,
        canUndo: this._history.length >= 2
      })
      wx.vibrateShort({ type: res.win === 1 ? 'medium' : 'heavy' })
      return true
    }
    if (L.isFull(this._board)) {
      this.setData({ over: true, winner: 3, moves })
      return true
    }
    this.setData({
      cells: this.buildCells(),
      turn: v === 1 ? 2 : 1,
      moves,
      last: v === 2 ? { x, y } : this.data.last,
      canUndo: this._history.length >= 2
    })
    return false
  },

  aiTurn() {
    this.setData({ thinking: true })
    // 让 UI 先渲染"思考中"
    setTimeout(() => {
      const m = L.aiMoveStrong(this._board, 2, this.data.aiLevel)
      this.setData({ thinking: false })
      this.place(m.x, m.y, 2)
    }, 30)
  },

  undo() {
    // 撤销一对（玩家 + AI）
    if (this._history.length < 2 || this.data.thinking) return
    for (let i = 0; i < 2; i++) {
      const [x, y] = this._history.pop()
      this._board[y][x] = 0
    }
    this.setData({
      cells: this.buildCells(),
      over: false,
      winner: 0,
      turn: 1,
      moves: Math.max(0, this.data.moves - 2),
      canUndo: this._history.length >= 2,
      last: null
    })
    wx.vibrateShort({ type: 'light' })
  },

  switchFirst() {
    if (this.data.moves > 0) {
      wx.showModal({
        title: '重新开局',
        content: '切换先手将重新开局，确定？',
        success: (r) => { if (r.confirm) this.newGame(!this.data.playerFirst) }
      })
    } else {
      this.newGame(!this.data.playerFirst)
    }
  },

  goHome() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) })
  }
})
