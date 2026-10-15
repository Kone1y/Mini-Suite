// 天气工具核心逻辑：纯函数，与页面解耦，可单测
// 数据层：28 城内置库（演示兜底 + 搜索联想）+ 7 场景映射 + 视图模型

const W = {
  sunny:  { label: '晴朗',   en: 'Sunny',       icon: '☀️' },
  cloudy: { label: '多云',   en: 'Cloudy',      icon: '⛅' },
  rainy:  { label: '小雨',   en: 'Rainy',       icon: '🌦️' },
  snowy:  { label: '飘雪',   en: 'Snowy',       icon: '🌨️' },
  storm:  { label: '雷阵雨', en: 'Thunder',     icon: '⛈️' },
  foggy:  { label: '薄雾',   en: 'Misty',       icon: '🌫️' },
  night:  { label: '晴夜',   en: 'Clear Night', icon: '🌙' }
}

const CITY_DB = [
  // 晴朗
  { id: 'beijing',   name: '北京',     en: 'Beijing',     country: 'CN', py: 'beijing',      w: 'sunny',  temp: 21, hi: 27, lo: 14, hum: 42, wind: 12 },
  { id: 'sanya',     name: '三亚',     en: 'Sanya',       country: 'CN', py: 'sanya',        w: 'sunny',  temp: 29, hi: 32, lo: 25, hum: 68, wind: 9 },
  { id: 'kunming',   name: '昆明',     en: 'Kunming',     country: 'CN', py: 'kunming',      w: 'sunny',  temp: 23, hi: 26, lo: 15, hum: 48, wind: 10 },
  { id: 'barcelona', name: '巴塞罗那', en: 'Barcelona',   country: 'ES', py: 'basailuona',   w: 'sunny',  temp: 24, hi: 27, lo: 18, hum: 55, wind: 14 },
  // 多云
  { id: 'tokyo',     name: '东京',     en: 'Tokyo',       country: 'JP', py: 'dongjing',     w: 'cloudy', temp: 23, hi: 26, lo: 18, hum: 65, wind: 14 },
  { id: 'paris',     name: '巴黎',     en: 'Paris',       country: 'FR', py: 'bali',         w: 'cloudy', temp: 17, hi: 20, lo: 11, hum: 60, wind: 13 },
  { id: 'guiyang',   name: '贵阳',     en: 'Guiyang',     country: 'CN', py: 'guiyang',      w: 'cloudy', temp: 19, hi: 23, lo: 14, hum: 72, wind: 8 },
  { id: 'vancouver', name: '温哥华',   en: 'Vancouver',   country: 'CA', py: 'wengehua',     w: 'cloudy', temp: 16, hi: 19, lo: 11, hum: 70, wind: 11 },
  // 小雨
  { id: 'shanghai',  name: '上海',     en: 'Shanghai',    country: 'CN', py: 'shanghai',     w: 'rainy',  temp: 24, hi: 28, lo: 19, hum: 78, wind: 16 },
  { id: 'guangzhou', name: '广州',     en: 'Guangzhou',   country: 'CN', py: 'guangzhou',    w: 'rainy',  temp: 26, hi: 30, lo: 22, hum: 82, wind: 12 },
  { id: 'hangzhou',  name: '杭州',     en: 'Hangzhou',    country: 'CN', py: 'hangzhou',     w: 'rainy',  temp: 22, hi: 26, lo: 18, hum: 76, wind: 10 },
  { id: 'manchester', name: '曼彻斯特', en: 'Manchester', country: 'GB', py: 'manchesite',   w: 'rainy',  temp: 14, hi: 17, lo: 9,  hum: 84, wind: 19 },
  // 飘雪
  { id: 'harbin',    name: '哈尔滨',   en: 'Harbin',      country: 'CN', py: 'haerbin',      w: 'snowy',  temp: -8, hi: -3, lo: -15, hum: 71, wind: 17 },
  { id: 'reykjavik', name: '雷克雅未克', en: 'Reykjavik', country: 'IS', py: 'leikeyaweike', w: 'snowy',  temp: -2, hi: 1,  lo: -7,  hum: 80, wind: 24 },
  { id: 'helsinki',  name: '赫尔辛基', en: 'Helsinki',    country: 'FI', py: 'heerxinji',    w: 'snowy',  temp: -5, hi: -1, lo: -11, hum: 77, wind: 15 },
  { id: 'astana',    name: '阿斯塔纳', en: 'Astana',      country: 'KZ', py: 'asitana',      w: 'snowy',  temp: -12, hi: -6, lo: -19, hum: 68, wind: 20 },
  // 雷阵雨
  { id: 'newyork',   name: '纽约',     en: 'New York',    country: 'US', py: 'niuyue',       w: 'storm',  temp: 18, hi: 22, lo: 11, hum: 55, wind: 20 },
  { id: 'singapore', name: '新加坡',   en: 'Singapore',   country: 'SG', py: 'xinjiapo',     w: 'storm',  temp: 27, hi: 31, lo: 24, hum: 91, wind: 22 },
  { id: 'miami',     name: '迈阿密',   en: 'Miami',       country: 'US', py: 'maiami',        w: 'storm',  temp: 28, hi: 31, lo: 23, hum: 85, wind: 26 },
  { id: 'jakarta',   name: '雅加达',   en: 'Jakarta',     country: 'ID', py: 'yajiada',      w: 'storm',  temp: 26, hi: 30, lo: 23, hum: 89, wind: 18 },
  // 薄雾
  { id: 'london',    name: '伦敦',     en: 'London',      country: 'GB', py: 'lundun',       w: 'foggy',  temp: 15, hi: 17, lo: 9,  hum: 82, wind: 18 },
  { id: 'sanfran',   name: '旧金山',   en: 'San Francisco', country: 'US', py: 'jiujinshan', w: 'foggy',  temp: 14, hi: 17, lo: 10, hum: 80, wind: 15 },
  { id: 'chongqing', name: '重庆',     en: 'Chongqing',   country: 'CN', py: 'chongqing',    w: 'foggy',  temp: 18, hi: 22, lo: 14, hum: 90, wind: 7 },
  { id: 'amsterdam', name: '阿姆斯特丹', en: 'Amsterdam', country: 'NL', py: 'amusitedan',   w: 'foggy',  temp: 12, hi: 15, lo: 7,  hum: 86, wind: 16 },
  // 晴夜
  { id: 'lhasa',     name: '拉萨',     en: 'Lhasa',       country: 'CN', py: 'lasa',         w: 'night',  temp: 12, hi: 20, lo: 2,  hum: 30, wind: 8 },
  { id: 'sydney',    name: '悉尼',     en: 'Sydney',      country: 'AU', py: 'xini',         w: 'night',  temp: 19, hi: 24, lo: 14, hum: 62, wind: 13 },
  { id: 'dubai',     name: '迪拜',     en: 'Dubai',       country: 'AE', py: 'dibai',        w: 'night',  temp: 28, hi: 36, lo: 22, hum: 40, wind: 10 },
  { id: 'cairo',     name: '开罗',     en: 'Cairo',       country: 'EG', py: 'kailuo',       w: 'night',  temp: 22, hi: 30, lo: 15, hum: 35, wind: 9 }
]

const DB_MAP = {}
for (const c of CITY_DB) DB_MAP[c.id] = c
const DEFAULT_SHOWN = ['beijing', 'shanghai', 'tokyo', 'newyork', 'london', 'reykjavik']

// ---------- 单位换算 ----------
function toF(c) { return Math.round(c * 9 / 5 + 32) }
function tVal(c, unit) { return unit === 'f' ? toF(Math.round(c)) : Math.round(c) }

// ---------- 风向/时间 ----------
const DIRS8 = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
function dirName(deg) { return DIRS8[Math.round((((deg % 360) + 360) % 360) / 45) % 8] }

// 按城市时区格式化 HH:mm（unix 秒 + 时区偏移秒）
function hhmmCity(unixSec, tzSec) {
  const d = new Date((unixSec + tzSec) * 1000)
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}

function agoStr(ts, now) {
  now = now || Date.now()
  const m = Math.round((now - ts) / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return m + ' 分钟前'
  return Math.round(m / 60) + ' 小时前'
}

// ---------- OWM 天气码 → 七场景（含昼夜判定） ----------
function mapScene(d, nowSec) {
  const code = (d.weather && d.weather[0] && d.weather[0].id) || 800
  const sr = d.sys && d.sys.sunrise
  const ss = d.sys && d.sys.sunset
  const dt = d.dt != null ? d.dt : (nowSec != null ? nowSec : Math.floor(Date.now() / 1000))
  const isNight = (sr && ss) ? (dt < sr || dt > ss) : false
  if (code >= 200 && code < 300) return 'storm'
  if (code >= 300 && code < 600) return 'rainy'
  if (code >= 600 && code < 700) return 'snowy'
  if (code >= 700 && code < 800) return 'foggy'
  if (code === 800) return isNight ? 'night' : 'sunny'
  return 'cloudy'
}

// ---------- 视图模型：live 数据覆盖 demo ----------
// live: {src:'live'|'cache'|'demo'|'loading', data, ts}
function liveView(id, live) {
  const c = DB_MAP[id]
  if (!c) return null
  const lv = live || {}
  if (!lv.data) {
    return {
      id, city: c, scene: c.w, condCn: W[c.w].label, condEn: W[c.w].en, icon: W[c.w].icon,
      temp: c.temp, hi: c.hi, lo: c.lo, hum: c.hum, windKmh: c.wind,
      src: lv.src || 'demo', ts: 0
    }
  }
  const d = lv.data
  const scene = mapScene(d)
  const w0 = (d.weather && d.weather[0]) || {}
  return {
    id, city: c, scene,
    condCn: w0.description || W[scene].label,
    condEn: W[scene].en,
    icon: W[scene].icon,
    temp: Math.round(d.main.temp),
    hi: Math.round(d.main.temp_max || d.main.temp),
    lo: Math.round(d.main.temp_min || d.main.temp),
    hum: d.main.humidity,
    windKmh: Math.round(((d.wind && d.wind.speed) || 0) * 3.6),
    src: lv.src, ts: lv.ts || 0
  }
}

// ---------- 搜索联想：中文/英文/拼音 ----------
function searchCities(q, excludeIds, limit) {
  limit = limit || 6
  q = (q || '').trim()
  if (!q) return []
  const ql = q.toLowerCase()
  const ex = new Set(excludeIds || [])
  return CITY_DB.filter(c =>
    !ex.has(c.id) &&
    (c.name.indexOf(q) >= 0 || c.en.toLowerCase().indexOf(ql) >= 0 || c.py.indexOf(ql) >= 0)
  ).slice(0, limit)
}

// ---------- 详情视图（live 数据才有，demo 给 null） ----------
function detailView(live) {
  if (!live || !live.data) return null
  const d = live.data
  const wd = d.wind && d.wind.deg
  const tz = d.timezone || 0
  const sr = d.sys && d.sys.sunrise
  const ss = d.sys && d.sys.sunset
  return {
    feels: Math.round(d.main.feels_like != null ? d.main.feels_like : d.main.temp),
    pressure: d.main.pressure,
    visKm: d.visibility != null ? +(d.visibility / 1000).toFixed(1) : null,
    clouds: (d.clouds && d.clouds.all != null) ? d.clouds.all : null,
    windDeg: wd != null ? wd : null,
    windDir: wd != null ? dirName(wd) + '风' : null,
    sunrise: sr ? hhmmCity(sr, tz) : null,
    sunset: ss ? hhmmCity(ss, tz) : null,
    // 日弧太阳位置 0~1（0=日出 1=日落；夜间钳到边界）
    sunPos: (sr && ss) ? (() => {
      const now = Math.floor(Date.now() / 1000)
      let p = (now - sr) / (ss - sr)
      return Math.max(0, Math.min(1, p))
    })() : null
  }
}

module.exports = {
  W, CITY_DB, DB_MAP, DEFAULT_SHOWN,
  toF, tVal, dirName, hhmmCity, agoStr, mapScene, liveView, searchCities, detailView
}
