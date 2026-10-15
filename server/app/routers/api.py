from fastapi import APIRouter, Depends, HTTPException
from fastapi import Request as _Req  # noqa 备用
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import text as _sql_text
from sqlalchemy import or_
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import os
import random

from ..database import get_db
from ..models import User, Category, Goods, Order, OrderItem, Poetry, Favorite, Media

router = APIRouter()


@router.get("/health")
def health(db: Session = Depends(get_db)):
    """健康检查：小程序首页探测后端可达性"""
    try:
        db.execute(_sql_text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {"ok": db_ok, "service": "mini-suite", "time": datetime.utcnow().isoformat()}


@router.get("/speedtest")
def speedtest(size: int = 512):
    """网络测速：下发随机字节流。size 单位 KB，1~4096 钳制，防滥用"""
    size = max(1, min(4096, int(size)))
    body = os.urandom(size * 1024)
    return Response(content=body, media_type="application/octet-stream",
                    headers={"Cache-Control": "no-store", "Content-Length": str(len(body))})


class LoginIn(BaseModel):
    openid: str


@router.post("/user/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.openid == data.openid).first()
    if not user:
        user = User(openid=data.openid)
        db.add(user)
        db.commit()
        db.refresh(user)
    return {"id": user.id, "openid": user.openid, "nickname": user.nickname}


# ---------- 商城 ----------

@router.get("/goods")
def list_goods(category_id: Optional[int] = None, page: int = 1, size: int = 20, db: Session = Depends(get_db)):
    q = db.query(Goods).filter(Goods.on_sale == True)  # noqa
    if category_id:
        q = q.filter(Goods.category_id == category_id)
    total = q.count()
    items = q.order_by(Goods.id.desc()).offset((page - 1) * size).limit(size).all()
    # 真实销量：按已支付订单统计（paid/shipped/done 计入，pending/closed 不计）
    paid_status = ("paid", "shipped", "done")
    sold_map = dict(
        db.query(OrderItem.goods_id, func.sum(OrderItem.qty))
        .join(Order, OrderItem.order_id == Order.id)
        .filter(Order.status.in_(paid_status))
        .group_by(OrderItem.goods_id)
        .all()
    )
    return {
        "total": total,
        "items": [
            {
                "id": g.id, "name": g.name, "price": g.price,
                "cover": (g.images.split(",")[0] if g.images else ""),
                "sold": int(sold_map.get(g.id, 0) or 0),
            }
            for g in items
        ],
    }


@router.get("/goods/{goods_id}")
def goods_detail(goods_id: int, db: Session = Depends(get_db)):
    g = db.query(Goods).get(goods_id)
    if not g:
        raise HTTPException(404, "商品不存在")
    paid_status = ("paid", "shipped", "done")
    sold = db.query(func.sum(OrderItem.qty)).join(
        Order, OrderItem.order_id == Order.id
    ).filter(Order.status.in_(paid_status), OrderItem.goods_id == goods_id).scalar()
    return {
        "id": g.id, "name": g.name, "price": g.price, "stock": g.stock,
        "images": [i for i in g.images.split(",") if i],
        "detail": g.detail,
        "sold": int(sold or 0),
    }


@router.get("/categories")
def list_categories(type: str = "goods", db: Session = Depends(get_db)):
    items = db.query(Category).filter(Category.type == type).order_by(Category.sort).all()
    return [{"id": c.id, "name": c.name} for c in items]


class CreateOrderIn(BaseModel):
    openid: str
    items: list  # [{goods_id, qty}]


@router.post("/order")
def create_order(data: CreateOrderIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.openid == data.openid).first()
    if not user:
        raise HTTPException(400, "用户未登录")
    if not data.items:
        raise HTTPException(400, "订单不能为空")

    total = 0.0
    lines = []
    for it in data.items:
        g = db.query(Goods).get(it.get("goods_id"))
        if not g:
            raise HTTPException(400, "商品不存在: %s" % it.get("goods_id"))
        qty = max(1, int(it.get("qty", 1)))
        total += g.price * qty
        lines.append((g, qty))

    order_no = datetime.now().strftime("%Y%m%d%H%M%S") + "".join(random.choices("0123456789", k=4))
    order = Order(order_no=order_no, user_id=user.id, total=round(total, 2))
    db.add(order)
    db.flush()
    for g, qty in lines:
        db.add(OrderItem(order_id=order.id, goods_id=g.id, name=g.name, price=g.price, qty=qty))
    db.commit()
    return {"order_no": order_no, "total": order.total}


@router.post("/order/{order_no}/pay")
def mock_pay(order_no: str, openid: str = "", db: Session = Depends(get_db)):
    """模拟支付：pending -> paid（演示态，不接真实微信支付）"""
    order = db.query(Order).filter(Order.order_no == order_no).first()
    if not order:
        raise HTTPException(404, "订单不存在")
    if order.status != "pending":
        raise HTTPException(400, "当前状态不能支付: %s" % order.status)
    order.status = "paid"
    order.updated_at = datetime.utcnow()
    db.commit()
    return {"order_no": order_no, "status": "paid"}


@router.get("/orders")
def list_orders(openid: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.openid == openid).first()
    if not user:
        return {"items": []}
    orders = db.query(Order).filter(Order.user_id == user.id).order_by(Order.id.desc()).all()
    result = []
    for o in orders:
        items = db.query(OrderItem).filter(OrderItem.order_id == o.id).all()
        result.append({
            "order_no": o.order_no, "total": o.total, "status": o.status,
            "created_at": o.created_at.strftime("%Y-%m-%d %H:%M") if o.created_at else "",
            "items": [{"name": i.name, "qty": i.qty, "price": i.price} for i in items],
        })
    return {"items": result}


@router.post("/order/{order_no}/cancel")
def cancel_order(order_no: str, openid: str = "", db: Session = Depends(get_db)):
    """用户取消订单：仅 pending 状态可取消"""
    order = db.query(Order).filter(Order.order_no == order_no).first()
    if not order:
        raise HTTPException(404, "订单不存在")
    if order.status != "pending":
        raise HTTPException(400, "仅待付款订单可取消")
    order.status = "closed"
    order.updated_at = datetime.utcnow()
    db.commit()
    return {"order_no": order_no, "status": "closed"}


@router.get("/order/{order_no}")
def order_detail(order_no: str, openid: str = "", db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.order_no == order_no).first()
    if not order:
        raise HTTPException(404, "订单不存在")
    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    return {
        "order_no": order.order_no, "total": order.total, "status": order.status,
        "address": order.address,
        "created_at": order.created_at.strftime("%Y-%m-%d %H:%M") if order.created_at else "",
        "items": [{"goods_id": i.goods_id, "name": i.name, "qty": i.qty, "price": i.price} for i in items],
    }


# ---------- 内容 ----------

@router.get("/poetry")
def list_poetry(dynasty: Optional[str] = None, kind: Optional[str] = None,
                keyword: Optional[str] = None,
                page: int = 1, size: int = 20, db: Session = Depends(get_db)):
    q = db.query(Poetry)
    if dynasty:
        q = q.filter(Poetry.dynasty == dynasty)
    if kind:
        q = q.filter(Poetry.kind == kind)
    if keyword:
        kw = f"%{keyword.strip()}%"
        q = q.filter(or_(Poetry.title.like(kw),
                         Poetry.author.like(kw),
                         Poetry.content.like(kw)))
    total = q.count()
    items = q.order_by(Poetry.id).offset((page - 1) * size).limit(size).all()
    return {
        "total": total,
        "items": [{"id": p.id, "title": p.title, "dynasty": p.dynasty, "author": p.author} for p in items],
    }


@router.get("/poetry/{pid}")
def poetry_detail(pid: int, db: Session = Depends(get_db)):
    p = db.query(Poetry).get(pid)
    if not p:
        raise HTTPException(404, "诗词不存在")
    return {"id": p.id, "title": p.title, "dynasty": p.dynasty, "author": p.author,
            "content": p.content, "kind": p.kind}


@router.get("/media")
def list_media(type: str, db: Session = Depends(get_db)):
    items = db.query(Media).filter(Media.type == type).order_by(Media.id.desc()).all()
    return {"items": [{"id": m.id, "path": m.path, "title": m.title} for m in items]}


# ---------- 收藏 ----------

class FavIn(BaseModel):
    openid: str
    kind: str
    ref_id: str


@router.post("/favorite")
def add_favorite(data: FavIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.openid == data.openid).first()
    if not user:
        raise HTTPException(400, "用户未登录")
    exists = db.query(Favorite).filter_by(user_id=user.id, kind=data.kind, ref_id=data.ref_id).first()
    if exists:
        return {"ok": True, "already": True}
    db.add(Favorite(user_id=user.id, kind=data.kind, ref_id=data.ref_id))
    db.commit()
    return {"ok": True}


@router.get("/favorites")
def list_favorites(openid: str, kind: Optional[str] = None, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.openid == openid).first()
    if not user:
        return {"items": []}
    q = db.query(Favorite).filter(Favorite.user_id == user.id)
    if kind:
        q = q.filter(Favorite.kind == kind)
    items = q.order_by(Favorite.id.desc()).all()
    return {"items": [{"kind": f.kind, "ref_id": f.ref_id} for f in items]}


@router.get("/favorites/detail")
def favorites_detail(openid: str, kind: Optional[str] = None, db: Session = Depends(get_db)):
    """收藏详情：诗词带标题作者，壁纸/表情带路径，供收藏页渲染"""
    user = db.query(User).filter(User.openid == openid).first()
    if not user:
        return {"items": []}
    q = db.query(Favorite).filter(Favorite.user_id == user.id)
    if kind:
        q = q.filter(Favorite.kind == kind)
    favs = q.order_by(Favorite.id.desc()).all()

    poetry_ids = [int(f.ref_id) for f in favs if f.kind == "poetry" and f.ref_id.isdigit()]
    poems = {str(p.id): p for p in db.query(Poetry).filter(Poetry.id.in_(poetry_ids)).all()} if poetry_ids else {}
    media_paths = [f.ref_id for f in favs if f.kind in ("wallpaper", "emoji")]
    medias = {m.path: m for m in db.query(Media).filter(Media.path.in_(media_paths)).all()} if media_paths else {}

    items = []
    for f in favs:
        if f.kind == "poetry":
            p = poems.get(f.ref_id)
            items.append({"kind": "poetry", "ref_id": f.ref_id,
                          "title": p.title if p else "（诗词已删除）",
                          "subtitle": (p.dynasty + "·" + p.author) if p else "",
                          "path": ""})
        else:
            m = medias.get(f.ref_id)
            items.append({"kind": f.kind, "ref_id": f.ref_id,
                          "title": m.title if m else f.ref_id.split("/")[-1],
                          "subtitle": "壁纸" if f.kind == "wallpaper" else "表情",
                          "path": f.ref_id})
    return {"items": items}


@router.delete("/favorite")
def remove_favorite(openid: str, kind: str, ref_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.openid == openid).first()
    if not user:
        raise HTTPException(400, "用户未登录")
    db.query(Favorite).filter_by(user_id=user.id, kind=kind, ref_id=ref_id).delete()
    db.commit()
    return {"ok": True}
