# -*- coding: utf-8 -*-
"""S2 深度测试：后台 CRUD/订单流转/上传/媒体/诗词接口"""
import urllib.request, json, time, io, sys

opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
BASE = "http://127.0.0.1:8791"
PASS, FAIL = [], []

def call(path, data=None, method=None, form=None):
    url = BASE + path
    headers = {}
    body = None
    if form is not None:
        boundary = "----mini suite test"
        parts = []
        for k, v in form.items():
            parts.append(("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n" % (boundary, k, v)).encode())
        body = b"".join(parts) + ("--%s--\r\n" % boundary).encode()
        headers["Content-Type"] = "multipart/form-data; boundary=" + boundary
        m = method or "POST"
    else:
        m = method or ("POST" if data is not None else "GET")
        if data is not None:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, method=m, headers=headers)
    try:
        with opener.open(req, timeout=15) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip().startswith(("{", "[")) else raw)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}

def check(name, cond, detail=""):
    (PASS if cond else FAIL).append((name, detail))
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(detail)[:160] if not cond else ""))

time.sleep(2.5)

# ===== 商品 CRUD =====
s, d = call("/admin/api/goods", {"name": "测试商品", "price": 1.23, "stock": 5, "detail": "t"})
check("H1 新增商品", s == 200 and d.get("id"), (s, d))
gid = d["id"]
s, d = call("/admin/api/goods/%d" % gid, {"name": "测试商品改", "price": 2.34, "stock": 6, "detail": "t2"}, method="PUT")
check("H2 改商品", s == 200, (s, d))
s, d = call("/api/goods/%d" % gid)
check("H3 改后生效", s == 200 and d.get("price") == 2.34 and d.get("name") == "测试商品改", (s, d))
s, d = call("/admin/api/goods/%d/toggle" % gid, method="POST")
check("H4 下架", s == 200 and d.get("on_sale") is False, (s, d))
s, d = call("/api/goods")
check("H5 下架不在列表", all(g["id"] != gid for g in d.get("items", [])), (s, d))
s, d = call("/admin/api/goods/%d/toggle" % gid, method="POST")
check("H6 重新上架", s == 200 and d.get("on_sale") is True, (s, d))
s, d = call("/admin/api/goods/%d" % gid, method="DELETE")
check("H7 删除商品", s == 200, (s, d))
s, d = call("/api/goods/%d" % gid)
check("H8 删后404", s == 404, (s, d))
s, d = call("/admin/api/goods", {"name": "  ", "price": 0})
check("H9 空名商品400", s == 400, (s, d))

# ===== 订单流转（完整状态机） =====
call("/api/user/login", {"openid": "s2_test"})
s, d = call("/api/order", {"openid": "s2_test", "items": [{"goods_id": 1, "qty": 1}]})
ono = d["order_no"]
check("I1 建单", s == 200 and ono, (s, d))
s, d = call("/admin/api/order/%s/status" % ono, form={"to": "done"})
check("I2 pending->done 非法跳转400", s == 400, (s, d))
s, d = call("/admin/api/order/%s/status" % ono, form={"to": "paid"})
check("I3 pending->paid", s == 200, (s, d))
s, d = call("/admin/api/order/%s/status" % ono, form={"to": "shipped"})
check("I4 paid->shipped", s == 200, (s, d))
s, d = call("/admin/api/order/%s/status" % ono, form={"to": "done"})
check("I5 shipped->done", s == 200, (s, d))
s, d = call("/admin/api/order/%s/status" % ono, form={"to": "closed"})
check("I6 done->closed 非法400", s == 400, (s, d))
s, d = call("/api/order/%s" % ono)
check("I7 订单详情接口", s == 200 and d.get("status") == "done" and d.get("items"), (s, d))

# 用户取消流
s, d = call("/api/order", {"openid": "s2_test", "items": [{"goods_id": 1, "qty": 1}]})
ono2 = d["order_no"]
s, d = call("/api/order/%s/cancel?openid=s2_test" % ono2, method="POST")
check("I8 用户取消 pending->closed", s == 200 and d.get("status") == "closed", (s, d))
s, d = call("/api/order/%s/cancel?openid=s2_test" % ono2, method="POST")
check("I9 已关闭再取消400", s == 400, (s, d))
s, d = call("/admin/api/order/%s" % ono2, method="DELETE")
check("I10 后台删单", s == 200, (s, d))

# ===== 媒体与上传 =====
s, d = call("/admin/api/media?type=wallpaper")
check("J1 壁纸列表12", s == 200 and len(d) == 12, (s, len(d) if isinstance(d, list) else d))
s, d = call("/admin/api/media?type=emoji")
check("J2 表情列表12", s == 200 and len(d) == 12, (s, d))
s, d = call("/api/media?type=wallpaper")
check("J3 小程序侧媒体接口", s == 200 and len(d.get("items", [])) == 12, (s, d))

# 上传一张真 PNG（1x1 像素）
png_hex = ("89504e470d0a1a0a0000000d49484452000000010000000108060000"
           "001f15c4890000000d4944415478da63fcffff3f030005fe02fea72d4b84"
           "0000000049454e44ae426082")
png = bytes.fromhex(png_hex)
boundary = "----mini suite upload"
body = (("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"t.png\"\r\nContent-Type: image/png\r\n\r\n" % boundary).encode()
        + png + ("\r\n--%s\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\n测试上传\r\n--%s--\r\n" % (boundary, boundary)).encode())
req = urllib.request.Request(BASE + "/admin/api/upload/emoji", data=body, method="POST",
                             headers={"Content-Type": "multipart/form-data; boundary=" + boundary})
with opener.open(req, timeout=15) as r:
    up = json.loads(r.read().decode())
check("J4 上传图片", up.get("path", "").startswith("/static/emoji/"), up)
# 文件真实存在
import os
fpath = r"D:\AppCode\langchain\mini-suite\server\app" + up["path"].replace("/", os.sep)
check("J5 上传文件落盘", os.path.isfile(fpath), fpath)
# 找到它的 id 删除
s, d = call("/admin/api/media?type=emoji")
tid = next((m["id"] for m in d if m["path"] == up["path"]), None)
s, d = call("/admin/api/media/%d" % tid, method="DELETE")
check("J6 删媒体+文件", s == 200 and not os.path.isfile(fpath), (s, d))
# 上传非法扩展
body_txt = (("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"evil.exe\"\r\n\r\nMZ" % boundary).encode()
            + ("\r\n--%s--\r\n" % boundary).encode())
req = urllib.request.Request(BASE + "/admin/api/upload/emoji", data=body_txt, method="POST",
                             headers={"Content-Type": "multipart/form-data; boundary=" + boundary})
try:
    with opener.open(req, timeout=15) as r:
        check("J7 非法扩展被拒", False, "上传成功了吗？！")
except urllib.error.HTTPError as e:
    check("J7 非法扩展被拒", e.code == 400, e.code)

# ===== 诗词接口（有数据后） =====
s, d = call("/api/poetry")
check("K1 诗词总数>=500", s == 200 and d.get("total") >= 500, (s, d.get("total")))
TOTAL = d.get("total", 0)
s, d = call("/api/poetry?kind=" + urllib.request.quote("词"))
check("K2 按kind过滤", s == 200 and 0 < d.get("total", 0) < TOTAL, (s, d.get("total")))
s, d = call("/api/poetry?dynasty=" + urllib.request.quote("唐"))
check("K3 按朝代过滤", s == 200 and 0 < d.get("total", 0) < TOTAL, (s, d.get("total")))
s, d = call("/api/poetry/1")
check("K4 诗词详情", s == 200 and d.get("content"), (s, d))
s, d = call("/admin/api/stats")
check("K5 统计接口", s == 200 and d.get("poetry", 0) >= 500, (s, d))

# 静态文件
req = urllib.request.Request(BASE + "/static/wallpapers/wp_00.jpg")
with opener.open(req, timeout=15) as r:
    check("L1 静态壁纸可访问", r.status == 200 and len(r.read()) > 10000)

print("\n========== 汇总 ==========")
print("PASS: %d  FAIL: %d" % (len(PASS), len(FAIL)))
if FAIL:
    for name, detail in FAIL:
        print(" -", name, "|", str(detail)[:200])
sys.exit(1 if FAIL else 0)
