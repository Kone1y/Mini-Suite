// 太空弹幕射击（STG）核心引擎：纯逻辑，无 wx 依赖，可单测
// 设计：固定步长（FIXED_DT）、全实体对象池、注入式 RNG（测试可复现）、数据驱动波次
// 渲染由页面层负责，本模块只产出「状态 + 几何描述」

// ================= 常量 =================
const FIXED_DT = 1 / 60            // 固定时间步长（秒）
const W = 375                       // 逻辑画布宽（页面按真实屏缩放）
const H = 667                       // 逻辑画布高

// 玩家
const PLAYER_R_HIT = 6              // 判定半径（专业弹幕手感：小于视觉）
const PLAYER_R_VIS = 14             // 视觉半径
const PLAYER_SPEED = 260            // px/s
const PLAYER_MAX_HP = 3
const PLAYER_MAX_POWER = 5          // 弹道数量上限
const INVULN_AFTER_HIT = 1.5        // 受击无敌（秒）
const RESPAWN_INVULN = 2.5
const FIRE_INTERVAL = 0.14          // 自动开火间隔
const SHIELD_DURATION = 8
const SPEED_DURATION = 8
const SPEED_MULT = 1.45

// 暴走（雷霆战机式：满火力再吃 P 进暴走）
const OVERDRIVE_DURATION = 8        // 基础时长（强化可+）
const OVERDRIVE_DMG_MULT = 2        // 伤害倍率
const WINGMAN_OFFSET_X = 34         // 僚机横向偏移
const WINGMAN_OFFSET_Y = 18         // 僚机纵向偏移

// 敌机类型
// dart=直冲 weaver=横摆 snav=S形 turret=悬停扇射 sniper=蓄力狙击
// mid=中型混合 large=大型六边
const ENEMY_DEFS = {
  dart:   { hp: 1,  r: 12, speed: 150, score: 100,  fire: null,        color: '#E0524B' },
  weaver: { hp: 2,  r: 13, speed: 110, score: 150,  fire: 'single',    color: '#E8923A', fireCd: 2.2 },
  snav:   { hp: 2,  r: 13, speed: 95,  score: 180,  fire: 'aimed',     color: '#D9B23A', fireCd: 2.6 },
  turret: { hp: 5,  r: 16, speed: 55,  score: 300,  fire: 'fan',       color: '#8A5AE0', fireCd: 2.0, stopY: null },
  sniper: { hp: 4,  r: 15, speed: 70,  score: 280,  fire: 'charge',    color: '#4B8AE0', fireCd: 3.2 },
  mid:    { hp: 12, r: 22, speed: 60,  score: 600,  fire: 'radial',    color: '#C94BC9', fireCd: 2.4 },
  large:  { hp: 26, r: 30, speed: 40,  score: 1200, fire: 'radialAim', color: '#E04B9B', fireCd: 2.8, stopY: null }
}

// 道具
const ITEM_DEFS = {
  POWER:  { r: 11, color: '#FFD66B', label: 'P' },
  SHIELD: { r: 11, color: '#4BD9E0', label: 'S' },
  LIFE:   { r: 11, color: '#6BE04B', label: '♥' },
  BOMB:   { r: 11, color: '#E06B4B', label: 'B' },
  SPEED:  { r: 11, color: '#B04BE0', label: '»' }
}
const ITEM_FALL_SPEED = 70

// 子弹
const PBULLET_SPEED = 520           // 玩家子弹
const EBULLET_SPEED_BASE = 130      // 敌弹基础速度（关卡缩放）

// Boss
const BOSS_R = 42
const BOSS_HP_BASE = 220            // ×关卡缩放
const BOSS_SCORE = 5000

// 掉落概率
const DROP_TABLE = { dart: 0.06, weaver: 0.10, snav: 0.10, turret: 0.30, sniper: 0.25, mid: 0.70, large: 1.0 }
const DROP_KINDS = ['POWER', 'POWER', 'POWER', 'SHIELD', 'BOMB', 'BOMB', 'SPEED', 'LIFE']  // 加权

// ================= 注入式 RNG =================
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ================= 对象池 =================
function makePool(n, factory) {
  const items = []
  for (let i = 0; i < n; i++) { const o = factory(); o.active = false; items.push(o) }
  return {
    items,
    get() {
      for (const o of items) if (!o.active) { o.active = true; return o }
      const o = factory(); o.active = true; items.push(o)   // 池满扩容
      return o
    },
    count() { return items.reduce((a, o) => a + (o.active ? 1 : 0), 0) },
    clear() { for (const o of items) o.active = false }
  }
}

// ================= 弹幕生成器（几何） =================
// 全部以「生成回调」形式输出：spawn(x, y, vx, vy, kind)
// radial: 环形 n 发
function radial(x, y, n, speed, phase, out) {
  for (let i = 0; i < n; i++) {
    const a = phase + (Math.PI * 2 * i) / n
    out(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 'orb')
  }
}
// fan: 朝 angle 的扇形 spread 弧度 n 发
function fan(x, y, angle, spread, n, speed, out) {
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? angle : angle - spread / 2 + (spread * i) / (n - 1)
    out(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 'orb')
  }
}
// aimed: 朝目标的单发（target 为 {x,y}）
function aimed(x, y, tx, ty, speed, out) {
  const a = Math.atan2(ty - y, tx - x)
  out(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 'orb')
}
// homing: 追踪弹（慢速）
function homing(x, y, tx, ty, speed, out) {
  const a = Math.atan2(ty - y, tx - x)
  out(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 'homing')
}

// ================= 游戏状态 =================
function createGame(opts) {
  opts = opts || {}
  const rng = opts.rng || mulberry32((Math.random() * 1e9) | 0)
  const g = {
    // 输入
    input: { dx: 0, dy: 0 },           // 玩家本步位移请求（页面写入）
    bombRequested: false,

    // 玩家
    player: {
      x: W / 2, y: H - 110, hp: PLAYER_MAX_HP, alive: true,
      power: 1, bombs: 2,
      fireTimer: 0, invuln: RESPAWN_INVULN,
      shield: 0, speedUp: 0,
      overdrive: 0             // 暴走剩余时间（>0 = 暴走中）
    },

    // 池
    pbullets: makePool(80, () => ({ x: 0, y: 0, vx: 0, vy: 0, r: 4, dmg: 1 })),
    ebullets: makePool(400, () => ({ x: 0, y: 0, vx: 0, vy: 0, r: 5, kind: 'orb', homing: false, life: 0 })),
    enemies: makePool(30, () => ({
      type: 'dart', x: 0, y: 0, vx: 0, vy: 0, hp: 1, maxHp: 1, r: 12,
      fireCd: 0, t: 0, phase: 0, stopped: false, flash: 0, seed: 0
    })),
    items: makePool(12, () => ({ kind: 'POWER', x: 0, y: 0, vx: 0, vy: 0, magnet: false })),
    particles: makePool(260, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 3, color: '#fff', ring: false })),
    floats: makePool(24, () => ({ x: 0, y: 0, text: '', life: 0, maxLife: 0, color: '#fff', size: 12 })),   // 击杀飘字

    // 关卡
    level: opts.startLevel || 1,
    waveIdx: 0,
    waveTimer: 0,
    progress: 0,                        // 0..1 关卡进度（打怪推进）
    bossActive: false,
    boss: null,
    bossEntering: false,

    // 状态机：'playing' | 'dead' | 'gameover' | 'victory'(单关结算用 bossDefeated)
    state: 'playing',
    time: 0,
    score: 0,
    combo: 0, comboTimer: 0,
    crystals: 0,                      // 本局水晶（结算入库）
    stageBannerT: 2.2,                // STAGE N 开场演出
    upgrades: opts.upgrades || null,  // 局外强化（页面注入）
    events: [],                        // 本步事件（页面层消费：音效/震动/文字）
    rng
  }
  g.wave = buildWave(g.level)
  g.events.push({ type: 'stageStart', level: g.level })
  return g
}

// 关卡难度缩放
function lvScale(level) {
  return {
    hp: Math.pow(1.12, level - 1),
    ebSpeed: Math.min(1.7, 1 + (level - 1) * 0.06),
    spawnGap: Math.max(0.55, 1 - (level - 1) * 0.05),   // 波次间隔缩短
    fireRate: Math.min(1.8, 1 + (level - 1) * 0.08),
    count: Math.min(2.2, 1 + (level - 1) * 0.10)        // 每波数量倍率
  }
}

// ================= 波次表（数据驱动） =================
// 每关一组；前 3 关教学级，4 起加 turret/sniper，5 起 mid，6 起 large
function buildWave(level) {
  const s = lvScale(level)
  const pick = arr => arr[Math.floor(rng2(arr.length))]
  // 局部随机（用全局 rng 不方便测试，这里用确定性轮换）
  const waves = []
  const add = (type, count, gap, opts) => waves.push({ type, count: Math.round(count * s.count), gap: gap / s.fireRate, ...opts })
  if (level === 1) {
    add('dart', 5, 1.1)
    add('weaver', 4, 1.0)
    add('dart', 7, 0.8)
    add('weaver', 5, 0.9)
    add('snav', 4, 1.1)
  } else if (level === 2) {
    add('dart', 8, 0.8)
    add('snav', 5, 1.0)
    add('turret', 2, 2.2)
    add('weaver', 6, 0.8)
    add('snav', 6, 0.9)
  } else if (level === 3) {
    add('weaver', 7, 0.7)
    add('turret', 3, 2.0)
    add('sniper', 2, 2.4)
    add('dart', 10, 0.6)
    add('snav', 6, 0.8)
    add('turret', 3, 1.8)
  } else {
    // 4+ 随关卡递增混编
    const lv = level
    add('dart', 8 + lv, 0.6)
    add('weaver', 6 + Math.floor(lv / 2), 0.7)
    add('snav', 5 + Math.floor(lv / 2), 0.8)
    add('turret', 3 + Math.floor(lv / 3), 1.8)
    add('sniper', 2 + Math.floor(lv / 3), 2.2)
    if (lv >= 5) add('mid', 1 + Math.floor((lv - 4) / 2), 3.0)
    if (lv >= 6) add('large', Math.floor((lv - 4) / 3), 3.5)
    add('dart', 10 + lv, 0.5)
    add('weaver', 6 + lv, 0.6)
  }
  return waves
  function rng2() { return 0 }   // 占位未用
}

// ================= 敌机生成 =================
function spawnEnemy(g, type, x, y) {
  const def = ENEMY_DEFS[type]
  const s = lvScale(g.level)
  const e = g.enemies.get()
  e.type = type
  e.x = x != null ? x : 30 + g.rng() * (W - 60)
  e.y = y != null ? y : -def.r - 10
  e.hp = Math.ceil(def.hp * s.hp)
  e.maxHp = e.hp
  e.r = def.r
  e.vx = 0
  e.vy = def.speed
  e.fireCd = def.fireCd ? def.fireCd * (0.6 + g.rng() * 0.8) : 0
  e.t = 0
  e.stopped = false
  e.flash = 0
  e.seed = g.rng() * Math.PI * 2
  e.stopY = type === 'turret' || type === 'large'
    ? 60 + g.rng() * (H * 0.28)
    : null
  return e
}

// ================= 敌机开火 =================
function enemyFire(g, e) {
  const def = ENEMY_DEFS[e.type]
  const s = lvScale(g.level)
  const spd = EBULLET_SPEED_BASE * s.ebSpeed
  const p = g.player
  const out = (x, y, vx, vy, kind) => {
    const b = g.ebullets.get()
    b.x = x; b.y = y; b.vx = vx; b.vy = vy
    b.kind = kind || 'orb'
    b.homing = kind === 'homing'
    b.life = 0
  }
  switch (def.fire) {
    case 'single':
      out(e.x, e.y + e.r, 0, spd, 'orb')
      break
    case 'aimed':
      aimed(e.x, e.y, p.x, p.y, spd, out)
      break
    case 'fan':
      fan(e.x, e.y, Math.PI / 2, Math.PI * 0.7, 5, spd * 0.9, out)
      break
    case 'charge': {
      // 狙击：先蓄力线（快弹直线）
      aimed(e.x, e.y, p.x, p.y, spd * 2.2, out)
      break
    }
    case 'radial':
      radial(e.x, e.y, 8, spd * 0.85, e.seed + e.t, out)
      break
    case 'radialAim': {
      const a0 = Math.atan2(p.y - e.y, p.x - e.x)
      fan(e.x, e.y, a0, Math.PI * 1.2, 7, spd * 0.8, out)
      break
    }
  }
}

// ================= Boss =================
function spawnBoss(g) {
  const s = lvScale(g.level)
  const hp = Math.ceil(BOSS_HP_BASE * Math.pow(1.18, g.level - 1))
  g.boss = {
    x: W / 2, y: -BOSS_R - 20,
    hp, maxHp: hp, r: BOSS_R,
    phase: 0,                       // 0 入场 1 2 3 战斗阶段
    t: 0, fireT: 0, fireT2: 0,
    entering: true,
    warningT: 1.8,                  // WARNING 演出（boss 出现前）
    flash: 0,
    swingT: 0
  }
  g.bossActive = true
  g.bossEntering = true
  g.events.push({ type: 'warning' })
}

function bossPhaseOf(boss) {
  const ratio = boss.hp / boss.maxHp
  if (ratio > 0.7) return 1
  if (ratio > 0.3) return 2
  return 3
}

function bossFire(g, dt) {
  const boss = g.boss
  if (!boss || boss.entering) return
  const p = g.player
  const s = lvScale(g.level)
  const spd = EBULLET_SPEED_BASE * s.ebSpeed
  const out = (x, y, vx, vy, kind) => {
    const b = g.ebullets.get()
    b.x = x; b.y = y; b.vx = vx; b.vy = vy
    b.kind = kind || 'orb'
    b.homing = kind === 'homing'
    b.life = 0
  }
  const phase = bossPhaseOf(boss)
  boss.fireT -= dt
  boss.fireT2 -= dt
  if (phase !== boss.phase) {
    // 阶段切换：清弹 + 冲击波
    boss.phase = phase
    boss.fireT = 1.2
    clearEBullets(g)
    ring(g, boss.x, boss.y, '#FFFFFF', 26, 0.7)
    g.events.push({ type: 'bossPhase', phase })
    return
  }
  const lvSpeedup = 1 + (g.level - 1) * 0.03
  if (phase === 1) {
    // 扇形瞄准 + 直弹
    if (boss.fireT <= 0) {
      const a = Math.atan2(p.y - boss.y, p.x - boss.x)
      fan(boss.x, boss.y + 20, a, 0.9, 5, spd * 1.05, out)
      boss.fireT = 1.5 / lvSpeedup
    }
    if (boss.fireT2 <= 0) {
      for (let i = -1; i <= 1; i++) out(boss.x + i * 26, boss.y + 30, i * 30, spd * 1.3, 'bolt')
      boss.fireT2 = 0.9 / lvSpeedup
    }
  } else if (phase === 2) {
    // 双向螺旋 + 瞄准狙击
    boss.swingT += dt * 2.6
    if (boss.fireT <= 0) {
      const a = boss.swingT
      for (let arm = 0; arm < 2; arm++) {
        const aa = a + arm * Math.PI
        for (let k = 0; k < 3; k++) {
          out(boss.x, boss.y, Math.cos(aa + k * 0.22) * spd, Math.sin(aa + k * 0.22) * spd, 'orb')
          out(boss.x, boss.y, Math.cos(-aa + k * 0.22 - Math.PI / 2) * spd, Math.sin(-aa + k * 0.22 - Math.PI / 2) * spd, 'orb')
        }
      }
      boss.fireT = 0.10
    }
    if (boss.fireT2 <= 0) {
      aimed(boss.x, boss.y + 20, p.x, p.y, spd * 2.3, out)
      boss.fireT2 = 1.1 / lvSpeedup
    }
  } else {
    // P3：花瓣放射 + 波状 + 追踪
    boss.swingT += dt * 1.8
    if (boss.fireT <= 0) {
      // 6 花瓣
      radial(boss.x, boss.y, 6, spd * 0.75, boss.swingT, out)
      radial(boss.x, boss.y, 6, spd * 0.75, -boss.swingT * 1.3 + 0.26, out)
      boss.fireT = 0.30 / lvSpeedup
    }
    if (boss.fireT2 <= 0) {
      // 波状（横向正弦流）+ 追踪弹
      for (let i = -2; i <= 2; i++) {
        out(W / 2 + i * 60, -10, Math.sin(i) * 40, spd * 0.9, 'orb')
      }
      homing(boss.x - 30, boss.y + 20, p.x, p.y, spd * 0.55, out)
      homing(boss.x + 30, boss.y + 20, p.x, p.y, spd * 0.55, out)
      boss.fireT2 = 2.2 / lvSpeedup
    }
  }
}

function clearEBullets(g) {
  for (const b of g.ebullets.items) if (b.active) {
    if (g.rng() < 0.4) puff(g, b.x, b.y, '#8B86B8', 2)
    b.active = false
  }
}

// ================= 粒子 =================
function puff(g, x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = g.rng() * Math.PI * 2
    const sp = 40 + g.rng() * 130
    const p = g.particles.get()
    p.x = x; p.y = y
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp
    p.life = p.maxLife = 0.35 + g.rng() * 0.3
    p.size = 2 + g.rng() * 3
    p.color = color
    p.ring = false
  }
}
function ring(g, x, y, color, size, life) {
  const p = g.particles.get()
  p.x = x; p.y = y; p.vx = 0; p.vy = 0
  p.life = p.maxLife = life
  p.size = size
  p.color = color
  p.ring = true
}

// 击杀/拾取飘字
function float(g, x, y, text, color, size) {
  const f = g.floats.get()
  f.x = x; f.y = y
  f.text = text
  f.life = f.maxLife = 0.8
  f.color = color || '#FFFFFF'
  f.size = size || 12
}

// ================= 道具 =================
function dropItem(g, x, y, forceKind) {
  const kind = forceKind || DROP_KINDS[Math.floor(g.rng() * DROP_KINDS.length)]
  const it = g.items.get()
  it.kind = kind
  it.x = x; it.y = y
  it.vx = 0; it.vy = 0
  it.magnet = false
}
function tryDrop(g, e) {
  const p = DROP_TABLE[e.type] || 0.1
  if (g.rng() < p) dropItem(g, e.x, e.y)
  // 水晶：大敌与精英必掉，小敌小概率
  const crystalP = e.type === 'large' || e.type === 'mid' ? 1 : (e.type === 'turret' || e.type === 'sniper' ? 0.35 : 0.06)
  if (g.rng() < crystalP) {
    g.crystals += e.type === 'large' ? 12 : (e.type === 'mid' ? 8 : 3)
    g.events.push({ type: 'crystal', amount: e.type === 'large' ? 12 : (e.type === 'mid' ? 8 : 3) })
  }
}

// ================= 玩家开火（弹道数量成长 + 暴走倍率 + 僚机） =================
function playerFire(g) {
  const p = g.player
  const pw = p.power
  const dmgMult = p.overdrive > 0 ? OVERDRIVE_DMG_MULT : 1
  const out = (dx, vx, x, y) => {
    const b = g.pbullets.get()
    b.x = x != null ? x : p.x + dx
    b.y = y != null ? y : p.y - PLAYER_R_VIS
    b.vx = vx; b.vy = -PBULLET_SPEED
    b.dmg = dmgMult
  }
  if (pw === 1) out(0, 0)
  else if (pw === 2) { out(-6, 0); out(6, 0) }
  else if (pw === 3) { out(0, 0); out(-10, -60); out(10, 60) }
  else if (pw === 4) { out(-7, 0); out(7, 0); out(-15, -110); out(15, 110) }
  else { out(0, 0); out(-8, -50); out(8, 50); out(-16, -130); out(16, 130) }
  // 暴走：双翼僚机伴随射击（侧翼内斜 45° 直弹）
  if (p.overdrive > 0) {
    for (const side of [-1, 1]) {
      const wx = p.x + side * WINGMAN_OFFSET_X
      const wy = p.y + WINGMAN_OFFSET_Y
      out(0, side * 46, wx, wy)
    }
  }
}

// ================= 炸弹 =================
function useBomb(g) {
  const p = g.player
  if (p.bombs <= 0 || !p.alive) return false
  p.bombs--
  // 全屏白闪事件 + 清敌弹 + 全敌伤害 + 无敌窗口
  clearEBullets(g)
  ring(g, p.x, p.y, '#FFFFFF', 40, 0.9)
  ring(g, p.x, p.y, '#FFD66B', 30, 0.7)
  g.events.push({ type: 'bomb' })
  p.invuln = Math.max(p.invuln, 2.0)
  const dmg = 30 + g.level * 6
  for (const e of g.enemies.items) {
    if (!e.active) continue
    damageEnemy(g, e, dmg)
  }
  if (g.boss && !g.boss.entering) damageBoss(g, dmg * 1.4)
  return true
}

// ================= 伤害 =================
function damageEnemy(g, e, dmg) {
  e.hp -= dmg
  e.flash = 0.08
  if (e.hp <= 0) {
    e.active = false
    const def = ENEMY_DEFS[e.type]
    addScore(g, def.score)
    bumpCombo(g)
    float(g, e.x, e.y, '+' + def.score, def.color, e.type === 'mid' || e.type === 'large' ? 14 : 11)
    puff(g, e.x, e.y, def.color, e.type === 'large' ? 18 : (e.type === 'mid' ? 12 : 7))
    if (e.type === 'mid' || e.type === 'large') ring(g, e.x, e.y, def.color, 16, 0.5)
    tryDrop(g, e)
    g.events.push({ type: 'kill', enemy: e.type })
  }
}
function damageBoss(g, dmg) {
  const boss = g.boss
  if (!boss || boss.entering) return
  boss.hp -= dmg
  boss.flash = 0.06
  if (boss.hp <= 0) {
    boss.hp = 0
    g.score += BOSS_SCORE + g.level * 800
    puff(g, boss.x, boss.y, '#FFD66B', 30)
    puff(g, boss.x, boss.y, '#E0524B', 24)
    ring(g, boss.x, boss.y, '#FFFFFF', 46, 1.0)
    dropItem(g, boss.x - 20, boss.y, 'POWER')
    dropItem(g, boss.x + 20, boss.y, g.rng() < 0.5 ? 'LIFE' : 'BOMB')
    g.boss = null
    g.bossActive = false
    g.events.push({ type: 'bossDown' })
    // 通关（单关结算）：页面读 state==='victory' 弹结算，下一关 startLevel(level+1)
    g.state = 'victory'
    clearEBullets(g)
  }
}
function hitPlayer(g) {
  const p = g.player
  if (!p.alive || p.invuln > 0 || p.shield > 0) {
    if (p.shield > 0 && p.invuln <= 0) {
      // 护盾挡下：碎盾 + 短无敌
      p.shield = 0
      p.invuln = 1.0
      ring(g, p.x, p.y, '#4BD9E0', 22, 0.5)
      g.events.push({ type: 'shieldBreak' })
    }
    return
  }
  p.hp--
  p.invuln = INVULN_AFTER_HIT
  // 受击掉一级火力（最低 1）
  if (p.power > 1) p.power--
  puff(g, p.x, p.y, '#FF6B6B', 10)
  g.events.push({ type: 'hurt' })
  if (p.hp <= 0) {
    p.alive = false
    puff(g, p.x, p.y, '#FFD66B', 22)
    ring(g, p.x, p.y, '#FFFFFF', 34, 0.9)
    g.state = 'gameover'
    g.events.push({ type: 'playerDown' })
  }
}

function addScore(g, s) {
  const mult = (g.upgrades && g.upgrades.scoreMult ? g.upgrades.scoreMult : 1)
  g.score += Math.round(s * mult * (1 + g.combo * 0.02))
}
function bumpCombo(g) { g.combo++; g.comboTimer = 2.5 }

// ================= 玩家移动 =================
function movePlayer(g, dt) {
  const p = g.player
  if (!p.alive) return
  let sp = PLAYER_SPEED
  if (p.speedUp > 0) sp *= SPEED_MULT
  p.x += g.input.dx
  p.y += g.input.dy
  // 边界
  if (p.x < PLAYER_R_VIS) p.x = PLAYER_R_VIS
  if (p.x > W - PLAYER_R_VIS) p.x = W - PLAYER_R_VIS
  if (p.y < PLAYER_R_VIS + 40) p.y = PLAYER_R_VIS + 40
  if (p.y > H - PLAYER_R_VIS - 16) p.y = H - PLAYER_R_VIS - 16
  g.input.dx = 0; g.input.dy = 0
  // 自动开火
  p.fireTimer -= dt
  if (p.fireTimer <= 0) {
    playerFire(g)
    p.fireTimer = FIRE_INTERVAL
  }
  // 计时器
  if (p.invuln > 0) p.invuln -= dt
  if (p.shield > 0) p.shield -= dt
  if (p.speedUp > 0) p.speedUp -= dt
  // 暴走计时与结束
  if (p.overdrive > 0) {
    p.overdrive -= dt
    if (p.overdrive <= 0) {
      p.overdrive = 0
      g.events.push({ type: 'overdriveEnd' })
    }
  }
}

// ================= 敌机行为 =================
function moveEnemy(g, e, dt) {
  e.t += dt
  if (e.flash > 0) e.flash -= dt
  switch (e.type) {
    case 'dart':
      e.y += e.vy * dt
      break
    case 'weaver':
      e.y += e.vy * dt
      e.x += Math.sin(e.t * 3 + e.seed) * 90 * dt
      break
    case 'snav':
      e.y += e.vy * dt
      e.x += Math.sin(e.t * 2.2 + e.seed) * 130 * dt
      break
    case 'turret':
    case 'large': {
      if (e.stopY != null && !e.stopped) {
        e.y += e.vy * dt
        if (e.y >= e.stopY) { e.stopped = true }
      } else {
        // 悬停横移
        e.x += Math.sin(e.t * 0.8 + e.seed) * 40 * dt
      }
      break
    }
    case 'sniper':
      e.y += e.vy * dt
      if (e.y > H * 0.35) e.vy = Math.max(20, e.vy - 60 * dt)   // 减速
      break
    case 'mid':
      e.y += e.vy * dt
      e.x += Math.cos(e.t * 1.5 + e.seed) * 60 * dt
      if (e.y > H * 0.3) e.vy = Math.max(30, e.vy - 40 * dt)
      break
  }
  // 开火
  const def = ENEMY_DEFS[e.type]
  if (def.fire && e.y > 0 && e.y < H * 0.75) {
    e.fireCd -= dt
    if (e.fireCd <= 0) {
      enemyFire(g, e)
      e.fireCd = def.fireCd / lvScale(g.level).fireRate
    }
  }
}

// ================= 主步进（固定步长） =================
function step(g, dt) {
  dt = FIXED_DT   // 固定步长；页面层负责累积器
  g.time += dt
  g.events.length = 0

  // 炸弹请求
  if (g.bombRequested) {
    g.bombRequested = false
    useBomb(g)
  }

  if (g.state === 'playing') {
    // STAGE 演出计时
    if (g.stageBannerT > 0) g.stageBannerT -= dt
    movePlayer(g, dt)

    // ---- 波次推进 ----
    if (!g.bossActive) {
      const wave = g.wave[g.waveIdx]
      if (wave) {
        g.waveTimer -= dt
        if (g.waveTimer <= 0) {
          spawnEnemy(g, wave.type)
          wave.count--
          g.waveTimer = wave.gap
          if (wave.count <= 0) { g.waveIdx++; g.waveTimer = 0.8 }
        }
        // 进度：按波次索引
        g.progress = Math.min(1, g.waveIdx / g.wave.length * 0.7)
      } else {
        // 波次结束：等清场
        g.progress = 0.7
        if (g.enemies.count() === 0) {
          g.progress = 1
          spawnBoss(g)
        }
      }
    }

    // ---- Boss ----
    if (g.bossActive && g.boss) {
      const boss = g.boss
      boss.t += dt
      if (boss.flash > 0) boss.flash -= dt
      if (boss.warningT > 0) {
        // WARNING 演出阶段（倒计时结束才开始入场）
        boss.warningT -= dt
        if (boss.warningT <= 0) g.events.push({ type: 'bossEnter' })
      } else if (boss.entering) {
        boss.y += 60 * dt
        if (boss.y >= 110) { boss.y = 110; boss.entering = false; g.bossEntering = false }
      } else {
        // 左右缓慢巡航
        boss.x = W / 2 + Math.sin(boss.t * 0.5) * (W / 2 - BOSS_R - 24)
        bossFire(g, dt)
      }
    }

    // ---- 敌机 ----
    for (const e of g.enemies.items) {
      if (!e.active) continue
      moveEnemy(g, e, dt)
      if (e.y > H + 60 || e.x < -60 || e.x > W + 60) { e.active = false; g.combo = 0 }
    }

    // ---- 玩家子弹 ----
    for (const b of g.pbullets.items) {
      if (!b.active) continue
      b.x += b.vx * dt; b.y += b.vy * dt
      if (b.y < -20 || b.x < -20 || b.x > W + 20) b.active = false
    }

    // ---- 敌弹 ----
    for (const b of g.ebullets.items) {
      if (!b.active) continue
      b.life += dt
      if (b.homing) {
        // 追踪：每帧朝玩家微调
        const p = g.player
        const a = Math.atan2(p.y - b.y, p.x - b.x)
        const cur = Math.atan2(b.vy, b.vx)
        let d = a - cur
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        const turn = Math.max(-2.2 * dt, Math.min(2.2 * dt, d))
        const na = cur + turn
        const sp = Math.hypot(b.vx, b.vy)
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp
        if (b.life > 4) b.homing = false   // 追 4 秒后失效
      }
      b.x += b.vx * dt; b.y += b.vy * dt
      if (b.y < -30 || b.y > H + 30 || b.x < -30 || b.x > W + 30) b.active = false
    }

    // ---- 道具（含磁吸：靠近玩家自动吸附） ----
    for (const it of g.items.items) {
      if (!it.active) continue
      const pl = g.player
      const ddx = pl.x - it.x, ddy = pl.y - it.y
      const dist = Math.hypot(ddx, ddy)
      if (!it.magnet && dist < 80) it.magnet = true
      if (it.magnet) {
        // 加速飞向玩家
        const sp = 240
        it.vx = (ddx / (dist || 1)) * sp
        it.vy = (ddy / (dist || 1)) * sp
        it.x += it.vx * dt; it.y += it.vy * dt
      } else {
        it.y += ITEM_FALL_SPEED * dt
      }
      if (it.y > H + 20) it.active = false
    }

    // ---- 飘字 ----
    for (const f of g.floats.items) {
      if (!f.active) continue
      f.life -= dt
      if (f.life <= 0) { f.active = false; continue }
      f.y -= 34 * dt
    }

    // ---- 粒子 ----
    for (const p of g.particles.items) {
      if (!p.active) continue
      p.life -= dt
      if (p.life <= 0) { p.active = false; continue }
      p.x += p.vx * dt; p.y += p.vy * dt
      p.vx *= 0.98; p.vy *= 0.98
    }

    // ================= 碰撞 =================
    const pl = g.player
    // 玩家弹 → 敌机 / Boss
    for (const b of g.pbullets.items) {
      if (!b.active) continue
      for (const e of g.enemies.items) {
        if (!e.active) continue
        const dx = b.x - e.x, dy = b.y - e.y
        const rr = b.r + e.r
        if (dx * dx + dy * dy < rr * rr) {
          b.active = false
          damageEnemy(g, e, b.dmg)
          break
        }
      }
      if (!b.active) continue
      if (g.boss && !g.boss.entering) {
        const boss = g.boss
        const dx = b.x - boss.x, dy = b.y - boss.y
        const rr = b.r + boss.r
        if (dx * dx + dy * dy < rr * rr) {
          b.active = false
          damageBoss(g, b.dmg)
        }
      }
    }
    // 敌弹 → 玩家
    if (pl.alive) {
      for (const b of g.ebullets.items) {
        if (!b.active) continue
        const dx = b.x - pl.x, dy = b.y - pl.y
        const rr = b.r + PLAYER_R_HIT
        if (dx * dx + dy * dy < rr * rr) {
          b.active = false
          hitPlayer(g)
          if (!pl.alive) break
        }
      }
      // 敌机机体 → 玩家
      if (pl.alive) {
        for (const e of g.enemies.items) {
          if (!e.active) continue
          const dx = e.x - pl.x, dy = e.y - pl.y
          const rr = e.r * 0.8 + PLAYER_R_HIT
          if (dx * dx + dy * dy < rr * rr) {
            damageEnemy(g, e, 4)      // 撞机对敌机也造成伤害
            hitPlayer(g)
            if (!pl.alive) break
          }
        }
      }
      // Boss 机体 → 玩家
      if (pl.alive && g.boss && !g.boss.entering) {
        const dx = g.boss.x - pl.x, dy = g.boss.y - pl.y
        const rr = g.boss.r * 0.85 + PLAYER_R_HIT
        if (dx * dx + dy * dy < rr * rr) hitPlayer(g)
      }
      // 道具 → 玩家（磁吸半径较大）
      for (const it of g.items.items) {
        if (!it.active) continue
        const dx = it.x - pl.x, dy = it.y - pl.y
        if (dx * dx + dy * dy < 26 * 26) {
          it.active = false
          applyItem(g, it.kind)
        }
      }
    }

    // 连击计时
    if (g.comboTimer > 0) {
      g.comboTimer -= dt
      if (g.comboTimer <= 0) g.combo = 0
    }
  }
  return g.events
}

// ================= 道具效果 =================
function applyItem(g, kind) {
  const p = g.player
  switch (kind) {
    case 'POWER':
      if (p.power < PLAYER_MAX_POWER) p.power++
      else if (p.overdrive <= 0) {
        // 满火力再吃 P = 暴走（雷霆战机式光之翼）
        p.overdrive = (g.upgrades && g.upgrades.overdriveTime ? g.upgrades.overdriveTime : OVERDRIVE_DURATION)
        ring(g, p.x, p.y, '#FFD66B', 30, 0.8)
        g.events.push({ type: 'overdriveStart', duration: p.overdrive })
      }
      else { g.score += 500; float(g, p.x, p.y - 20, '+500', '#FFD66B', 13) }
      break
    case 'SHIELD': p.shield = SHIELD_DURATION; break
    case 'LIFE': if (p.hp < PLAYER_MAX_HP) { p.hp++; float(g, p.x, p.y - 20, '生命+1', '#6BE04B', 13) } else { g.score += 1000; float(g, p.x, p.y - 20, '+1000', '#6BE04B', 13) } break
    case 'BOMB': if (p.bombs < 5) { p.bombs++; float(g, p.x, p.y - 20, '炸弹+1', '#E8923A', 13) } else { g.score += 500; float(g, p.x, p.y - 20, '+500', '#E8923A', 13) } break
    case 'SPEED': p.speedUp = SPEED_DURATION; break
  }
  g.events.push({ type: 'item', kind })
}

// ================= 下一关 =================
function startLevel(g, level) {
  g.level = level
  g.wave = buildWave(level)
  g.waveIdx = 0
  g.waveTimer = 0.5
  g.progress = 0
  g.bossActive = false
  g.boss = null
  g.bossEntering = false
  g.state = 'playing'
  clearEBullets(g)
  g.pbullets.clear()
  g.enemies.clear()
  // 道具保留（让玩家带着buff进下一关）——粒子清掉
  g.particles.clear()
  g.floats.clear()
  g.stageBannerT = 2.2
  g.events.push({ type: 'levelStart', level })
  g.events.push({ type: 'stageStart', level })
}

module.exports = {
  FIXED_DT, W, H,
  PLAYER_R_HIT, PLAYER_R_VIS, PLAYER_MAX_HP, PLAYER_MAX_POWER,
  OVERDRIVE_DURATION, WINGMAN_OFFSET_X, WINGMAN_OFFSET_Y,
  ENEMY_DEFS, ITEM_DEFS, BOSS_R,
  mulberry32, createGame, step, startLevel, spawnEnemy, spawnBoss,
  bossPhaseOf, lvScale, buildWave, applyItem, useBomb, damageEnemy, damageBoss, hitPlayer, float, dropItem
}
