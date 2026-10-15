// SQL 练习场
const { LESSONS } = require('../../sql-lessons')
const { request } = require('../../../utils/request')

const STORE_PROGRESS = 'sql_progress_v1'

Page({
  data: {
    screen: 'list',        // list | lesson
    lessons: [],           // 关卡列表（带通过态）
    cur: null,             // 当前课
    sql: '',
    result: null,          // {columns, rows, ms}
    error: '',
    running: false,
    passed: false,
    showAnswer: false,
    schemaText: ''
  },

  onLoad() {
    try {
      this._passed = JSON.parse(wx.getStorageSync(STORE_PROGRESS) || '{}')
    } catch (e) { this._passed = {} }
    this.buildList()
  },

  buildList() {
    const lessons = LESSONS.map(l => ({ ...l, done: !!this._passed[l.id] }))
    this.setData({ lessons })
  },

  onLessonTap(e) {
    const id = Number(e.currentTarget.dataset.id)
    const cur = LESSONS.find(l => l.id === id)
    if (!cur) return
    this.setData({
      screen: 'lesson', cur,
      sql: '', result: null, error: '', passed: false, showAnswer: false
    })
    this.loadSchema(cur)
  },

  loadSchema(cur) {
    // 拉一张表结构看（SELECT * LIMIT 0 拿列名）
    request({
      url: '/api/sql/exec', method: 'POST',
      data: { sql: 'SELECT * FROM movies LIMIT 0', lesson: cur.sandbox }
    }).then(d => {
      this.setData({ schemaText: d.columns.join(', ') })
    }).catch(() => {
      // employees 课表
      request({
        url: '/api/sql/exec', method: 'POST',
        data: { sql: 'SELECT * FROM employees LIMIT 0', lesson: cur.sandbox }
      }).then(d2 => this.setData({ schemaText: d2.columns.join(', ') }))
        .catch(() => this.setData({ schemaText: '后端未启动' }))
    })
  },

  onSqlInput(e) {
    this.setData({ sql: e.detail.value, error: '' })
  },

  onRun() {
    if (this.data.running) return
    const sql = this.data.sql.trim()
    if (!sql) { this.setData({ error: '请输入 SQL' }); return }
    this.setData({ running: true, error: '', result: null })
    request({
      url: '/api/sql/exec', method: 'POST',
      data: { sql, lesson: this.data.cur.sandbox }
    }).then(d => {
      this.setData({ running: false, result: d })
      this.checkPass(sql, d)
    }).catch(err => {
      this.setData({ running: false, error: (err && err.message) || '执行失败' })
    })
  },

  checkPass(sql, result) {
    const cur = this.data.cur
    // 判定：行数与期望一致 + 列数一致（宽松：列名不强校验，因别名/顺序变化多）
    if (result.rowCount === cur.expectRows && result.columns.length === cur.expectCols.length) {
      this._passed[cur.id] = true
      try { wx.setStorageSync(STORE_PROGRESS, JSON.stringify(this._passed)) } catch (e) { }
      this.buildList()
      this.setData({ passed: true })
      wx.vibrateShort({ type: 'heavy' })
    }
  },

  onFillAnswer() {
    this.setData({ sql: this.data.cur.answer, showAnswer: true })
  },

  onNextLesson() {
    const next = LESSONS.find(l => l.id === this.data.cur.id + 1)
    if (next) this.onLessonTap({ currentTarget: { dataset: { id: next.id } } })
    else this.setData({ screen: 'list' })
  },

  backToList() { this.setData({ screen: 'list' }) },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
