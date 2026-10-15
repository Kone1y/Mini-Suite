# -*- coding: utf-8 -*-
"""S0 后端深度测试：正常路径 + 边界 + 异常路径 + 状态机完整性"""
import urllib.request, json, time, sys

opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
BASE = "http://127.0.0.1:8791"
PASS, FAIL = [], []

def call(path, data=None, method=None, raw_body=None):
    url = BASE + path
    m = method or ("POST" if data is not None or raw_body is not None else "GET")
    body = raw_body if raw_body is not None else (json.dumps(data).encode() if data is not None else None)
    req = urllib.request.Request(url, data=body, method=m, headers={"Content-Type": "application/json"})
    try:
        with opener.open(req, timeout=10) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}

def check(name, cond, detail=""):
    (PASS if cond else FAIL).append((name, detail))
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(detail)[:150] if detail and not cond else ""))

time.sleep(2.5)

# ===== A. 登录模块 =====
s, d = call("/api/user/login", {"openid": "test_a"})
check("A1 登录新用户", s == 200 and d.get("openid") == "test_a", (s, d))
s2, d2 = call("/api/user/login", {"openid": "test_a"})
check("A2 登录幂等(同一openid同id)", s2 == 200 and d2.get("id") == d.get("id"), (d, d2))
s, d = call("/api/user/login", {})
check("A3 登录缺openid应422", s == 422, (s, d))
s, d = call("/api/user/login", raw_body=b"not-json", method="POST")
check("A4 登录非法JSON应422", s == 422, (s, d))

# ===== B. 商品模块 =====
s, d = call("/api/goods")
check("B1 商品列表", s == 200 and d.get("total", 0) >= 2, (s, d))
gid = d["items"][0]["id"]
s, d = call("/api/goods/%d" % gid)
check("B2 商品详情", s == 200 and "price" in d, (s, d))
s, d = call("/api/goods/99999")
check("B3 不存在商品应404", s == 404, (s, d))
s, d = call("/api/goods/abc")
check("B4 非法id应422", s == 422, (s, d))
s, d = call("/api/goods?page=0&size=10")
check("B5 page=0 容错", s == 200, (s, d))
s, d = call("/api/goods?page=-1")
check("B6 page=-1 容错", s == 200, (s, d))
s, d = call("/api/categories?type=goods")
check("B7 分类列表", s == 200 and isinstance(d, list), (s, d))

# ===== C. 订单状态机（核心） =====
s, d = call("/api/goods/%d" % gid)
gprice = d["price"]  # 动态取价，不依赖种子数据
s, d = call("/api/order", {"openid": "test_a", "items": [{"goods_id": gid, "qty": 2}]})
check("C1 创建订单", s == 200 and d.get("order_no"), (s, d))
ono = d["order_no"]
check("C2 金额正确(单价*2)", d.get("total") == gprice * 2, (d.get("total"), gprice))

s, d = call("/api/order", {"openid": "no_such_user", "items": [{"goods_id": gid, "qty": 1}]})
check("C3 未登录用户下单应400", s == 400, (s, d))
s, d = call("/api/order", {"openid": "test_a", "items": []})
check("C4 空订单应400", s == 400, (s, d))
s, d = call("/api/order", {"openid": "test_a", "items": [{"goods_id": 99999, "qty": 1}]})
check("C5 不存在商品下单应400", s == 400, (s, d))
s, d = call("/api/order", {"openid": "test_a", "items": [{"goods_id": gid, "qty": -5}]})
check("C6 负数量容错(max(1,n))", s == 200 and d.get("total") == gprice, (d.get("total"), gprice))

# 支付状态机
s, d = call("/api/order/%s/pay?openid=test_a" % ono, method="POST")
check("C7 模拟支付 pending->paid", s == 200 and d.get("status") == "paid", (s, d))
s, d = call("/api/order/%s/pay?openid=test_a" % ono, method="POST")
check("C8 重复支付应400", s == 400, (s, d))
s, d = call("/api/order/NOTEXIST/pay?openid=test_a", method="POST")
check("C9 不存在订单支付应404", s == 404, (s, d))

# ===== D. 订单列表 =====
s, d = call("/api/orders?openid=test_a")
check("D1 订单列表", s == 200 and len(d.get("items", [])) >= 2, (s, d.get("total") if isinstance(d, dict) else s))
s, d = call("/api/orders?openid=ghost")
check("D2 无用户订单空列表", s == 200 and d.get("items") == [], (s, d))
s, d = call("/api/orders")
check("D3 缺openid应422", s == 422, (s, d))

# ===== E. 收藏 =====
s, d = call("/api/favorite", {"openid": "test_a", "kind": "poetry", "ref_id": "42"})
check("E1 添加收藏", s == 200 and d.get("ok"), (s, d))
s, d = call("/api/favorite", {"openid": "test_a", "kind": "poetry", "ref_id": "42"})
check("E2 重复收藏幂等", s == 200 and d.get("already") is True, (s, d))
s, d = call("/api/favorites?openid=test_a&kind=poetry")
check("E3 收藏列表", s == 200 and any(f["ref_id"] == "42" for f in d["items"]), (s, d))
s, d = call("/api/favorites?openid=test_a&kind=poetry", method="DELETE")  # 方法不对
# 正确删除：DELETE 带 query
req = urllib.request.Request(BASE + "/api/favorite?openid=test_a&kind=poetry&ref_id=42", method="DELETE")
with opener.open(req, timeout=10) as r:
    dd = json.loads(r.read().decode())
check("E4 删除收藏", dd.get("ok") is True, dd)
s, d = call("/api/favorites?openid=test_a&kind=poetry")
check("E5 删除后列表为空", all(f["ref_id"] != "42" for f in d.get("items", [])), (s, d))

# ===== F. 诗词/媒体（空库行为） =====
s, d = call("/api/poetry")
check("F1 诗词列表(种子500首)", s == 200 and d.get("total", 0) >= 500, (s, d.get("total")))
s, d = call("/api/poetry/1")
check("F2 诗词详情(种子数据)", s == 200 and d.get("content"), (s, d))
s, d = call("/api/media?type=wallpaper")
check("F3 媒体列表(种子12张)", s == 200 and len(d.get("items", [])) >= 12, (s, len(d.get("items", [])) if isinstance(d, dict) else d))
s, d = call("/api/media?type=notatype")
check("F4 非法媒体类型空列表", s == 200, (s, d))

# ===== G. 后台与安全 =====
r = opener.open(BASE + "/admin", timeout=10)
check("G1 后台页面200", r.status == 200 and "管理后台" in r.read().decode())
r = opener.open(BASE + "/docs", timeout=10)
check("G2 Swagger文档200", r.status == 200)
s, d = call("/api/orders?openid=<script>alert(1)</script>")
check("G3 XSS参数当作普通字符串(无反射错误)", s in (200,), (s,))

print("\n========== 汇总 ==========")
print("PASS: %d  FAIL: %d" % (len(PASS), len(FAIL)))
if FAIL:
    print("\n失败项:")
    for name, detail in FAIL:
        print(" -", name, "|", str(detail)[:200])
sys.exit(1 if FAIL else 0)
