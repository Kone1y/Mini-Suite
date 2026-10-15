# SQL 练习场：内存 SQLite 沙箱
import sqlite3
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# 防多语句/写操作：只允許单条 SELECT
_FORBIDDEN = ("insert", "update", "delete", "drop", "create", "alter", "attach",
              "detach", "pragma", "vacuum", "reindex", "replace")


class SqlReq(BaseModel):
    sql: str
    lesson: str = ""   # 课程 id：决定 schema/seed（前端传，后端校验白名单）


# 每课的 schema + seed（与前端课程数据一致，此处为可信源）
LESSONS_DB = {
    "movies": [
        "CREATE TABLE movies (id INTEGER PRIMARY KEY, title TEXT, director TEXT, year INTEGER, length_minutes INTEGER)",
        "INSERT INTO movies VALUES (1,'Toy Story','John Lasseter',1995,81),(2,'A Bug''s Life','John Lasseter',1998,95),"
        "(3,'Toy Story 2','John Lasseter',1999,93),(4,'Monsters, Inc.','Pete Docter',2001,92),"
        "(5,'Finding Nemo','Andrew Stanton',2003,107),(6,'The Incredibles','Brad Bird',2004,115),"
        "(7,'Ratatouille','Brad Bird',2007,115),(8,'WALL-E','Andrew Stanton',2008,104)",
    ],
    "employees": [
        "CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, role TEXT, salary INTEGER, department_id INTEGER)",
        "INSERT INTO employees VALUES (1,'Alice','Engineer',9000,1),(2,'Bob','Designer',8000,2),"
        "(3,'Carol','Engineer',9500,1),(4,'Dave','Manager',12000,3),(5,'Eve','Engineer',10000,1),"
        "(6,'Frank','Designer',7500,2),(7,'Grace','PM',10500,3)",
        "CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT, building TEXT)",
        "INSERT INTO departments VALUES (1,'Engineering','A'),(2,'Design','B'),(3,'Product','C')",
    ],
}

_SBX_CACHE = {}   # lesson -> bytes（预构建的库快照）


def _build_snapshot(lesson: str) -> bytes:
    con = sqlite3.connect(":memory:")
    try:
        for stmt in LESSONS_DB[lesson]:
            con.execute(stmt)
        con.commit()
        return con.serialize()
    finally:
        con.close()


def _get_snapshot(lesson: str) -> bytes:
    if lesson not in _SBX_CACHE:
        _SBX_CACHE[lesson] = _build_snapshot(lesson)
    return _SBX_CACHE[lesson]


@router.post("/sql/exec")
def sql_exec(req: SqlReq):
    if req.lesson not in LESSONS_DB:
        raise HTTPException(status_code=400, detail="未知课程沙箱")
    sql = (req.sql or "").strip().rstrip(";").strip()
    if not sql:
        raise HTTPException(status_code=400, detail="SQL 为空")
    # 单语句 & 只读校验
    low = " " + sql.lower() + " "
    if ";" in sql:
        raise HTTPException(status_code=400, detail="只支持单条语句")
    for kw in _FORBIDDEN:
        # 词边界检查（防 replace 列名误伤：前后需非字母）
        import re
        if re.search(rf"\b{kw}\b", low):
            raise HTTPException(status_code=400, detail=f"练习场仅支持 SELECT 查询（检测到 {kw.upper()}）")
    # 复制快照执行（隔离：每次请求一个全新沙箱）
    con = sqlite3.connect(":memory:")
    try:
        con.deserialize(_get_snapshot(req.lesson))
        cur = con.cursor()
        t0 = time.time()
        cur.execute(sql)
        rows = cur.fetchmany(200)
        cols = [d[0] for d in cur.description] if cur.description else []
        ms = int((time.time() - t0) * 1000)
        return {"columns": cols, "rows": [list(map(_safe, r)) for r in rows],
                "rowCount": len(rows), "ms": ms}
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"SQL 错误：{e}")
    finally:
        con.close()


def _safe(v):
    if v is None or isinstance(v, (int, float, str)):
        return v
    return str(v)
