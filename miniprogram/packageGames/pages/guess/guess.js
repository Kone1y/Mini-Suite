const L = require('../../idiom-logic')
const { request } = require('../../../utils/request')

const STORE_DAILY = 'idiom_daily_v1'   // { date, rows:[...], win }
const STORE_STREAK = 'idiom_streak_v1' // { count, lastDate, played, wins }

Page({
  data: {
    mode: 'daily',            // daily | endless
    answer: null,             // { word, pinyin, explanation }（pinyin 前端不需要展示答案，但判定用）
    rows: [],                 // 已猜记录 [{chars,pinyins}]
    input: '',                // 当前输入的四字成语
    candidates: [],           // 输入联想候选
    showCands: false,
    status: '',
    finished: false,
    win: false,
    detail: null,             // 结算释义卡
    canShare: false,
    streak: { played: 0, wins: 0, count: 0 },
    dictOpen: false,          // 词典面板
    dictKeyword: '',
    dictItems: [],
    dictTotal: 0,
    dictDetail: null,         // 词典词条详情
    inputMethod: 'char',      // char（输字搜词）| abbr（输拼音首字母）
    helpOpen: false            // 玩法说明折叠（首次进入自动展开，见 onLoad）
  },

  onLoad(opts) {
    opts = opts || {}
    const seen = wx.getStorageSync('idiom_help_seen')
    this.setData({ mode: opts.mode === 'endless' ? 'endless' : 'daily', helpOpen: !seen })
    if (!seen) { try { wx.setStorageSync('idiom_help_seen', '1') } catch (e) { } }
    this.loadStreak()
    this.newRound()
    // 内容馆入口：直接开词典
    if (opts.dict === '1' || opts.dict === 1) {
      this.setData({ dictOpen: true })
    }
  },

  // ---------- 战绩 ----------
  loadStreak() {
    try {
      const v = JSON.parse(wx.getStorageSync(STORE_STREAK) || 'null')
      if (v) this.setData({ streak: v })
    } catch (e) { }
  },
  saveResultToStreak(win) {
    const s = this.data.streak
    const today = L.todayKey()
    const next = {
      played: (s.played || 0) + 1,
      wins: (s.wins || 0) + (win ? 1 : 0),
      count: (s.lastDate === this.yesterdayKey() && win) ? (s.count || 0) + 1 : (win ? 1 : 0),
      lastDate: today
    }
    this.setData({ streak: next })
    try { wx.setStorageSync(STORE_STREAK, JSON.stringify(next)) } catch (e) { }
  },
  yesterdayKey() {
    const d = new Date(Date.now() - 86400000)
    return L.todayKey(d)
  },

  // ---------- 局 ----------
  newRound() {
    if (this.data.mode === 'daily') {
      // 每日一题：本地缓存当日局（当天内同一题）
      try {
        const saved = JSON.parse(wx.getStorageSync(STORE_DAILY) || 'null')
        if (saved && saved.date === L.todayKey()) {
          this.setData({
            rows: saved.rows || [],
            finished: saved.finished || false,
            win: saved.win || false,
            answer: saved.answer,
            input: '', candidates: [], showCands: false, detail: null,
            status: saved.finished ? (saved.win ? '已通关 · 明天再来' : '今日已结束') : '输入一个四字成语开始'
          })
          if (saved.finished) this.revealDetail(saved.answer)
          return
        }
      } catch (e) { }
    }
    // 拉新题
    this.setData({ status: '出题中…', rows: [], finished: false, win: false, detail: null, input: '', candidates: [] })
    request({ url: '/api/idiom/random' }).then(d => {
      const answer = { word: d.word, pinyin: d.pinyin, explanation: d.explanation, derivation: d.derivation }
      this.setData({ answer, status: '输入一个四字成语开始' })
      if (this.data.mode === 'daily') this.saveDaily(answer, [], false, false)
    }).catch(() => {
      this.setData({ status: '后端不可达（每日一题需启动后端）' })
    })
  },

  saveDaily(answer, rows, finished, win) {
    try {
      wx.setStorageSync(STORE_DAILY, JSON.stringify({ date: L.todayKey(), answer, rows, finished, win }))
    } catch (e) { }
  },

  revealDetail(answer) {
    this.setData({
      detail: {
        word: answer.word,
        pinyin: answer.pinyin,
        explanation: answer.explanation,
        derivation: answer.derivation
      }
    })
  },

  // ---------- 输入与联想 ----------
  onInput(e) {
    const v = e.detail.value.trim()
    this.setData({ input: v })
    this.searchCands(v)
  },

  searchCands(q) {
    if (!q || q.length < 1) { this.setData({ candidates: [], showCands: false }); return }
    // 防抖 300ms + 代际防护（快速输入时旧响应不覆盖新结果）
    if (this._searchTimer) clearTimeout(this._searchTimer)
    const gen = (this._searchGen = (this._searchGen || 0) + 1)
    this._searchTimer = setTimeout(() => {
      request({ url: '/api/idiom/search?keyword=' + encodeURIComponent(q) + '&size=8' })
        .then(d => {
          if (gen !== this._searchGen) return   // 过期响应丢弃
          let items = d.items || []
          if (this.data.inputMethod === 'abbr') {
            items = items.filter(it => {
              const abbr = (it.pinyin || '').split(/\s+/).map(p => p[0]).join('').toLowerCase()
              return abbr.indexOf(q.toLowerCase()) >= 0
            })
          } else {
            items = items.filter(it => it.word.indexOf(q) >= 0)
          }
          this.setData({ candidates: items.slice(0, 6), showCands: true })
        })
        .catch(() => { if (gen === this._searchGen) this.setData({ candidates: [], showCands: false }) })
    }, 300)
  },

  onCandTap(e) {
    const word = e.currentTarget.dataset.word
    this.setData({ input: word, candidates: [], showCands: false })
    this.submit()
  },

  onMethodToggle() {
    const m = this.data.inputMethod === 'char' ? 'abbr' : 'char'
    this.setData({ inputMethod: m, input: '', candidates: [], showCands: false, status: m === 'char' ? '输入汉字搜成语' : '输入拼音首字母（如 hl）' })
  },

  // ---------- 提交 ----------
  submit() {
    if (this.data.finished) return
    const word = this.data.input.trim()
    if (word.length !== 4) {
      wx.showToast({ title: '请选择一个四字成语', icon: 'none' })
      return
    }
    if (this.data.rows.some(r => r.word === word)) {
      wx.showToast({ title: '这个词已猜过', icon: 'none' })
      return
    }
    // 取这个词的拼音（详情接口）
    request({ url: '/api/idiom/' + encodeURIComponent(word) })
      .then(d => {
        const guess = { word: d.word, pinyin: d.pinyin }
        const row = L.judge(this.data.answer, guess)
        row.word = word
        const rows = this.data.rows.concat([row])
        const win = row.win
        const finished = win || rows.length >= 6
        this.setData({
          rows,
          input: '', candidates: [], showCands: false,
          finished, win,
          status: win ? '🎉 猜对了！' : (finished ? '答案已揭晓' : '第 ' + (rows.length + 1) + '/6 次')
        })
        if (this.data.mode === 'daily') this.saveDaily(this.data.answer, rows, finished, win)
        if (finished) {
          this.revealDetail(this.data.answer)
          this.saveResultToStreak(win)
          wx.vibrateShort({ type: win ? 'heavy' : 'light' })
        }
      })
      .catch(() => {
        wx.showToast({ title: '词库中无此成语', icon: 'none' })
      })
  },

  // 无限模式：再来一局
  nextRound() {
    this.setData({ rows: [], finished: false, win: false, detail: null, input: '', candidates: [], status: '' })
    this.newRound()
  },

  // 切模式
  switchMode(e) {
    const m = e.currentTarget.dataset.m
    if (m === this.data.mode) return
    this.setData({ mode: m })
    this.newRound()
  },

  onShare() {
    const txt = L.shareText(this.data.rows, this.data.win, this.data.mode)
    wx.setClipboardData({ data: txt })
  },

  // ---------- 词典 ----------
  toggleDict() {
    this.setData({ dictOpen: !this.data.dictOpen, dictDetail: null })
  },
  onDictKeyword(e) {
    this.setData({ dictKeyword: e.detail.value })
  },
  dictSearch() {
    const kw = this.data.dictKeyword.trim()
    if (!kw) return
    request({ url: '/api/idiom/search?keyword=' + encodeURIComponent(kw) + '&size=20' })
      .then(d => this.setData({ dictItems: d.items || [], dictTotal: d.total || 0 }))
      .catch(() => this.setData({ dictItems: [], dictTotal: 0 }))
  },
  onDictItemTap(e) {
    const word = e.currentTarget.dataset.word
    request({ url: '/api/idiom/' + encodeURIComponent(word) })
      .then(d => this.setData({ dictDetail: d }))
      .catch(() => { })
  },
  closeDictDetail() {
    this.setData({ dictDetail: null })
  },

  // 空处理器：弹层 catchtap 阻止冒泡用（catchtap 必须绑真实函数，空串不生效）
  stopProp() { },

  toggleHelp() {
    this.setData({ helpOpen: !this.data.helpOpen })
  },

  goBack() { wx.navigateBack({ delta: 1 }) },
  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
