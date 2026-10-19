# -*- coding: utf-8 -*-
"""诗词导入脚本：从 jsDelivr CDN 拉 chinese-poetry (MIT) 数据入库

用法（在 server 目录下，用带依赖的 python，如 Anaconda）:
    python scripts/import_poetry.py                # 默认：唐诗1000 + 宋词1000
    python scripts/import_poetry.py --tang 2000    # 唐诗 2000 首
    python scripts/import_poetry.py --song 0       # 只导唐诗
    python scripts/import_poetry.py --all          # 全量（约5.5万唐+2.1万宋词，较慢）

说明：
- raw.githubusercontent.com 在本机网络不可达（TLS 超时），故走 jsDelivr CDN
- 文件名为 offset 命名：poet.tang.0/1000/2000...json（每个 1000 首），
  404 = 数据集已到末尾；不是 0,1,2 顺序序号！
- 分片缓存于 scripts/_cache/tang_{offset}.json、song_{offset}.json，
  命中缓存不联网；联网成功回写缓存 → 重跑即断点续传
- 重复执行安全：按 (title, author, kind, content) 去重（导入时统一繁转简后比对）；
  同词牌同作者的不同首词（如苏轼多首《浣溪沙》）内容不同，均会保留
- 运行前自动备份 DB 到 mini_suite.db.bak_poetry_<时间戳>（--no-backup 跳过）
- 数据源 License: MIT (https://github.com/chinese-poetry/chinese-poetry)
"""
import argparse
import json
import sys
import os
import time
import sqlite3
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, DB_PATH  # noqa: E402
from app.init_db import init_db  # noqa: E402
from app.models import Poetry  # noqa: E402

try:
    from zhconv import convert as zh_convert
except ImportError:  # 兜底：无 zhconv 则不转（不推荐）
    def zh_convert(s, _loc):
        return s

CDN = "https://cdn.jsdelivr.net/gh/chinese-poetry/chinese-poetry@master"
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache")
STEP = 1000          # 每个文件 1000 首（offset 步长）
TIMEOUT = 90         # 单请求超时（jsDelivr 大文件偶尔慢）
RETRIES = 3          # 网络错误重试次数
BATCH = 2000         # 每 N 条 commit 一次
MAX_404 = 2          # 连续 404 达到该数即认为数据集结束（防偶发误判）


def log(msg):
    print(msg, flush=True)


def fetch_url(url, timeout=TIMEOUT):
    """带重试的 GET（返回 bytes）；404 不重试直接抛，由调用方判定数据集结束"""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    last = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "mini-suite"})
            with opener.open(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise  # 404 不重试：交由调用方判定结束
            last = e
        except Exception as e:  # 超时/连接错误
            last = e
        if attempt < RETRIES - 1:
            time.sleep(2 * (attempt + 1))  # 2s/4s/6s 退避
    raise last


def load_slice(kind, offset):
    """取一个分片：缓存优先，网络回写缓存。
    返回 list；数据集结束（404）返回 None；网络彻底失败抛异常。"""
    cache = os.path.join(CACHE_DIR, "%s_%d.json" % (kind, offset))
    if os.path.exists(cache):
        try:
            with open(cache, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list) and data:
                return data
        except Exception:
            pass  # 缓存损坏则重新下载
    path = ("全唐诗/poet.tang.%d.json" if kind == "tang" else "宋词/ci.song.%d.json") % offset
    url = CDN + "/" + urllib.request.quote(path)
    raw = fetch_url(url)
    data = json.loads(raw.decode("utf-8"))
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return data


def norm(p, kind):
    """源记录 → (title, dynasty, author, content)；统一转简体"""
    if kind == "tang":
        title = (p.get("title") or "").strip()
        author = (p.get("author") or "佚名").strip()
    else:
        title = (p.get("rhythmic") or "").strip()  # 词牌名作标题
        author = (p.get("author") or "佚名").strip()
    content = "\n".join(p.get("paragraphs") or [])
    if not title or not content:
        return None
    return (
        zh_convert(title, "zh-hans")[:128],
        "唐" if kind == "tang" else "宋",
        zh_convert(author, "zh-hans")[:64],
        zh_convert(content, "zh-hans"),
        "诗" if kind == "tang" else "词",
    )


def dedup_key(title, author, kind, content):
    """去重键：含正文。同词牌同作者但内容不同的词不会误杀；跨卷完全重复的诗仍会去重"""
    return (title, author, kind, content[:64])


def import_kind(db, kind, limit, seen):
    """导入一类（tang/song）。limit=None 表示全量。
    seen: set of (title,author,kind)，库内已有 + 本次已加"""
    label = "唐诗" if kind == "tang" else "宋词"
    added = skipped = invalid = 0
    pending = []
    consecutive_404 = 0
    failed_offsets = []
    offset = 0
    fi = 0
    while limit is None or added < limit:
        try:
            data = load_slice(kind, offset)
            consecutive_404 = 0
        except urllib.error.HTTPError as e:
            if e.code == 404:
                consecutive_404 += 1
                if consecutive_404 >= MAX_404 or limit is None:
                    log("  %s offset=%d 起 404 ×%d，数据集到头" % (label, offset, consecutive_404))
                    break
                offset += STEP  # 限量模式下偶发缺号，跳过继续
                continue
            # 5xx / 网络故障：记录缺口，跳过继续（重跑可补）
            log("  %s offset=%d 网络失败(%s)，跳过待补" % (label, offset, str(e)[:60]))
            failed_offsets.append(offset)
            consecutive_404 += 1
            if consecutive_404 >= MAX_404:
                log("  %s 连续 %d 次失败，提前结束本批" % (label, MAX_404))
                break
            offset += STEP
            continue
        except Exception as e:
            log("  %s offset=%d 异常(%s)，跳过待补" % (label, offset, str(e)[:60]))
            failed_offsets.append(offset)
            consecutive_404 += 1
            if consecutive_404 >= MAX_404:
                break
            offset += STEP
            continue
        fi += 1
        for p in data:
            row = norm(p, kind)
            if not row:
                invalid += 1
                continue
            title, dynasty, author, content, k = row
            key = dedup_key(title, author, k, content)
            if key in seen:
                skipped += 1
                continue
            pending.append(Poetry(title=title, dynasty=dynasty, author=author, content=content, kind=k))
            seen.add(key)
            added += 1
            if limit is not None and added >= limit:
                break
        if pending:
            db.add_all(pending)
            db.commit()
            pending = []
        log("  %s 分片 %d（offset=%d，%d 条源数据）→ 累计新增 %d / 跳过 %d"
            % (label, fi, offset, len(data), added, skipped))
        if limit is not None and added >= limit:
            break
        offset += STEP
    if pending:  # 限量模式 break 时可能残留
        db.add_all(pending)
        db.commit()
    if failed_offsets:
        log("  ⚠ %s 有 %d 个缺口 offset 待补：%s（重跑 --all 即可补齐）"
            % (label, len(failed_offsets), failed_offsets[:10]))
    log("  %s 完成：新增 %d，跳过(已存在) %d，无效 %d" % (label, added, skipped, invalid))
    return added


def backup_db():
    ts = time.strftime("%Y%m%d_%H%M%S")
    bak = DB_PATH + ".bak_poetry_" + ts
    src = sqlite3.connect(DB_PATH)
    dst = sqlite3.connect(bak)
    with dst:
        src.backup(dst)
    dst.close()
    src.close()
    log("已备份数据库 → %s (%.1f MB)" % (os.path.basename(bak), os.path.getsize(bak) / 1e6))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tang", type=int, default=1000, help="导入唐诗数量（默认1000，0=不导）")
    ap.add_argument("--song", type=int, default=1000, help="导入宋词数量（默认1000，0=不导）")
    ap.add_argument("--all", action="store_true", help="全量导入（忽略 --tang/--song）")
    ap.add_argument("--no-backup", action="store_true", help="跳过运行前 DB 备份")
    args = ap.parse_args()

    init_db()
    if not args.no_backup:
        backup_db()
    db = SessionLocal()

    # 一次性载入去重键（比逐条 SELECT 快百倍）
    seen = set((t, a, k, (c or "")[:64])
               for (t, a, k, c) in db.query(Poetry.title, Poetry.author, Poetry.kind, Poetry.content).all())
    log("库内现有 %d 首（去重键 %d 个）" % (db.query(Poetry).count(), len(seen)))

    t0 = time.time()
    if args.all:
        log("全量导入模式：唐诗约 5.5 万 + 宋词约 2.1 万，耐心等待…")
        n1 = import_kind(db, "tang", None, seen)
        n2 = import_kind(db, "song", None, seen)
    else:
        n1 = import_kind(db, "tang", args.tang, seen) if args.tang > 0 else 0
        n2 = import_kind(db, "song", args.song, seen) if args.song > 0 else 0

    total = db.query(Poetry).count()
    log("完成：本次新增 唐 %d / 词 %d；库内总计 %d 首；耗时 %.1f 分钟"
        % (n1, n2, total, (time.time() - t0) / 60))
    db.close()


if __name__ == "__main__":
    main()
