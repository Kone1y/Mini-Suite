// 亲戚称呼计算核心：关系链推算
// 用「我」为根；每个关系词有 (称呼, 性别, 世代偏移, 配偶标志) 四元组语义
// N8：配偶链补全——支持 任意位置 的 老公/老婆（视角切换重算）

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

// ===== N8 配偶转换表 =====
// X 的老婆/老公 = Y（对称互换）。用于消除链中配偶词：找第一个配偶词，把它前面的
// 亲属链转换成"该亲属的配偶"的等价亲属链，然后从新视角继续推。
// 例：「爸爸的哥哥的老婆」→ 爸爸的哥哥=伯伯 → 伯伯的老婆=伯母
// 实现：SPOUSE_OF[X 的称呼] = 等价链（用基础词表示）
const SPOUSE_OF = {
  // 长辈
  '爸爸': ['妈妈'], '妈妈': ['爸爸'],
  '爷爷': ['奶奶'], '奶奶': ['爷爷'],
  '外公': ['外婆'], '外婆': ['外公'],
  // 父辈
  '伯父': ['伯母'], '伯母': ['伯父'],
  '叔叔': ['婶婶'], '婶婶': ['叔叔'],
  '姑妈': ['姑父'], '姑父': ['姑妈'],
  '姑姑': ['姑父'], '舅舅': ['舅妈'], '舅妈': ['舅舅'],
  '姨妈': ['姨父'], '姨父': ['姨妈'],
  '阿姨': ['姨父'],
  // 平辈（配偶的亲属 → 我的亲属，走 AFFIN 转换）
  // 晚辈
  '儿子': ['儿媳'], '儿媳': ['儿子'],
  '女儿': ['女婿'], '女婿': ['女儿'],
  '孙子': ['孙媳'], '孙女': ['孙女婿'],
  '侄子': ['侄媳'], '侄女': ['侄女婿'],
  '外甥': ['外甥媳'], '外甥女': ['外甥女婿']
}

// ===== N8 姻亲转换表（AFFINITY）=====
// 「老婆的X」/「老公的X」= 我的什么人（反之亦然：我的 X 的配偶）
// 例：老婆的爸爸=岳父；老公的姐姐=大姑子（姐）；老公的哥哥=大伯子
const AFFIN = {
  // 我 配偶 的父母/兄妹/子女 → 我的称呼
  m: {   // 配偶是男性（我叫他老公）→ 他家的人
    '爸爸': '公公', '妈妈': '婆婆',
    '哥哥': '大伯子', '弟弟': '小叔子',
    '姐姐': '大姑子', '妹妹': '小姑子',
    '儿子': '继子', '女儿': '继女'
  },
  f: {   // 配偶是女性（我叫她老婆）→ 她家的人
    '爸爸': '岳父', '妈妈': '岳母',
    '哥哥': '内兄/大舅子', '弟弟': '内弟/小舅子',
    '姐姐': '大姨子', '妹妹': '小姨子',
    '儿子': '继子', '女儿': '继女'
  }
}

// 主推算（原三段式逻辑，抽出为内部函数）
function calcCore(chain) {
  const parents = []
  let i = 0
  while (i < chain.length && ['爸爸', '妈妈'].includes(chain[i])) {
    parents.push(chain[i]); i++
  }
  const sibs = []
  while (i < chain.length && ['哥哥', '弟弟', '姐姐', '妹妹'].includes(chain[i])) {
    sibs.push(chain[i]); i++
  }
  const kids = []
  while (i < chain.length && ['儿子', '女儿'].includes(chain[i])) {
    kids.push(chain[i]); i++
  }
  if (i < chain.length) return null   // 有配偶词等未消化内容 → 上层处理

  const sibFirst = sibs[0]
  const kidFirst = kids[0]

  // 无父母段
  if (!parents.length) {
    if (!sibs.length) {
      if (kids.length === 1) return kidFirst === '儿子' ? '儿子' : '女儿'
      if (kids.length === 2) {
        if (kids[0] === '儿子') return kids[1] === '儿子' ? '孙子' : '孙女'
        return kids[1] === '儿子' ? '外孙' : '外孙女'
      }
      return null
    }
    if (!kids.length) return sibs.length === 1 ? REL[sibFirst].title : null
    if (sibs.length === 1 && kids.length === 1) {
      return sibFirst === '哥哥' || sibFirst === '弟弟' ? (kidFirst === '儿子' ? '侄子' : '侄女') : (kidFirst === '儿子' ? '外甥' : '外甥女')
    }
    return null
  }

  const pLen = parents.length
  if (pLen === 2) {
    const fatherSide = parents[0] === '爸爸'
    if (!sibs.length && !kids.length) {
      return fatherSide ? (parents[1] === '爸爸' ? '爷爷' : '奶奶') : (parents[1] === '爸爸' ? '外公' : '外婆')
    }
    if (sibs.length === 1 && !kids.length) {
      const m = REL[sibFirst].gender === 'm'
      return m ? (fatherSide ? '伯祖父/叔祖父' : '舅公') : (fatherSide ? '姑祖母' : '姨祖母')
    }
    if (!sibs.length && kids.length === 1) {
      const m = REL[kidFirst].gender === 'm'
      if (fatherSide) return m ? '伯父/叔叔' : '姑妈/姑姑'
      return m ? '舅舅' : '姨妈/阿姨'
    }
    if (!sibs.length && kids.length === 2) {
      const m = REL[kids[1]].gender === 'm'
      return fatherSide ? (m ? '堂哥/堂弟' : '堂姐/堂妹') : (m ? '表哥/表弟' : '表姐/表妹')
    }
    return null
  }
  if (pLen === 1) {
    const father = parents[0] === '爸爸'
    if (!sibs.length && !kids.length) return father ? '爸爸' : '妈妈'
    if (sibs.length === 1 && !kids.length) {
      const m = REL[sibFirst].gender === 'm'
      const older = REL[sibFirst].older
      if (father) return m ? (older ? '伯父/伯伯' : '叔叔') : (older ? '姑妈/大姑' : '姑姑')
      return m ? '舅舅' : (older ? '姨妈' : '阿姨')
    }
    if (sibs.length === 1 && kids.length === 1) {
      const m = REL[kidFirst].gender === 'm'
      const sibMale = REL[sibFirst].gender === 'm'
      if (father && sibMale) return m ? '堂哥/堂弟' : '堂姐/堂妹'
      return m ? '表哥/表弟' : '表姐/表妹'
    }
    if (!sibs.length && kids.length === 1) {
      // 父母的子女 = 兄妹（自己）——older 未知给通用
      const m = REL[kidFirst].gender === 'm'
      return m ? '哥哥/弟弟' : '姐姐/妹妹'
    }
    if (!sibs.length && kids.length === 2) {
      if (kids[0] === '儿子') return kids[1] === '儿子' ? '侄子' : '侄女'
      return kids[1] === '儿子' ? '外甥' : '外甥女'
    }
  }
  return null
}

// ===== N8 配偶链主算法 =====
// 策略：
// 1. 链首是配偶词：老婆的X → AFFIN 转换（直接查表，剩下的链继续递归处理）
// 2. 链中配偶词：把配偶词之前的子链算出称呼 T，查 SPOUSE_OF[T]；若 T 不在表里，
//    用 AFFIN 反推（T 的配偶的 X 视角）
// 3. 链尾配偶词：先算前面的链得 T，返回 SPOUSE_OF[T]（如 儿子的老婆=儿媳）
function calc(chain, depth) {
  if (depth === undefined) depth = 0
  if (depth > 6) return '关系太复杂啦'
  if (!chain.length) return '自己'
  const first = chain[0]
  const firstRel = REL[first]

  // ---- 情形 1：链首配偶词（老公的… / 老婆的…）----
  if (firstRel && firstRel.spouse) {
    if (chain.length === 1) return firstRel.title      // 就一个词：老公/老婆
    const rest = chain.slice(1)
    // 配偶的亲属：AFFIN 查表（rest 的首词）
    const table = AFFIN[firstRel.gender]
    const nextWord = rest[0]
    if (table[nextWord]) {
      // 老婆的爸爸 → 岳父（若 rest 还有后续，继续从岳父视角——简化：仅支持 1 层深入）
      if (rest.length === 1) return table[nextWord]
      // 老婆的爸爸的X → 递归：把 nextWord 替换成对应"我家"等价链再算
      // 简化正确路径：岳父=老婆的爸爸 → 后续链基于岳父。用 INVERSE 映射回我方视角：
      // 岳父的哥哥=舅公类复杂关系降级提示
      return table[nextWord] + '的' + rest.slice(1).join('的')
    }
    // 配偶的配偶 = 自己
    if (REL[nextWord] && REL[nextWord].spouse) return '自己'
    return '暂不支持'
  }

  // ---- 情形 2/3：链中或链尾配偶词 ----
  const spIdx = chain.findIndex(w => REL[w] && REL[w].spouse)
  if (spIdx > 0) {
    const before = chain.slice(0, spIdx)
    const after = chain.slice(spIdx + 1)
    let beforeTitle = calcCore(before) || calc(before, depth + 1)
    if (!beforeTitle || beforeTitle === '暂不支持') return '暂不支持'
    // 斜杠多称呼：取主称呼查配偶表（伯父/伯伯 → 伯父）
    const isMulti = beforeTitle.indexOf('/') >= 0
    const lookupKey = isMulti ? beforeTitle.split('/')[0] : beforeTitle
    if (!after.length) {
      // 链尾：T 的配偶
      const sp = SPOUSE_OF[lookupKey]
      return sp ? sp.join('') : (isMulti ? lookupKey + '的配偶' : beforeTitle + '的配偶')
    }
    // 链中：展开重算
    const expanded = expandTitle(lookupKey)
    if (expanded) {
      return calc(expanded.concat(after), depth + 1)
    }
    const sp2 = SPOUSE_OF[lookupKey]
    if (sp2) return calc(sp2.concat(after), depth + 1)
    return '暂不支持'
  }

  // ---- 无配偶词：原三段式 ----
  const core = calcCore(chain)
  return core || '暂不支持这么复杂的关系'
}

// 称呼 → 基础链展开（用于配偶词替换后重算）
function expandTitle(title) {
  const T2C = {
    '爸爸': ['爸爸'], '妈妈': ['妈妈'],
    '爷爷': ['爸爸', '爸爸'], '奶奶': ['爸爸', '妈妈'],
    '外公': ['妈妈', '爸爸'], '外婆': ['妈妈', '妈妈'],
    '伯父': ['爸爸', '哥哥'], '叔叔': ['爸爸', '弟弟'],
    '姑妈': ['爸爸', '姐姐'], '姑姑': ['爸爸', '妹妹'],
    '舅舅': ['妈妈', '哥哥'], '舅妈': null,
    '姨妈': ['妈妈', '姐姐'], '阿姨': ['妈妈', '妹妹'],
    '哥哥': ['哥哥'], '弟弟': ['弟弟'], '姐姐': ['姐姐'], '妹妹': ['妹妹'],
    '儿子': ['儿子'], '女儿': ['女儿'],
    '儿媳': ['儿子', '老婆'], '女婿': ['女儿', '老公'],
    '堂哥/堂弟': null, '表哥/表弟': null
  }
  return T2C[title] || null
}

module.exports = { calc, REL, SPOUSE_OF, AFFIN, calcCore }
