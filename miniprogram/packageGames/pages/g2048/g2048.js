const logic = require('../../logic')

const BEST_KEY = 'g2048_best'

Page({
  data: {
    board: [],
    cells: [],      // 渲染用：16 格 { v, new, merged }
    score: 0,
    best: 0,
    over: false,
    won: false,
    canUndo: false
  },

  onLoad() {
    this.setData({ best: wx.getStorageSync(BEST_KEY) || 0 })
    this._history = []   // 撤销栈：[{board, score}]，最多 10 步
    this.restart()
  },

  restart() {
    this._board = logic.initBoard()
    this._history = []
    this.setData({
      board: this._board,
      cells: this._board.map(v => ({ v })),
      score: 0,
      over: false,
      won: false,
      canUndo: false
    })
  },

  // 触摸滑动识别
  onTouchStart(e) {
    const t = e.touches[0]
    this._sx = t.clientX
    this._sy = t.clientY
  },
  onTouchEnd(e) {
    const t = e.changedTouches[0]
    const dx = t.clientX - this._sx
    const dy = t.clientY - this._sy
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return
    let dir
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left'
    else dir = dy > 0 ? 'down' : 'up'
    this.doMove(dir)
  },

  doMove(dir) {
    if (this.data.over) return
    const prevBoard = this._board.slice()
    const prevScore = this.data.score

    const { board, gained, moved } = logic.move(this._board, dir)
    if (!moved) return

    // spawn 前快照，spawn 后对比得出新块位置
    const afterMove = board.slice()
    logic.spawnTile(board)

    const cells = board.map((v, i) => {
      const isSpawn = (v !== 0 && afterMove[i] === 0)          // 空位变非空 = 新块
      const isMerged = (v !== 0 && prevBoard[i] !== v && prevBoard[i] !== 0)  // 原位翻倍 = 合并
      return { v, new: isSpawn, merged: isMerged }
    })

    // 入撤销栈（上限 10）
    this._history.push({ board: prevBoard, score: prevScore })
    if (this._history.length > 10) this._history.shift()

    this._board = board
    const score = this.data.score + gained
    const best = Math.max(score, this.data.best)
    if (best > this.data.best) wx.setStorageSync(BEST_KEY, best)

    const won = !this.data.won && logic.hasWon(board)
    const over = !logic.canMove(board)

    this.setData({
      board,
      cells,
      score,
      best,
      won,
      over,
      canUndo: this._history.length > 0
    })
  },

  undo() {
    if (!this._history || !this._history.length) return
    const last = this._history.pop()
    this._board = last.board
    this.setData({
      board: last.board,
      cells: last.board.map(v => ({ v })),
      score: last.score,
      over: false,
      won: false,
      canUndo: this._history.length > 0
    })
    wx.vibrateShort({ type: 'light' })
  },

  keepPlaying() {
    this.setData({ won: false })
  },

  goHome() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) })
  }
})
