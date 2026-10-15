// 时间戳 / 日期 转换核心逻辑（纯函数，可单测）
function pad(n) { return n < 10 ? '0' + n : '' + n }

function fmt(d, utc) {
  const y = utc ? d.getUTCFullYear() : d.getFullYear()
  const m = utc ? d.getUTCMonth() + 1 : d.getMonth() + 1
  const day = utc ? d.getUTCDate() : d.getDate()
  const h = utc ? d.getUTCHours() : d.getHours()
  const mi = utc ? d.getUTCMinutes() : d.getMinutes()
  const s = utc ? d.getUTCSeconds() : d.getSeconds()
  return y + '-' + pad(m) + '-' + pad(day) + ' ' + pad(h) + ':' + pad(mi) + ':' + pad(s)
}

// 时间戳 → 日期（自动识别 10 位秒 / 13 位毫秒）
function tsToParts(ts) {
  let ms = ts
  if (ts > 0 && ts < 1e12) ms = ts * 1000
  const d = new Date(ms)
  if (isNaN(d.getTime())) return null
  return {
    ms: d.getTime(),
    local: fmt(d, false),
    utc: fmt(d, true),
    iso: d.toISOString(),
    rel: ts < 1e12 ? '秒级' : '毫秒级'
  }
}

function dateToTs(y, m, d, h, mi, s) {
  if (m < 1 || m > 12) return null
  if (d < 1 || d > 31) return null
  if (h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) return null
  const dt = new Date(y, m - 1, d, h, mi, s)
  if (isNaN(dt.getTime())) return null
  // 防 Date 自动回卷：2/30 → 3/2、4/31 → 5/1 之类要判非法
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return { seconds: Math.floor(dt.getTime() / 1000), millis: dt.getTime() }
}

function nowTs() {
  const ms = Date.now()
  return { seconds: Math.floor(ms / 1000), millis: ms }
}

module.exports = { tsToParts, dateToTs, nowTs, pad }
