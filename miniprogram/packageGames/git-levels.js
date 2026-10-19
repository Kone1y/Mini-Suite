// Git 修炼场关卡数据
// 每关：name/goal（描述）/setup（构建起始树的命令序列）/target（构建目标树的命令序列）/
//       hint（提示）/disable（禁用命令，逗号分隔）/golf（官方最少命令数）
const LEVELS = [
  {
    id: 1, name: '第一次提交', cat: '基础',
    goal: '创建 2 个提交（main 分支上有 C1→C2 链）',
    setup: [],
    target: ['commit -m A', 'commit -m B'],
    hint: 'commit 命令会沿当前分支创建新提交；每次 commit 前引擎自动记住父提交。',
    disable: '', golf: 2
  },
  {
    id: 2, name: '分支初体验', cat: '基础',
    goal: 'main 有 2 个提交，另建分支 dev 也指向第 2 个提交',
    setup: ['commit -m A'],
    target: ['commit -m A', 'commit -m B', 'branch dev'],
    hint: 'branch <名字> 在当前提交上建分支；默认 checkout 不切过去。',
    disable: '', golf: 3
  },
  {
    id: 3, name: '分叉开发', cat: '基础',
    goal: 'main 停在 C2，dev 领先 1 个提交（C3）',
    setup: ['commit -m A', 'commit -m B'],
    target: ['commit -m A', 'commit -m B', 'branch dev', 'checkout dev', 'commit -m C'],
    hint: '先建分支再 checkout 过去提交；switch -c 可以一步到位。',
    disable: '', golf: 4
  },
  {
    id: 4, name: '快进合并', cat: '合并',
    goal: '把 dev 的提交合并进 main（fast-forward，main 与 dev 同指 C3）',
    setup: ['commit -m A', 'branch dev', 'checkout dev', 'commit -m C'],
    target: ['commit -m A', 'branch dev', 'checkout dev', 'commit -m C', 'checkout main', 'merge dev'],
    hint: 'checkout main 回主分支后 merge dev；领先时无需新提交（Fast-forward）。',
    disable: '', golf: 6
  },
  {
    id: 5, name: '真正的合并', cat: '合并',
    goal: 'main 与 dev 各有分叉提交，最后 merge 出一个双亲合并提交',
    setup: ['commit -m A', 'branch dev', 'checkout dev', 'commit -m C', 'checkout main', 'commit -m B'],
    target: ['commit -m A', 'branch dev', 'checkout dev', 'commit -m C', 'checkout main', 'commit -m B', 'merge dev'],
    hint: '双方分叉时 merge 会生成 parents 有两个的新提交。',
    disable: '', golf: 7
  },
  {
    id: 6, name: '变基', cat: '合并',
    goal: 'dev 的提交变基到 main 顶端：dev 变成 A-B-D-C′ 链',
    setup: ['commit -m A', 'branch dev', 'checkout dev', 'commit -m C', 'checkout main', 'commit -m D'],
    target: ['commit -m A', 'branch dev', 'checkout dev', 'commit -m C', 'checkout main', 'commit -m D', 'checkout dev', 'rebase main'],
    hint: 'rebase main 把 dev 独有的提交"摘下来"重放到 main 顶端。',
    disable: '', golf: 8
  },
  {
    id: 7, name: '摘樱桃', cat: '合并',
    goal: 'main 只多一个提交，内容是 dev 上 C3 的复制（cherry-pick）',
    setup: ['commit -m A', 'branch dev', 'checkout dev', 'commit -m C', 'checkout main', 'commit -m D'],
    target: ['commit -m A', 'branch dev', 'checkout dev', 'commit -m C', 'checkout main', 'commit -m D', 'cherry-pick C3'],
    hint: 'cherry-pick <id> 复制单个提交到当前分支顶端。',
    disable: '', golf: 7
  },
  {
    id: 8, name: '回退重做', cat: '进阶',
    goal: 'main 从 D 回到 B，再提交一个新的 E（最终 main 顶端在 E）',
    setup: ['commit -m A', 'commit -m B', 'commit -m D'],
    target: ['commit -m A', 'commit -m B', 'commit -m D', 'reset C2', 'commit -m E'],
    hint: 'reset C2 把 main 指针拨回 C2，然后正常提交 E。',
    disable: '', golf: 5
  },
  {
    id: 9, name: '撤销的艺术', cat: '进阶',
    goal: '在 B 之后加一个"反向提交"回到 A 的内容（revert）',
    setup: ['commit -m A', 'commit -m B'],
    target: ['commit -m A', 'commit -m B', 'revert C2'],
    hint: 'revert <id> 生成一个新提交，内容恢复为该提交的父提交。',
    disable: '', golf: 3
  },
  {
    id: 10, name: '分离头指针', cat: '进阶',
    goal: 'HEAD 直接指在 C1 上（detached），不随任何分支',
    setup: ['commit -m A', 'commit -m B'],
    target: ['commit -m A', 'commit -m B', 'checkout C1'],
    hint: 'checkout <提交id> 进入分离头指针状态。',
    disable: '', golf: 3
  },
  {
    id: 11, name: '两路汇合', cat: '挑战',
    goal: '让 bugfix 分支与 main 都指向同一个合并提交',
    setup: ['commit -m A', 'branch bugfix', 'checkout bugfix', 'commit -m F', 'checkout main', 'commit -m B'],
    target: ['commit -m A', 'branch bugfix', 'checkout bugfix', 'commit -m F', 'checkout main', 'commit -m B', 'merge bugfix', 'checkout bugfix', 'merge main'],
    hint: '先 merge 出合并提交，再把另一分支 FF 过来。',
    disable: '', golf: 9
  },
  {
    id: 12, name: '终极重构', cat: '挑战',
    goal: 'feature 分支重放到 main 顶端后，main 快进跟上 feature',
    setup: ['commit -m A', 'branch feature', 'checkout feature', 'commit -m F1', 'commit -m F2', 'checkout main', 'commit -m B'],
    target: ['commit -m A', 'branch feature', 'checkout feature', 'commit -m F1', 'commit -m F2', 'checkout main', 'commit -m B', 'checkout feature', 'rebase main', 'checkout main', 'merge feature'],
    hint: 'rebase + merge 组合拳：feature 变基后 main 直接 FF 到顶端。',
    disable: '', golf: 11
  },
  {
    id: 13, name: '首次推送', cat: '远程',
    goal: '本地 main 领先 1 个提交，把它推到远程（o/main 同步到最新）',
    setup: ['commit -m A', 'remote setup main=C1'],
    target: ['commit -m A', 'remote setup main=C1', 'commit -m B', 'push'],
    hint: 'push 把本地分支推到远程同名分支；远程落后时可以 fast-forward 推上去。',
    disable: '', golf: 2
  },
  {
    id: 14, name: '团队协作', cat: '远程',
    goal: '队友已把 C2 推到远程。先拉取远程更新（快进到 C2），再做你的提交 C3，最后推送（o/main 到 C3）',
    setup: ['commit -m A', 'commit -m B', 'remote setup main=C2', 'reset C1'],
    target: ['commit -m A', 'commit -m B', 'remote setup main=C2', 'reset C1', 'pull', 'commit -m C', 'push'],
    hint: '本地落后时 pull 直接快进；然后 commit 你的工作；push 前远程没变即可直推。',
    disable: '', golf: 3
  }
]

module.exports = { LEVELS }
