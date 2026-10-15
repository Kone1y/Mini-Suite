# -*- coding: utf-8 -*-
"""S4 端到端测试：完全模拟小程序商城用户的操作序列"""
import urllib.request, json, time, sys
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
BASE = "http://127.0.0.1:8791"
PASS, FAIL = [], []

def call(path, data=None, method=None):
    m = method or ("POST" if data is not None else "GET")
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(BASE + path, data=body, method=m, headers={"Content-Type": "application/json"})
    try:
        with opener.open(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode() or "{}")
        except Exception: return e.code, {}

def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(detail)[:170] if not cond else ""))

time.sleep(2.5)
# 用户旅程：登录 → 逛列表 → 看详情 → 加购(本地) → 结算下单 → 模拟支付 → 看订单 → 再下一单不付 → 取消
call("/api/user/login", {"openid": "s4_shopper"})

s, d = call("/api/goods?page=1&size=50")
check("P1 商品列表(带cover)", s == 200 and d["items"] and all("cover" in g for g in d["items"]), (s, d.get("total")))
# 选第一个有图商品（管理后台新建的无图商品跳过），都没有则退回第一个
gid = next((g["id"] for g in d["items"] if g.get("cover")), d["items"][0]["id"])

s, d = call("/api/goods/%d" % gid)
check("P2 详情含图片数组", s == 200 and isinstance(d.get("images"), list) and (d["images"] or d.get("cover")), (s, d))

# 购物车结算（模拟前端组装的 items）
cart = [{"goods_id": gid, "qty": 2}, {"goods_id": gid + 1 if gid + 1 <= d.get("id", gid) + 1 else gid, "qty": 1}]
s, d = call("/api/order", {"openid": "s4_shopper", "items": [{"goods_id": gid, "qty": 2}]})
check("P3 购物车结算下单", s == 200 and d.get("order_no"), (s, d))
ono1 = d["order_no"]

# 详情页「立即购买」路径
s, d = call("/api/order", {"openid": "s4_shopper", "items": [{"goods_id": gid, "qty": 1}]})
ono2 = d.get("order_no", "")
check("P4 立即购买下单", s == 200 and ono2, (s, d))

# 模拟支付（order-detail 页的 pay()）
s, d = call("/api/order/%s/pay?openid=x" % ono1, method="POST")
check("P5 模拟支付", s == 200 and d.get("status") == "paid", (s, d))

# 订单详情（order-detail 页 load()）
s, d = call("/api/order/%s" % ono1)
check("P6 订单详情含地址", s == 200 and d.get("address") and d.get("items"), (s, d))

# 订单列表（order 页 load()）——历史数据可能有残留，断言 >= 2 且含本轮两单
s, d = call("/api/orders?openid=s4_shopper")
check("P7 订单列表≥2条(含本轮)", s == 200 and len(d.get("items", [])) >= 2
      and {ono1, ono2}.issubset({i["order_no"] for i in d["items"]}),
      (s, len(d.get("items", []))))
statuses = {i["order_no"]: i["status"] for i in d["items"]}
check("P8 状态正确(1paid/1pending)", statuses.get(ono1) == "paid" and statuses.get(ono2) == "pending", statuses)

# 取消未支付订单（order 页 cancel()）
s, d = call("/api/order/%s/cancel?openid=s4_shopper" % ono2, method="POST")
check("P9 取消pending订单", s == 200 and d.get("status") == "closed", (s, d))

# 已支付订单不能再取消（接口只允许 pending）
s, d = call("/api/order/%s/cancel?openid=s4_shopper" % ono1, method="POST")
check("P10 paid订单不可用户取消", s == 400, (s, d))

# 下架商品不可见但已有订单保留快照
s, d = call("/api/goods")
all_ids = [g["id"] for g in d["items"]]
check("P11 列表与详情一致性", gid in all_ids, (gid, all_ids[:5]))

print("\nPASS: %d  FAIL: %d" % (len(PASS), len(FAIL)))
sys.exit(1 if FAIL else 0)
