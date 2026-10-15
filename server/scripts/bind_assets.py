# -*- coding: utf-8 -*-
"""给演示商品挂图 + 注册壁纸/表情包媒体索引（一次性脚本）"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import SessionLocal
from app.models import Goods, Media

db = SessionLocal()
STATIC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "static")

# 商品图
goods_imgs = sorted(os.listdir(os.path.join(STATIC, "goods")))
items = db.query(Goods).order_by(Goods.id).all()
names = ["迷你手提帆布包", "陶瓷马克杯", "纯棉文化衫", "PVC贴纸包", "金属徽章套装", "精装笔记本"]
for i, g in enumerate(items[:len(names)]):
    g.name = names[i]
    g.price = [29.9, 39.9, 59.9, 9.9, 15.9, 19.9][i]
    g.detail = "mini-suite 周边演示商品 %d 号。这是自动生成的演示数据，可在后台编辑。" % (i + 1)
    if i < len(goods_imgs):
        g.images = "/static/goods/" + goods_imgs[i]
db.commit()
print("商品已更新:", [(g.id, g.name, g.price, bool(g.images)) for g in items[:len(names)]])

# 媒体索引（若空）
if db.query(Media).count() == 0:
    wp_titles = ["山川", "湖海", "星辰", "月色", "清风", "竹影", "云野", "空山", "暮雪", "晨雾", "松涛", "溪谷"]
    for i, f in enumerate(sorted(os.listdir(os.path.join(STATIC, "wallpapers")))):
        db.add(Media(type="wallpaper", path="/static/wallpapers/" + f, title=wp_titles[i % len(wp_titles)]))
    em_titles = ["开心", "加油", "稳住", "冲鸭", "躺平", "绝了", "社恐", "emo", "哈哈", "嗯嗯", "收到", "摸鱼"]
    for i, f in enumerate(sorted(os.listdir(os.path.join(STATIC, "emoji")))):
        db.add(Media(type="emoji", path="/static/emoji/" + f, title=em_titles[i % len(em_titles)]))
    db.commit()
    print("媒体索引已建：壁纸 12 + 表情 12")
else:
    print("媒体索引已存在，跳过")
db.close()
