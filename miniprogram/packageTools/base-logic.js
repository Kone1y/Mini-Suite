// 进制 / 位运算 / 字符编码 核心逻辑（纯函数，可单测）
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// 整数 → 指定进制字符串（2~36），支持 0 与负数
function toBase(value, base) {
  base = base | 0
  if (base < 2 || base > 36) return null
  const neg = value < 0
  let v = Math.abs(Math.trunc(value))
  if (v === 0) return '0'
  let out = ''
  while (v > 0) {
    out = ALPHABET[v % base] + out
    v = Math.floor(v / base)
  }
  return neg ? '-' + out : out
}

// 解析指定进制的整数字符串 → 整数；非法返回 {ok:false}
function fromBase(str, base) {
  if (str == null) return { ok: false, error: '请输入数字' }
  base = base | 0
  if (base < 2 || base > 36) return { ok: false, error: '进制需在 2~36' }
  const s = String(str).trim()
  if (!s) return { ok: false, error: '请输入数字' }
  const neg = s[0] === '-'
  const body = neg ? s.slice(1) : s
  if (!body) return { ok: false, error: '非法数字' }
  let val = 0
  for (const ch of body) {
    const d = ALPHABET.indexOf(ch.toUpperCase())
    if (d < 0 || d >= base) return { ok: false, error: '字符「' + ch + '」不在 ' + base + ' 进制内' }
    val = val * base + d
    if (!isFinite(val)) return { ok: false, error: '数值过大溢出' }
  }
  return { ok: true, value: neg ? -val : val }
}

// 位运算：op ∈ & | ^ << >> ~（~ 为一元，忽略 b）
function bitwise(a, b, op) {
  switch (op) {
    case '&': return a & b
    case '|': return a | b
    case '^': return a ^ b
    case '<<': return a << b
    case '>>': return a >> b
    case '~': return ~a
    default: return NaN
  }
}

// 字符 → 编码信息（多字符仅取第一个码点；rest 为剩余部分）
function charToCode(ch) {
  if (ch == null || ch.length === 0) return null
  const code = ch.codePointAt(0)
  const first = String.fromCodePoint(code)
  return {
    char: ch,
    first,
    rest: ch.slice(first.length),
    dec: code,
    hex: 'U+' + code.toString(16).toUpperCase().padStart(4, '0'),
    bin: code.toString(2)
  }
}

// 编码 → 字符
function codeToChar(code) {
  const n = Number(code)
  if (!Number.isInteger(n) || n < 0 || n > 0x10FFFF) return null
  return { code: n, char: String.fromCodePoint(n) }
}

module.exports = { toBase, fromBase, bitwise, charToCode, codeToChar, ALPHABET }
