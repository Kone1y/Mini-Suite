// 亲戚称呼计算核心：关系链推算
// 用「我」为根；每个关系词有 (称呼, 性别, 世代偏移, 配偶标志) 四元组语义

// 基础关系表（相对「我」）
const REL = {
  '爸爸': { title: '爸爸', gender: 'm', gen: 1 },
  '妈妈': { title: '妈妈', gender: 'f', gen: 1 },
  '哥哥': { title: '哥哥', gender: 'm', gen: 0, older: true },
  '弟弟': { title: '弟弟', gender: 'm', gen: 0, older: false },
  '姐姐': { title: '姐姐', gender: 'f', gen: 0, older: true },
  '妹妹': { title: '妹妹', gender: 'f', gen: 0, older: false },
  '儿子': { title: '儿子', gender: 'm', gen: -1 },
  '女儿': { title: '女儿', gender: 'f', gen: -1 },
  '老公': { title: '老公', gender: 'm', gen: 0, spouse: true },
  '老婆': { title: '老婆', gender: 'f', gen: 0, spouse: true }
}

// 复合称呼表：键 = 关系描述（链式展开后的标准形态）
// gen: 世代差（正=长辈），gender: 该亲属性别，older: 同辈长幼
const COMPOUND = {
  // 父系长辈
  '1m1m': { title: '爷爷', gender: 'm' },
  '1m1f': { title: '奶奶', gender: 'f' },
  '1f1m': { title: '外公', gender: 'm' },
  '1f1f': { title: '外婆', gender: 'f' },
  // 父辈的兄弟姐妹
  '1m1m0m': { title: '伯父', gender: 'm' },
  '1m1m0m2': { title: '叔叔', gender: 'm' },   // 爷爷的次子以下（简化：用岁序区分不展开，统一叔伯）
  '1m1f0m': { title: '舅舅', gender: 'm' },
  '1f1m0m': { title: '舅舅', gender: 'm' },
  '1f1f0m': { title: '舅舅', gender: 'm' },
  '1m0m1': { title: '伯父', gender: 'm' },
  '1m0m0': { title: '叔叔', gender: 'm' },
  '1m0f1': { title: '姑妈', gender: 'f' },
  '1m0f0': { title: '姑姑', gender: 'f' },
  '1f0m1': { title: '舅舅', gender: 'm' },
  '1f0m0': { title: '舅舅', gender: 'm' },
  '1f0f1': { title: '姨妈', gender: 'f' },
  '1f0f0': { title: '阿姨', gender: 'f' },
  // 平辈（堂/表）
  '1m0m0m': { title: '堂哥/堂弟', gender: 'm' },
  '1m0f0m': { title: '表哥/表弟', gender: 'm' },
  '1f0m0m': { title: '表哥/表弟', gender: 'm' },
  '1f0f0m': { title: '表哥/表弟', gender: 'm' },
  '1m0m0f': { title: '堂姐/堂妹', gender: 'f' },
  '1m0f0f': { title: '表姐/表妹', gender: 'f' },
  '1f0m0f': { title: '表姐/表妹', gender: 'f' },
  '1f0f0f': { title: '表姐/表妹', gender: 'f' },
  // 晚辈
  'm-1': { title: '儿子', gender: 'm' },
  'f-1': { title: '女儿', gender: 'f' },
  'm-1m': { title: '孙子', gender: 'm' },
  'm-1f': { title: '孙女', gender: 'f' },
  'f-1m': { title: '外孙', gender: 'm' },
  'f-1f': { title: '外孙女', gender: 'f' },
  // 祖辈的兄弟姐妹等复杂关系走通用规则
}

// 通用推算：按链计算世代与性别，给通用称呼
function chainTitle(chain) {
  // chain: ['爸爸','哥哥','儿子', ...]
  let gen = 0, gender = null, spouse = false
  for (const word of chain) {
    const r = REL[word]
    if (!r) return null
    gen += r.gen
    if (r.spouse) { spouse = !spouse; gender = r.gender }
    else gender = r.gender
  }
  return { gen, gender, spouse }
}

// 主入口：返回称呼文本
function calc(chain, myGender = 'm') {
  if (!chain.length) return '自己'
  // 展开复合查找
  const key = chain.map(w => {
    const r = REL[w]
    if (r.spouse) return 's'
    return (r.gender === 'm' ? 'm' : 'f') + (r.gen >= 0 ? '' : '')
  }).join('')

  // 逐一处理：构造逐级路径
  // 简化策略：找最远三代路径
  // 父母 -> 兄妹 -> 子女 三段式
  const parents = []
  let i = 0
  while (i < chain.length && ['爸爸', '妈妈', '老公', '老婆'].includes(chain[i])) {
    if (chain[i] === '老公' || chain[i] === '老婆') break
    parents.push(chain[i]); i++
  }
  // 中段：兄弟姐妹
  const sibs = []
  while (i < chain.length && ['哥哥', '弟弟', '姐姐', '妹妹'].includes(chain[i])) {
    sibs.push(chain[i]); i++
  }
  // 末段：子女
  const kids = []
  while (i < chain.length && ['儿子', '女儿'].includes(chain[i])) {
    kids.push(chain[i]); i++
  }
  if (i < chain.length) return '暂不支持这么复杂的关系'

  const parentKey = parents.join('')
  const sibFirst = sibs[0]
  const kidFirst = kids[0]

  // ============ 分情况 ============
  // 无父母段：直接同辈/晚辈
  if (!parents.length) {
    if (!sibs.length) {
      // 纯子女链
      if (kids.length === 1) return kidFirst === '儿子' ? '儿子' : '女儿'
      if (kids.length === 2) {
        if (kids[0] === '儿子') return kids[1] === '儿子' ? '孙子' : '孙女'
        return kids[1] === '儿子' ? '外孙' : '外孙女'
      }
      return '暂不支持'
    }
    if (!kids.length) return sibs.length === 1 ? REL[sibFirst].title : '暂不支持'
    // 兄弟姐妹的子女
    if (sibs.length === 1 && kids.length === 1) {
      return sibFirst === '哥哥' || sibFirst === '弟弟' ? (kidFirst === '儿子' ? '侄子' : '侄女') : (kidFirst === '儿子' ? '外甥' : '外甥女')
    }
    return '暂不支持'
  }

  // 有父母段
  const pLen = parents.length
  // 两代父母（祖辈）
  if (pLen === 2) {
    const fatherSide = parents[0] === '爸爸'
    if (!sibs.length && !kids.length) {
      return fatherSide ? (parents[1] === '爸爸' ? '爷爷' : '奶奶') : (parents[1] === '爸爸' ? '外公' : '外婆')
    }
    if (sibs.length === 1 && !kids.length) {
      // 祖辈的兄弟姐妹
      const m = REL[sibFirst].gender === 'm'
      return m ? (fatherSide ? '伯祖父/叔祖父' : '舅公') : (fatherSide ? '姑祖母' : '姨祖母')
    }
    if (!sibs.length && kids.length === 1) {
      // 祖辈的儿子 = 伯/叔，祖辈的女儿 = 姑/姨（按父系母系）
      const m = REL[kidFirst].gender === 'm'
      if (fatherSide) return m ? '伯父/叔叔' : '姑妈/姑姑'
      return m ? '舅舅' : '姨妈/阿姨'
    }
    if (!sibs.length && kids.length === 2) {
      // 祖辈的孙辈 = 父母的兄妹 = 堂/表
      const m = REL[kids[1]].gender === 'm'
      return fatherSide ? (m ? '堂哥/堂弟' : '堂姐/堂妹') : (m ? '表哥/表弟' : '表姐/表妹')
    }
    return '暂不支持'
  }
  // 一代父母
  if (pLen === 1) {
    const father = parents[0] === '爸爸'
    if (!sibs.length && !kids.length) return father ? '爸爸' : '妈妈'
    if (sibs.length === 1 && !kids.length) {
      // 父母的兄弟姐妹
      const m = REL[sibFirst].gender === 'm'
      const older = REL[sibFirst].older
      if (father) return m ? (older ? '伯父/伯伯' : '叔叔') : (older ? '姑妈/大姑' : '姑姑')
      return m ? '舅舅' : (older ? '姨妈' : '阿姨')
    }
    if (sibs.length === 1 && kids.length === 1) {
      // 父母兄弟姐妹的子女 = 堂/表
      const m = REL[kidFirst].gender === 'm'
      // 姑/舅/姨的子女都为表；伯叔的子女为堂
      const sibMale = REL[sibFirst].gender === 'm'
      if (father && sibMale) return m ? '堂哥/堂弟' : '堂姐/堂妹'
      return m ? '表哥/表弟' : '表姐/表妹'
    }
    if (!sibs.length && kids.length === 1) {
      // 父母的子女 = 兄妹（自己）
      const older = true
      const m = REL[kidFirst].gender === 'm'
      return m ? (older ? '哥哥' : '弟弟') : (older ? '姐姐' : '妹妹')
    }
    if (!sibs.length && kids.length === 2) {
      // 父母的孙辈
      if (kids[0] === '儿子') return kids[1] === '儿子' ? '侄子' : '侄女'
      return kids[1] === '儿子' ? '外甥' : '外甥女'
    }
  }
  return '暂不支持'
}

module.exports = { calc, REL }
