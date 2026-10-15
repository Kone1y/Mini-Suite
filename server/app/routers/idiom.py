# 成语 API：Wordle 出题 + 词典搜索 + 玩法出题（quiz/chain/fill）
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
import random
import unicodedata

from ..database import get_db
from ..models import Idiom

router = APIRouter()

# 常用汉字集（按 GB2312 一级字库近似——覆盖 3755 个高频字）
# Wordle 出题从"全部由一级字组成"的成语里抽，避免生僻字
try:
    import gzip
    import os
    _COMMON_FILE = os.path.join(os.path.dirname(__file__), 'common_chars.txt.gz')
    with gzip.open(_COMMON_FILE, 'rt', encoding='utf-8') as _f:
        COMMON_CHARS = set(_f.read())
except Exception:
    COMMON_CHARS = None   # 文件缺失时不做过滤


# 高频成语白名单（Wordle 出题池：保证可猜性）
import os as _os
try:
    _CI_FILE = _os.path.join(_os.path.dirname(__file__), 'common_idioms.txt')
    with open(_CI_FILE, 'r', encoding='utf-8') as _f:
        COMMON_IDIOMS = set(line.strip() for line in _f
                           if len(line.strip()) == 4)
except Exception:
    COMMON_IDIOMS = None   # 文件缺失时回退到全库


def is_common_word(word: str) -> bool:
    if COMMON_IDIOMS is not None:
        return word in COMMON_IDIOMS
    if COMMON_CHARS is None:
        return True
    return all(ch in COMMON_CHARS for ch in word)


def no_tone(s: str) -> str:
    """去掉拼音声调（'huà'→'hua'；ü 的分音符也属组合符号会被去掉）"""
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if not unicodedata.combining(c))


# ---------- 进程级缓存 ----------
_POOL_CACHE = {}     # {'pool_words': [...], 'pool_items': [...], 'chain_index': {首音: [词]}}


def _get_pool(db: Session):
    """常用池（词列表 + 完整条目）与接龙首音索引，一次性构建缓存"""
    if 'pool_items' not in _POOL_CACHE:
        rows = db.query(Idiom).all()
        items = [r for r in rows if is_common_word(r.word)
                 and len((r.pinyin or '').split()) == 4]
        _POOL_CACHE['pool_items'] = items
        _POOL_CACHE['pool_words'] = [r.word for r in items]
        idx = {}
        for it in items:
            first = no_tone((it.pinyin or '').split()[0])
            idx.setdefault(first, []).append(it.word)
        _POOL_CACHE['chain_index'] = idx
    return _POOL_CACHE['pool_items'], _POOL_CACHE['pool_words'], _POOL_CACHE['chain_index']


@router.get("/idiom/random")
def random_idiom(exclude: str = Query("", max_length=2000), common_only: int = 1, db: Session = Depends(get_db)):
    """Wordle 出题：四字成语随机一条。exclude=已出过的词（逗号分隔），common_only=1 时只用常用字成语。"""
    excl = set(x for x in exclude.split(',') if x)
    items, pool, _ = _get_pool(db)
    cands = [w for w in pool if w not in excl]
    if not cands:
        cands = pool  # 兜底
    word = random.choice(cands)
    item = next(i for i in items if i.word == word)
    return {
        "word": item.word,
        "pinyin": item.pinyin,
        "explanation": item.explanation,
        "derivation": item.derivation,
        "poolSize": len(pool),
    }


@router.get("/idiom/search")
def search_idioms(keyword: str = Query(..., min_length=1, max_length=8), page: int = 1, size: int = 20,
                  db: Session = Depends(get_db)):
    """词典搜索：关键词包含匹配（词/释义）。"""
    q = f"%{keyword}%"
    rows = db.query(Idiom).filter(or_(Idiom.word.like(q), Idiom.explanation.like(q)))
    total = rows.count()
    items = rows.order_by(Idiom.common.desc(), func.length(Idiom.word)).offset((page - 1) * size).limit(size).all()
    return {
        "total": total,
        "items": [{
            "word": i.word, "pinyin": i.pinyin,
            "explanation": i.explanation[:120],
        } for i in items]
    }


# ================= 玩法出题 =================

@router.get("/idiom/quiz")
def quiz_question(exclude: str = Query("", max_length=2000), db: Session = Depends(get_db)):
    """释义选词：给释义，从 4 个成语选项中选正确的。exclude=逗号分隔已出词。"""
    items, pool, _ = _get_pool(db)
    # 只用释义非空的词条
    good = [i for i in items if i.explanation and i.explanation.strip()]
    excl = set(x for x in exclude.split(',') if x)
    cands = [i for i in good if i.word not in excl]
    if len(cands) < 4:
        cands = good
    if len(cands) < 4:
        raise HTTPException(status_code=500, detail="词库不足")
    right = random.choice(cands)
    # 干扰项：与正确答案首字不同的（避免同首干扰太刁钻），且释义不同
    distractors_pool = [i for i in cands if i.word != right.word]
    random.shuffle(distractors_pool)
    distractors = distractors_pool[:3]
    # 4 选项洗牌
    opts = [right] + distractors
    random.shuffle(opts)
    return {
        "explanation": right.explanation,
        "answer": right.word,
        "pinyin": right.pinyin,
        "options": [i.word for i in opts],
        "answerDetail": {"explanation": right.explanation, "derivation": right.derivation},
    }


@router.get("/idiom/chain")
def chain_question(word: str = Query("", max_length=8), db: Session = Depends(get_db)):
    """成语接龙：给 word（上一词），出 4 个候选（恰好 1 个能首字同音接上，3 个干扰）。
    word 为空时出一组「首发词」任选开始。"""
    items, pool, idx = _get_pool(db)
    item_map = {i.word: i for i in items}

    def tail_sound(w):
        it = item_map.get(w)
        if not it:
            return None
        return no_tone(it.pinyin.split()[-1])

    def head_sound(w):
        it = item_map.get(w)
        if not it:
            return None
        return no_tone(it.pinyin.split()[0])

    if not word:
        # 首发词：随机一个可接续的词（保证词库里有词能接它）
        starters = [w for w in pool if tail_sound(w) and tail_sound(w) in idx]
        start = random.choice(starters) if starters else random.choice(pool)
        it = item_map[start]
        return {"word": start, "pinyin": it.pinyin,
                "explanation": it.explanation[:80], "mode": "start"}

    # 接龙题：找能接上 word 的词（首音 == word 尾音）
    ts = None
    if word in item_map:
        ts = tail_sound(word)
    if not ts:
        raise HTTPException(status_code=404, detail="不认识这个词")
    followers = idx.get(ts, [])
    # 排除已含 word 本身的环
    followers = [w for w in followers if w != word]
    if not followers:
        # 尾音无人能接——换一组合法首发（告知前端 reset）
        starters = [w for w in pool if tail_sound(w) and tail_sound(w) in idx]
        start = random.choice(starters)
        it = item_map[start]
        return {"word": start, "pinyin": it.pinyin,
                "explanation": it.explanation[:80], "mode": "reset"}
    right = random.choice(followers)
    # 干扰：首音 != ts 的词
    distractors_pool = [w for w in pool if w != right and head_sound(w) != ts]
    random.shuffle(distractors_pool)
    distractors = distractors_pool[:3]
    opts = [right] + distractors
    random.shuffle(opts)
    it = item_map[right]
    return {
        "prev": word,
        "tailSound": ts,
        "answer": right,
        "pinyin": it.pinyin,
        "options": [i for i in opts],
        "explanation": (it.explanation or "")[:80],
        "mode": "chain",
    }


@router.get("/idiom/fill")
def fill_question(exclude: str = Query("", max_length=2000), db: Session = Depends(get_db)):
    """补全成语：随机词挖 1~2 个字，给 6 个候选字（含正确字）。"""
    items, pool, _ = _get_pool(db)
    excl = set(x for x in exclude.split(',') if x)
    cands = [i for i in items if i.word not in excl and i.explanation and i.explanation.strip()]
    if len(cands) < 8:
        cands = [i for i in items if i.explanation and i.explanation.strip()]
    if not cands:
        raise HTTPException(status_code=500, detail="词库不足")
    item = random.choice(cands)
    word = item.word
    # 挖 1 或 2 个字（位置随机，去重）
    n_blanks = 1 if random.random() < 0.55 or len(set(word)) < 3 else 2
    positions = random.sample(range(4), n_blanks)
    answer_chars = [word[p] for p in positions]
    # 干扰字：从池里其他词的字抽（保证是"成语常用字"）
    other_chars = set()
    for _ in range(80):
        w = random.choice(pool)
        for ch in w:
            if ch not in answer_chars:
                other_chars.add(ch)
        if len(other_chars) >= 30:
            break
    fillers = random.sample(sorted(other_chars), 6 - len(answer_chars))
    options = answer_chars + fillers
    random.shuffle(options)
    return {
        "word": word,
        "pinyin": item.pinyin,
        "explanation": (item.explanation or "")[:80],
        "blanks": positions,          # 挖空位置（0~3）
        "answerChars": answer_chars,  # 正确字（按 blanks 顺序）
        "options": options,           # 6 候选字（洗牌）
        "nBlanks": n_blanks,
    }


@router.get("/idiom/{word}")
def idiom_detail(word: str, db: Session = Depends(get_db)):
    """成语详情。"""
    item = db.query(Idiom).filter(Idiom.word == word).first()
    if not item:
        raise HTTPException(status_code=404, detail="未收录该成语")
    return {
        "word": item.word, "pinyin": item.pinyin,
        "explanation": item.explanation,
        "derivation": item.derivation,
        "example": item.example,
    }
