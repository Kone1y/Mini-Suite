// 成语接龙：尾字接首字（同音即可），4 选 1，链越越长
const { request } = require('../../../utils/request')

Page({
  data: {
    start: null,           // 首发词 {word, pinyin, explanation}
    q: null,               // 当前接龙题 {prev, answer, options, tailSound, explanation}
    chain: [],             // 已接链条 [{word, pinyin}]
    picked: '',
    correct: null,
    score: 0,              // 接龙长度（成功次数）
    best: 0,
    loading: true,
    resetTip: ''           // 无词可接时的换链提示
  },

  onLoad() {
    try {
      this._best = Number(wx.getStorageSync('idiom_chain_best') || 0)
      this.setData({ best: this._best })
    } catch (e) { }
    this.fetchStart()
  },

  // 拉首发词
  fetchStart() {
    this.setData({ loading: true, resetTip: '' })
    request({ url: '/api/idiom/chain' })
      .then(d => {
        this.setData({
          start: d,
          chain: [{ word: d.word, pinyin: d.pinyin }],
          q: null, picked: '', correct: null,
          loading: false
        })
      })
      .catch(() => {
        this.setData({ loading: false })
        wx.showToast({ title: '出题失败，请确认后端已启动', icon: 'none' })
      })
  },

  // 首发词就绪 → 出第一道接龙题
  startChain() {
    const w = this.data.start.word
    this.setData({ start: null })
    this.fetchNext(w)
  },

  // 拉下一道接龙题
  fetchNext(prevWord) {
    this.setData({ loading: true, resetTip: '' })
    request({ url: '/api/idiom/chain?word=' + encodeURIComponent(prevWord) })
      .then(d => {
        if (d.mode === 'reset') {
          // 尾音无人能接——后端给了新首发
          this.setData({
            start: d,
            loading: false,
            resetTip: '「' + prevWord + '」尾音无词可接，已换新链',
            q: null, picked: '', correct: null
          })
          return
        }
        this.setData({ q: d, picked: '', correct: null, loading: false })
      })
      .catch(() => {
        this.setData({ loading: false })
        wx.showToast({ title: '出题失败', icon: 'none' })
      })
  },

  onPick(e) {
    if (this.data.correct !== null || this.data.loading || !this.data.q) return
    const word = e.currentTarget.dataset.word
    const isRight = word === this.data.q.answer
    if (isRight) {
      const score = this.data.score + 1
      const chain = this.data.chain.concat([{ word, pinyin: this.data.q.pinyin }])
      this.setData({ picked: word, correct: true, score, chain })
      if (score > (this._best || 0)) {
        this._best = score
        try { wx.setStorageSync('idiom_chain_best', score) } catch (err) { }
        this.setData({ best: score })
      }
      wx.vibrateShort({ type: 'heavy' })
    } else {
      this.setData({ picked: word, correct: false })
      wx.vibrateShort({ type: 'light' })
    }
  },

  // 继续：答对→接着出题；答错→看答案后继续接（不扣分，链断提示）
  onNext() {
    if (!this.data.q) return
    this.fetchNext(this.data.q.answer)
  },

  // 换一条链
  newChain() {
    this.setData({ score: 0 })
    this.fetchStart()
  },

  goBack() { wx.navigateBack({ delta: 1 }) }
})
