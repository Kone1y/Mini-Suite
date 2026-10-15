Page({
  data: {
    running: false,
    db: 0,
    peakDb: 0,
    levelPct: 0,
    unsupported: false,
    // pcm 不可用时的降级模式：只显示相对音量动画（不显示绝对 dB）
    degraded: false,
    relLevel: 0,        // 相对音量 0~100（历史最大值归一化）
    frameInfo: ''
  },

  onReady() {
    // 基础库兼容性检测
    if (!wx.getRecorderManager) {
      this.setData({ unsupported: true })
      return
    }
    this.recorder = wx.getRecorderManager()
    this._relPeak = 1e-6   // 相对模式的历史峰值（RMS），用于归一化

    const rms = arr => {
      let sum = 0
      for (let i = 0; i < arr.length; i++) { const v = arr[i] / 32768; sum += v * v }
      return Math.sqrt(sum / arr.length)
    }
    const dbFromRms = r => Math.max(0, Math.min(120, Math.round(20 * Math.log10(r + 1e-8) + 90)))

    // 检测帧是否为编码数据（MP3/AAC）而非 PCM
    // 判据1（决定性）：帧头同步字 FF Ex / FF Fx
    // 判据2（兜底）：相邻样本差分能量比（PCM 语音<0.5，随机编码数据≈2）连续两帧 >1.8
    this._badStreak = 0
    this.isEncodedFrame = (dv, samples) => {
      if (dv.byteLength >= 2) {
        const b0 = dv.getUint8(0), b1 = dv.getUint8(1)
        if (b0 === 0xFF && (b1 & 0xE0) === 0xE0) return true
      }
      let e = 0, d = 0
      for (let i = 0; i < samples.length; i++) e += samples[i] * samples[i]
      for (let i = 1; i < samples.length; i++) { const t = samples[i] - samples[i - 1]; d += t * t }
      if (e <= 0) { this._badStreak = 0; return false }
      e /= samples.length; d /= samples.length - 1
      if (d / e > 1.8) {
        if (++this._badStreak >= 2) return true
      } else {
        this._badStreak = 0
      }
      return false
    }

    this.recorder.onFrameRecorded(res => {
      // iOS 返回 ArrayBuffer(mp3/aac 帧)，Android 部分机型返回 PCM
      if (!res || !res.frameBuffer) return
      try {
        const dv = new DataView(res.frameBuffer)
        const n = Math.floor(dv.byteLength / 2)
        if (n <= 0) return
        const samples = new Int16Array(n)
        for (let i = 0; i < n; i++) samples[i] = dv.getInt16(i * 2, true)

        // 非 PCM 帧检测（决定性：MP3/AAC 同步字 FF Ex；兜底：差分能量比持续>1.8 双帧确认）
        if (!this.data.degraded && this.isEncodedFrame(dv, samples)) {
          this.setData({
            degraded: true,
            db: 0, peakDb: 0, levelPct: 0,
            frameInfo: 'iOS 编码帧，已切换相对音量模式'
          })
        }

        if (this.data.degraded) {
          // 降级模式：能量本身随音量变化，作相对响度指示
          let sum2 = 0
          for (let i = 0; i < n; i++) sum2 += samples[i] * samples[i]
          const energy = sum2 / n
          if (energy > this._relPeak) this._relPeak = energy
          const rel = Math.sqrt(energy / this._relPeak)
          this.setData({
            relLevel: Math.min(100, Math.round(rel * 100))
          })
          return
        }

        const r = rms(samples)
        const db = dbFromRms(r)
        const peak = Math.max(this.data.peakDb, db)
        this.setData({
          db,
          peakDb: peak,
          levelPct: Math.min(100, Math.round((db / 120) * 100)),
          frameInfo: 'frame ' + res.frameBuffer.byteLength + 'B'
        })
      } catch (e) {
        this.setData({ frameInfo: 'frame parse fail' })
      }
    })

    this.recorder.onError(() => {
      this.setData({ unsupported: true, running: false })
      wx.showToast({ title: '录音不可用（可能未授权麦克风）', icon: 'none' })
    })
  },

  toggle() {
    if (this.data.running) {
      this.recorder && this.recorder.stop()
      this.setData({ running: false })
      return
    }
    if (this.data.unsupported) return
    this._relPeak = 1e-6
    this.setData({ running: true, peakDb: 0, db: 0, relLevel: 0 })
    // frameSize 最小 1KB；先尝试 pcm（Android 常见），iOS 编码帧会自动降级相对音量模式
    this.recorder.start({
      duration: 600000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'pcm',
      frameSize: 1
    })
  },

  resetPeak() {
    this.setData({ peakDb: 0 })
    this._relPeak = 1e-6
  },

  onUnload() {
    if (this.recorder && this.data.running) this.recorder.stop()
  },

  onHide() {
    if (this.recorder && this.data.running) {
      this.recorder.stop()
      this.setData({ running: false })
    }
  }
})
