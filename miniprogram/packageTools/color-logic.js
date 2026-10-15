// 色值转换器：HEX / RGB / HSL 互转
// 核心转换纯函数（与页面解耦，可单测）

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// HEX -> RGB
function hexToRgb(hex) {
  let h = String(hex || '').trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  }
}

// RGB -> HEX
function rgbToHex(r, g, b) {
  const to2 = v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return '#' + to2(r) + to2(g) + to2(b)
}

// RGB -> HSL
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

// HSL -> RGB
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360
  s = clamp(s, 0, 100) / 100
  l = clamp(l, 0, 100) / 100
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue2rgb = t => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return {
    r: Math.round(hue2rgb(h + 1 / 3) * 255),
    g: Math.round(hue2rgb(h) * 255),
    b: Math.round(hue2rgb(h - 1 / 3) * 255)
  }
}

// 亮度（决定文字用黑还是白）
function luminance(r, g, b) {
  const f = v => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

module.exports = { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, luminance, clamp }
