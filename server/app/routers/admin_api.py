from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import os
import re
import uuid

from ..database import get_db
from ..models import Category, Goods, Order, Media, Poetry

router = APIRouter(prefix="/admin/api")

STATIC_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_UPLOAD = 5 * 1024 * 1024  # 5MB


# ---------- 商品 ----------

class GoodsIn(BaseModel):
    name: str
    category_id: Optional[int] = None
    price: float = 0.0
    stock: int = 999
    images: str = ""
    detail: str = ""


@router.post("/goods")
def create_goods(g: GoodsIn, db: Session = Depends(get_db)):
    if not g.name.strip():
        raise HTTPException(400, "名称不能为空")
    goods = Goods(name=g.name.strip(), category_id=g.category_id, price=round(g.price, 2),
                  stock=g.stock, images=g.images, detail=g.detail)
    db.add(goods)
    db.commit()
    return {"id": goods.id}


@router.put("/goods/{goods_id}")
def update_goods(goods_id: int, g: GoodsIn, db: Session = Depends(get_db)):
    goods = db.query(Goods).get(goods_id)
    if not goods:
        raise HTTPException(404, "商品不存在")
    goods.name = g.name.strip()
    goods.category_id = g.category_id
    goods.price = round(g.price, 2)
    goods.stock = g.stock
    goods.images = g.images
    goods.detail = g.detail
    db.commit()
    return {"ok": True}


@router.delete("/goods/{goods_id}")
def delete_goods(goods_id: int, db: Session = Depends(get_db)):
    goods = db.query(Goods).get(goods_id)
    if not goods:
        raise HTTPException(404, "商品不存在")
    db.delete(goods)
    db.commit()
    return {"ok": True}


@router.post("/goods/{goods_id}/toggle")
def toggle_goods(goods_id: int, db: Session = Depends(get_db)):
    goods = db.query(Goods).get(goods_id)
    if not goods:
        raise HTTPException(404, "商品不存在")
    goods.on_sale = not goods.on_sale
    db.commit()
    return {"on_sale": goods.on_sale}


# ---------- 分类 ----------

class CategoryIn(BaseModel):
    name: str
    type: str = "goods"
    sort: int = 0


@router.post("/category")
def create_category(c: CategoryIn, db: Session = Depends(get_db)):
    if c.type not in ("goods", "wallpaper", "emoji"):
        raise HTTPException(400, "type 必须是 goods/wallpaper/emoji")
    cat = Category(name=c.name.strip(), type=c.type, sort=c.sort)
    db.add(cat)
    db.commit()
    return {"id": cat.id}


@router.delete("/category/{cid}")
def delete_category(cid: int, db: Session = Depends(get_db)):
    in_use = db.query(Goods).filter(Goods.category_id == cid).count()
    if in_use:
        raise HTTPException(400, "分类下还有 %d 个商品" % in_use)
    db.query(Category).filter(Category.id == cid).delete()
    db.commit()
    return {"ok": True}


# ---------- 订单流转 ----------

ORDER_FLOW = {"pending": ["paid", "closed"], "paid": ["shipped", "closed"],
              "shipped": ["done"], "done": [], "closed": []}


@router.post("/order/{order_no}/status")
def advance_order(order_no: str, to: str = Form(...), db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.order_no == order_no).first()
    if not order:
        raise HTTPException(404, "订单不存在")
    if to not in ORDER_FLOW.get(order.status, []):
        raise HTTPException(400, "状态 %s 不能流转到 %s（允许：%s）" % (order.status, to, ORDER_FLOW[order.status]))
    order.status = to
    order.updated_at = datetime.utcnow()
    db.commit()
    return {"order_no": order_no, "status": to}


@router.delete("/order/{order_no}")
def delete_order(order_no: str, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.order_no == order_no).first()
    if not order:
        raise HTTPException(404, "订单不存在")
    from ..models import OrderItem
    db.query(OrderItem).filter(OrderItem.order_id == order.id).delete()
    db.delete(order)
    db.commit()
    return {"ok": True}


# ---------- 上传与媒体 ----------

@router.post("/upload/{media_type}")
async def upload(media_type: str, file: UploadFile = File(...), title: str = Form(""), db: Session = Depends(get_db)):
    if media_type not in ("wallpaper", "emoji", "goods"):
        raise HTTPException(400, "media_type 必须是 wallpaper/emoji/goods")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, "只支持 %s" % ", ".join(sorted(ALLOWED_EXT)))
    content = await file.read()
    if len(content) > MAX_UPLOAD:
        raise HTTPException(400, "文件超过 5MB 上限")

    subdir = {"wallpaper": "wallpapers", "emoji": "emoji", "goods": "goods"}[media_type]
    name = uuid.uuid4().hex[:12] + ext
    dest_dir = os.path.join(STATIC_ROOT, subdir)
    os.makedirs(dest_dir, exist_ok=True)
    with open(os.path.join(dest_dir, name), "wb") as f:
        f.write(content)

    path = "/static/%s/%s" % (subdir, name)
    if media_type in ("wallpaper", "emoji"):
        db.add(Media(type=media_type, path=path, title=title or (file.filename or name)))
        db.commit()
    return {"path": path}


@router.get("/media")
def list_media(type: str, db: Session = Depends(get_db)):
    items = db.query(Media).filter(Media.type == type).order_by(Media.id.desc()).all()
    return [{"id": m.id, "path": m.path, "title": m.title} for m in items]


@router.delete("/media/{mid}")
def delete_media(mid: int, db: Session = Depends(get_db)):
    m = db.query(Media).get(mid)
    if not m:
        raise HTTPException(404, "媒体不存在")
    # 删文件（安全拼接：只删 static 子目录下文件）
    rel = m.path.replace("/static/", "").replace("/", os.sep)
    full = os.path.join(STATIC_ROOT, rel)
    if os.path.isfile(full) and re.match(r"^(wallpapers|emoji|goods)[\\\/][\w\-]+\.\w+$", rel):
        try:
            os.remove(full)
        except OSError:
            pass
    db.delete(m)
    db.commit()
    return {"ok": True}


# ---------- 诗词统计 ----------

@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    return {
        "goods": db.query(Goods).count(),
        "orders": db.query(Order).count(),
        "poetry": db.query(Poetry).count(),
        "poetry_tang": db.query(Poetry).filter(Poetry.kind == "诗").count(),
        "poetry_song": db.query(Poetry).filter(Poetry.kind == "词").count(),
    }
