// 纯 JS 哈希实现（无后端、无 subtle crypto 依赖），供小程序直接使用
// 实现：MD5 / SHA-1 / SHA-256。输入为 Uint8Array，输出为小写十六进制串。

// ---------- 工具 ----------
function utf8Bytes(str) {
  const out = []
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i)
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F))
    else if (c >= 0xD800 && c <= 0xDBFF) {           // UTF-16 代理对 → 4 字节
      const c2 = str.charCodeAt(++i)
      const cp = 0x10000 + ((c & 0x3FF) << 10) + (c2 & 0x3FF)
      out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F))
    } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F))
  }
  return out
}

function padToMultiple(bytes, blockBits, isLittleEndian) {
  const l = bytes.length
  const bitLen = l * 8
  // 块均为 64 字节；需要在数据后放 0x80 + 填充 0 + 8 字节长度，total 为 64 的倍数
  const total = ((l + 1 + 8 + 63) & ~63)
  const msg = new Uint8Array(total)
  msg.set(bytes)
  msg[l] = 0x80
  const view = new DataView(msg.buffer)
  if (isLittleEndian) {
    view.setUint32(total - 8, (bitLen >>> 0) >>> 0, true)
    view.setUint32(total - 4, Math.floor(bitLen / 0x100000000) >>> 0, true)
  } else {
    view.setUint32(total - 8, Math.floor(bitLen / 0x100000000) >>> 0, false)
    view.setUint32(total - 4, (bitLen >>> 0) >>> 0, false)
  }
  return { msg, view, total }
}

function wordHexBE(x) {
  return ('00000000' + (x >>> 0).toString(16)).slice(-8)
}
function wordHexLE(x) {
  let s = ''
  for (let i = 0; i < 4; i++) s += ('0' + ((x >>> 0 >> (i * 8)) & 0xff).toString(16)).slice(-2)
  return s
}

const ROTR = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0
const ROTL = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0

// ---------- SHA-256 ----------
const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]
const H256 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]

function sha256(bytes) {
  const H = H256.slice()
  const { view, total } = padToMultiple(bytes, 512, false)
  const w = new Uint32Array(64)
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false)
    for (let i = 16; i < 64; i++) {
      const s0 = ROTR(w[i - 15], 7) ^ ROTR(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = ROTR(w[i - 2], 17) ^ ROTR(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7]
    for (let i = 0; i < 64; i++) {
      const S1 = ROTR(e, 6) ^ ROTR(e, 11) ^ ROTR(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K256[i] + w[i]) >>> 0
      const S0 = ROTR(a, 2) ^ ROTR(a, 13) ^ ROTR(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0
  }
  return H.map(wordHexBE).join('')
}

// ---------- SHA-1 ----------
const H1 = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
const K1 = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6]

function sha1(bytes) {
  const H = H1.slice()
  const { view, total } = padToMultiple(bytes, 512, false)
  const w = new Uint32Array(80)
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false)
    for (let i = 16; i < 80; i++) w[i] = ROTL(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4]
    for (let i = 0; i < 80; i++) {
      let f, k
      if (i < 20) { f = (b & c) | (~b & d); k = K1[0] }
      else if (i < 40) { f = b ^ c ^ d; k = K1[1] }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = K1[2] }
      else { f = b ^ c ^ d; k = K1[3] }
      const t = (ROTL(a, 5) + f + e + w[i] + k) >>> 0
      e = d; d = c; c = ROTL(b, 30); b = a; a = t
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0; H[4] = (H[4] + e) >>> 0
  }
  return H.map(wordHexBE).join('')
}

// ---------- MD5 ----------
function md5(bytes) {
  const K = []
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ]
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  const l = bytes.length
  const bitLenLo = (l * 8) >>> 0
  const bitLenHi = Math.floor((l * 8) / 0x100000000)
  const total = ((l + 1 + 8 + 63) & ~63)
  const msg = new Uint8Array(total)
  msg.set(bytes)
  msg[l] = 0x80
  const view = new DataView(msg.buffer)
  view.setUint32(total - 8, bitLenLo, true)
  view.setUint32(total - 4, bitLenHi, true)
  const M = new Uint32Array(16)
  const add = (x, y) => (x + y) >>> 0
  const rol = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(off + i * 4, true)
    let A = a0, B = b0, C = c0, D = d0
    for (let i = 0; i < 64; i++) {
      let F, g
      if (i < 16) { F = (B & C) | (~B & D); g = i }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16 }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16 }
      else { F = C ^ (B | ~D); g = (7 * i) % 16 }
      F = add(add(add(F, A), K[i]), M[g])
      A = D; D = C; C = B; B = add(B, rol(F, s[i]))
    }
    a0 = add(a0, A); b0 = add(b0, B); c0 = add(c0, C); d0 = add(d0, D)
  }
  return wordHexLE(a0) + wordHexLE(b0) + wordHexLE(c0) + wordHexLE(d0)
}

const FUNCS = { md5, sha1, sha256 }

// 文本 → 哈希十六进制
function hashText(text, algo) {
  const fn = FUNCS[algo]
  if (!fn) return ''
  return fn(utf8Bytes(text))
}

module.exports = { md5, sha1, sha256, hashText, utf8Bytes }
