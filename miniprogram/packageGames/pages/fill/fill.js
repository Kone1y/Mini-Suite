// 补全成语：挖空填字，6 选字，限时闯关
const { request } = require('../../../utils/request')

const ROUND_TIME = 30        // 每题限时（秒）
const MAX_WRONG = 3

Page({
  data: {
    q: null,               // {word, blanks, answerChars, options, nBlanks, explanation}
    display: [],           // 4 格展示 [{ch|'', blank}]
    pickedChars: [],       // 已填入的字（按 blanks 顺序，null 未填）
    pickedOptIdx: [],      // 已用掉的选项下标
    selSlot: -1,           // 当前选中的空（-1 未选）
    correct: null,
    score: 0,
    wrongs: 0,
    over: false,
    loading: true,
    timeLeft: ROUND_TIME,
    usedWords: []
  },

  _timer: null,

  onLoad() {
    try {
      this._best = Number(wx.getStorageSync('idiom_fill_best') || 0)
    } catch (e) { this._best = 0 }
    this.nextQuestion()
  },

  onUnload() { this.clearTimer() },
  onHide() { this.clearTimer() },
  onShow() {
    if (this.data.q && this.data.correct === null && !this.data.loading && !this.data.over) {
      this.startTimer()
    }
  },

  clearTimer() { if (this._timer) { clearInterval(this._timer); this._timer = null } },

  startTimer() {
    this.clearTimer()
    this._timer = setInterval(() => {
      const t = this.data.timeLeft - 1
      if (t <= 0) {
        this.clearTimer()
        // 超时 = 答错
        this.timeUp()
      } else {
        this.setData({ timeLeft: t })
      }
    }, 1000)
  },

  timeUp() {
    if (this.data.correct !== null) return
    const wrongs = this.data.wrongs + 1
    this.setData({ correct: false, wrongs, timeLeft: 0 })
    wx.vibrateShort({ type: 'light' })
    if (wrongs >= MAX_WRONG) {
      setTimeout(() => this.setData({ over: true }), 900)
    }
  },

  nextQuestion() {
    if (this.data.over) return
    this.clearTimer()
    this.setData({ loading: true, picked: '', pickedChars: [], pickedOptIdx: [], selSlot: -1, correct: null })
    const exclude = this.data.usedWords.slice(-40).join(',')
    request({ url: '/api/idiom/fill' + (exclude ? '?exclude=' + encodeURIComponent(exclude) : '') })
      .then(d => {
        const used = this.data.usedWords.concat([d.word]).slice(-60)
        // 关键：blanks 排序（后端 random.sample 可能乱序如 [3,1]），
        // answerChars 跟随重排，保证 slot 0 = 最左空格
        const order = d.blanks.map((p, i) => ({ p, ch: d.answerChars[i] }))
        order.sort((a, b) => a.p - b.p)
        d.blanks = order.map(o => o.p)
        d.answerChars = order.map(o => o.ch)
        const display = d.word.split('').map((ch, i) => ({
          ch: d.blanks.indexOf(i) >= 0 ? '' : ch,
          blank: d.blanks.indexOf(i) >= 0
        }))
        this.setData({
          q: d, display, loading: false, usedWords: used,
          pickedChars: new Array(d.nBlanks).fill(null),
          pickedOptIdx: [],
          selSlot: d.nBlanks === 1 ? 0 : -1,   // 单空题自动选中；双空题等玩家点空
          timeLeft: ROUND_TIME
        })
        this.startTimer()
      })
      .catch(() => {
        this.setData({ loading: false })
        wx.showToast({ title: '出题失败，请确认后端已启动', icon: 'none' })
      })
  },

  // 点空格：选中该空（再点已填的空 = 撤回并选中）
  onSlotTap(e) {
    if (this.data.correct !== null || !this.data.q) return
    const slot = Number(e.currentTarget.dataset.slot)
    if (this.data.pickedChars[slot] != null) {
      // 撤回该空已填的字，并选中该空
      const ch = this.data.pickedChars[slot]
      const oi = this.data.pickedOptIdx.lastIndexOf(this.data.q.options.indexOf(ch))
      let pickedOptIdx = this.data.pickedOptIdx
      if (oi >= 0) pickedOptIdx = this.data.pickedOptIdx.filter((_, i) => i !== oi)
      const pickedChars = this.data.pickedChars.slice()
      pickedChars[slot] = null
      this.setData({ pickedChars, pickedOptIdx, selSlot: slot })
      return
    }
    this.setData({ selSlot: slot })
  },

  // 点候选字：填入当前选中的空
  onCharTap(e) {
    if (this.data.correct !== null || this.data.loading || !this.data.q) return
    // 未选空时：自动选第一个未填的空（兜底，正常流程都会先点空）
    let slot = this.data.selSlot
    if (slot < 0 || this.data.pickedChars[slot] != null) {
      slot = this.data.pickedChars.indexOf(null)
      if (slot < 0) return
    }
    const oi = Number(e.currentTarget.dataset.idx)
    if (this.data.pickedOptIdx.indexOf(oi) >= 0) return   // 已用过的选项
    const pickedChars = this.data.pickedChars.slice()
    pickedChars[slot] = this.data.q.options[oi]
    const pickedOptIdx = this.data.pickedOptIdx.concat([oi])
    // 自动推进：填完这空后，选中下一个未填的空
    let nextSel = pickedChars.indexOf(null)
    this.setData({ pickedChars, pickedOptIdx, selSlot: nextSel })
    // 全部填满 → 判定
    if (nextSel < 0) {
      this.judge(pickedChars)
    }
  },

  judge(pickedChars) {
    const q = this.data.q
    const isRight = pickedChars.every((ch, i) => ch === q.answerChars[i])
    if (isRight) {
      this.clearTimer()
      const score = this.data.score + 1
      this.setData({ correct: true, score })
      if (score > (this._best || 0)) {
        this._best = score
        try { wx.setStorageSync('idiom_fill_best', score) } catch (err) { }
      }
      wx.vibrateShort({ type: 'heavy' })
    } else {
      const wrongs = this.data.wrongs + 1
      this.setData({ correct: false, wrongs })
      wx.vibrateShort({ type: 'light' })
      if (wrongs >= MAX_WRONG) {
        this.clearTimer()
        setTimeout(() => this.setData({ over: true }), 900)
      }
    }
  },

  onNext() {
    if (this.data.over) return
    this.nextQuestion()
  },

  restart() {
    this.setData({ score: 0, wrongs: 0, over: false, usedWords: [], timeLeft: ROUND_TIME, selSlot: -1 })
    this.nextQuestion()
  },

  goBack() { wx.navigateBack({ delta: 1 }) }
})
