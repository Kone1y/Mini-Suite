from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Float
from datetime import datetime

from .database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    openid = Column(String(64), unique=True, index=True)
    nickname = Column(String(64), default="演示用户")
    created_at = Column(DateTime, default=datetime.utcnow)


class Category(Base):
    """商城商品分类 / 内容分类通用（type 区分）"""
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True)
    name = Column(String(32), nullable=False)
    type = Column(String(16), default="goods")  # goods | wallpaper | emoji
    sort = Column(Integer, default=0)


class Goods(Base):
    __tablename__ = "goods"
    id = Column(Integer, primary_key=True)
    name = Column(String(128), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"))
    price = Column(Float, default=0.0)          # 演示态：单位元
    stock = Column(Integer, default=999)
    images = Column(Text, default="")           # 逗号分隔的 /static/goods/xxx
    detail = Column(Text, default="")
    on_sale = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Order(Base):
    """演示态订单：模拟支付状态机 pending -> paid -> shipped -> done；closed 表取消"""
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True)
    order_no = Column(String(32), unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    total = Column(Float, default=0.0)
    status = Column(String(16), default="pending")  # pending|paid|shipped|done|closed
    address = Column(String(255), default="演示地址：XX省XX市XX区 1 号")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    goods_id = Column(Integer, ForeignKey("goods.id"))
    name = Column(String(128))
    price = Column(Float)
    qty = Column(Integer, default=1)


class Poetry(Base):
    __tablename__ = "poetry"
    id = Column(Integer, primary_key=True)
    title = Column(String(128))
    dynasty = Column(String(16), default="")
    author = Column(String(64), default="")
    content = Column(Text)                     # \n 分行
    kind = Column(String(16), default="诗")     # 诗 | 词 | 曲


class Favorite(Base):
    __tablename__ = "favorites"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    kind = Column(String(16))                  # poetry | wallpaper | emoji | goods
    ref_id = Column(String(64))                # poetry 表 id 或静态资源路径
    created_at = Column(DateTime, default=datetime.utcnow)


class Media(Base):
    """壁纸 / 表情包索引（文件落在 app/static 下，记录元信息）"""
    __tablename__ = "media"
    id = Column(Integer, primary_key=True)
    type = Column(String(16))                  # wallpaper | emoji
    path = Column(String(255))                 # /static/wallpapers/xxx.jpg
    title = Column(String(64), default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class Idiom(Base):
    """成语词库（Wordle + 词典）"""
    __tablename__ = "idioms"
    id = Column(Integer, primary_key=True)
    word = Column(String(8), unique=True, index=True)
    pinyin = Column(String(64))                # 带声调（展示）
    pinyin_plain = Column(String(64))          # 无声调（匹配）
    pinyin_first = Column(String(32))          # 声母首字母
    explanation = Column(Text)                 # 释义
    derivation = Column(String(256))           # 出处
    example = Column(String(256))              # 例句
    common = Column(Integer, default=0)        # 常用标记（1=有例句）
