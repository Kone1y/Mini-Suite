# -*- coding: utf-8 -*-
"""S6 新功能接口测试：speedtest + poetry keyword 搜索
用法: cd server && python tests/test_s6_new.py   (需 8791 测试端后端已启动)
"""
import sys, json, time
import urllib.request, urllib.error

BASE = "http://127.0.0.1:8791"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(detail) if not cond and detail else ""))


def get(path, timeout=20):
    t0 = time.time()
    r = opener.open(BASE + path, timeout=timeout)
    body = r.read()
    return r, body, time.time() - t0


# ===== A. speedtest =====
try:
    r, body, ms = get("/api/speedtest?size=1")
    check("A1 1KB精确", len(body) == 1024, len(body))
    check("A2 octet-stream", r.headers.get("Content-Type") == "application/octet-stream")
except Exception as e:
    check("A组 speedtest 不可达", False, e)

try:
    r, body, ms = get("/api/speedtest?size=512")
    check("A3 512KB精确", len(body) == 512 * 1024, len(body))
    check("A4 512KB生成<2s", ms < 2.0, round(ms, 2))
except Exception as e:
    check("A3/A4", False, e)

try:
    r, body, _ = get("/api/speedtest?size=99999")
    check("A5 上限钳制4096KB", len(body) == 4096 * 1024, len(body))
    r, body, _ = get("/api/speedtest?size=0")
    check("A6 下限钳制1KB", len(body) == 1024, len(body))
except Exception as e:
    check("A5/A6", False, e)

try:
    r, _, _ = get("/api/speedtest?size=1")
    check("A7 no-store", r.headers.get("Cache-Control") == "no-store")
    _, b1, _ = get("/api/speedtest?size=64")
    _, b2, _ = get("/api/speedtest?size=64")
    check("A8 随机性(两次不同)", b1 != b2)
except Exception as e:
    check("A7/A8", False, e)

# ===== B. poetry keyword =====
try:
    r, body, _ = get("/api/poetry?page=1&size=3")
    d = json.loads(body.decode("utf-8"))
    author = d["items"][0]["author"]
    pid = d["items"][0]["id"]
    check("B1 基线列表", d["total"] >= 2300, d["total"])
except Exception as e:
    check("B组 poetry 不可达", False, e)
    author, pid = None, None

if author:
    r, body, _ = get("/api/poetry?keyword=" + urllib.request.quote(author) + "&page=1&size=5")
    d = json.loads(body.decode("utf-8"))
    check("B2 作者搜索>0", d["total"] > 0, d["total"])
    check("B3 结果全含关键词", all(author in i["author"] for i in d["items"]))

    r, body, _ = get("/api/poetry?keyword=" + urllib.request.quote("zzz不存在的词xyz"))
    d = json.loads(body.decode("utf-8"))
    check("B4 空结果", d["total"] == 0 and d["items"] == [])

    r, body, _ = get("/api/poetry?keyword=%20%20")
    d = json.loads(body.decode("utf-8"))
    check("B5 纯空白不过滤", d["total"] >= 2300, d["total"])

    # 内容搜索：取详情内容片段
    r, body, _ = get("/api/poetry/%d" % pid)
    det = json.loads(body.decode("utf-8"))
    frag = det["content"].replace("\n", "").strip()[2:4]
    r, body, _ = get("/api/poetry?keyword=" + urllib.request.quote(frag) + "&page=1&size=100")
    d = json.loads(body.decode("utf-8"))
    check("B6 诗句搜索命中原诗", det["title"] in [i["title"] for i in d["items"]], frag)

    # 组合筛选 + 分页
    r, body, _ = get("/api/poetry?keyword=" + urllib.request.quote(author) + "&page=1&size=2")
    p1 = json.loads(body.decode("utf-8"))
    r, body, _ = get("/api/poetry?keyword=" + urllib.request.quote(author) + "&page=2&size=2")
    p2 = json.loads(body.decode("utf-8"))
    same = p1["items"][0]["id"] == (p2["items"][0]["id"] if p2["items"] else -1)
    check("B7 搜索分页不重叠", not same)

    r, body, _ = get("/api/poetry?keyword=" + urllib.request.quote(author) + "&kind=" + urllib.request.quote("诗") + "&page=1&size=5")
    d = json.loads(body.decode("utf-8"))
    check("B8 keyword+kind组合", d["total"] <= 500 and d["total"] >= 0, d["total"])

print("\nS6 PASS: %d  FAIL: %d" % (len(PASS), len(FAIL)))
sys.exit(1 if FAIL else 0)
