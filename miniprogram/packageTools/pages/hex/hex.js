// 十六进制查看器
Page({
  data: {
    fileName: '',
    fileSize: 0,
    fileType: '',         // 魔数识别结果
    magicHex: '',
    pages: [],            // 当前页 hex 行
    pageIdx: 0,
    pageCount: 0,
    strings: [],          // 提取的可打印字符串
    loading: false,
    pageSize: 256         // 每页字节数
  },

  _bytes: null,

  onLoad() { },

  onPick() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const f = res.tempFiles[0]
        this.loadFile(f.path, f.name, f.size)
      }
    })
  },

  loadFile(path, name, size) {
    this.setData({ loading: true, fileName: name, strings: [] })
    const fm = wx.getFileSystemManager()
    fm.readFile({
      filePath: path,
      success: (res) => {
        const bytes = new Uint8Array(res.data)
        this._bytes = bytes
        const magic = this.detectMagic(bytes)
        const pageCount = Math.max(1, Math.ceil(bytes.length / this.data.pageSize))
        this.setData({
          fileSize: bytes.length,
          fileType: magic.type,
          magicHex: magic.hex,
          pageCount,
          pageIdx: 0,
          loading: false
        })
        this.renderPage(0)
        this.extractStrings(bytes)
      },
      fail: () => {
        this.setData({ loading: false })
        wx.showToast({ title: '读取失败', icon: 'none' })
      }
    })
  },

  detectMagic(bytes) {
    const sigs = [
      { hex: [0x89, 0x50, 0x4E, 0x47], type: 'PNG 图片' },
      { hex: [0xFF, 0xD8, 0xFF], type: 'JPEG 图片' },
      { hex: [0x47, 0x49, 0x46, 0x38], type: 'GIF 图片' },
      { hex: [0x25, 0x50, 0x44, 0x46], type: 'PDF 文档' },
      { hex: [0x50, 0x4B, 0x03, 0x04], type: 'ZIP 压缩包（含 docx/xlsx/apk/jar）' },
      { hex: [0x1F, 0x8B], type: 'Gzip 压缩' },
      { hex: [0x42, 0x5A, 0x68], type: 'Bzip2 压缩' },
      { hex: [0x7F, 0x45, 0x4C, 0x46], type: 'ELF 可执行（Linux）' },
      { hex: [0x4D, 0x5A], type: 'Windows PE 可执行（EXE/DLL）' },
      { hex: [0x00, 0x61, 0x73, 0x6D], type: 'WebAssembly 模块' },
      { hex: [0x52, 0x49, 0x46, 0x46], type: 'RIFF 容器（WAV/AVI）' },
      { hex: [0x66, 0x4C, 0x61, 0x43], type: 'FLAC 音频' },
      { hex: [0x49, 0x44, 0x33], type: 'MP3 音频' },
      { hex: [0x00, 0x00, 0x01, 0x00], type: 'ICO 图标' },
      { hex: [0x37, 0x7A, 0xBC, 0xAF], type: '7z 压缩包' },
      { hex: [0x52, 0x61, 0x72, 0x21], type: 'RAR 压缩包' }
    ]
    const head = bytes.slice(0, 8)
    const headHex = this.toHex(head)
    for (const s of sigs) {
      if (head.length >= s.hex.length && s.hex.every((b, i) => bytes[i] === b)) {
        return { type: s.type, hex: headHex }
      }
    }
    return { type: '未知（无匹配魔数，可能是纯文本）', hex: headHex }
  },

  toHex(u8) {
    return [...u8].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
  },

  renderPage(idx) {
    const bytes = this._bytes
    if (!bytes) return
    const ps = this.data.pageSize
    const start = idx * ps
    const end = Math.min(start + ps, bytes.length)
    const lines = []
    for (let off = start; off < end; off += 16) {
      const chunk = bytes.slice(off, Math.min(off + 16, end))
      const hex = [...chunk].map(b => b.toString(16).toUpperCase().padStart(2, '0'))
      while (hex.length < 16) hex.push('  ')
      let ascii = ''
      for (const b of chunk) ascii += (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '·'
      lines.push({
        offset: off.toString(16).toUpperCase().padStart(8, '0'),
        h1: hex.slice(0, 8).join(' '),
        h2: hex.slice(8).join(' '),
        ascii
      })
    }
    this.setData({ pages: lines, pageIdx: idx })
  },

  onPrev() {
    if (this.data.pageIdx > 0) this.renderPage(this.data.pageIdx - 1)
  },
  onNext() {
    if (this.data.pageIdx < this.data.pageCount - 1) this.renderPage(this.data.pageIdx + 1)
  },

  extractStrings(bytes) {
    // 提取可打印字符串（≥4 连续，最多 30 条）
    const out = []
    let cur = '', start = 0
    for (let i = 0; i < Math.min(bytes.length, 8192); i++) {
      const b = bytes[i]
      if (b >= 0x20 && b <= 0x7E) {
        if (!cur) start = i
        cur += String.fromCharCode(b)
      } else {
        if (cur.length >= 4 && out.length < 30) out.push({ off: start.toString(16).toUpperCase().padStart(4, '0'), s: cur.slice(0, 40) })
        cur = ''
      }
    }
    if (cur.length >= 4 && out.length < 30) out.push({ off: start.toString(16).toUpperCase().padStart(4, '0'), s: cur.slice(0, 40) })
    this.setData({ strings: out })
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
