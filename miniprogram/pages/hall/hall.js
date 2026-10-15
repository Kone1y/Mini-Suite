const H = require('../../utils/hall-data')

const BG_PREFIX = 'hall_bg_'      // hall_bg_tools = 文件路径
const ICON_KEY = 'hall_icon_map'  // { url: 文件路径 }

// 各大厅默认壁纸（包内 assets，WXSS 不支持本地图背景所以用 image 组件）
const DEFAULT_BG = {
  tools: '/assets/wallpapers/bg2.jpg',
  games: '/assets/wallpapers/bg3.jpg',
  content: '/assets/wallpapers/bg4.jpg',
  mall: '/assets/wallpapers/bg5.jpg'
}

Page({
  data: {
    mod: null,
    catIdx: 0,
    shownTools: [],      // 过滤后（含 brick/iconSrc）
    recent: [],
    bgImage: '',         // 自定义背景（空=默认）
    iconMap: {},         // 自定义图标映射
    animated: false      // 入场动画开关（切分类重放）
  },

  onLoad(opts) {
    const mod = H.getModule(opts.key || 'tools')
    if (!mod) {
      wx.showToast({ title: '未知模块', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }
    this._mod = mod
    this._decorated = H.decorate(mod.key)   // 带色砖的完整列表
    // 恢复自定义图标
    try {
      this._iconMap = JSON.parse(wx.getStorageSync(ICON_KEY) || '{}')
    } catch (e) { this._iconMap = {} }
    // 校验图标文件仍存在（saveFile 持久路径）
    this.validateIcons()
    this.setData({ mod, iconMap: this._iconMap, bgImage: wx.getStorageSync(BG_PREFIX + mod.key) || DEFAULT_BG[mod.key] || '' })
    this.applyCat(0)
    this.loadRecentList()
    // 入场动画（下一帧触发，保证初始态渲染）
    setTimeout(() => this.setData({ animated: true }), 50)
  },

  onShow() {
    if (this._mod) this.loadRecentList()
  },

  // 校验自定义图标文件有效性
  validateIcons() {
    const fm = wx.getFileSystemManager()
    let changed = false
    for (const url of Object.keys(this._iconMap)) {
      try { fm.accessSync(this._iconMap[url]) } catch (e) {
        delete this._iconMap[url]
        changed = true
      }
    }
    if (changed) {
      try { wx.setStorageSync(ICON_KEY, JSON.stringify(this._iconMap)) } catch (e) { }
    }
  },

  loadRecentList() {
    this.setData({ recent: H.loadRecent(this._mod.key) })
  },

  applyCat(idx) {
    const mod = this._mod
    const cat = mod.cats[idx]
    let shown = cat.key === 'all' ? this._decorated : this._decorated.filter(t => t.cat === cat.key)
    // 附加用户自定义图标
    shown = shown.map(t => ({ ...t, iconSrc: this._iconMap[t.url] || '' }))
    this.setData({ catIdx: idx, shownTools: shown, animated: false })
    setTimeout(() => this.setData({ animated: true }), 30)
  },

  onCat(e) {
    this.applyCat(Number(e.currentTarget.dataset.idx))
  },

  goTool(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    const tool = this._mod.tools.find(t => t.url === url)
    if (tool) H.pushRecent(this._mod.key, tool)
    wx.navigateTo({ url })
  },

  // ---------- 通用：持久化用户选的图（FileSystemManager，避开已停维护的 wx.saveFile） ----------
  persistImage(tmpPath) {
    return new Promise((resolve, reject) => {
      const fm = wx.getFileSystemManager()
      const ext = (tmpPath.match(/\.(\w+)$/) || [, 'jpg'])[1]
      const dest = wx.env.USER_DATA_PATH + '/hall_' + Date.now() + '_' + Math.floor(Math.random() * 1e4) + '.' + ext
      fm.saveFile({
        tempFilePath: tmpPath,
        filePath: dest,
        success: () => resolve(dest),
        fail: (e) => reject(e && e.errMsg ? e.errMsg : '保存失败')
      })
    })
  },

  // ---------- 背景自定义 ----------
  onPickBg() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['compressed'],
      success: (res) => {
        const tmp = res.tempFiles[0].tempFilePath
        this.persistImage(tmp)
          .then((saved) => {
            // 清掉旧背景文件
            const old = wx.getStorageSync(BG_PREFIX + this._mod.key)
            if (old) { try { wx.getFileSystemManager().unlinkSync(old) } catch (e) { } }
            wx.setStorageSync(BG_PREFIX + this._mod.key, saved)
            this.setData({ bgImage: saved })
            wx.showToast({ title: '背景已更换', icon: 'success' })
          })
          .catch((err) => {
            console.error('bg save fail:', err)
            wx.showToast({ title: '保存失败：' + String(err).slice(0, 20), icon: 'none' })
          })
      },
      fail: (e) => {
        if (e && e.errMsg && e.errMsg.indexOf('cancel') < 0) {
          wx.showToast({ title: '选图失败', icon: 'none' })
        }
      }
    })
  },

  onClearBg() {
    const cur = wx.getStorageSync(BG_PREFIX + this._mod.key)
    if (cur) {
      try { wx.getFileSystemManager().unlinkSync(cur) } catch (e) { }
      wx.removeStorageSync(BG_PREFIX + this._mod.key)
    }
    this.setData({ bgImage: DEFAULT_BG[this._mod.key] || '' })
    wx.showToast({ title: '已恢复默认', icon: 'none' })
  },

  // ---------- 图标自定义（长按卡片） ----------
  onCardLongPress(e) {
    const url = e.currentTarget.dataset.url
    const name = e.currentTarget.dataset.name
    if (!url) return
    const hasCustom = !!this._iconMap[url]
    const items = hasCustom
      ? ['🖼 换一张图片', '↩ 恢复默认图标']
      : ['🖼 自定义图标']
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const chosen = items[res.tapIndex]
        if (chosen.indexOf('恢复') >= 0) {
          this.clearIcon(url)
        } else {
          this.pickIcon(url, name)
        }
      }
    })
  },

  pickIcon(url, name) {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['compressed'],
      success: (res) => {
        const tmp = res.tempFiles[0].tempFilePath
        this.persistImage(tmp)
          .then((saved) => {
            // 清旧
            const old = this._iconMap[url]
            if (old) { try { wx.getFileSystemManager().unlinkSync(old) } catch (e) { } }
            this._iconMap[url] = saved
            try { wx.setStorageSync(ICON_KEY, JSON.stringify(this._iconMap)) } catch (e) { }
            this.setData({ iconMap: this._iconMap })
            this.applyCat(this.data.catIdx)
            wx.showToast({ title: '「' + name + '」图标已更新', icon: 'none' })
          })
          .catch((err) => {
            console.error('icon save fail:', err)
            wx.showToast({ title: '保存失败：' + String(err).slice(0, 20), icon: 'none' })
          })
      }
    })
  },

  clearIcon(url) {
    const old = this._iconMap[url]
    if (old) { try { wx.getFileSystemManager().unlinkSync(old) } catch (e) { } }
    delete this._iconMap[url]
    try { wx.setStorageSync(ICON_KEY, JSON.stringify(this._iconMap)) } catch (e) { }
    this.setData({ iconMap: this._iconMap })
    this.applyCat(this.data.catIdx)
    wx.showToast({ title: '已恢复默认图标', icon: 'none' })
  },

  goHome() {
    wx.navigateBack()
  }
})
