// 换算定义：基准单位换算系数（温度特殊处理）
const GROUPS = [
  {
    name: '长度',
    units: [
      { key: 'km', label: '千米', factor: 1000 },
      { key: 'm', label: '米', factor: 1 },
      { key: 'dm', label: '分米', factor: 0.1 },
      { key: 'cm', label: '厘米', factor: 0.01 },
      { key: 'mm', label: '毫米', factor: 0.001 },
      { key: 'mi', label: '英里', factor: 1609.344 },
      { key: 'ft', label: '英尺', factor: 0.3048 },
      { key: 'in', label: '英寸', factor: 0.0254 }
    ]
  },
  {
    name: '重量',
    units: [
      { key: 't', label: '吨', factor: 1000000 },
      { key: 'kg', label: '千克', factor: 1000 },
      { key: 'g', label: '克', factor: 1 },
      { key: 'mg', label: '毫克', factor: 0.001 },
      { key: 'lb', label: '磅', factor: 453.59237 },
      { key: 'oz', label: '盎司', factor: 28.349523 }
    ]
  },
  {
    name: '面积',
    units: [
      { key: 'km2', label: '平方千米', factor: 1000000 },
      { key: 'ha', label: '公顷', factor: 10000 },
      { key: 'mu', label: '亩', factor: 666.6667 },
      { key: 'm2', label: '平方米', factor: 1 },
      { key: 'dm2', label: '平方分米', factor: 0.01 },
      { key: 'cm2', label: '平方厘米', factor: 0.0001 },
      { key: 'ft2', label: '平方英尺', factor: 0.09290304 }
    ]
  },
  {
    name: '温度',
    units: [
      { key: 'c', label: '摄氏度 (°C)' },
      { key: 'f', label: '华氏度 (°F)' },
      { key: 'k', label: '开尔文 (K)' }
    ]
  },
  {
    name: '数据存储',
    units: [
      { key: 'tb', label: '太字节 (TB)', factor: Math.pow(1024, 4) },
      { key: 'gb', label: '吉字节 (GB)', factor: Math.pow(1024, 3) },
      { key: 'mb', label: '兆字节 (MB)', factor: Math.pow(1024, 2) },
      { key: 'kb', label: '千字节 (KB)', factor: 1024 },
      { key: 'b', label: '字节 (B)', factor: 1 },
      { key: 'bit', label: '比特 (bit)', factor: 0.125 }
    ]
  },
  {
    name: '速度',
    units: [
      { key: 'ma', label: '马赫', factor: 340.29 },
      { key: 'kmh', label: '千米/时', factor: 1 / 3.6 },
      { key: 'ms', label: '米/秒', factor: 1 },
      { key: 'mph', label: '英里/时', factor: 0.44704 },
      { key: 'kn', label: '节', factor: 0.5144444 },
      { key: 'fts', label: '英尺/秒', factor: 0.3048 }
    ]
  },
  {
    name: '体积',
    units: [
      { key: 'm3', label: '立方米', factor: 1000 },
      { key: 'l', label: '升', factor: 1 },
      { key: 'ml', label: '毫升', factor: 0.001 },
      { key: 'galus', label: '加仑(美)', factor: 3.785411784 },
      { key: 'galuk', label: '加仑(英)', factor: 4.54609 },
      { key: 'pt', label: '品脱(美)', factor: 0.473176473 },
      { key: 'cup', label: '杯', factor: 0.2365882365 }
    ]
  }
]

function toCelsius(v, from) {
  if (from === 'f') return (v - 32) * 5 / 9
  if (from === 'k') return v - 273.15
  return v
}
function fromCelsius(c, to) {
  if (to === 'f') return c * 9 / 5 + 32
  if (to === 'k') return c + 273.15
  return c
}

Page({
  data: {
    groups: GROUPS.map(g => g.name),
    current: 0,
    units: [],
    unitIndexA: 0,
    unitIndexB: 1,
    value: '',
    result: ''
  },

  onLoad() {
    this.applyGroup(0)
  },

  onGroup(e) {
    this.applyGroup(Number(e.detail.value))
  },

  applyGroup(idx) {
    const group = GROUPS[idx]
    this.setData({
      current: idx,
      units: group.units.map(u => u.label),
      unitIndexA: 0,
      unitIndexB: Math.min(1, group.units.length - 1),
      value: '',
      result: ''
    })
  },

  onUnitA(e) { this.setData({ unitIndexA: Number(e.detail.value) }, () => this.calc()) },
  onUnitB(e) { this.setData({ unitIndexB: Number(e.detail.value) }, () => this.calc()) },

  onValue(e) {
    this.setData({ value: e.detail.value }, () => this.calc())
  },

  calc() {
    const raw = parseFloat(this.data.value)
    if (isNaN(raw)) { this.setData({ result: '' }); return }
    const group = GROUPS[this.data.current]
    const a = group.units[this.data.unitIndexA]
    const b = group.units[this.data.unitIndexB]
    let out
    if (group.name === '温度') {
      out = fromCelsius(toCelsius(raw, a.key), b.key)
    } else {
      // 数据存储因子为 2 的幂，除法在浮点下精确；raw*factor 超 2^53 的极端场景
      // 误差也被 toPrecision(10) 吸收，无需特殊分支
      out = raw * a.factor / b.factor
    }
    // 有效数字处理
    let text = Math.abs(out) >= 1e10 || (Math.abs(out) < 1e-6 && out !== 0)
      ? out.toExponential(6)
      : parseFloat(out.toPrecision(10)).toString()
    this.setData({ result: text })
  }
})
