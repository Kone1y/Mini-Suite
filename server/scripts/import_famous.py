# -*- coding: utf-8 -*-
"""名家诗词补充导入：修复「搜索李白无结果」——原导入只取了全唐诗开头的帝王诗
用法（在 server 目录下）:
    python scripts/import_famous.py            # 直接用本地缓存（scripts/_cache）
    python scripts/import_famous.py --download # 缓存缺失时先联网下载
"""
import argparse
import json
import sys
import os
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal  # noqa: E402
from app.init_db import init_db  # noqa: E402
from app.models import Poetry  # noqa: E402

CDN = "https://cdn.jsdelivr.net/gh/chinese-poetry/chinese-poetry@master"
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache")

TANG_AUTHORS = ["李白", "杜甫", "白居易", "王维", "李商隐", "杜牧", "孟浩然", "王昌龄"]
SONG_AUTHORS = ["苏轼", "辛弃疾", "李清照", "欧阳修"]
PER_AUTHOR_CAP = 60

# 数据源为繁体（全唐诗用「王維/李商隱/王昌齡」），显示/入库统一转简体
TRAD2SIMPLE = {"王維": "王维", "李商隱": "李商隐", "王昌齡": "王昌龄",
               "劉禹錫": "刘禹锡", "孟郊": "孟郊", "李賀": "李贺", "杜荀鶴": "杜荀鹤"}

# (远端路径, 缓存名)
FILES = [
    ("全唐诗/poet.tang.1000.json", "tang_1000.json"),
    ("全唐诗/poet.tang.5000.json", "tang_5000.json"),
    ("全唐诗/poet.tang.6000.json", "tang_6000.json"),
    ("全唐诗/poet.tang.7000.json", "tang_7000.json"),
    ("全唐诗/poet.tang.8000.json", "tang_8000.json"),
    ("全唐诗/poet.tang.10000.json", "tang_10000.json"),
    ("全唐诗/poet.tang.11000.json", "tang_11000.json"),
    ("全唐诗/poet.tang.28000.json", "tang_28000.json"),
    ("全唐诗/poet.tang.29000.json", "tang_29000.json"),
    ("宋词/ci.song.0.json", "song_0.json"),
    ("宋词/ci.song.1000.json", "song_1000.json"),
    ("宋词/ci.song.3000.json", "song_3000.json"),
    ("宋词/ci.song.6000.json", "song_6000.json"),
]


def fetch(pair, allow_download):
    path, local = pair
    dst = os.path.join(CACHE, local)
    if os.path.exists(dst) and os.path.getsize(dst) > 100000:
        return json.loads(open(dst, "rb").read().decode("utf-8"))
    if not allow_download:
        raise FileNotFoundError("缓存缺失且未开启 --download: " + local)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    url = CDN + "/" + urllib.request.quote(path)
    req = urllib.request.Request(url, headers={"User-Agent": "mini-suite"})
    data = opener.open(req, timeout=90).read()
    os.makedirs(CACHE, exist_ok=True)
    open(dst, "wb").write(data)
    return json.loads(data.decode("utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true", help="缓存缺失时联网下载")
    args = ap.parse_args()

    init_db()
    db = SessionLocal()

    tang_caps = {a: 0 for a in TANG_AUTHORS}
    song_caps = {a: 0 for a in SONG_AUTHORS}

    for pair in FILES:
        is_tang = pair[1].startswith("tang")
        data = fetch(pair, args.download)
        caps = tang_caps if is_tang else song_caps
        authors = TANG_AUTHORS if is_tang else SONG_AUTHORS
        for p in data:
            author = (p.get("author") or "").strip()
            # 繁体名归一化到简体再匹配
            author = TRAD2SIMPLE.get(author, author)
            if author not in caps or caps[author] >= PER_AUTHOR_CAP:
                continue
            title = ((p.get("title") or p.get("rhythmic")) or "").strip()
            content = "\n".join(p.get("paragraphs") or [])
            if not title or not content:
                continue
            kind = "诗" if is_tang else "词"
            if db.query(Poetry).filter_by(title=title[:128], author=author, kind=kind).first():
                continue
            db.add(Poetry(title=title[:128], dynasty="唐" if is_tang else "宋",
                          author=author, content=content, kind=kind))
            caps[author] += 1
        db.commit()
        print("  %s 完成：%s" % (pair[1], caps))

    # 验证
    for a in ["李白", "杜甫", "白居易", "苏轼", "辛弃疾", "李清照"]:
        cnt = db.query(Poetry).filter(Poetry.author.like("%" + a + "%")).count()
        print("验证 [%s]: %d 首" % (a, cnt))
    total = db.query(Poetry).count()
    print("完成：库内总计 %d 首" % total)
    db.close()


if __name__ == "__main__":
    main()
