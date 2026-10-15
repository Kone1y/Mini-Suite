# -*- coding: utf-8 -*-
"""名篇定向导入：从本地缓存精确抓取传世名篇（静夜思/将进酒/登鹳雀楼等）
保证「搜索名篇必有结果」。用法（在 server 目录下）:
    python scripts/import_classics.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from zhconv import convert  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import Poetry  # noqa: E402

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache")

# 名篇清单（简体；数据源繁体会自动匹配）
CLASSICS = [
    # 李白
    "静夜思", "将进酒", "望庐山瀑布", "黄鹤楼送孟浩然之广陵", "早发白帝城",
    "赠汪伦", "望天门山", "独坐敬亭山", "月下独酌", "行路难",
    # 杜甫
    "春望", "望岳", "春夜喜雨", "茅屋为秋风所破歌", "登高", "闻官军收河南河北",
    "绝句", "江畔独步寻花",
    # 王维
    "相思", "九月九日忆山东兄弟", "送元二使安西", "渭城曲", "鹿柴", "竹里馆", "山居秋暝",
    # 白居易
    "赋得古原草送别", "草", "卖炭翁", "钱塘湖春行", "钱唐湖春行", "暮江吟", "大林寺桃花", "忆江南",
    # 李商隐
    "夜雨寄北", "锦瑟", "无题", "登乐游原",
    # 杜牧
    "清明", "山行", "江南春", "泊秦淮", "秋夕", "赤壁",
    # 孟浩然
    "春晓", "过故人庄", "宿建德江",
    # 王昌龄
    "出塞", "芙蓉楼送辛渐", "从军行",
]


def norm_title(t):
    return convert((t or "").strip(), "zh-hans")


def main():
    db = SessionLocal()
    have_titles = {norm_title(p.title) for p in db.query(Poetry).all()}
    want = set(CLASSICS)
    missing = want - have_titles
    print("库内已有名篇 %d/%d，待补 %d" % (len(want) - len(missing), len(want), len(missing)))
    if not missing:
        print("无需补录")
        return

    added = 0
    for fn in sorted(os.listdir(CACHE)):
        if not fn.endswith(".json") or fn.startswith("authors"):
            continue
        try:
            data = json.loads(open(os.path.join(CACHE, fn), "rb").read().decode("utf-8"))
        except Exception:
            continue
        is_tang = fn.startswith("tang")
        for p in data:
            title = norm_title(p.get("title") or p.get("rhythmic"))
            # 名篇匹配：双向包含（处理「望庐山瀑布水二首」「相和歌辞 静夜思」等变体）
            hit = next((m for m in missing if m in title or title.endswith(m)), None)
            if not hit:
                continue
            author = convert((p.get("author") or "佚名").strip(), "zh-hans")
            content = convert("\n".join(p.get("paragraphs") or []), "zh-hans")
            if not content:
                continue
            if db.query(Poetry).filter_by(title=title[:128], author=author, kind="诗" if is_tang else "词").first():
                missing.discard(hit)
                continue
            db.add(Poetry(title=title[:128], dynasty="唐" if is_tang else "宋",
                          author=author, content=content, kind="诗" if is_tang else "词"))
            added += 1
            missing.discard(hit)
        if not missing:
            break
    db.commit()
    print("补录名篇 %d 首；仍未找到：%s" % (added, missing if missing else "无"))

    # 验证
    for kw in ["静夜思", "将进酒", "春晓", "登鹳雀楼" if "登鹳雀楼" in CLASSICS else "清明"]:
        n = db.query(Poetry).filter(Poetry.title.like("%" + kw + "%")).count()
        print("验证 [%s]: %d 首" % (kw, n))
    # 床前明月光原句（牀前看月光/床前明月光）
    n = db.query(Poetry).filter(Poetry.content.like("%床前%")).count()
    print("含「床前」: %d 首" % n)
    print("库内总计: %d 首" % db.query(Poetry).count())
    db.close()


if __name__ == "__main__":
    main()
