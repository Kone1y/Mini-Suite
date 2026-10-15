# -*- coding: utf-8 -*-
"""存量诗词繁转简：全唐诗数据源为繁体，统一转为简体（标题/作者/内容）
用法（在 server 目录下）:
    python scripts/convert_to_simplified.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from zhconv import convert  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import Poetry  # noqa: E402


def main():
    db = SessionLocal()
    all_rows = db.query(Poetry).all()
    changed = 0
    for p in all_rows:
        t2 = convert(p.title, "zh-hans")
        a2 = convert(p.author, "zh-hans")
        c2 = convert(p.content, "zh-hans")
        if (t2, a2, c2) != (p.title, p.author, p.content):
            p.title, p.author, p.content = t2, a2, c2
            changed += 1
    db.commit()
    print("已转换 %d / %d 首" % (changed, len(all_rows)))

    # 验证
    checks = [
        ("李白", "李白"),
        ("静夜思", "静夜思"),
        ("床前", "床前看月光"),
    ]
    for kw, note in checks:
        n = db.query(Poetry).filter(Poetry.content.like("%" + kw + "%")).count()
        print("验证 [%s]（%s）: %d 首" % (kw, note, n))
    # 繁体残留检查：常见繁体字
    for trad in ["誰", "東", "車", "靜", "隱"]:
        n = db.query(Poetry).filter(Poetry.content.like("%" + trad + "%")).count()
        print("繁体残留 [%s]: %d" % (trad, n))
    print("库内总计: %d 首" % db.query(Poetry).count())
    db.close()


if __name__ == "__main__":
    main()
