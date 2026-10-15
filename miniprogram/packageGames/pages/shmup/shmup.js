const L = require('../../shmup-logic')

Page({
  data: {
    // UI 状态（HUD 由 setData 驱动，低频更新）
    screen: 'title',      // title | playing | paused | gameover | victory | upgrade
    score: 0,
    level: 1,
    hp: 3,
    bombs: 2,
    power: 1,
    combo: 0,
    progress: 0,
    bossHpRatio: 0,       // 0~1，0 表示无 Boss
    highScore: 0,
    finalScore: 0,
    finalLevel: 1,
    finalCrystals: 0,     // 本局获得水晶
    fps: 60,
    helpOpen: false,
    // 强化系统
    crystals: 0,          // 持有水晶（storage）
    upgrades: null,       // {fire:0..2, shield:0..2, bomb:0..2, odTime:0..3, score:0..3}
    // 关卡选择
    maxLevel: 1,          // 已解锁最高起始关（storage）
    startLevel: 1         // 标题屏当前选中起始关
  },

  // 实例字段
  _game: null,
  _canvas: null,
  _ctx: null,
  _rafId: null,
  _acc: 0,
  _lastT: 0,
  _scale: 1,             // 逻辑(375×667) → 真实屏 缩放
  _offX: 0,
  _offY: 0,
  _stars: [],            // 背景星
  _hudTimer: 0,
  _flashT: 0,            // 炸弹白闪
  _lastTouch: null,

  onLoad() {
    const sys = wx.getSystemInfoSync()
    this._winW = sys.windowWidth
    this._winH = sys.windowHeight
    this._highScoreKey = 'shmup_high'
    this._crystalKey = 'shmup_crystals'
    this._upgKey = 'shmup_upgrades'
    this._maxLevelKey = 'shmup_maxlevel'
    const hs = wx.getStorageSync(this._highScoreKey) || 0
    // 强化存档
    let upg = wx.getStorageSync(this._upgKey)
    if (!upg || typeof upg !== 'object') upg = { fire: 0, shield: 0, bomb: 0, odTime: 0, score: 0 }
    const maxLv = Math.max(1, wx.getStorageSync(this._maxLevelKey) || 1)
    this.setData({
      highScore: hs,
      crystals: wx.getStorageSync(this._crystalKey) || 0,
      upgrades: upg,
      maxLevel: maxLv,
      startLevel: 1
    })
  },

  // ================= 强化系统 =================
  // 强化定义：[key, 名称, 说明, 每级价格数组]
  getUpgradeDefs() {
    return [
      { key: 'fire', name: '火神炮', desc: '初始火力 +1', costs: [800, 1600], icon: 'P' },
      { key: 'shield', name: '能量护盾', desc: '开局获得护盾', costs: [600, 1200], icon: 'S' },
      { key: 'bomb', name: '高能爆弹', desc: '初始炸弹 +1', costs: [700, 1400], icon: 'B' },
      { key: 'odTime', name: '光之翼', desc: '暴走时长 +4s', costs: [500, 900, 1500], icon: 'W' },
      { key: 'score', name: '高效回收', desc: '得分 +10%', costs: [400, 800, 1300], icon: '◆' }
    ]
  },

  // 应用强化到新对局
  applyUpgrades(g) {
    const u = this.data.upgrades
    if (!u) return
    if (u.fire > 0) g.player.power = Math.min(5, 1 + u.fire)
    if (u.shield > 0) g.player.shield = 8   // 开局护盾（与道具同时长）
    if (u.bomb > 0) g.player.bombs = Math.min(5, 2 + u.bomb)
    // odTime/score 在引擎内动态读取
    g.upgrades = {
      overdriveTime: 8 + u.odTime * 4,
      scoreMult: 1 + u.score * 0.10
    }
  },

  openUpgrades() {
    if (this.data.screen !== 'title') return
    this.setData({ screen: 'upgrade' })
  },

  closeUpgrades() {
    this.setData({ screen: 'title' })
  },

  // 强化面板点击（区域判定在 drawUI 里画，这里按 y 分发）
  onUpgradeTap(e) {
    const defs = this.getUpgradeDefs()
    const t = e.touches ? e.touches[0] : e.changedTouches && e.changedTouches[0]
    if (!t) return
    // 逻辑坐标
    const S = this._scale
    const lx = t.x / S, ly = (t.y / S)
    // 面板布局（与 drawUI 一致）：条目从 y=200 起，每条 64 高
    const baseY = 200
    const rowH = 64
    const closeY = L.H - 60
    if (ly > closeY - 20 && ly < closeY + 20) { this.closeUpgrades(); return }
    const idx = Math.floor((ly - baseY) / rowH)
    if (idx < 0 || idx >= defs.length) return
    // 升级按钮在条目右侧（x > 250 为升级区）
    if (lx < 240) return
    this.tryUpgrade(defs[idx].key)
  },

  tryUpgrade(key) {
    const defs = this.getUpgradeDefs()
    const def = defs.find(d => d.key === key)
    const u = this.data.upgrades
    const lv = u[key]
    if (lv >= def.costs.length) return          // 已满级
    const cost = def.costs[lv]
    if (this.data.crystals < cost) {
      wx.showToast({ title: '水晶不足', icon: 'none' })
      return
    }
    const next = Object.assign({}, u)
    next[key] = lv + 1
    this.setData({ crystals: this.data.crystals - cost, upgrades: next })
    wx.setStorageSync(this._crystalKey, this.data.crystals)
    wx.setStorageSync(this._upgKey, next)
    wx.vibrateShort({ type: 'light' })
  },

  onReady() {
    this.initCanvas()
  },

  initCanvas() {
    const q = wx.createSelectorQuery()
    q.select('#stage').fields({ node: true, size: true }).exec(res => {
      const canvas = res[0].node
      const dpr = wx.getSystemInfoSync().pixelRatio || 2
      canvas.width = this._winW * dpr
      canvas.height = this._winH * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      this._canvas = canvas
      this._ctx = ctx
      // 逻辑坐标 → 屏幕坐标：等比缩放（375 宽为基准），垂直方向填充
      this._scale = this._winW / L.W
      this._offY = 0
      this.initStars()
      this.startLoop()
    })
  },

  initStars() {
    this._stars = []
    for (let i = 0; i < 60; i++) {
      this._stars.push({
        x: Math.random() * L.W,
        y: Math.random() * L.H,
        z: 0.3 + Math.random() * 0.7,      // 视差层
        s: 0.6 + Math.random() * 1.4
      })
    }
  },

  // ================= 游戏流程 =================
  startGame(fromLevel) {
    const lv = Math.max(1, fromLevel || this.data.startLevel || 1)
    this._game = L.createGame({ startLevel: lv })
    this.applyUpgrades(this._game)   // 局外强化应用
    this._bankedC = 0
    this._bankedS = 0
    this.setData({
      screen: 'playing',
      score: 0, level: lv, hp: 3, bombs: 2, power: 1, combo: 0,
      progress: 0, bossHpRatio: 0, finalScore: 0, finalCrystals: 0
    })
    this._lastT = 0
    this._hudTimer = 0
  },

  nextLevel() {
    if (!this._game) return
    L.startLevel(this._game, this._game.level + 1)
    this.setData({ screen: 'playing', bossHpRatio: 0 })
  },

  pauseGame() {
    if (this.data.screen !== 'playing') return
    this.setData({ screen: 'paused' })
  },

  resumeGame() {
    if (this.data.screen !== 'paused') return
    this.setData({ screen: 'playing' })
    this._lastT = 0
  },

  backTitle() {
    this.setData({ screen: 'title' })
    this._game = null
  },

  // ================= 主循环 =================
  startLoop() {
    const loop = (t) => {
      this._rafId = this._canvas.requestAnimationFrame(loop)
      const dt = this._lastT ? Math.min(0.05, (t - this._lastT) / 1000) : 0.016
      this._lastT = t
      if (this.data.screen === 'playing' && this._game) {
        // 固定步长累积器
        this._acc += dt
        let steps = 0
        while (this._acc >= L.FIXED_DT && steps < 4) {
          const events = L.step(this._game, L.FIXED_DT)
          this.consumeEvents(events)
          this._acc -= L.FIXED_DT
          steps++
        }
        this.updateHUD(dt)
        if (this._game.state === 'gameover') this.onGameOver()
        else if (this._game.state === 'victory') this.onVictory()
      }
      this.render(dt)
    }
    this._rafId = this._canvas.requestAnimationFrame(loop)
  },

  consumeEvents(events) {
    for (const e of events) {
      if (e.type === 'kill') { if (e.enemy === 'mid' || e.enemy === 'large') wx.vibrateShort({ type: 'light' }) }
      else if (e.type === 'hurt') { wx.vibrateShort({ type: 'medium' }); this._flashT = 0.25 }
      else if (e.type === 'bomb') { this._flashT = 0.5; wx.vibrateShort({ type: 'heavy' }) }
      else if (e.type === 'bossEnter') wx.vibrateShort({ type: 'heavy' })
      else if (e.type === 'bossDown') wx.vibrateShort({ type: 'heavy' })
      else if (e.type === 'playerDown') this._flashT = 0.4
    }
  },

  updateHUD(dt) {
    this._hudTimer -= dt
    if (this._hudTimer > 0) return
    this._hudTimer = 0.15
    const g = this._game
    const bossRatio = g.boss ? g.boss.hp / g.boss.maxHp : 0
    this.setData({
      score: g.score,
      level: g.level,
      hp: g.player.hp,
      bombs: g.player.bombs,
      power: g.player.power,
      combo: g.combo,
      progress: Math.round(g.progress * 100) / 100,
      bossHpRatio: g.bossActive ? Math.round(bossRatio * 100) / 100 : 0
    })
  },

  // 增量结算水晶（防 victory→下一关→gameover 重复入库）
  settleCrystals() {
    const g = this._game
    const bankedC = this._bankedC || 0
    const bankedS = this._bankedS || 0
    const earned = (g.crystals - bankedC) + Math.floor((g.score - bankedS) / 1000)
    if (earned > 0) {
      this._bankedC = g.crystals
      this._bankedS = g.score
      const nc = this.data.crystals + earned
      wx.setStorageSync(this._crystalKey, nc)
      this.setData({ crystals: nc })
    }
    return earned
  },

  onGameOver() {
    const s = this._game.score
    const earned = this.settleCrystals()
    if (s > this.data.highScore) {
      wx.setStorageSync(this._highScoreKey, s)
    }
    this.setData({
      screen: 'gameover', finalScore: s, finalLevel: this._game.level,
      highScore: Math.max(s, this.data.highScore),
      finalCrystals: earned
    })
  },

  onVictory() {
    const s = this._game.score
    const earned = this.settleCrystals()
    if (s > this.data.highScore) {
      wx.setStorageSync(this._highScoreKey, s)
    }
    // 通关解锁下一关为起始关
    const nextLv = this._game.level + 1
    if (nextLv > this.data.maxLevel) {
      wx.setStorageSync(this._maxLevelKey, nextLv)
    }
    this.setData({
      screen: 'victory', finalScore: s, finalLevel: this._game.level,
      highScore: Math.max(s, this.data.highScore),
      finalCrystals: earned,
      maxLevel: Math.max(nextLv, this.data.maxLevel)
    })
  },

  // ================= 操控 =================
  onTouchStart(e) {
    // 屏幕点击兜底：canvas UI 分发（布局常量与 drawUI 共享）
    const scr = this.data.screen
    const t0 = e.touches ? e.touches[0] : (e.changedTouches && e.changedTouches[0])
    if (!t0) return
    const S = this._scale
    const lx = t0.x / S, ly = t0.y / S
    const UI = this.uiLayout()

    if (scr === 'gameover') {
      // 点屏幕主体=重开；底部小按钮=回标题
      const t0 = e.touches ? e.touches[0] : (e.changedTouches && e.changedTouches[0])
      const ly = t0.y / this._scale
      const lx = t0.x / this._scale
      const UI = this.uiLayout()
      if (this.hit(lx, ly, UI.quitSmall)) { this.backTitle(); return }
      this.startGame()
      return
    }
    if (scr === 'victory') {
      const t0 = e.touches ? e.touches[0] : (e.changedTouches && e.changedTouches[0])
      const ly = t0.y / this._scale
      const lx = t0.x / this._scale
      const UI = this.uiLayout()
      if (this.hit(lx, ly, UI.quitSmall)) { this.backTitle(); return }
      this.nextLevel()
      return
    }

    if (scr === 'paused') {
      // 暂停菜单：返回游戏 / 回初始界面
      if (this.hit(lx, ly, UI.pauseResume)) { this.resumeGame(); return }
      if (this.hit(lx, ly, UI.pauseQuit)) { this.backTitle(); return }
      // 菜单外点击不误触（老版"点哪都继续"取消）
      return
    }

    if (scr === 'upgrade') { this.onUpgradeTap(e); return }

    if (scr === 'title') {
      // 关卡选择：−/+
      if (this.hit(lx, ly, UI.titleLvMinus)) { this.changeStartLevel(-1); return }
      if (this.hit(lx, ly, UI.titleLvPlus)) { this.changeStartLevel(1); return }
      // 强化机库
      if (this.hit(lx, ly, UI.titleUpgBtn)) { this.openUpgrades(); return }
      this.startGame()
      return
    }

    // playing：双指同按 = 放炸弹
    if (e.touches && e.touches.length >= 2) {
      if (this._game) this._game.bombRequested = true
      return
    }
    // 左下角暂停（避开左上分数区与右下炸弹区）
    if (lx < 60 && ly > L.H - 60) {
      this.pauseGame()
      return
    }
    this._lastTouch = { x: t0.x, y: t0.y }
  },

  // 标题屏起始关切换
  changeStartLevel(d) {
    const next = Math.min(this.data.maxLevel, Math.max(1, this.data.startLevel + d))
    if (next !== this.data.startLevel) wx.vibrateShort({ type: 'light' })
    this.setData({ startLevel: next })
  },
  onTouchMove(e) {
    if (this.data.screen !== 'playing' || !this._game || !this._lastTouch) return
    const t = e.touches[0]
    // 相对位移 → 逻辑坐标位移（1:1 手感，除以缩放）
    const dx = (t.x - this._lastTouch.x) / this._scale
    const dy = (t.y - this._lastTouch.y) / this._scale
    this._game.input.dx += dx
    this._game.input.dy += dy
    this._lastTouch = { x: t.x, y: t.y }
  },
  onTouchEnd() {
    this._lastTouch = null
  },
  onBombTap() {
    if (this.data.screen === 'playing' && this._game) this._game.bombRequested = true
  },

  // 炸弹按钮触摸兜底（catchtouchstart 阻止冒泡到 canvas 的拖动）
  bombBtnTouch() {},

  toggleHelp() {
    this.setData({ helpOpen: !this.data.helpOpen })
  },

  // ================= 渲染 =================
  render(dt) {
    const ctx = this._ctx
    if (!ctx) return
    const S = this._scale
    const W = L.W, H = L.H
    ctx.save()
    // 深空底
    ctx.fillStyle = '#0A0A14'
    ctx.fillRect(0, 0, this._winW, this._winH)
    ctx.translate(this._offX, this._offY)
    ctx.scale(S, S)

    // ---- 星空 ----
    this.updateStars(dt)
    for (const st of this._stars) {
      ctx.globalAlpha = 0.25 + st.z * 0.5
      ctx.fillStyle = '#8B9BD4'
      ctx.fillRect(st.x, st.y, st.s, st.s)
    }
    ctx.globalAlpha = 1

    const g = this._game
    if (g && (this.data.screen === 'playing' || this.data.screen === 'paused' ||
      this.data.screen === 'gameover' || this.data.screen === 'victory')) {
      // ---- 粒子（底层）----
      for (const p of g.particles.items) {
        if (!p.active) continue
        const a = Math.max(0, p.life / p.maxLife)
        if (p.ring) {
          ctx.globalAlpha = a * 0.8
          ctx.strokeStyle = p.color
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6) * 2, 0, Math.PI * 2)
          ctx.stroke()
        } else {
          ctx.globalAlpha = a
          ctx.fillStyle = p.color
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
        }
      }
      ctx.globalAlpha = 1

      // ---- 道具 ----
      for (const it of g.items.items) {
        if (!it.active) continue
        const def = L.ITEM_DEFS[it.kind]
        const pulse = 1 + Math.sin(g.time * 6 + it.x) * 0.12
        this.glow(ctx, def.color, 10, () => {
          ctx.fillStyle = '#FFFFFF'
          ctx.beginPath()
          ctx.arc(it.x, it.y, def.r * pulse, 0, Math.PI * 2)
          ctx.fill()
        })
        ctx.fillStyle = '#1C1B22'
        ctx.font = 'bold 13px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(def.label, it.x, it.y + 1)
      }

      // ---- 飘字（击杀+分/拾取提示） ----
      for (const f of g.floats.items) {
        if (!f.active) continue
        const a = Math.max(0, f.life / f.maxLife)
        ctx.globalAlpha = a
        ctx.fillStyle = f.color
        ctx.font = 'bold ' + f.size + 'px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(f.text, f.x, f.y)
        ctx.globalAlpha = 1
      }

      // ---- 敌机 ----
      for (const e of g.enemies.items) {
        if (!e.active) continue
        this.drawEnemy(ctx, e)
      }

      // ---- Boss ----
      if (g.boss) this.drawBoss(ctx, g.boss)

      // ---- 敌弹 ----
      for (const b of g.ebullets.items) {
        if (!b.active) continue
        this.drawEBullet(ctx, b)
      }

      // ---- 玩家子弹 ----
      ctx.fillStyle = '#FFE58A'
      for (const b of g.pbullets.items) {
        if (!b.active) continue
        ctx.fillRect(b.x - 1.5, b.y - 7, 3, 10)
      }
      // 玩家子弹辉光
      ctx.globalAlpha = 0.35
      ctx.fillStyle = '#FFD66B'
      for (const b of g.pbullets.items) {
        if (!b.active) continue
        ctx.fillRect(b.x - 3, b.y - 9, 6, 14)
      }
      ctx.globalAlpha = 1

      // ---- 玩家 ----
      if (g.player.alive) this.drawPlayer(ctx, g.player, g.time)
    }

    // ---- 炸弹白闪 ----
    if (this._flashT > 0) {
      this._flashT -= dt
      ctx.globalAlpha = Math.min(0.75, this._flashT * 1.6)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
    }

    // ---- 游戏 UI（canvas 直绘：标题/结算/HUD，任何环境必可见） ----
    this.drawUI(ctx)

    ctx.restore()
  },

  // ================= Canvas 直绘 UI =================
  drawUI(ctx) {
    const scr = this.data.screen
    const W = L.W, H = L.H
    const now = Date.now()
    ctx.textBaseline = 'top'
    if (scr === 'playing') {
      const g = this._game
      if (!g) return
      // 左上：分数 + 关卡/火力
      ctx.textAlign = 'left'
      ctx.font = 'bold 22px monospace'
      ctx.fillStyle = '#FFFFFF'
      ctx.shadowColor = '#6A5AE0'
      ctx.shadowBlur = 8
      ctx.fillText(String(g.score), 14, 12)
      ctx.shadowBlur = 0
      ctx.font = '12px monospace'
      ctx.fillStyle = '#8B9BD4'
      ctx.fillText('第 ' + g.level + ' 关 · 火力 P' + g.player.power, 14, 40)
      // 右上：生命 ♥ + 炸弹 B
      ctx.textAlign = 'right'
      ctx.font = 'bold 18px monospace'
      ctx.fillStyle = '#FF6B6B'
      let hpStr = ''
      for (let i = 0; i < g.player.hp; i++) hpStr += '♥'
      ctx.fillText(hpStr || '—', W - 14, 12)
      ctx.font = 'bold 15px monospace'
      ctx.fillStyle = '#E8923A'
      ctx.fillText('B×' + g.player.bombs, W - 14, 38)
      // buff 剩余时间
      ctx.font = '12px monospace'
      let buffY = 60
      if (g.player.overdrive > 0) {
        ctx.fillStyle = '#FFD66B'
        ctx.fillText('暴走 ' + Math.ceil(g.player.overdrive) + 's', W - 14, buffY); buffY += 16
      }
      if (g.player.shield > 0) {
        ctx.fillStyle = '#4BD9E0'
        ctx.fillText('护盾 ' + Math.ceil(g.player.shield) + 's', W - 14, buffY); buffY += 16
      }
      if (g.player.speedUp > 0) {
        ctx.fillStyle = '#B04BE0'
        ctx.fillText('加速 ' + Math.ceil(g.player.speedUp) + 's', W - 14, buffY)
      }
      // 水晶计数（本局）
      ctx.textAlign = 'left'
      ctx.font = '13px monospace'
      ctx.fillStyle = '#9C8FF5'
      ctx.fillText('◆ ' + g.crystals, 14, 58)
      // Boss 血条 / 关卡进度条
      if (g.bossActive && g.boss) {
        const r = g.boss.hp / g.boss.maxHp
        ctx.fillStyle = 'rgba(255,255,255,0.14)'
        ctx.fillRect(14, 92, W - 28, 7)
        ctx.fillStyle = '#E0524B'
        ctx.fillRect(14, 92, (W - 28) * r, 7)
        ctx.textAlign = 'center'
        ctx.font = '11px monospace'
        ctx.fillStyle = '#FF9B9B'
        ctx.fillText('BOSS', W / 2, 102)
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.10)'
        ctx.fillRect(14, 95, W - 28, 4)
        ctx.fillStyle = '#4B8AE0'
        ctx.fillRect(14, 95, (W - 28) * g.progress, 4)
      }
      // 连击
      if (g.combo >= 3) {
        ctx.textAlign = 'center'
        ctx.font = 'bold 17px monospace'
        ctx.fillStyle = '#FFD66B'
        ctx.fillText(g.combo + ' COMBO', W / 2, 112)
      }
      // 左下暂停角标提示
      ctx.textAlign = 'left'
      ctx.font = '14px monospace'
      ctx.fillStyle = 'rgba(139,155,212,0.6)'
      ctx.fillText('⏸', 14, H - 34)

      // ---- 演出层 ----
      // STAGE N 开场
      if (g.stageBannerT > 0) {
        const t = g.stageBannerT
        const a = t > 1.8 ? (2.2 - t) / 0.4 : Math.min(1, t / 0.6)
        ctx.globalAlpha = Math.max(0, a)
        ctx.textAlign = 'center'
        ctx.fillStyle = '#FFFFFF'
        ctx.font = 'bold 34px sans-serif'
        ctx.fillText('STAGE ' + g.level, W / 2, H * 0.38)
        ctx.font = '13px monospace'
        ctx.fillStyle = '#8B9BD4'
        ctx.fillText('— 击败关底 BOSS —', W / 2, H * 0.38 + 34)
        ctx.globalAlpha = 1
      }
      // BOSS WARNING 警告
      if (g.bossActive && g.boss && g.boss.warningT > 0) {
        const blink = Math.floor(now / 160) % 2 === 0
        if (blink) {
          ctx.textAlign = 'center'
          ctx.fillStyle = '#FF4B4B'
          ctx.font = 'bold 42px sans-serif'
          ctx.fillText('WARNING !!', W / 2, H * 0.36)
        }
        ctx.globalAlpha = 0.8
        ctx.textAlign = 'center'
        ctx.fillStyle = '#FF9B9B'
        ctx.font = '14px monospace'
        ctx.fillText('强大的敌人正在接近', W / 2, H * 0.36 + 46)
        ctx.globalAlpha = 1
        // 扫描线效果
        ctx.globalAlpha = 0.12
        ctx.fillStyle = '#FF4B4B'
        const sy = (now / 6) % H
        ctx.fillRect(0, sy, W, 2)
        ctx.globalAlpha = 1
      }
    } else if (scr === 'title') {
      ctx.textAlign = 'center'
      const breathe = 0.5 + 0.5 * Math.sin(now / 400)
      ctx.shadowColor = '#6A5AE0'
      ctx.shadowBlur = 10 + 16 * breathe
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 40px sans-serif'
      ctx.fillText('星 陨 突 袭', W / 2, H * 0.28)
      ctx.shadowBlur = 0
      ctx.font = '15px monospace'
      ctx.fillStyle = '#4BD9E0'
      ctx.fillText('N E O N  S T R I K E', W / 2, H * 0.28 + 42)
      // 闪烁开始提示
      ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(now / 450))
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 20px sans-serif'
      ctx.fillText('点 击 屏 幕 开 始 出 击', W / 2, H * 0.5)
      ctx.globalAlpha = 1
      ctx.font = '13px monospace'
      ctx.fillStyle = '#FFD66B'
      ctx.fillText('最高分  ' + this.data.highScore, W / 2, H * 0.57)

      // ---- 关卡选择器（− N +）----
      const UI = this.uiLayout()
      const lvY = UI.titleLvMinus.y
      // 当前起始关
      ctx.textAlign = 'center'
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 24px sans-serif'
      ctx.fillText(String(this.data.startLevel), W / 2, lvY + 9)
      ctx.fillStyle = '#8B9BD4'
      ctx.font = '12px monospace'
      ctx.fillText('出击关卡（已解锁至 ' + this.data.maxLevel + '）', W / 2, lvY + 44)
      // − 按钮
      const canMinus = this.data.startLevel > 1
      ctx.strokeStyle = canMinus ? '#8B9BD4' : '#3A3A52'
      ctx.lineWidth = 1.5
      this.roundRect(ctx, UI.titleLvMinus.x, lvY, UI.titleLvMinus.w, UI.titleLvMinus.h, 8)
      ctx.stroke()
      ctx.fillStyle = canMinus ? '#FFFFFF' : '#3A3A52'
      ctx.font = 'bold 22px sans-serif'
      ctx.fillText('−', UI.titleLvMinus.x + UI.titleLvMinus.w / 2, lvY + 9)
      // + 按钮
      const canPlus = this.data.startLevel < this.data.maxLevel
      ctx.strokeStyle = canPlus ? '#FFD66B' : '#3A3A52'
      this.roundRect(ctx, UI.titleLvPlus.x, lvY, UI.titleLvPlus.w, UI.titleLvPlus.h, 8)
      ctx.stroke()
      ctx.fillStyle = canPlus ? '#FFD66B' : '#3A3A52'
      ctx.fillText('+', UI.titleLvPlus.x + UI.titleLvPlus.w / 2, lvY + 9)

      // 强化入口按钮（底部）
      const upgY = H - 100
      ctx.fillStyle = 'rgba(156,143,245,0.16)'
      ctx.strokeStyle = '#9C8FF5'
      ctx.lineWidth = 1.5
      this.roundRect(ctx, W / 2 - 100, upgY, 200, 44, 22)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#C9C0FF'
      ctx.font = 'bold 16px sans-serif'
      ctx.fillText('◆ 强化机库（' + this.data.crystals + '）', W / 2, upgY + 14)
      ctx.fillStyle = '#8B9BD4'
      ctx.font = '11px monospace'
      ctx.fillText('点 击 屏 幕 其 他 位 置 直 接 出 击', W / 2, H - 38)
    } else if (scr === 'upgrade') {
      // ============ 强化面板 ============
      ctx.fillStyle = 'rgba(10,10,20,0.94)'
      ctx.fillRect(0, 0, W, H)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#C9C0FF'
      ctx.font = 'bold 26px sans-serif'
      ctx.fillText('强 化 机 库', W / 2, 58)
      ctx.fillStyle = '#9C8FF5'
      ctx.font = '15px monospace'
      ctx.fillText('◆ ' + this.data.crystals, W / 2, 92)
      // 条目
      const defs = this.getUpgradeDefs()
      const u = this.data.upgrades
      const baseY = 200, rowH = 64
      defs.forEach((d, i) => {
        const y = baseY + i * rowH
        const lv = u[d.key]
        const maxLv = d.costs.length
        // 行底
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        this.roundRect(ctx, 16, y, W - 32, 56, 10)
        ctx.fill()
        // 图标
        ctx.fillStyle = '#1C1B22'
        ctx.strokeStyle = '#9C8FF5'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(46, y + 28, 16, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#FFD66B'
        ctx.font = 'bold 14px monospace'
        ctx.fillText(d.icon, 46, y + 22)
        // 名称+说明
        ctx.textAlign = 'left'
        ctx.fillStyle = '#FFFFFF'
        ctx.font = 'bold 15px sans-serif'
        ctx.fillText(d.name, 74, y + 15)
        ctx.fillStyle = '#8B9BD4'
        ctx.font = '12px monospace'
        ctx.fillText(d.desc, 74, y + 36)
        // 等级点
        for (let k = 0; k < maxLv; k++) {
          ctx.beginPath()
          ctx.arc(190 + k * 14, y + 44, 4, 0, Math.PI * 2)
          if (k < lv) { ctx.fillStyle = '#FFD66B'; ctx.fill() }
          else { ctx.strokeStyle = '#55557A'; ctx.lineWidth = 1; ctx.stroke() }
        }
        // 升级按钮（右侧）
        ctx.textAlign = 'center'
        if (lv >= maxLv) {
          ctx.fillStyle = '#4BD9E0'
          ctx.font = 'bold 14px sans-serif'
          ctx.fillText('MAX', W - 60, y + 24)
        } else {
          const cost = d.costs[lv]
          const afford = this.data.crystals >= cost
          ctx.fillStyle = afford ? '#534AB7' : '#3A3A52'
          this.roundRect(ctx, W - 118, y + 12, 92, 34, 17)
          ctx.fill()
          ctx.fillStyle = afford ? '#FFFFFF' : '#77778F'
          ctx.font = 'bold 14px monospace'
          ctx.fillText('◆' + cost, W - 72, y + 24)
        }
      })
      // 返回按钮
      const closeY = L.H - 60
      ctx.strokeStyle = '#8B9BD4'
      ctx.lineWidth = 1.5
      this.roundRect(ctx, W / 2 - 70, closeY - 20, 140, 40, 20)
      ctx.stroke()
      ctx.fillStyle = '#8B9BD4'
      ctx.font = 'bold 15px sans-serif'
      ctx.fillText('返 回', W / 2, closeY - 6)
    } else if (scr === 'gameover') {
      ctx.fillStyle = 'rgba(10,10,20,0.78)'
      ctx.fillRect(0, 0, W, H)
      ctx.textAlign = 'center'
      ctx.shadowColor = '#FF6B6B'
      ctx.shadowBlur = 22
      ctx.fillStyle = '#FF6B6B'
      ctx.font = 'bold 44px sans-serif'
      ctx.fillText('坠　落', W / 2, H * 0.3)
      ctx.shadowBlur = 0
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 34px monospace'
      ctx.fillText(String(this.data.finalScore), W / 2, H * 0.4)
      ctx.fillStyle = '#8B9BD4'
      ctx.font = '14px monospace'
      ctx.fillText('到达第 ' + this.data.finalLevel + ' 关 · 最高分 ' + this.data.highScore, W / 2, H * 0.46)
      if (this.data.finalCrystals > 0) {
        ctx.fillStyle = '#9C8FF5'
        ctx.font = 'bold 15px monospace'
        ctx.fillText('◆ +' + this.data.finalCrystals + '（持有 ' + this.data.crystals + '）', W / 2, H * 0.51)
      }
      ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(now / 450))
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 19px sans-serif'
      ctx.fillText('点 击 屏 幕 再 次 出 击', W / 2, H * 0.58)
      ctx.globalAlpha = 1
      // 底部回标题
      this.drawQuitSmall(ctx, now)
    } else if (scr === 'victory') {
      ctx.fillStyle = 'rgba(10,10,20,0.78)'
      ctx.fillRect(0, 0, W, H)
      ctx.textAlign = 'center'
      ctx.shadowColor = '#4BD9E0'
      ctx.shadowBlur = 22
      ctx.fillStyle = '#4BD9E0'
      ctx.font = 'bold 36px sans-serif'
      ctx.fillText('第 ' + this.data.finalLevel + ' 关 通关', W / 2, H * 0.3)
      ctx.shadowBlur = 0
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 34px monospace'
      ctx.fillText(String(this.data.finalScore), W / 2, H * 0.4)
      ctx.fillStyle = '#8B9BD4'
      ctx.font = '14px monospace'
      ctx.fillText('Boss 已被击毁 · 前方更凶险…', W / 2, H * 0.46)
      if (this.data.finalCrystals > 0) {
        ctx.fillStyle = '#9C8FF5'
        ctx.font = 'bold 15px monospace'
        ctx.fillText('◆ +' + this.data.finalCrystals + '（持有 ' + this.data.crystals + '）', W / 2, H * 0.51)
      }
      ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(now / 450))
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 19px sans-serif'
      ctx.fillText('点 击 屏 幕 进 入 第 ' + (this.data.finalLevel + 1) + ' 关', W / 2, H * 0.58)
      ctx.globalAlpha = 1
      // 底部回标题
      this.drawQuitSmall(ctx, now)
    } else if (scr === 'paused') {
      ctx.fillStyle = 'rgba(10,10,20,0.72)'
      ctx.fillRect(0, 0, W, H)
      const UI = this.uiLayout()
      ctx.textAlign = 'center'
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 30px sans-serif'
      ctx.fillText('已 暂 停', W / 2, H * 0.30)
      ctx.font = '13px monospace'
      ctx.fillStyle = '#8B9BD4'
      ctx.fillText('第 ' + (this._game ? this._game.level : this.data.level) + ' 关 · 得分 ' + this.data.score, W / 2, H * 0.30 + 42)
      // 返回游戏按钮
      ctx.fillStyle = 'rgba(106,90,224,0.30)'
      ctx.strokeStyle = '#6A5AE0'
      ctx.lineWidth = 2
      this.roundRect(ctx, UI.pauseResume.x, UI.pauseResume.y, UI.pauseResume.w, UI.pauseResume.h, 26)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 18px sans-serif'
      ctx.fillText('▶ 返 回 游 戏', W / 2, UI.pauseResume.y + 16)
      // 回初始界面按钮
      ctx.fillStyle = 'rgba(139,155,212,0.12)'
      ctx.strokeStyle = '#8B9BD4'
      ctx.lineWidth = 1.5
      this.roundRect(ctx, UI.pauseQuit.x, UI.pauseQuit.y, UI.pauseQuit.w, UI.pauseQuit.h, 26)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#8B9BD4'
      ctx.font = 'bold 17px sans-serif'
      ctx.fillText('🏠 回 初 始 界 面', W / 2, UI.pauseQuit.y + 16)
    }
  },

  updateStars(dt) {
    const speed = this.data.screen === 'playing' ? 1 : 0.35
    for (const st of this._stars) {
      st.y += (28 + st.z * 90) * dt * speed
      if (st.y > L.H) { st.y = -2; st.x = Math.random() * L.W }
    }
  },

  // 霓虹描边辅助：外发光
  glow(ctx, color, blur, drawFn) {
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = blur
    drawFn()
    ctx.restore()
  },

  // 圆角矩形手绘（不用 canvas 新 API，兼容性稳妥）
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  },

  // ============ canvas UI 布局常量（绘制与命中判定共享，改动两处自动一致） ============
  uiLayout() {
    return {
      // 标题屏
      titleUpgBtn: { x: L.W / 2 - 100, y: L.H - 100, w: 200, h: 44 },          // 强化机库
      titleLvMinus: { x: L.W / 2 - 130, y: L.H - 172, w: 56, h: 40 },          // 关卡 -
      titleLvPlus: { x: L.W / 2 + 74, y: L.H - 172, w: 56, h: 40 },            // 关卡 +
      // 暂停菜单（两按钮）
      pauseResume: { x: L.W / 2 - 110, y: L.H * 0.44, w: 220, h: 52 },
      pauseQuit: { x: L.W / 2 - 110, y: L.H * 0.44 + 72, w: 220, h: 52 },
      // 强化面板
      upgBaseY: 200, upgRowH: 64, upgUpX: 240,                                    // 升级区 lx>240
      upgClose: { x: L.W / 2 - 70, y: L.H - 80, w: 140, h: 40 },
      // gameover/victory 屏底部"回标题"小按钮
      quitSmall: { x: L.W / 2 - 90, y: L.H - 76, w: 180, h: 36 }
    }
  },

  // 点是否在区域内（逻辑坐标）
  hit(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
  },

  // 结算屏底部"回标题"小按钮（gameover/victory 共用）
  drawQuitSmall(ctx, now) {
    const UI = this.uiLayout()
    const q = UI.quitSmall
    ctx.strokeStyle = 'rgba(139,155,212,0.6)'
    ctx.lineWidth = 1.2
    this.roundRect(ctx, q.x, q.y, q.w, q.h, 18)
    ctx.stroke()
    ctx.fillStyle = 'rgba(139,155,212,0.85)'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('🏠 回初始界面', q.x + q.w / 2, q.y + 10)
  },

  // 回标题（清对局，保留存档）
  backTitle() {
    this._game = null
    this.setData({ screen: 'title' })
  },

  // ---- 玩家：霓虹箭形战机 ----
  drawPlayer(ctx, p, time) {
    const blink = p.invuln > 0 && Math.floor(time * 12) % 2 === 0
    ctx.save()
    ctx.translate(p.x, p.y)
    if (blink) ctx.globalAlpha = 0.35
    // 引擎尾焰
    const flame = 8 + Math.sin(time * 40) * 3
    this.glow(ctx, '#4BD9E0', 8, () => {
      ctx.fillStyle = '#4BD9E0'
      ctx.beginPath()
      ctx.moveTo(-4, 12)
      ctx.lineTo(0, 12 + flame)
      ctx.lineTo(4, 12)
      ctx.closePath()
      ctx.fill()
    })
    // 机体（箭形）
    this.glow(ctx, '#6A5AE0', 10, () => {
      ctx.fillStyle = '#2D2860'
      ctx.strokeStyle = '#9C8FF5'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(0, -16)          // 机头
      ctx.lineTo(5, -4)
      ctx.lineTo(16, 8)           // 右翼
      ctx.lineTo(6, 6)
      ctx.lineTo(4, 12)           // 右尾
      ctx.lineTo(-4, 12)          // 左尾
      ctx.lineTo(-6, 6)
      ctx.lineTo(-16, 8)          // 左翼
      ctx.lineTo(-5, -4)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })
    // 座舱
    ctx.fillStyle = '#4BD9E0'
    ctx.beginPath()
    ctx.arc(0, -4, 3, 0, Math.PI * 2)
    ctx.fill()
    // 判定点（专业弹幕：中心白点）
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.arc(0, 0, 2, 0, Math.PI * 2)
    ctx.fill()
    // 暴走：光之翼（双翼光刃）+ 僚机
    if (p.overdrive > 0) {
      const flap = Math.sin(time * 10) * 4
      // 光之翼（双层彩色光刃）
      this.glow(ctx, '#FFD66B', 14, () => {
        ctx.strokeStyle = '#FFD66B'
        ctx.lineWidth = 3
        for (const side of [-1, 1]) {
          ctx.beginPath()
          ctx.moveTo(side * 8, -2)
          ctx.quadraticCurveTo(side * (26 + flap), -14, side * (38 + flap * 1.4), 4)
          ctx.stroke()
        }
      })
      this.glow(ctx, '#4BD9E0', 10, () => {
        ctx.strokeStyle = '#4BD9E0'
        ctx.lineWidth = 2
        for (const side of [-1, 1]) {
          ctx.beginPath()
          ctx.moveTo(side * 8, 2)
          ctx.quadraticCurveTo(side * (20 + flap * 0.7), -6, side * (28 + flap), 8)
          ctx.stroke()
        }
      })
      // 双翼僚机（小型箭头，随主体微微浮动）
      for (const side of [-1, 1]) {
        const wx = side * L.WINGMAN_OFFSET_X + Math.sin(time * 7 + side) * 2
        const wy = L.WINGMAN_OFFSET_Y + Math.sin(time * 5 + side * 2) * 2
        ctx.save()
        ctx.translate(wx, wy)
        this.glow(ctx, '#FF9B4B', 8, () => {
          ctx.fillStyle = '#2D2860'
          ctx.strokeStyle = '#FF9B4B'
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.moveTo(0, -7)
          ctx.lineTo(5, 5)
          ctx.lineTo(0, 2)
          ctx.lineTo(-5, 5)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        })
        ctx.restore()
      }
    }
    // 护盾
    if (p.shield > 0) {
      ctx.globalAlpha = 0.5 + Math.sin(time * 8) * 0.2
      this.glow(ctx, '#4BD9E0', 12, () => {
        ctx.strokeStyle = '#4BD9E0'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(0, 0, 24, 0, Math.PI * 2)
        ctx.stroke()
      })
    }
    if (p.speedUp > 0) {
      ctx.globalAlpha = 0.4
      ctx.strokeStyle = '#B04BE0'
      ctx.lineWidth = 1.2
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath()
        ctx.moveTo(-10 - i * 5, 14)
        ctx.lineTo(-10 - i * 5, 14 + i * 3)
        ctx.moveTo(10 + i * 5, 14)
        ctx.lineTo(10 + i * 5, 14 + i * 3)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
    ctx.restore()
  },

  // ---- 敌机：按类型几何形 ----
  drawEnemy(ctx, e) {
    const def = L.ENEMY_DEFS[e.type]
    ctx.save()
    ctx.translate(e.x, e.y)
    const hitFlash = e.flash > 0
    this.glow(ctx, def.color, 8, () => {
      ctx.fillStyle = hitFlash ? '#FFFFFF' : '#171624'
      ctx.strokeStyle = def.color
      ctx.lineWidth = 1.6
      ctx.beginPath()
      switch (e.type) {
        case 'dart':    // 倒三角
          ctx.moveTo(0, e.r)
          ctx.lineTo(-e.r * 0.85, -e.r * 0.7)
          ctx.lineTo(e.r * 0.85, -e.r * 0.7)
          break
        case 'weaver':  // 圆形带环
          ctx.arc(0, 0, e.r * 0.8, 0, Math.PI * 2)
          break
        case 'snav': {  // 菱形
          const r = e.r
          ctx.moveTo(0, -r)
          ctx.lineTo(r * 0.8, 0)
          ctx.lineTo(0, r)
          ctx.lineTo(-r * 0.8, 0)
          break
        }
        case 'turret':  // 六边形
          for (let i = 0; i < 6; i++) {
            const a = Math.PI / 6 + (Math.PI * 2 * i) / 6
            const px = Math.cos(a) * e.r, py = Math.sin(a) * e.r
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
          }
          break
        case 'sniper':  // 尖朝下的长菱（狙击手）
          ctx.moveTo(0, e.r * 1.15)
          ctx.lineTo(-e.r * 0.55, -e.r * 0.6)
          ctx.lineTo(0, -e.r * 0.25)
          ctx.lineTo(e.r * 0.55, -e.r * 0.6)
          break
        case 'mid': {   // 中型：八边舱
          for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 * i) / 8 + Math.PI / 8
            const px = Math.cos(a) * e.r, py = Math.sin(a) * e.r
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
          }
          break
        }
        case 'large': { // 大型：六边战舰+装甲线
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 * i) / 6
            const px = Math.cos(a) * e.r, py = Math.sin(a) * e.r
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
          }
          break
        }
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })
    // 类型细节
    if (e.type === 'weaver') {
      ctx.strokeStyle = def.color
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.arc(0, 0, e.r * 0.45, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    if (e.type === 'mid' || e.type === 'large') {
      // 核心
      ctx.fillStyle = def.color
      ctx.beginPath()
      ctx.arc(0, 0, e.r * 0.3, 0, Math.PI * 2)
      ctx.fill()
      // 血条（受损才显示）
      if (e.hp < e.maxHp) {
        const w = e.r * 1.8
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(-w / 2, -e.r - 8, w, 3)
        ctx.fillStyle = def.color
        ctx.fillRect(-w / 2, -e.r - 8, w * (e.hp / e.maxHp), 3)
      }
    }
    if (e.type === 'sniper') {
      // 狙击蓄力灯
      const charging = e.fireCd < 0.5
      ctx.fillStyle = charging ? '#FF4B4B' : def.color
      ctx.globalAlpha = charging ? 0.6 + Math.sin(e.t * 20) * 0.4 : 0.8
      ctx.beginPath()
      ctx.arc(0, e.r * 0.3, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.restore()
  },

  // ---- Boss：巨型六边堡垒 ----
  drawBoss(ctx, b) {
    ctx.save()
    ctx.translate(b.x, b.y)
    const hitFlash = b.flash > 0
    const phaseColor = b.phase >= 3 ? '#E0524B' : (b.phase === 2 ? '#E8923A' : '#C94BC9')
    // 外壳
    this.glow(ctx, phaseColor, 16, () => {
      ctx.fillStyle = hitFlash ? '#FFFFFF' : '#17121F'
      ctx.strokeStyle = phaseColor
      ctx.lineWidth = 2.5
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6 + Math.PI / 6
        const px = Math.cos(a) * b.r, py = Math.sin(a) * b.r
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })
    // 内核（随阶段变色旋转）
    ctx.save()
    ctx.rotate(b.t * (b.phase === 3 ? 2.4 : 0.8))
    this.glow(ctx, '#FFD66B', 10, () => {
      ctx.fillStyle = '#2D2860'
      ctx.strokeStyle = '#FFD66B'
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 * i) / 3
        const px = Math.cos(a) * b.r * 0.5, py = Math.sin(a) * b.r * 0.5
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })
    ctx.restore()
    // 炮口（两个侧炮 + 主炮）
    ctx.fillStyle = phaseColor
    for (const dx of [-b.r * 0.55, b.r * 0.55]) {
      ctx.fillRect(dx - 3, b.r * 0.55, 6, 10)
    }
    ctx.fillRect(-4, b.r * 0.8, 8, 8)
    ctx.restore()
  },

  // ---- 敌弹 ----
  drawEBullet(ctx, b) {
    const isBolt = b.kind === 'bolt'
    const isHoming = b.homing
    const color = isHoming ? '#E06B4B' : (isBolt ? '#4BD9E0' : '#FF7B9B')
    ctx.save()
    if (isBolt) {
      // 长条弹：旋转朝速度方向
      const a = Math.atan2(b.vy, b.vx)
      ctx.translate(b.x, b.y)
      ctx.rotate(a)
      this.glow(ctx, color, 6, () => {
        ctx.fillStyle = color
        ctx.fillRect(-7, -2, 14, 4)
      })
    } else {
      // 圆弹：外圈+亮芯
      this.glow(ctx, color, 7, () => {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  },

  onHide() {
    this.pauseGame()
  },
  onUnload() {
    if (this._canvas && this._rafId) this._canvas.cancelAnimationFrame(this._rafId)
  }
})
