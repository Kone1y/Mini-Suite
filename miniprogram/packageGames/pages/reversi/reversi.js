const L = require('../../reversi-logic')

const DIFFS = [
  { name: '轻松', depth: 2 },
  { name: '标准', depth: 4 },
  { name: '困难', depth: 6 }
]

// 棋盘配色（经典绿毡）
const C_EMPTY = '#1E7A46'   // 空位绿
const C_MOVE = '#2FA86A'    // 可落点提示
const C_LAST = '#FFD66B'    // 最后落点标记

Page({
  data: {
    boardView: [],          // [{ idx, bg, piece, canMove, isLast }]
    blackCnt: 2,
    whiteCnt: 2,
    turnText: '你的回合（黑）',
    gameOver: false,
    resultText: '',
    diffIdx: 1,
    diffNames: ['轻松', '标准', '困难'],
    thinking: false,
    boardPx: 0,
    cellPx: 0,
    humanColor: L.BLACK,
    introOpen: false
  },

  // 实例字段
  _board: null,
  _turn: L.BLACK,
  _lastMove: -1,
  _history: [],
  _gen: 0,          // 对局代际：newGame 自增，作废思考中的 AI 回调（防新局落旧子）

  onLoad() {
    const W = wx.getSystemInfoSync().windowWidth
    const boardPx = W - 32
    const cellPx = Math.floor(boardPx / 8)
    this.setData({ boardPx: cellPx * 8, cellPx })
    this.newGame()
  },

  newGame(e) {
    // bindtap 直调时事件对象会被当入参——归一
    if (e && typeof e !== 'object') e = null
    this._gen++                      // 作废所有思考中的回调
    this._board = L.initialBoard()
    this._turn = L.BLACK
    this._lastMove = -1
    this._history = []
    this.setData({ gameOver: false, resultText: '', thinking: false, humanColor: L.BLACK })
    this.syncView()
  },

  onDiff(e) {
    const i = Number(e.detail.value)
    this.setData({ diffIdx: i })
  },

  // ---- 渲染 ----
  syncView() {
    const cell = this.data.cellPx
    const moves = new Set(L.validMoves(this._board, this._turn))
    const isHumanTurn = !this.data.gameOver && this._turn === this.data.humanColor && !this.data.thinking
    const boardView = []
    for (let i = 0; i < 64; i++) {
      const v = this._board[i]
      boardView.push({
        idx: i,
        canMove: isHumanTurn && moves.has(i),
        isLast: i === this._lastMove,
        cellSize: cell,
        piece: v,          // 0/1/2，WXML 用三元渲染
        dotSize: Math.floor(cell * 0.76)
      })
    }
    const cnt = L.countPieces(this._board)
    let turnText
    if (this.data.gameOver) {
      turnText = '对局结束'
    } else if (this.data.thinking) {
      turnText = 'AI 思考中…'
    } else if (this._turn === this.data.humanColor) {
      const n = moves.size
      turnText = '你的回合（黑）· 可落 ' + n + ' 处'
    } else {
      turnText = 'AI 回合（白）'
    }
    this.setData({ boardView, blackCnt: cnt.black, whiteCnt: cnt.white, turnText })
  },

  // ---- 人类落子 ----
  onCell(e) {
    if (this.data.gameOver || this.data.thinking) return
    if (this._turn !== this.data.humanColor) return
    const idx = Number(e.currentTarget.dataset.idx)
    const x = idx % 8, y = Math.floor(idx / 8)
    const flips = L.flipsFor(this._board, x, y, this._turn)
    if (!flips) return   // 非法点直接忽略
    this.commitMove(idx)
    // AI 回应由 commitMove 末尾统一调度（避免跳过场景漏触发）
  },

  commitMove(idx) {
    this._history.push(this._board.slice())
    if (this._history.length > 20) this._history.shift()
    this._board = L.applyMove(this._board, idx, this._turn)
    this._lastMove = idx
    this._turn = L.opponent(this._turn)
    // 无子可下自动跳过（给提示）
    if (!this.data.gameOver && L.validMoves(this._board, this._turn).length === 0) {
      const skipped = this._turn === L.BLACK ? '黑' : '白'
      this._turn = L.opponent(this._turn)
      wx.showToast({ title: skipped + '方无处可落，跳过', icon: 'none' })
    }
    if (L.isOver(this._board)) {
      this.finish()
      this.syncView()
      return
    }
    this.syncView()
    // 统一调度：轮到 AI 就走（覆盖 人落子→AI / AI落子跳过人→AI继续 两种路径）
    if (this._turn !== this.data.humanColor && !this.data.thinking) {
      this.aiTurn()
    }
  },

  aiTurn() {
    if (this.data.gameOver) return
    if (this._turn === this.data.humanColor) return
    const gen = this._gen               // 记住本回调属于哪一代对局
    this.setData({ thinking: true }, () => this.syncView())
    // AI 计算放 setTimeout 里，让"思考中"先渲染
    setTimeout(() => {
      if (gen !== this._gen) return     // 已开新局，丢弃过期回调
      const depth = DIFFS[this.data.diffIdx].depth
      const mv = L.aiMove(this._board, this._turn, depth)
      this.setData({ thinking: false })
      if (mv >= 0) {
        this.commitMove(mv)
      } else {
        // AI 无处可下（commitMove 已处理跳过），刷新视图
        this.syncView()
      }
    }, 30)
  },

  finish() {
    const c = L.countPieces(this._board)
    let resultText
    if (c.black > c.white) resultText = '🎉 你赢了 ' + c.black + ' : ' + c.white
    else if (c.black < c.white) resultText = 'AI 获胜 ' + c.black + ' : ' + c.white
    else resultText = '平局 ' + c.black + ' : ' + c.white
    this.setData({ gameOver: true, resultText })
    wx.vibrateShort({ type: 'medium' })
  },

  // ---- 悔棋（退回到上次人类落子前）----
  undo() {
    if (this.data.thinking || !this._history.length) return
    // 回退到最近一次"轮到人类"的历史快照
    let bd = null
    while (this._history.length) {
      const snap = this._history.pop()
      if (L.validMoves(snap, L.BLACK).length > 0) { bd = snap; break }
      bd = snap
    }
    if (bd) {
      this._board = bd
      this._turn = L.BLACK
      this._lastMove = -1
      this.setData({ gameOver: false, resultText: '' })
      this.syncView()
    }
  },

  // 折叠/展开玩法说明
  toggleIntro() {
    this.setData({ introOpen: !this.data.introOpen })
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
