const R = require('../../relatives-logic')

const WORDS = [
  { w: '爸爸', icon: '👨' }, { w: '妈妈', icon: '👩' },
  { w: '哥哥', icon: '👦' }, { w: '姐姐', icon: '👧' },
  { w: '弟弟', icon: '🧒' }, { w: '妹妹', icon: '👧' },
  { w: '儿子', icon: '👶' }, { w: '女儿', icon: '👶' }
]

Page({
  data: {
    words: WORDS,
    chain: [],      // 已选关系链
    result: '',
    history: []     // 最近计算
  },

  addWord(e) {
    const w = e.currentTarget.dataset.w
    if (this.data.chain.length >= 4) {
      wx.showToast({ title: '最多 4 层关系', icon: 'none' })
      return
    }
    this.setData({ chain: this.data.chain.concat(w) }, () => this.calc())
  },

  undo() {
    if (!this.data.chain.length) return
    const chain = this.data.chain.slice()
    chain.pop()
    this.setData({ chain }, () => this.calc())
  },

  clear() {
    this.setData({ chain: [], result: '' })
  },

  calc() {
    const chain = this.data.chain
    if (!chain.length) { this.setData({ result: '' }); return }
    const result = R.calc(chain)
    this.setData({ result })
    if (result && result !== '暂不支持' && result !== '暂不支持这么复杂的关系') {
      const entry = chain.join('的') + ' = ' + result
      const history = [entry].concat(this.data.history.filter(h => h !== entry)).slice(0, 8)
      this.setData({ history })
    }
  }
})
