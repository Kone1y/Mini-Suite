function fmtSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

Page({
  data: {
    // 批量模式
    files: [],          // [{ path, originSize, originSizeText, resultPath, resultSizeText, savedText, status }]
    quality: 60,
    scale: 100,
    compressing: false,
    doneCount: 0,
    totalStat: '',      // 总节省统计
    // 单张详情查看
    preview: null
  },

  choose() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = (res.tempFiles || []).map(f => ({
          path: f.tempFilePath,
          originSize: f.size || 0,
          originSizeText: fmtSize(f.size || 0),
          resultPath: '',
          resultSizeText: '',
          savedText: '',
          status: 'pending'    // pending | done | fail
        }))
        this.setData({ files: this.data.files.concat(files), totalStat: '' })
      }
    })
  },

  remove(e) {
    const i = e.currentTarget.dataset.index
    const files = this.data.files.slice()
    files.splice(i, 1)
    this.setData({ files })
  },

  clearAll() {
    if (!this.data.files.length) return
    wx.showModal({
      title: '清空列表',
      content: '确定移除全部待压缩图片吗？',
      success: (res) => {
        if (res.confirm) this.setData({ files: [], totalStat: '' })
      }
    })
  },

  onQuality(e) { this.setData({ quality: e.detail.value }) },
  onScale(e) { this.setData({ scale: e.detail.value }) },

  compress() {
    if (!this.data.files.length) {
      wx.showToast({ title: '请先选择图片', icon: 'none' })
      return
    }
    if (this.data.compressing) return
    const pending = this.data.files.filter(f => f.status !== 'done')
    if (!pending.length) {
      wx.showToast({ title: '已全部压缩完成', icon: 'none' })
      return
    }
    this.setData({ compressing: true, doneCount: 0 })
    this.compressOne(0)
  },

  // 逐张串行压缩（canvas 全局只有一个，必须串行）
  compressOne(idx) {
    const files = this.data.files
    if (idx >= files.length) { this.finish(); return }
    const file = files[idx]
    if (file.status === 'done') { this.compressOne(idx + 1); return }

    const { quality, scale } = this.data
    wx.getImageInfo({
      src: file.path,
      success: (info) => {
        const w = Math.max(1, Math.round(info.width * scale / 100))
        const h = Math.max(1, Math.round(info.height * scale / 100))
        // 画布尺寸必须先 setData 渲染生效，且不能放屏幕外（真机不渲染）
        this.setData({ canvasW: w, canvasH: h }, () => {
          setTimeout(() => {
            const ctx = wx.createCanvasContext('cpcanvas', this)
            ctx.drawImage(file.path, 0, 0, w, h)
            ctx.draw(false, () => {
              setTimeout(() => {
                wx.canvasToTempFilePath({
                  canvasId: 'cpcanvas',
                  fileType: 'jpg',
                  quality: quality / 100,
                  success: (res) => {
                    wx.getFileInfo({
                      filePath: res.tempFilePath,
                      success: (fi) => {
                        const saved = file.originSize - (fi.size || 0)
                        this.updateFile(idx, {
                          resultPath: res.tempFilePath,
                          resultSizeText: fmtSize(fi.size || 0),
                          savedText: saved > 0 ? ('省 ' + fmtSize(saved)) : '未变小',
                          status: 'done'
                        }, () => this.compressOne(idx + 1))
                      },
                      fail: () => {
                        this.updateFile(idx, { resultPath: res.tempFilePath, status: 'done' }, () => this.compressOne(idx + 1))
                      }
                    })
                  },
                  fail: () => {
                    this.updateFile(idx, { status: 'fail' }, () => this.compressOne(idx + 1))
                  }
                }, this)
              }, 300)
            })
          }, 50)
        })
      },
      fail: () => {
        this.updateFile(idx, { status: 'fail' }, () => this.compressOne(idx + 1))
      }
    })
  },

  updateFile(idx, patch, done) {
    const key = `files[${idx}]`
    const obj = {}
    Object.keys(patch).forEach(k => { obj[key + '.' + k] = patch[k] })
    this.setData(obj, () => {
      this.setData({ doneCount: this.data.doneCount + 1 })
      done && done()
    })
  },

  finish() {
    const files = this.data.files
    let originSum = 0, resultSum = 0, ok = 0, fail = 0
    files.forEach(f => {
      originSum += f.originSize || 0
      if (f.status === 'done') {
        ok++
        // 未取到大小时用原始大小兜底（避免统计为0）
        resultSum += this.parseSize(f.resultSizeText) || f.originSize || 0
      } else if (f.status === 'fail') fail++
    })
    const saved = originSum - resultSum
    const pct = originSum > 0 ? Math.round(saved / originSum * 100) : 0
    this.setData({
      compressing: false,
      totalStat: ok + ' 张完成' + (fail ? ('，' + fail + ' 张失败') : '') +
        '｜共 ' + fmtSize(originSum) + ' → ' + fmtSize(resultSum) +
        (saved > 0 ? '（省 ' + fmtSize(saved) + '，' + pct + '%）' : '')
    })
  },

  parseSize(text) {
    if (!text) return 0
    const m = text.match(/^([\d.]+)\s*(B|KB|MB)$/)
    if (!m) return 0
    const v = parseFloat(m[1])
    if (m[2] === 'KB') return Math.round(v * 1024)
    if (m[2] === 'MB') return Math.round(v * 1024 * 1024)
    return Math.round(v)
  },

  saveOne(e) {
    const i = e.currentTarget.dataset.index
    const f = this.data.files[i]
    if (!f || !f.resultPath) return
    wx.saveImageToPhotosAlbum({
      filePath: f.resultPath,
      success: () => wx.showToast({ title: '已保存', icon: 'success' }),
      fail: () => wx.showToast({ title: '保存失败或未授权', icon: 'none' })
    })
  },

  saveAll() {
    const done = this.data.files.filter(f => f.resultPath)
    if (!done.length) return
    // 逐张保存，串行
    const saveNext = (i) => {
      if (i >= done.length) {
        wx.showToast({ title: '全部已保存', icon: 'success' })
        return
      }
      wx.saveImageToPhotosAlbum({
        filePath: done[i].resultPath,
        success: () => saveNext(i + 1),
        fail: () => wx.showToast({ title: '第 ' + (i + 1) + ' 张保存失败', icon: 'none' })
      })
    }
    saveNext(0)
  },

  onUnload() {
    this.setData = this.setData.bind(this)  // 防 页面销毁后回调 setData 报错
  }
})
