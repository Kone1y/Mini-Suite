# -*- coding: utf-8 -*-
"""诗词导入脚本：从 jsDelivr CDN 拉 chinese-poetry (MIT) 数据入库

用法（在 server 目录下）:
    python scripts/import_poetry.py                # 默认：唐诗1000 + 宋词1000
    python scripts/import_poetry.py --tang 2000    # 唐诗 2000 首
    python scripts/import_poetry.py --song 0       # 只导唐诗
    python scripts/import_poetry.py --all          # 全量（约5.5万唐+2.1万宋词，较慢）

说明：
- raw.githubusercontent.com 在本机网络不可达（TLS 超时），故走 jsDelivr CDN
- 重复执行安全：按 (title, author, kind) 去重
- 数据源 License: MIT (https://github.com/chinese-poetry/chinese-poetry)
"""
import argparse
import json
import sys
import urllib.request
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal  # noqa: E402
from app.init_db import init_db  # noqa: E402
from app.models import Poetry  # noqa: E402

CDN = "https://cdn.jsdelivr.net/gh/chinese-poetry/chinese-poetry@master"


def fetch(path):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    url = CDN + "/" + urllib.request.quote(path)
    req = urllib.request.Request(url, headers={"User-Agent": "mini-suite"})
    with opener.open(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def file_list(dir_quote, prefix, limit):
    """列出目录里指定前缀的 json 文件名（经 GitHub API，仅 --all 时用）"""
    import urllib.request as u
    api = "https://api.github.com/repos/chinese-poetry/chinese-poetry/contents/" + dir_quote
    req = u.Request(api, headers={"User-Agent": "mini-suite"})
    opener = u.build_opener(u.ProxyHandler({}))
    with opener.open(req, timeout=60) as r:
        items = json.loads(r.read().decode())
    names = sorted(i["name"] for i in items if i["name"].startswith(prefix) and i["name"].endswith(".json"))
    return names if limit is None else names[:limit]


def import_tang(db, limit, stats):
    # poet.tang.0.json ~ poet.tang.2500.json，每个 1000 首
    per_file = 1000
    files_needed = (limit + per_file - 1) // per_file
    for fi in range(files_needed):
        data = fetch("全唐诗/poet.tang.%d.json" % fi)
        for p in data:
            title = (p.get("title") or "").strip()
            author = (p.get("author") or "佚名").strip()
            content = "\n".join(p.get("paragraphs") or [])
            if not title or not content:
                continue
            exists = db.query(Poetry).filter_by(title=title, author=author, kind="诗").first()
            if exists:
                continue
            db.add(Poetry(title=title[:128], dynasty="唐", author=author[:64], content=content, kind="诗"))
            stats["tang"] += 1
            if stats["tang"] >= limit:
                db.commit()
                return
        db.commit()
        print("  唐诗已导入文件 %d/%d，累计 %d 首" % (fi + 1, files_needed, stats["tang"]))


def import_song(db, limit, stats):
    # ci.song.0.json ~ ci.song.21000.json，每个 1000 首
    per_file = 1000
    files_needed = (limit + per_file - 1) // per_file
    for fi in range(files_needed):
        data = fetch("宋词/ci.song.%d.json" % fi)
        for p in data:
            title = (p.get("rhythmic") or "").strip()  # 词牌名作标题
            author = (p.get("author") or "佚名").strip()
            content = "\n".join(p.get("paragraphs") or [])
            if not title or not content:
                continue
            exists = db.query(Poetry).filter_by(title=title, author=author, kind="词").first()
            if exists:
                continue
            db.add(Poetry(title=title[:128], dynasty="宋", author=author[:64], content=content, kind="词"))
            stats["song"] += 1
            if stats["song"] >= limit:
                db.commit()
                return
        db.commit()
        print("  宋词已导入文件 %d/%d，累计 %d 首" % (fi + 1, files_needed, stats["song"]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tang", type=int, default=1000, help="导入唐诗数量（默认1000，0=不导）")
    ap.add_argument("--song", type=int, default=1000, help="导入宋词数量（默认1000，0=不导）")
    ap.add_argument("--all", action="store_true", help="全量导入（忽略 --tang/--song）")
    args = ap.parse_args()

    init_db()
    db = SessionLocal()
    stats = {"tang": 0, "song": 0}

    if args.all:
        print("全量导入模式：唐诗约 5.5 万 + 宋词约 2.1 万，耐心等待…")
        import_tang(db, 99999999, stats)
        import_song(db, 99999999, stats)
    else:
        if args.tang > 0:
            print("导入唐诗 %d 首…" % args.tang)
            import_tang(db, args.tang, stats)
        if args.song > 0:
            print("导入宋词 %d 首…" % args.song)
            import_song(db, args.song, stats)

    total = db.query(Poetry).count()
    print("完成：本次新增 唐 %d / 词 %d；库内总计 %d 首" % (stats["tang"], stats["song"], total))
    db.close()


if __name__ == "__main__":
    main()
