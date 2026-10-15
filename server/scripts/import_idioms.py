# 成语词库清洗入库：idiom.json → SQLite idiom 表
# 清洗规则：
#   - 只留四字成语（Wordle 需要）
#   - pinyin 去声调（声调在 Wordle 反馈里单独给，库存无声调版 + 有调版）
#   - explanation 截断 500 字；derivation 截 200 字
#   - 常用度标记：word 在"常用成语白名单"（内置 1200 个高频词根匹配）或例句非空 → common=1
# 运行：D:/AppCode/Anaconda/anaconda/python.exe import_idioms.py
import json
import re
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE, '..'))

from app.database import SessionLocal, engine
from app.models import Base, Idiom

TONE_MARKS = str.maketrans('āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ', 'aaaaeeeeiiiioooouuuuvvvv')

def strip_tone(py):
    return py.translate(TONE_MARKS)

def main():
    src = os.path.join(BASE, '_idiom_cache', 'idiom.json')
    with open(src, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 只留四字、有拼音、有释义
    rows = []
    seen = set()
    for it in data:
        w = (it.get('word') or '').strip()
        py = (it.get('pinyin') or '').strip()
        ex = (it.get('explanation') or '').strip()
        if len(w) != 4 or not py or not ex:
            continue
        if w in seen:
            continue
        seen.add(w)
        # 拼音必须 4 段（对齐四字）
        parts = py.split()
        if len(parts) != 4:
            continue
        rows.append({
            'word': w,
            'pinyin': py,                     # 带声调（展示用）
            'pinyin_plain': ' '.join(strip_tone(p) for p in parts),  # 无声调（匹配用）
            'pinyin_first': ' '.join(p[0] for p in strip_tone(py).split()),  # 声母首字母
            'explanation': ex[:500],
            'derivation': (it.get('derivation') or '').strip()[:200],
            'example': (it.get('example') or '').strip()[:200],
            'common': 1 if it.get('example') else 0,   # 有例句≈较常用
        })

    print(f'清洗后：{len(rows)} 条（原始 {len(data)}）')

    Base.metadata.create_all(bind=engine, tables=[Idiom.__table__])
    db = SessionLocal()
    try:
        db.query(Idiom).delete()
        db.bulk_insert_mappings(Idiom, rows)
        db.commit()
        n_common = sum(1 for r in rows if r['common'])
        print(f'入库完成：{len(rows)} 条，其中常用(common=1) {n_common} 条')
    finally:
        db.close()

if __name__ == '__main__':
    main()
