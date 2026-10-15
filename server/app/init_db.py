from .database import Base, engine, SessionLocal
from . import models  # noqa 确保模型注册


def init_db():
    """建表 + 演示种子数据（幂等：已有数据时跳过）"""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        from .models import Category, Goods
        if db.query(Goods).count() == 0:
            c1 = Category(name="演示分类", type="goods", sort=0)
            db.add(c1)
            db.commit()
            db.add(Goods(name="演示商品 A（示例数据）", category_id=c1.id, price=9.9,
                         detail="这是脚手架自动生成的示例商品，请在管理后台修改或删除。"))
            db.add(Goods(name="演示商品 B（示例数据）", category_id=c1.id, price=19.9,
                         detail="同上，示例数据。"))
            db.commit()
    finally:
        db.close()
