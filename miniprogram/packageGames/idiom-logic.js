// 成语 Wordle 核心逻辑：纯函数，可单测
// 反馈设计（汉兜式三重）：
//   字：绿=位置对 黄=字在答案中 灰=无
//   拼音：每个字分声母/韵母两段反馈（绿=该段对 黄=在答案其他字的同段中）
//   声调：绿=声调对且韵母对 黄=声调在答案中

const TONE_MARKS = 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ'
const TONE_PLAIN = 'aaaaeeeeiiiioooouuuuvvvv'
const TONE_NUMS = [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]

function toneOf(ch) {
  for (let i = 0; i < TONE_MARKS.length; i++) {
    if (ch === TONE_MARKS[i]) return TONE_NUMS[i]
  }
  return 0   // 轻声/无声调
}
function stripTone(ch) {
  const i = TONE_MARKS.indexOf(ch)
  return i >= 0 ? TONE_PLAIN[i] : ch
}

// 单音节拆分：声母 + 韵母（简化规则：zh/ch/sh 开头取2，其余单声母表内取1，零声母全韵）
const INITIALS_2 = ['zh', 'ch', 'sh']
const INITIALS_1 = 'bpmfdtnlgkhjqxrzcsyw'.split('')
function splitPinyin(syl) {
  // syl: 无声调拼音（如 huang）
  const low = syl.toLowerCase()
  for (const p of INITIALS_2) {
    if (low.startsWith(p)) return { initial: p, final: low.slice(2) }
  }
  if (INITIALS_1.indexOf(low[0]) >= 0 && low.length > 1) {
    // 特例：整体认读 zhi chi shi ri zi ci si 的 i 韵
    return { initial: low[0], final: low.slice(1) }
  }
  return { initial: '', final: low }   // 零声母（a/o/e 开头）
}

// 带调拼音（如 huà）→ { plain:'hua', tone:4 }
function parseSyllable(syl) {
  let plain = ''
  let tone = 0
  for (const ch of syl) {
    const t = toneOf(ch)
    if (t) tone = t
    plain += stripTone(ch)
  }
  return { plain, tone }
}

// ============ 核心判定 ============
// answer/guess: { word:'四字', pinyin:'x y z w' }（pinyin 带声调，四段）
// 返回 rows: [{ chars:[{ch, state}], pinyins:[{text, initial:{state}, final:{state}, tone:{state}}] }]
// state: 'hit' | 'present' | 'miss'
function judge(answer, guess) {
  const aChars = answer.word.split('')
  const gChars = guess.word.split('')
  const aPys = answer.pinyin.split(/\s+/)
  const gPys = guess.pinyin.split(/\s+/)

  // ---- 字判定（Wordle 经典：先绿后黄，重复字正确处理）----
  const charStates = new Array(4).fill('miss')
  const aUsed = [false, false, false, false]
  // 绿
  for (let i = 0; i < 4; i++) {
    if (gChars[i] === aChars[i]) {
      charStates[i] = 'hit'
      aUsed[i] = true
    }
  }
  // 黄
  for (let i = 0; i < 4; i++) {
    if (charStates[i] === 'hit') continue
    for (let j = 0; j < 4; j++) {
      if (!aUsed[j] && gChars[i] === aChars[j]) {
        charStates[i] = 'present'
        aUsed[j] = true
        break
      }
    }
  }

  // ---- 拼音判定（声母/韵母独立，同 Wordle 逻辑在"音节池"上做）----
  const aParsed = aPys.map(p => Object.assign(splitPinyin(parseSyllable(p).plain), { tone: parseSyllable(p).tone }))
  const gParsed = gPys.map(p => Object.assign(splitPinyin(parseSyllable(p).plain), { tone: parseSyllable(p).tone }))

  const initialStates = new Array(4).fill('miss')
  const finalStates = new Array(4).fill('miss')
  const toneStates = new Array(4).fill('miss')

  // 池：答案的各声母/韵母/声调（用于 present 判定）
  const aInitPool = []
  const aFinalPool = []
  const aTonePool = []
  for (let j = 0; j < 4; j++) {
    aInitPool.push(aParsed[j].initial)
    aFinalPool.push(aParsed[j].final)
    aTonePool.push(aParsed[j].tone)
  }

  // 绿（位置对）
  for (let i = 0; i < 4; i++) {
    if (gParsed[i].initial === aParsed[i].initial) initialStates[i] = 'hit'
    if (gParsed[i].final === aParsed[i].final) finalStates[i] = 'hit'
    if (gParsed[i].tone === aParsed[i].tone) toneStates[i] = 'hit'
  }
  // 黄（在答案其他位置；已 hit 的不重复占池）
  const initUsed = initialStates.map(s => s === 'hit')
  const finalUsed = finalStates.map(s => s === 'hit')
  const toneUsed = toneStates.map(s => s === 'hit')
  for (let i = 0; i < 4; i++) {
    if (initialStates[i] !== 'miss') continue
    for (let j = 0; j < 4; j++) {
      if (!initUsed[j] && gParsed[i].initial === aInitPool[j] && gParsed[i].initial !== '') {
        initialStates[i] = 'present'
        initUsed[j] = true
        break
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    if (finalStates[i] !== 'miss') continue
    for (let j = 0; j < 4; j++) {
      if (!finalUsed[j] && gParsed[i].final === aFinalPool[j]) {
        finalStates[i] = 'present'
        finalUsed[j] = true
        break
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    if (toneStates[i] !== 'miss' || gParsed[i].tone === 0) continue
    for (let j = 0; j < 4; j++) {
      if (!toneUsed[j] && gParsed[i].tone === aTonePool[j]) {
        toneStates[i] = 'present'
        toneUsed[j] = true
        break
      }
    }
  }

  // ---- 组装行 ----
  const chars = gChars.map((ch, i) => ({ ch, state: charStates[i] }))
  const pinyins = gPys.map((py, i) => {
    const p = gParsed[i]
    return {
      text: py,
      initial: { text: p.initial || '∅', state: initialStates[i] },
      final: { text: p.final, state: finalStates[i] },
      tone: { text: p.tone ? String(p.tone) : '·', state: toneStates[i] }
    }
  })
  return { chars, pinyins, win: guess.word === answer.word }
}

// 分享战绩文本
function shareText(rows, win, mode) {
  const emoji = r => r.chars.map(c => c.state === 'hit' ? '🟩' : c.state === 'present' ? '🟨' : '⬜').join('')
  const head = (mode === 'daily' ? '成语挑战·每日一题' : '成语挑战·无限模式') + ' '
  const result = win ? (rows.length + '/6') : 'X/6'
  return head + result + '\n' + rows.map(emoji).join('\n')
}

// 每日一题的日期 key（本地时区）
function todayKey(d) {
  d = d || new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

module.exports = { judge, shareText, todayKey, parseSyllable, splitPinyin, toneOf, stripTone }
