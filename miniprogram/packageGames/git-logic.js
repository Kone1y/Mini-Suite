// 伪 Git 引擎：commit DAG + 分支引用 + 命令执行 + 快照比对
// 纯逻辑，无 wx 依赖，全部可单测。

// ---------- ID 生成 ----------
let _nextId = 0
function resetIds() { _nextId = 0 }

function newId() {
  return 'C' + (++_nextId)
}

// ---------- 仓库 ----------
function createRepo() {
  resetIds()
  return {
    commits: new Map(),      // id -> {id, parents:[], msg, files:{k:v}}
    branches: new Map(),     // name -> commitId
    HEAD: { type: 'branch', name: 'main' },   // or {type:'commit', id}
    tags: new Map(),         // name -> commitId
    reflog: [],              // 命令历史（undo 用）
    snapshots: [],           // 每步仓库快照（undo 用）
    cmdCount: 0              // git golf 计数
  }
}

// ---------- 内部工具 ----------
function headCommitId(repo) {
  if (repo.HEAD.type === 'branch') return repo.branches.get(repo.HEAD.name)
  return repo.HEAD.id
}

function headCommit(repo) {
  const id = headCommitId(repo)
  return id ? repo.commits.get(id) : null
}

// 当前分支名（detached 返回 null）
function currentBranch(repo) {
  return repo.HEAD.type === 'branch' ? repo.HEAD.name : null
}

function cloneRepo(repo) {
  return {
    commits: new Map([...repo.commits].map(([k, v]) => [k, { ...v, parents: v.parents.slice(), files: { ...v.files } }])),
    branches: new Map(repo.branches),
    HEAD: { ...repo.HEAD },
    tags: new Map(repo.tags),
    reflog: repo.reflog.slice(),
    snapshots: [],
    cmdCount: repo.cmdCount
  }
}

function pushUndo(repo) {
  repo.snapshots.push(cloneRepo(repo))
  if (repo.snapshots.length > 30) repo.snapshots.shift()
}

// ---------- 布局（canvas 渲染用）----------
// 简单分层：拓扑序 → x 按提交先后，y 按分支通道
// 返回 {nodes:[{id,x,y,color,parents,msg,labels:[]}], width, height}
function layout(repo) {
  // 拓扑排序（Kahn，parents 先于 children）
  const indeg = new Map()
  for (const c of repo.commits.values()) indeg.set(c.id, c.parents.length)
  const children = new Map()
  for (const c of repo.commits.values()) {
    for (const p of c.parents) {
      if (!children.has(p)) children.set(p, [])
      children.get(p).push(c.id)
    }
  }
  const queue = []
  for (const [id, d] of indeg) if (d === 0) queue.push(id)
  const order = []
  while (queue.length) {
    const id = queue.shift()
    order.push(id)
    for (const ch of (children.get(id) || [])) {
      indeg.set(ch, indeg.get(ch) - 1)
      if (indeg.get(ch) === 0) queue.push(ch)
    }
  }
  // 分支通道分配：第一父链走主通道，第二父（merge 进来）开新通道
  const lane = new Map()
  const laneCount = { n: 0 }
  // 从根开始沿第一父分叉：每个分支一条通道
  // 简化算法：BFS 给每个 commit 的第一孩子继承通道，第二孩子新通道
  const occupied = new Map()   // lane -> Set(orderIndex)  用于合并时回归
  for (let i = 0; i < order.length; i++) {
    const id = order[i]
    if (!lane.has(id)) lane.set(id, laneCount.n++)
    const c = repo.commits.get(id)
    const first = c.parents[0]
    const second = c.parents[1]
    if (first && !lane.has(first)) lane.set(first, lane.has(id) ? lane.get(id) : laneCount.n++)
    if (second && !lane.has(second)) lane.set(second, laneCount.n++)
  }
  // 通道压紧（间隙回收）
  const usedLanes = [...new Set([...lane.values()])].sort((a, b) => a - b)
  const remap = new Map(usedLanes.map((l, i) => [l, i]))
  // 标签（分支/HEAD/tag）
  const labels = new Map()   // commitId -> [name]
  for (const [b, id] of repo.branches) {
    if (!labels.has(id)) labels.set(id, [])
    labels.get(id).push(b)
  }
  for (const [t, id] of repo.tags) {
    if (!labels.has(id)) labels.set(id, [])
    labels.get(id).push('tag:' + t)
  }
  if (repo.HEAD.type === 'commit') {
    const id = repo.HEAD.id
    if (!labels.has(id)) labels.set(id, [])
    labels.get(id).push('(HEAD)')
  } else {
    const id = repo.branches.get(repo.HEAD.name)
    if (id) {
      if (!labels.has(id)) labels.set(id, [])
      // HEAD 标记渲染层根据 currentBranch 加箭头
    }
  }
  // 节点
  const nodes = order.map((id, i) => {
    const c = repo.commits.get(id)
    const myLabels = (labels.get(id) || []).slice()
    if (repo.HEAD.type === 'branch') {
      const hid = repo.branches.get(repo.HEAD.name)
      if (hid === id) myLabels.push('HEAD→' + repo.HEAD.name)
    }
    return {
      id,
      x: i,                       // 渲染层乘间距
      y: remap.get(lane.get(id)),
      parents: c.parents.slice(),
      msg: c.msg,
      labels: myLabels
    }
  })
  return { nodes, lanes: usedLanes.length, width: order.length, height: usedLanes.length }
}

// ---------- 快照（关卡判定）----------
// 规范化树：每 commit 的内容 = files + parents 的规范化 id（相对结构）
// 用拓扑序重编号后序列化，忽略真实 id，只比较结构等价
function serialize(repo) {
  // 拓扑序
  const indeg = new Map()
  for (const c of repo.commits.values()) indeg.set(c.id, c.parents.length)
  const children = new Map()
  for (const c of repo.commits.values()) {
    for (const p of c.parents) {
      if (!children.has(p)) children.set(p, [])
      children.get(p).push(c.id)
    }
  }
  const queue = []
  for (const [id, d] of indeg) if (d === 0) queue.push(id)
  const order = []
  while (queue.length) {
    const id = queue.shift()
    order.push(id)
    for (const ch of (children.get(id) || [])) {
      indeg.set(ch, indeg.get(ch) - 1)
      if (indeg.get(ch) === 0) queue.push(ch)
    }
  }
  // 重编号（拓扑序序号）
  const rid = new Map(order.map((id, i) => [id, i]))
  const lines = order.map(id => {
    const c = repo.commits.get(id)
    const ps = c.parents.map(p => rid.get(p)).sort((a, b) => a - b).join(',')
    const files = Object.keys(c.files).sort().map(k => k + '=' + c.files[k]).join(';')
    return rid.get(id) + '|p:' + ps + '|f:' + files
  })
  // 分支结构（分支名与树结构一起算——关卡判定含分支状态）
  const bs = [...repo.branches.entries()].map(([n, id]) => n + '->' + (rid.get(id) ?? '-')).sort()
  // tags 不参与判定（简化）
  return lines.join('\n') + '\n#' + bs.join(';')
}

// ---------- 内容合并（简化三向）----------
// 基于文件级三向合并：base/ours/theirs 全 files 映射
function mergeFiles(base, ours, theirs) {
  const keys = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])
  const out = {}
  let conflict = false
  for (const k of keys) {
    const b = base[k], o = ours[k], t = theirs[k]
    if (o === t) { if (o !== undefined) out[k] = o }
    else if (b === o) { if (t !== undefined) out[k] = t }
    else if (b === t) { if (o !== undefined) out[k] = o }
    else { conflict = true }
  }
  return { files: out, conflict }
}

function isAncestor(repo, ancestorId, descendantId) {
  // BFS descendant 的所有祖先
  const seen = new Set()
  const stack = [descendantId]
  while (stack.length) {
    const id = stack.pop()
    if (id === ancestorId) return true
    if (seen.has(id)) continue
    seen.add(id)
    const c = repo.commits.get(id)
    if (c) for (const p of c.parents) stack.push(p)
  }
  return false
}

// ---------- 命令 ----------
// 返回 {ok, out}；ok=false 时 out 是错误信息（不改变状态）
function exec(repo, line) {
  const parts = line.trim().split(/\s+/)
  const cmd = parts[0]
  const args = parts.slice(1)
  pushUndo(repo)
  let r
  switch (cmd) {
    case 'commit': r = cmdCommit(repo, args); break
    case 'branch': r = cmdBranch(repo, args); break
    case 'checkout': r = cmdCheckout(repo, args); break
    case 'switch': r = cmdSwitch(repo, args); break
    case 'merge': r = cmdMerge(repo, args); break
    case 'rebase': r = cmdRebase(repo, args); break
    case 'cherry-pick': r = cmdCherryPick(repo, args); break
    case 'reset': r = cmdReset(repo, args); break
    case 'revert': r = cmdRevert(repo, args); break
    case 'tag': r = cmdTag(repo, args); break
    case 'undo':
      // undo 自身不压快照，直接恢复上一步
      repo.snapshots.pop()
      r = cmdUndo(repo)
      return r
    case 'log': r = cmdLog(repo); break
    case 'status': r = cmdStatus(repo); break
    default:
      repo.snapshots.pop()
      return { ok: false, out: '未知命令：' + cmd + '（可用：commit/branch/checkout/merge/rebase/cherry-pick/reset/revert/tag/undo）' }
  }
  if (r.ok) {
    repo.cmdCount++
    repo.reflog.push(line)
  } else {
    repo.snapshots.pop()   // 失败不留撤销点
  }
  return r
}

function cmdCommit(repo, args) {
  // commit / commit -m msg
  const mi = args.indexOf('-m')
  const msg = mi >= 0 && args[mi + 1] ? args[mi + 1] : '提交'
  const head = headCommit(repo)
  const parents = head ? [head.id] : []
  const files = head ? { ...head.files } : {}
  // 每次提交带一个自动递增的文件变化（让内容有区分度）
  files['f' + (repo.commits.size + 1)] = 'v' + repo.commits.size
  const id = newId()
  repo.commits.set(id, { id, parents, msg, files })
  if (repo.HEAD.type === 'branch') {
    repo.branches.set(repo.HEAD.name, id)
  } else {
    repo.HEAD = { type: 'commit', id }   // detached commit 移动 HEAD
  }
  return { ok: true, out: '[' + (repo.HEAD.type === 'branch' ? repo.HEAD.name : 'detached') + '] ' + id + ' ' + msg }
}

function cmdBranch(repo, args) {
  if (args.length < 1) {
    // 无参：列出分支
    const cur = currentBranch(repo)
    const lines = [...repo.branches.keys()].map(b => (b === cur ? '* ' : '  ') + b)
    return { ok: true, out: lines.join('\n') }
  }
  const name = args[0]
  if (repo.branches.has(name)) return { ok: false, out: '分支已存在：' + name }
  if (!headCommitId(repo)) return { ok: false, out: '当前无提交，无法建分支' }
  repo.branches.set(name, headCommitId(repo))
  return { ok: true, out: '分支 ' + name + ' 建立于 ' + headCommitId(repo) }
}

function cmdCheckout(repo, args) {
  if (args.length < 1) return { ok: false, out: '用法：checkout <分支|提交>' }
  const target = args[0]
  if (repo.branches.has(target)) {
    repo.HEAD = { type: 'branch', name: target }
    return { ok: true, out: '切换到分支 ' + target }
  }
  if (repo.commits.has(target)) {
    repo.HEAD = { type: 'commit', id: target }
    return { ok: true, out: '分离头指针 ' + target }
  }
  return { ok: false, out: '无此分支或提交：' + target }
}

function cmdSwitch(repo, args) {
  if (args[0] === '-c') {
    if (args.length < 2) return { ok: false, out: '用法：switch -c <新分支>' }
    const name = args[1]
    if (repo.branches.has(name)) return { ok: false, out: '分支已存在' }
    if (!headCommitId(repo)) return { ok: false, out: '当前无提交' }
    repo.branches.set(name, headCommitId(repo))
    repo.HEAD = { type: 'branch', name }
    return { ok: true, out: '新建并切换到 ' + name }
  }
  return cmdCheckout(repo, args)
}

function cmdMerge(repo, args) {
  if (args.length < 1) return { ok: false, out: '用法：merge <分支>' }
  const name = args[0]
  if (!repo.branches.has(name)) return { ok: false, out: '无此分支：' + name }
  const theirs = repo.commits.get(repo.branches.get(name))
  const oursHead = headCommit(repo)
  if (!oursHead) return { ok: false, out: '当前无提交' }
  const ours = repo.commits.get(oursHead.id)
  // fast-forward
  if (isAncestor(repo, ours.id, theirs.id)) {
    if (repo.HEAD.type === 'branch') repo.branches.set(repo.HEAD.name, theirs.id)
    else repo.HEAD = { type: 'commit', id: theirs.id }
    return { ok: true, out: 'Fast-forward → ' + theirs.id }
  }
  // already up-to-date
  if (isAncestor(repo, theirs.id, ours.id)) {
    return { ok: true, out: 'Already up-to-date' }
  }
  // 三向合并
  // base = 两者的最近公共祖先
  const baseId = lca(repo, ours.id, theirs.id)
  const base = baseId ? repo.commits.get(baseId).files : {}
  const m = mergeFiles(base, ours.files, theirs.files)
  if (m.conflict) return { ok: false, out: 'CONFLICT：文件级冲突（本沙箱不支持手动解决）' }
  const id = newId()
  repo.commits.set(id, { id, parents: [ours.id, theirs.id].sort(), msg: 'Merge ' + name, files: m.files })
  if (repo.HEAD.type === 'branch') repo.branches.set(repo.HEAD.name, id)
  else repo.HEAD = { type: 'commit', id }
  return { ok: true, out: '合并提交 ' + id + '（无冲突）' }
}

// 最近公共祖先：ours 的祖先集 ∩ theirs 往上走
function lca(repo, a, b) {
  const anc = new Set()
  const stack = [a]
  while (stack.length) {
    const id = stack.pop()
    if (anc.has(id)) continue
    anc.add(id)
    const c = repo.commits.get(id)
    if (c) for (const p of c.parents) stack.push(p)
  }
  // b 按 BFS 找第一个在 anc 里的
  const q = [b]
  const seen = new Set()
  while (q.length) {
    const id = q.shift()
    if (anc.has(id)) return id
    if (seen.has(id)) continue
    seen.add(id)
    const c = repo.commits.get(id)
    if (c) for (const p of c.parents) q.push(p)
  }
  return null
}

function cmdRebase(repo, args) {
  if (args.length < 1) return { ok: false, out: '用法：rebase <分支>' }
  const name = args[0]
  if (!repo.branches.has(name)) return { ok: false, out: '无此分支：' + name }
  const onto = repo.commits.get(repo.branches.get(name))
  const oursHead = headCommit(repo)
  if (!oursHead) return { ok: false, out: '当前无提交' }
  if (isAncestor(repo, onto.id, oursHead.id)) return { ok: true, out: 'Already up-to-date（当前分支领先）' }
  if (!isAncestor(repo, oursHead.id, onto.id)) {
    // 分叉：需要重放 ours 独有提交
    const baseId = lca(repo, oursHead.id, onto.id)
    // 收集 ours 侧独有提交（从 head 到 base，不含 base）——按拓扑序
    const mine = []
    const stack = [oursHead.id]
    const seen = new Set()
    while (stack.length) {
      const id = stack.pop()
      if (id === baseId || seen.has(id)) continue
      seen.add(id)
      mine.push(repo.commits.get(id))
      const c = repo.commits.get(id)
      for (const p of c.parents) stack.push(p)
    }
    mine.reverse()   // 旧→新重放
    // 逐个重放到 onto 上
    let base = onto
    for (const c of mine) {
      const id = newId()
      repo.commits.set(id, { id, parents: [base.id], msg: c.msg, files: { ...base.files, ...c.files } })
      base = repo.commits.get(id)
    }
    if (repo.HEAD.type === 'branch') repo.branches.set(repo.HEAD.name, base.id)
    else repo.HEAD = { type: 'commit', id: base.id }
    return { ok: true, out: '变基完成：' + mine.length + ' 个提交重放到 ' + onto.id }
  }
  // fast-forward 情形：直接推进
  if (repo.HEAD.type === 'branch') repo.branches.set(repo.HEAD.name, onto.id)
  else repo.HEAD = { type: 'commit', id: onto.id }
  return { ok: true, out: 'Fast-forward → ' + onto.id }
}

function cmdCherryPick(repo, args) {
  if (args.length < 1) return { ok: false, out: '用法：cherry-pick <提交id>' }
  const src = repo.commits.get(args[0])
  if (!src) return { ok: false, out: '无此提交：' + args[0] }
  const head = headCommit(repo)
  if (!head) return { ok: false, out: '当前无提交' }
  const id = newId()
  repo.commits.set(id, { id, parents: [head.id], msg: src.msg, files: { ...head.files, ...src.files } })
  if (repo.HEAD.type === 'branch') repo.branches.set(repo.HEAD.name, id)
  else repo.HEAD = { type: 'commit', id }
  return { ok: true, out: 'Cherry-pick ' + src.id + ' → ' + id }
}

function cmdReset(repo, args) {
  if (args.length < 1) return { ok: false, out: '用法：reset <提交id>' }
  const target = repo.commits.get(args[0])
  if (!target) return { ok: false, out: '无此提交：' + args[0] }
  if (repo.HEAD.type === 'branch') repo.branches.set(repo.HEAD.name, target.id)
  else repo.HEAD = { type: 'commit', id: target.id }
  return { ok: true, out: 'HEAD 现在指向 ' + target.id }
}

function cmdRevert(repo, args) {
  if (args.length < 1) return { ok: false, out: '用法：revert <提交id>' }
  const src = repo.commits.get(args[0])
  if (!src) return { ok: false, out: '无此提交：' + args[0] }
  const head = headCommit(repo)
  if (!head) return { ok: false, out: '当前无提交' }
  if (src.parents.length !== 1) return { ok: false, out: '只能 revert 普通提交（单亲）' }
  const parent = repo.commits.get(src.parents[0])
  // 逆向：恢复成父提交的 files
  const id = newId()
  repo.commits.set(id, { id, parents: [head.id], msg: 'Revert ' + src.id, files: { ...parent.files } })
  if (repo.HEAD.type === 'branch') repo.branches.set(repo.HEAD.name, id)
  else repo.HEAD = { type: 'commit', id }
  return { ok: true, out: 'Revert ' + src.id + ' → ' + id }
}

function cmdTag(repo, args) {
  if (args.length < 1) {
    return { ok: true, out: [...repo.tags.keys()].join('\n') || '（无 tag）' }
  }
  if (!headCommitId(repo)) return { ok: false, out: '当前无提交' }
  repo.tags.set(args[0], headCommitId(repo))
  return { ok: true, out: 'tag ' + args[0] + ' → ' + headCommitId(repo) }
}

function cmdUndo(repo) {
  const snap = repo.snapshots.pop()
  if (!snap) return { ok: false, out: '无可撤销' }
  // 恢复字段但保留 snapshots 栈自身（snap 内的 snapshots 是克隆时的空栈）
  const keepStack = repo.snapshots
  Object.assign(repo, snap)
  repo.snapshots = keepStack
  return { ok: true, out: '已撤销上一步' }
}

function cmdLog(repo) {
  const head = headCommit(repo)
  if (!head) return { ok: true, out: '（空仓库）' }
  const lines = []
  const stack = [head.id]
  const seen = new Set()
  while (stack.length) {
    const id = stack.shift()
    if (seen.has(id)) continue
    seen.add(id)
    const c = repo.commits.get(id)
    lines.push(id + ' ' + c.msg + '  (p: ' + c.parents.join(',') + ')')
    for (const p of c.parents) stack.unshift(p)
  }
  return { ok: true, out: lines.join('\n') }
}

function cmdStatus(repo) {
  const b = currentBranch(repo)
  const id = headCommitId(repo)
  return { ok: true, out: (b ? 'On branch ' + b : 'HEAD detached at ' + repo.HEAD.id) + (id ? ' @ ' + id : '') }
}

// ---------- 命令构造 API（页面层用）----------
const api = {
  createRepo, exec, serialize, layout, currentBranch, headCommitId,
  // 测试/关卡构建用
  _newId: newId, _resetIds: resetIds
}

module.exports = api
