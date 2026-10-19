// shmup-audio.js —— 星陨突袭 WebAudio 合成音效（零素材，全程序合成）
// 设计原则：每种音效 = 若干 OscillatorNode/GainNode 的短序列；总时长 < 0.6s；
//          AudioContext 由页面传入（wx.createWebAudioContext()），本模块只管合成不碰 wx。

function ShmupAudio() {
  this.ctx = null
  this.master = null
  this.muted = false
  this._lastPlay = {}   // 同名音效节流（防止一帧 N 个 kill 爆音）
}

// 初始化（页面 onReady 调用；ctx = wx.createWebAudioContext()）
ShmupAudio.prototype.init = function (ctx) {
  this.ctx = ctx
  try {
    this.master = ctx.createGain()
    this.master.gain.value = 0.42
    this.master.connect(ctx.destination)
  } catch (e) { this.ctx = null }
}

ShmupAudio.prototype.setMuted = function (m) {
  this.muted = m
  if (this.master) this.master.gain.value = m ? 0 : 0.42
}

// ---- 基础合成器 ----
// 单音：type 波形 / f0→f1 频率滑动 / t 时长 / v 音量 / delay 相对起始延迟
ShmupAudio.prototype.tone = function (type, f0, f1, t, v, delay) {
  const ctx = this.ctx
  if (!ctx) return
  const now = ctx.currentTime + (delay || 0)
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(f0, now)
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + t)
  gain.gain.setValueAtTime(v, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + t)
  osc.connect(gain)
  gain.connect(this.master)
  osc.start(now)
  osc.stop(now + t + 0.02)
}

// 噪声：t 时长 / v 音量 / f 低通频率 / delay
ShmupAudio.prototype.noise = function (t, v, f, delay) {
  const ctx = this.ctx
  if (!ctx) return
  const now = ctx.currentTime + (delay || 0)
  const len = Math.max(1, Math.floor(ctx.sampleRate * t))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(v, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + t)
  const filt = ctx.createBiquadFilter()
  filt.type = 'lowpass'
  filt.frequency.value = f
  src.connect(filt); filt.connect(gain); gain.connect(this.master)
  src.start(now)
}

// 节流：同名音效 30ms 内只放一次
ShmupAudio.prototype.play = function (name, opt) {
  if (!this.ctx || this.muted) return
  const now = Date.now()
  if (this._lastPlay[name] && now - this._lastPlay[name] < 30) return
  this._lastPlay[name] = now
  const fn = this['sfx_' + name]
  if (fn) fn.call(this, opt || {})
}

// ---- 音效库（事件名 → 合成配方） ----
// 射击：短促方波下行（轻）
ShmupAudio.prototype.sfx_shoot = function () {
  this.tone('square', 880, 420, 0.06, 0.10)
}
// 击杀小兵：噪声弹
ShmupAudio.prototype.sfx_kill = function (opt) {
  const big = opt && (opt.enemy === 'mid' || opt.enemy === 'large')
  if (big) { this.noise(0.22, 0.30, 1400); this.tone('triangle', 220, 60, 0.22, 0.22) }
  else this.noise(0.10, 0.16, 2400)
}
// 受伤：低频锯齿下滑 + 噪声
ShmupAudio.prototype.sfx_hurt = function () {
  this.tone('sawtooth', 300, 90, 0.28, 0.30)
  this.noise(0.18, 0.18, 900)
}
// 炸弹：轰——低频噪声 + 低音下坠
ShmupAudio.prototype.sfx_bomb = function () {
  this.noise(0.5, 0.40, 600)
  this.tone('sine', 160, 40, 0.5, 0.35)
  this.tone('square', 90, 30, 0.35, 0.20, 0.05)
}
// 水晶拾取：上行双音（清脆）
ShmupAudio.prototype.sfx_crystal = function () {
  this.tone('sine', 1180, 1180, 0.07, 0.16)
  this.tone('sine', 1560, 1560, 0.09, 0.16, 0.06)
}
// 道具：上行琶音三连
ShmupAudio.prototype.sfx_item = function () {
  this.tone('sine', 660, 660, 0.08, 0.18)
  this.tone('sine', 880, 880, 0.08, 0.18, 0.07)
  this.tone('sine', 1180, 1180, 0.12, 0.18, 0.14)
}
// 暴走开始：双音轰鸣
ShmupAudio.prototype.sfx_overdrive = function () {
  this.tone('sawtooth', 120, 480, 0.3, 0.26)
  this.tone('sawtooth', 90, 360, 0.3, 0.26, 0.04)
  this.noise(0.3, 0.14, 1800, 0.05)
}
// Boss 出场：警告低鸣两声
ShmupAudio.prototype.sfx_warning = function () {
  this.tone('square', 196, 196, 0.22, 0.22)
  this.tone('square', 196, 196, 0.22, 0.22, 0.3)
}
// Boss 入场：低音滚
ShmupAudio.prototype.sfx_bossEnter = function () {
  this.tone('sawtooth', 60, 110, 0.5, 0.28)
  this.noise(0.4, 0.16, 500)
}
// Boss 阶段切换：金属声
ShmupAudio.prototype.sfx_bossPhase = function () {
  this.tone('square', 520, 240, 0.14, 0.20)
  this.tone('square', 720, 300, 0.14, 0.20, 0.1)
}
// Boss 击破：大爆炸串
ShmupAudio.prototype.sfx_bossDown = function () {
  this.noise(0.7, 0.42, 900)
  this.tone('sine', 120, 30, 0.7, 0.32)
  for (let i = 0; i < 4; i++) this.noise(0.16, 0.24, 1600, 0.12 + i * 0.14)
}
// 玩家坠机：下坠长音 + 爆炸
ShmupAudio.prototype.sfx_playerDown = function () {
  this.tone('sawtooth', 420, 40, 0.8, 0.30)
  this.noise(0.6, 0.34, 800, 0.1)
}
// 护盾破碎：玻璃感高频噪声
ShmupAudio.prototype.sfx_shieldBreak = function () {
  this.noise(0.2, 0.24, 5200)
  this.tone('triangle', 1400, 500, 0.18, 0.18)
}
// 关卡开始：轻快上行
ShmupAudio.prototype.sfx_stageStart = function () {
  this.tone('sine', 520, 520, 0.1, 0.20)
  this.tone('sine', 660, 660, 0.1, 0.20, 0.1)
  this.tone('sine', 880, 880, 0.16, 0.20, 0.2)
}
// 胜利：胜利琶音
ShmupAudio.prototype.sfx_victory = function () {
  const seq = [523, 659, 784, 1047]
  seq.forEach((f, i) => this.tone('sine', f, f, 0.18, 0.22, i * 0.13))
  this.tone('sine', 1319, 1319, 0.4, 0.20, 0.52)
}
// 失败：下行小调
ShmupAudio.prototype.sfx_gameover = function () {
  const seq = [392, 330, 262, 196]
  seq.forEach((f, i) => this.tone('triangle', f, f, 0.24, 0.24, i * 0.18))
}

module.exports = { ShmupAudio }
