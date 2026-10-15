# 天气代理：服务端转发 OpenWeatherMap current-weather
# 为什么走后端代理而不是小程序直连：
#   1) 小程序 request 合法域名需备案/https——OWM 不在国内白名单体系内，开发者工具虽可勾选"不校验"但真机不行
#   2) API key 不应打进前端包（会被反编译提取滥用）
#   3) 服务端可做内存缓存，多用户共享同一城市的请求（OWM 免费档 60 次/分）
import time
import json
import urllib.request
import urllib.parse
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

OWM_KEY = "6c00e63be406d3b49252fabb9ef0c6ce"
OWM_BASE = "https://api.openweathermap.org/data/2.5/weather"
UPSTREAM_TIMEOUT = 12          # 秒
CACHE_TTL = 600                # 10 分钟：与前端自动刷新周期一致
_cache = {}                    # {cache_key: (ts, payload)}


@router.get("/weather")
def weather(city: str = Query(..., min_length=1, max_length=64),
            country: str = Query("", max_length=4)):
    """OWM current 天气代理。city 用英文名，country 可选 ISO 两码（提升同名城市消歧）。"""
    key = (city.strip().lower(), country.strip().upper())
    now = time.time()

    hit = _cache.get(key)
    if hit and now - hit[0] < CACHE_TTL:
        payload = dict(hit[1])
        payload["_cache"] = "hit"
        payload["_age"] = int(now - hit[0])
        return payload

    q = city.strip()
    if country.strip():
        q = f"{q},{country.strip()}"
    url = (f"{OWM_BASE}?q={urllib.parse.quote(q)}"
           f"&appid={OWM_KEY}&units=metric&lang=zh_cn")
    req = urllib.request.Request(url, headers={"User-Agent": "mini-suite/0.1"})
    try:
        with urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # 404 = OWM 不认识该城市；401 = key 失效；429 = 限流
        raise HTTPException(status_code=502, detail=f"OWM HTTP {e.code}")
    except Exception as e:
        raise HTTPException(status_code=504, detail=f"OWM 不可达: {type(e).__name__}")

    if not isinstance(data, dict) or "main" not in data or "weather" not in data:
        raise HTTPException(status_code=502, detail="OWM 返回异常")

    _cache[key] = (now, data)
    if len(_cache) > 200:      # 简单防膨胀：超过 200 键清最旧的一半
        for k in sorted(_cache, key=lambda k: _cache[k][0])[:100]:
            _cache.pop(k, None)

    out = dict(data)
    out["_cache"] = "miss"
    out["_age"] = 0
    return out
