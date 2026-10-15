from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import uvicorn

from app.routers import api, admin, admin_api
from app.routers import weather
from app.routers import idiom
from app.routers import sqlsandbox
from app.init_db import init_db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

init_db()

app = FastAPI(title="mini-suite", version="0.1.0")

# 开发期跨域：小程序开发者工具不校验域名，这里放开方便调试
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api.router, prefix="/api")
app.include_router(weather.router, prefix="/api")
app.include_router(idiom.router, prefix="/api")
app.include_router(sqlsandbox.router, prefix="/api")
app.include_router(admin.router)
app.include_router(admin_api.router)


@app.get("/")
def root():
    return {"name": "mini-suite api", "docs": "/docs", "admin": "/admin"}


# 静态资源：壁纸 / 表情包 / 商品图（后续步骤填充素材）
static_dir = os.path.join(BASE_DIR, "app", "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8790, reload=False)
