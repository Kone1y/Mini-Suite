// SQL 练习场课程数据
// 每课：id/name/sql（主题分类）/desc（讲解）/task（任务）/answer（参考 SQL）/
//       expect（期望结果列名，用于判定——结果集与参考答案一致即过关）/sandbox（后端沙箱名）
const LESSONS = [
  {
    id: 1, name: 'SELECT 基础', cat: '查询', sandbox: 'movies',
    desc: 'SELECT 从表里取数据。SELECT * FROM movies 取出全部行全部列；SELECT title FROM movies 只取 title 列。',
    task: '查出所有电影的标题（title 列）。',
    answer: 'SELECT title FROM movies',
    expectCols: ['title'], expectRows: 8
  },
  {
    id: 2, name: '选取多列', cat: '查询', sandbox: 'movies',
    desc: '列名之间用逗号分隔：SELECT title, year FROM movies。列的顺序就是你书写的顺序。',
    task: '查出每部电影的标题和上映年份（title, year）。',
    answer: 'SELECT title, year FROM movies',
    expectCols: ['title', 'year'], expectRows: 8
  },
  {
    id: 3, name: 'WHERE 筛选', cat: '筛选', sandbox: 'movies',
    desc: 'WHERE 按条件过滤行：WHERE year > 2000 只保留 2000 年后的行。比较符有 > < >= <= = <>。',
    task: '查出 2000 年之后（不含 2000）上映的电影的标题和年份。',
    answer: 'SELECT title, year FROM movies WHERE year > 2000',
    expectCols: ['title', 'year'], expectRows: 5
  },
  {
    id: 4, name: 'AND / OR 组合', cat: '筛选', sandbox: 'movies',
    desc: '多个条件用 AND（且）/ OR（或）连接，括号控制优先级：WHERE (a OR b) AND c。',
    task: '查出 Andrew Stanton 执导且时长超过 100 分钟的电影标题。',
    answer: "SELECT title FROM movies WHERE director = 'Andrew Stanton' AND length_minutes > 100",
    expectCols: ['title'], expectRows: 2
  },
  {
    id: 5, name: 'ORDER BY 排序', cat: '排序', sandbox: 'movies',
    desc: 'ORDER BY 列 [ASC|DESC] 对结果排序，默认升序 ASC，DESC 降序。可多列：ORDER BY a, b DESC。',
    task: '按上映年份从新到旧（降序）查出所有电影标题和年份。',
    answer: 'SELECT title, year FROM movies ORDER BY year DESC',
    expectCols: ['title', 'year'], expectRows: 8
  },
  {
    id: 6, name: 'LIMIT 截取', cat: '排序', sandbox: 'movies',
    desc: 'LIMIT n 只取前 n 行，常与 ORDER BY 组合做"Top N"。',
    task: '查出时长最长的 3 部电影的标题和时长。',
    answer: 'SELECT title, length_minutes FROM movies ORDER BY length_minutes DESC LIMIT 3',
    expectCols: ['title', 'length_minutes'], expectRows: 3
  },
  {
    id: 7, name: 'DISTINCT 去重', cat: '聚合', sandbox: 'movies',
    desc: 'SELECT DISTINCT 列 去掉重复值，返回唯一组合。',
    task: '查出所有不同的导演名字（去重）。',
    answer: 'SELECT DISTINCT director FROM movies',
    expectCols: ['director'], expectRows: 4
  },
  {
    id: 8, name: 'COUNT 与聚合', cat: '聚合', sandbox: 'movies',
    desc: 'COUNT(*) 数行数；SUM/MAX/MIN/AVG 分别求和/最大/最小/平均。聚合函数把多行压成一行。',
    task: '查出电影总数（列名叫 COUNT(*) 即可）。',
    answer: 'SELECT COUNT(*) FROM movies',
    expectCols: ['COUNT(*)'], expectRows: 1
  },
  {
    id: 9, name: 'GROUP BY 分组', cat: '聚合', sandbox: 'employees',
    desc: 'GROUP BY 列 把相同值的行分成一组，配合聚合函数做统计：每组一个结果。',
    task: '统计每个部门的员工人数（department_id 与人数）。',
    answer: 'SELECT department_id, COUNT(*) FROM employees GROUP BY department_id',
    expectCols: ['department_id', 'COUNT(*)'], expectRows: 3
  },
  {
    id: 10, name: 'HAVING 过滤组', cat: '聚合', sandbox: 'employees',
    desc: 'WHERE 过滤行、HAVING 过滤组（聚合之后）：GROUP BY x HAVING COUNT(*) > 2。',
    task: '找出平均工资超过 9000 的部门的部门号与平均工资。',
    answer: 'SELECT department_id, AVG(salary) FROM employees GROUP BY department_id HAVING AVG(salary) > 9000',
    expectCols: ['department_id', 'AVG(salary)'], expectRows: 2
  },
  {
    id: 11, name: 'INNER JOIN 连接', cat: '连接', sandbox: 'employees',
    desc: 'JOIN 把两张表按关联列拼起来：FROM a JOIN b ON a.x = b.y，只保留两边都匹配的行。',
    task: '查出每个员工的名字及其部门名（name, name——注意列重名，把部门表别名为 d 后取 d.name，员工列用 e.name）。',
    answer: 'SELECT e.name, d.name FROM employees e JOIN departments d ON e.department_id = d.id',
    expectCols: ['name', 'name'], expectRows: 7
  },
  {
    id: 12, name: 'LEFT JOIN 保留左表', cat: '连接', sandbox: 'employees',
    desc: 'LEFT JOIN 保留左表全部行，右表没匹配的填 NULL。加一条无部门员工看差异。',
    task: '用 LEFT JOIN 连接员工与部门，选出员工名与部门名（部门可空）。',
    answer: 'SELECT e.name, d.name FROM employees e LEFT JOIN departments d ON e.department_id = d.id',
    expectCols: ['name', 'name'], expectRows: 7
  },
  {
    id: 13, name: 'IN 子查询', cat: '子查询', sandbox: 'employees',
    desc: '子查询是查询里的查询：WHERE x IN (SELECT ...) 先执行括号里的查询，再用结果过滤外层。',
    task: '查出在 Engineering 部门工作的员工名字（用 IN + 子查询，不使用 JOIN）。',
    answer: "SELECT name FROM employees WHERE department_id IN (SELECT id FROM departments WHERE name = 'Engineering')",
    expectCols: ['name'], expectRows: 3
  },
  {
    id: 14, name: '标量子查询', cat: '子查询', sandbox: 'employees',
    desc: '返回单值的子查询可以像数值一样用在比较里：WHERE salary > (SELECT AVG(salary) FROM employees)。',
    task: '查出工资高于全公司平均工资的员工名字与工资。',
    answer: 'SELECT name, salary FROM employees WHERE salary > (SELECT AVG(salary) FROM employees)',
    expectCols: ['name', 'salary'], expectRows: 3
  },
  {
    id: 15, name: 'UNION 合并结果', cat: '集合', sandbox: 'employees',
    desc: 'UNION 把两个查询的结果上下拼接（自动去重）；UNION ALL 不去重、更快。两边列数必须相同。',
    task: '把 Engineering 部门和 Design 部门的员工名字合并成一个列表（分别查两部门再 UNION，结果按名字排序）。',
    answer: "SELECT name FROM employees WHERE department_id = (SELECT id FROM departments WHERE name = 'Engineering') UNION SELECT name FROM employees WHERE department_id = (SELECT id FROM departments WHERE name = 'Design') ORDER BY name",
    expectCols: ['name'], expectRows: 5
  },
  {
    id: 16, name: '窗口函数 ROW_NUMBER', cat: '窗口', sandbox: 'employees',
    desc: '窗口函数不压缩行数，而是给每行附加计算值：ROW_NUMBER() OVER (PARTITION BY 部门 ORDER BY 工资 DESC) 给每组编号。经典用法：组内 Top-N。',
    task: '给每个部门的员工按工资从高到低编号（输出：name, department_id, salary, rn），只取编号 rn = 1 的行——即每个部门工资最高的人。',
    answer: 'SELECT name, department_id, salary, rn FROM (SELECT name, department_id, salary, ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC) AS rn FROM employees) WHERE rn = 1',
    expectCols: ['name', 'department_id', 'salary', 'rn'], expectRows: 3
  }
]

module.exports = { LESSONS }
