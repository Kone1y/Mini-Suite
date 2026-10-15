from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
import os

from ..database import get_db
from .. import models  # noqa

router = APIRouter()
TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates")
templates = Jinja2Templates(directory=TEMPLATES_DIR)


@router.get("/admin", response_class=HTMLResponse)
def admin_home(request: Request, db: Session = Depends(get_db)):
    goods = db.query(models.Goods).order_by(models.Goods.id.desc()).all()
    orders = db.query(models.Order).order_by(models.Order.id.desc()).limit(20).all()
    return templates.TemplateResponse(request, "admin.html", {
        "goods": goods, "orders": orders,
    })
