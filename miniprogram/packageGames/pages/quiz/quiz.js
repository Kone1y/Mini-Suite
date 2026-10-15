// 释义选词：看释义从 4 选项挑成语。答错 3 次结束，连对计分。
const { request } = require('../../../utils/request')

const MAX_WRONG = 3

Page({
  data: {
    q: null,               // {explanation, options, answer, pinyin, answerDetail}
    picked: '',            // 已选的词
    correct: null,         // 本题对错（true/false/null 未答）
    streak: 0,             // 连对
    best: 0,               // 最佳连对
    wrongs: 0,             // 已错次数
    total: 0,              // 已答题数
    over: false,           // 游戏结束
    loading: true,
    usedWords: []          // 已出词（避免重复）
  },

  onLoad() {
    try {
      this._best = Number(wx.getStorageSync('idiom_quiz_best') || 0)
    } catch (e) { this._best = 0 }
    this.nextQuestion()
  },

  nextQuestion() {
    if (this.data.over) return
    this.setData({ loading: true, picked: '', correct: null })
    const exclude = this.data.usedWords.slice(-40).join(',')
    request({ url: '/api/idiom/quiz' + (exclude ? '?exclude=' + encodeURIComponent(exclude) : '') })
      .then(d => {
        const used = this.data.usedWords.concat([d.answer]).slice(-60)
        this.setData({ q: d, loading: false, usedWords: used })
      })
      .catch(() => {
        this.setData({ loading: false })
        wx.showToast({ title: '出题失败，请确认后端已启动', icon: 'none' })
      })
  },

  onPick(e) {
    if (this.data.correct !== null || this.data.loading || !this.data.q) return
    const word = e.currentTarget.dataset.word
    const isRight = word === this.data.q.answer
    const streak = isRight ? this.data.streak + 1 : 0
    const wrongs = isRight ? this.data.wrongs : this.data.wrongs + 1
    this.setData({
      picked: word,
      correct: isRight,
      streak,
      best: Math.max(this.data.best, streak),
      wrongs,
      total: this.data.total + 1
    })
    wx.vibrateShort({ type: isRight ? 'heavy' : 'light' })
    if (isRight && streak > (this._best || 0)) {
      this._best = streak
      try { wx.setStorageSync('idiom_quiz_best', streak) } catch (err) { }
    }
    if (wrongs >= MAX_WRONG) {
      setTimeout(() => this.setData({ over: true }), 700)
    }
  },

  // 下一题（答错未结束也可见答案后继续）
  onNext() {
    if (this.data.over) return
    this.nextQuestion()
  },

  restart() {
    this.setData({ streak: 0, wrongs: 0, total: 0, over: false, usedWords: [] })
    this.nextQuestion()
  },

  goBack() { wx.navigateBack({ delta: 1 }) }
})
