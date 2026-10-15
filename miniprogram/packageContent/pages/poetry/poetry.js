const { request } = require('../../../utils/request')

Page({
  data: {
    kinds: ['全部', '诗', '词'],
    kindIndex: 0,
    dynasties: ['全部', '唐', '宋'],
    dynastyIndex: 0,
    keyword: '',
    searched: false,     // 是否处于搜索结果态（控制结果计数/空态文案）
    items: [],
    page: 1,
    total: 0,
    loading: false,
    noMore: false
  },

  onLoad() {
    this.load(true)
  },

  onPullDownRefresh() {
    this.load(true, () => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (!this.data.noMore && !this.data.loading) this.load(false)
  },

  onKind(e) {
    this.setData({ kindIndex: Number(e.detail.value) }, () => this.load(true))
  },

  onDynasty(e) {
    this.setData({ dynastyIndex: Number(e.detail.value) }, () => this.load(true))
  },

  filterParams() {
    const p = {}
    if (this.data.kindIndex > 0) p.kind = this.data.kinds[this.data.kindIndex]
    if (this.data.dynastyIndex > 0) p.dynasty = this.data.dynasties[this.data.dynastyIndex]
    if (this.data.keyword.trim()) p.keyword = this.data.keyword.trim()
    return p
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value })
  },

  // 回车/点搜索按钮触发
  doSearch() {
    this.load(true)
  },

  clearKeyword() {
    this.setData({ keyword: '' }, () => this.load(true))
  },

  load(reset, done) {
    if (this.data.loading) return
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true })
    request({
      url: '/api/poetry',
      data: Object.assign({ page, size: 20 }, this.filterParams())
    }).then(res => {
      const items = reset ? res.items : this.data.items.concat(res.items)
      const kw = this.data.keyword.trim()
      this.setData({
        items,
        page,
        total: res.total,
        loading: false,
        noMore: items.length >= res.total,
        searched: !!kw
      })
    }).catch(() => {
      this.setData({ loading: false })
    }).finally(() => done && done())
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/packageContent/pages/poetry-detail/poetry-detail?id=' + id })
  }
})
