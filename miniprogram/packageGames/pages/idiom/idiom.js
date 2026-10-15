// 成语挑战 · 玩法菜单
Page({
  data: {
    games: [
      { key: 'guess', name: '每日挑战', sub: '6 次机会猜成语 · 拼音三重提示', icon: '🔤', diff: '硬核', url: '/packageGames/pages/guess/guess', tag: '含每日一题 / 无限模式' },
      { key: 'quiz', name: '释义选词', sub: '看释义挑成语 · 4 选 1', icon: '📖', diff: '简单', url: '/packageGames/pages/quiz/quiz' },
      { key: 'chain', name: '成语接龙', sub: '尾字接首字 · 链越越长', icon: '🔗', diff: '简单', url: '/packageGames/pages/chain/chain' },
      { key: 'fill', name: '补全成语', sub: '挖空填字 · 6 选字', icon: '✏️', diff: '简单', url: '/packageGames/pages/fill/fill' }
    ],
    dictUrl: '/packageGames/pages/guess/guess?dict=1'
  },

  onGameTap(e) {
    const url = e.currentTarget.dataset.url
    wx.navigateTo({ url })
  },

  openDict() {
    wx.navigateTo({ url: this.data.dictUrl })
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
