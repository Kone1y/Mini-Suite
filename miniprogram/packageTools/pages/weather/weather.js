const L = require('../../weather-logic')
const { request } = require('../../../utils/request')

const STORE_SHOWN = 'wx-shown-v1'
const STORE_UNIT = 'wx-unit-v1'
const STORE_LIVE = 'wx-live-v1'
const CACHE_TTL = 30 * 60 * 1000    // 30 分钟内算缓存而非陈旧
const REFRESH_MS = 10 * 60 * 1000

Page({
  data: {
    query: '',
    suggestions: [],        // [{id,name,en,icon,label,hlName}]
    showSug: false,
    cards: [],              // 视图模型数组（渲染直接用）
    unit: 'c',
    refreshing: false,
    quickAdds: []           // 空态快捷城市（未展示的库前 8）
  },

  // 实例状态（非渲染）
  _shown: [],
  _live: {},               // id -> {src,data,ts}
  _expanded: {},           // id -> bool
  _refreshTimer: null,

  onLoad() {
    this._shown = this.loadShown()
    const unit = (wx.getStorageSync(STORE_UNIT) === 'f' ? 'f' : 'c')
    this.loadLiveCache()
    this.setData({ unit })
    this.rebuild()
    this.refreshAll(true)
  },

  onUnload() {
    if (this._refreshTimer) clearInterval(this._refreshTimer)
  },

  onShow() {
    // 回前台：超过半周期就静默刷一轮
    this.refreshAll(true)
  },

  onHide() {
    if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null }
  },

  // ---------- 持久化 ----------
  loadShown() {
    try {
      const v = JSON.parse(wx.getStorageSync(STORE_SHOWN) || 'null')
      if (Array.isArray(v) && v.length) {
        const ok = v.filter(id => L.DB_MAP[id])
        if (ok.length) return ok
      }
    } catch (e) { }
    return [...L.DEFAULT_SHOWN]
  },
  saveShown() {
    try { wx.setStorageSync(STORE_SHOWN, JSON.stringify(this._shown)) } catch (e) { }
  },
  loadLiveCache() {
    try {
      const v = JSON.parse(wx.getStorageSync(STORE_LIVE) || 'null')
      if (v && typeof v === 'object') {
        for (const [id, ent] of Object.entries(v)) {
          if (L.DB_MAP[id] && ent && ent.data) {
            this._live[id] = { src: 'cache', data: ent.data, ts: ent.ts }
          }
        }
      }
    } catch (e) { }
  },
  saveLiveCache() {
    try {
      const out = {}
      for (const [id, ent] of Object.entries(this._live)) {
        if ((ent.src === 'live' || ent.src === 'cache') && ent.data) {
          out[id] = { data: ent.data, ts: ent.ts }
        }
      }
      wx.setStorageSync(STORE_LIVE, JSON.stringify(out))
    } catch (e) { }
  },

  // ---------- 渲染 ----------
  rebuild() {
    const unit = this.data.unit
    const cards = this._shown.map(id => this.cardVM(id, unit))
    // 空态快捷：未展示的库城市前 8
    const shownSet = new Set(this._shown)
    const quickAdds = L.CITY_DB.filter(c => !shownSet.has(c.id)).slice(0, 8)
      .map(c => ({ id: c.id, name: c.name, icon: L.W[c.w].icon }))
    this.setData({ cards, quickAdds })
    this.saveShown()
  },

  cardVM(id, unit) {
    const v = L.liveView(id, this._live[id])
    const unitLabel = unit === 'f' ? '°F' : '°C'
    const card = {
      id,
      scene: v.scene,
      condIcon: v.icon,
      condCn: v.condCn,
      condEn: v.condEn,
      name: v.city.name,
      en: v.city.en,
      country: v.city.country,
      temp: L.tVal(v.temp, unit),
      hi: L.tVal(v.hi, unit),
      lo: L.tVal(v.lo, unit),
      hum: v.hum,
      windKmh: v.windKmh,
      unitLabel,
      src: v.src,
      srcText: v.src === 'live' ? L.agoStr(v.ts) : (v.src === 'cache' ? '缓存' : (v.src === 'loading' ? '同步中' : '演示')),
      open: !!this._expanded[id]
    }
    const det = L.detailView(this._live[id])
    if (det && card.open) {
      card.det = {
        feels: L.tVal(det.feels, unit),
        pressure: det.pressure,
        visKm: det.visKm,
        clouds: det.clouds,
        windDir: det.windDir,
        windDeg: det.windDeg,
        sunrise: det.sunrise,
        sunset: det.sunset,
        sunPos: det.sunPos,
        unitLabel
      }
    } else {
      card.det = null
    }
    // 场景元素种子（wx:for 需要静态数组；元素数量按场景定；用 id 做确定性随机——同卡不闪变）
    card.fx = this.sceneFx(v.scene, id)
    return card
  },

  // 场景动效元素（id 哈希 → LCG 确定性随机：同卡重绘不闪变）
  sceneFx(scene, cardId) {
    let seed = 0
    for (const ch of String(cardId)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
    seed = (seed || 1) >>> 0
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    const mk = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).map(o => {
      const r = {}
      if (o.x != null) r.x = +o.x.toFixed(1)
      if (o.y != null) r.y = +o.y.toFixed(1)
      if (o.dur != null) r.dur = +o.dur.toFixed(2)
      if (o.delay != null) r.delay = +o.delay.toFixed(2)
      if (o.sz != null) r.sz = o.sz
      if (o.h != null) r.h = o.h
      if (o.cross != null) r.cross = o.cross
      return r
    })
    switch (scene) {
      case 'sunny': return { clouds: mk(2, () => ({ y: 8 + rnd() * 28, dur: 30 + rnd() * 20, delay: -rnd() * 40 })) }
      case 'cloudy': return { clouds: mk(4, () => ({ y: 10 + rnd() * 40, dur: 28 + rnd() * 24, delay: -rnd() * 40 })) }
      case 'rainy': return { clouds: mk(2, () => ({ y: 6 + rnd() * 18, dur: 30 + rnd() * 18, delay: -rnd() * 30 })), drops: mk(14, () => ({ x: 3 + rnd() * 94, dur: 0.9 + rnd() * 0.6, delay: -rnd() * 1.4 })) }
      case 'snowy': return { clouds: mk(2, () => ({ y: 6 + rnd() * 16, dur: 32 + rnd() * 20, delay: -rnd() * 30 })), flakes: mk(11, () => ({ x: 3 + rnd() * 94, dur: 4 + rnd() * 3.4, delay: -rnd() * 7, sz: +(4 + rnd() * 3).toFixed(1) })) }
      case 'storm': return { clouds: mk(2, () => ({ y: 4 + rnd() * 14, dur: 26 + rnd() * 16, delay: -rnd() * 26 })), drops: mk(18, () => ({ x: 3 + rnd() * 94, dur: 0.55 + rnd() * 0.3, delay: -rnd() * 0.8 })) }
      case 'foggy': return { fogs: [0, 1, 2].map(i => ({ y: [26, 46, 66][i], dur: [10, 14.5, 19][i], delay: -i * 3, h: [30, 42, 34][i] })) }
      case 'night': return { stars: mk(12, i => ({ x: 3 + rnd() * 93, dur: 1.8 + rnd() * 2.4, delay: -rnd() * 4, cross: i % 5 === 0 ? 1 : 0 })), clouds: mk(1, () => ({ y: 46 + rnd() * 10, dur: 40 + rnd() * 16, delay: -rnd() * 40 })) }
    }
    return {}
  },

  patchCard(id) {
    const idx = this._shown.indexOf(id)
    if (idx < 0) return
    const vm = this.cardVM(id, this.data.unit)
    this.setData({ ['cards[' + idx + ']']: vm })
  },

  // ---------- 搜索 ----------
  onQuery(e) {
    const q = e.detail.value
    this.setData({ query: q })
    this.renderSug(q)
  },
  renderSug(q) {
    const list = L.searchCities(q, this._shown, 6)
    const sug = list.map(c => {
      // 简易高亮：名字命中部分包裹
      let hlName = c.name
      if (q && c.name.indexOf(q) >= 0) {
        hlName = c.name.replace(q, '«' + q + '»')
      }
      return { id: c.id, name: c.name, hlName, en: c.en, icon: L.W[c.w].icon, label: L.W[c.w].label }
    })
    this.setData({ suggestions: sug, showSug: !!q.trim() })
  },
  onSugTap(e) {
    const id = e.currentTarget.dataset.id
    this.addCity(id)
  },
  onSearchBlur() {
    // 延迟收起避免点不到选项
    setTimeout(() => this.setData({ showSug: false }), 150)
  },
  onSearchFocus() {
    if (this.data.query.trim()) this.renderSug(this.data.query)
  },

  addCity(id) {
    const c = L.DB_MAP[id]
    if (!c || this._shown.indexOf(id) >= 0) return
    this._shown.push(id)
    this._expanded[id] = false
    this.rebuild()
    wx.showToast({ title: '已加入 · ' + c.name, icon: 'none' })
    this.fetchLive(id, false)
    this.setData({ query: '', suggestions: [], showSug: false })
  },

  removeCity(e) {
    const id = e.currentTarget.dataset.id
    const c = L.DB_MAP[id]
    if (!c) return
    this._shown = this._shown.filter(x => x !== id)
    delete this._expanded[id]
    this.rebuild()
    wx.showToast({ title: '已移除 · ' + c.name, icon: 'none' })
  },

  // 展开/收起
  onCardTap(e) {
    const id = e.currentTarget.dataset.id
    this._expanded[id] = !this._expanded[id]
    this.patchCard(id)
  },
  onRetryTap(e) {
    const id = e.currentTarget.dataset.id
    wx.showToast({ title: '正在重新同步 ' + L.DB_MAP[id].name + '…', icon: 'none' })
    this.fetchLive(id, false)
  },

  // ---------- 实时数据 ----------
  fetchLive(id, silent) {
    const c = L.DB_MAP[id]
    if (!c) return
    this._live[id] = Object.assign({}, this._live[id], { src: 'loading' })
    this.patchCard(id)
    request({
      url: '/api/weather?city=' + encodeURIComponent(c.en) + '&country=' + c.country,
      method: 'GET'
    }).then(d => {
      if (!d || !d.main || !d.weather) throw new Error('bad payload')
      this._live[id] = { src: 'live', data: d, ts: Date.now() }
      this.saveLiveCache()
      this.patchCard(id)
    }).catch(() => {
      // 失败兜底：曾有数据（live/cache/loading 前遗留）→ 保留为缓存；从未成功 → 演示
      const prev = this._live[id]
      if (prev && prev.data) {
        this._live[id] = {
          src: (Date.now() - prev.ts < CACHE_TTL) ? 'cache' : 'live',   // 超 TTL 标 live 但数据是旧的（badge 仍显示时间）
          data: prev.data, ts: prev.ts
        }
      } else {
        this._live[id] = { src: 'demo', data: null, ts: 0 }
      }
      this.patchCard(id)
      if (!silent) wx.showToast({ title: c.name + ' · 实时未取到，已用' + (this._live[id].data ? '缓存' : '演示'), icon: 'none' })
    })
  },

  refreshAll(silent) {
    if (!this._shown.length) return
    this._shown.forEach(id => this.fetchLive(id, silent))
    // 定时器：10 分钟静默刷新（页面可见时）
    if (!this._refreshTimer) {
      this._refreshTimer = setInterval(() => {
        if (this._shown.length) this._shown.forEach(id => this.fetchLive(id, true))
      }, REFRESH_MS)
    }
  },

  onRefreshTap() {
    this.setData({ refreshing: true })
    this.refreshAll(false)
    setTimeout(() => this.setData({ refreshing: false }), 1000)
  },

  // ---------- 单位切换 ----------
  onUnitTap() {
    const unit = this.data.unit === 'c' ? 'f' : 'c'
    try { wx.setStorageSync(STORE_UNIT, unit) } catch (e) { }
    this.setData({ unit })
    this.rebuild()
    wx.showToast({ title: unit === 'c' ? '已切换为摄氏度 °C' : '已切换为华氏度 °F', icon: 'none' })
  },

  // 按当前温度降序排卡片（再点恢复原顺序）
  onSortTap() {
    if (this._sorted) {
      // 恢复添加顺序
      this._sorted = false
      this.rebuild()
      wx.showToast({ title: '已恢复原顺序', icon: 'none' })
      return
    }
    this._sorted = true
    this._shown = this._shown.slice().sort((a, b) => {
      const ta = L.liveView(a, this._live[a]).temp
      const tb = L.liveView(b, this._live[b]).temp
      return tb - ta
    })
    this.rebuild()
    wx.showToast({ title: '已按温度排序 ↓', icon: 'none' })
  },

  onPullDownRefresh() {
    this.refreshAll(true)
    wx.stopPullDownRefresh()
    wx.showToast({ title: '已同步 ' + this._shown.length + ' 座城', icon: 'none' })
  },

  // 空态快捷添加
  onQuickAdd(e) {
    const id = e.currentTarget.dataset.id
    this.addCity(id)
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
