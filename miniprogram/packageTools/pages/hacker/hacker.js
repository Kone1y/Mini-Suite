// Hacker Typer 装逼神器
const CODE_STREAMS = {
  c: [
    '#include <linux/kernel.h>',
    '#include <linux/module.h>',
    '',
    'static int __init exploit_init(void) {',
    '    struct task_struct *task = current;',
    '    printk(KERN_INFO "target pid=%d comm=%s\\n", task->pid, task->comm);',
    '    for_each_process(task) {',
    '        if (task->mm && task->pid > 1000) {',
    '            atomic_inc(&task->usage);',
    '            down_write(&task->mm->mmap_sem);',
    '        }',
    '    }',
    '    return 0;',
    '}',
    'module_init(exploit_init);'
  ].join('\n'),
  py: [
    'import asyncio, hashlib, struct',
    '',
    'async def brute_force(target: bytes, charset: str):',
    '    queue = asyncio.Queue()',
    '    for ch in charset:',
    '        await queue.put(ch)',
    '    while not queue.empty():',
    '        cand = await queue.get()',
    '        if hashlib.sha256(cand.encode()).digest() == target:',
    '            return cand',
    '        for ch in charset:',
    '            await queue.put(cand + ch)',
    '',
    'if __name__ == "__main__":',
    '    asyncio.run(brute_force(b"\\x00", "abcdef"))'
  ].join('\n'),
  js: [
    'const crypto = require("crypto");',
    '',
    'class NodeChain {',
    '  constructor() {',
    '    this.chain = [this.genesis()];',
    '  }',
    '  hash(block) {',
    '    return crypto.createHash("sha256")',
    '      .update(JSON.stringify(block)).digest("hex");',
    '  }',
    '  add(data) {',
    '    const prev = this.chain[this.chain.length - 1];',
    '    this.chain.push({',
    '      data, prev: this.hash(prev), nonce: 0',
    '    });',
    '  }',
    '}',
    'module.exports = NodeChain;'
  ].join('\n'),
  sh: [
    '#!/bin/bash',
    'set -euo pipefail',
    '',
    'scan() {',
    '  local subnet="$1"',
    '  for host in $(seq 1 254); do',
    '    (ping -c1 -W1 "$subnet.$host" &>/dev/null && \\',
    '      echo "[+] alive: $subnet.$host") &',
    '  done',
    '  wait',
    '}',
    'scan "192.168.1"'
  ].join('\n')
}

const LANGS = [
  { key: 'c', name: 'C 内核' },
  { key: 'py', name: 'Python' },
  { key: 'js', name: 'Node.js' },
  { key: 'sh', name: 'Bash' }
]

Page({
  data: {
    langs: LANGS,
    langIdx: 0,
    text: '',            // 已显示的文本
    progress: 0,         // 0~100
    granted: false,      // ACCESS GRANTED 彩蛋
    speed: 3,            // 每次点击推进字符数
    speedLabel: '正常',
    lineCount: 0
  },

  _stream: '',
  _pos: 0,

  onLoad() {
    this.loadStream(0)
  },

  loadStream(idx) {
    this._stream = CODE_STREAMS[LANGS[idx].key]
    this._pos = 0
    this.setData({ langIdx: idx, text: '', progress: 0, granted: false, lineCount: 0 })
  },

  onLang(e) {
    this.loadStream(Number(e.currentTarget.dataset.idx))
  },

  onSpeed() {
    const speeds = [
      { v: 2, label: '慢速' },
      { v: 3, label: '正常' },
      { v: 6, label: '极速' },
      { v: 12, label: '黑客之王' }
    ]
    const next = (this.data.speed + 1) % 4 === 0 ? 0 : speeds.findIndex(s => s.v === this.data.speed) + 1
    const cur = speeds[(next) % speeds.length]
    this.setData({ speed: cur.v, speedLabel: cur.label })
  },

  // 点击屏幕任意处推进
  onType() {
    if (this.data.granted) return
    const n = this.data.speed
    const chunk = this._stream.slice(this._pos, this._pos + n)
    this._pos += n
    // 循环
    if (this._pos >= this._stream.length) this._pos = 0
    const text = (this.data.text + chunk).split('\n').slice(-18).join('\n')
    const progress = Math.min(100, this.data.progress + 1)
    this.setData({ text, progress, lineCount: text.split('\n').length })
    if (progress >= 100 && !this.data.granted) {
      this.setData({ granted: true })
      wx.vibrateShort({ type: 'heavy' })
    }
  },

  onReset() {
    this._pos = 0
    this.setData({ text: '', progress: 0, granted: false })
  },

  // catchtap 阻止冒泡（空 catchtap 不生效）
  stopProp() { },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
