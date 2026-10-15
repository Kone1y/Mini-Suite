// 排序算法可视化：纯函数逻辑（与页面解耦，可单测）
// 每个排序函数返回 { steps, sorted }
//   steps: 快照数组，每个 step = {
//     array:   [快照副本],
//     compare: [i, j]      正在比较的下标（无为空数组）
//     swap:    [i, j]|null 正在交换的下标（无则 null）
//     sorted:  [index...]  已确定最终位置的下标
//   }
// 所有模拟都在副本上进行，不破坏入参。

// 生成 n 个 [1, max] 随机整数
function randomArray(n, max) {
  const a = []
  for (let i = 0; i < n; i++) a.push(1 + Math.floor(Math.random() * max))
  return a
}

// 快照构造：深拷贝 array，sorted 也拷贝
function snap(arr, compare, swap, sorted) {
  return {
    array: arr.slice(),
    compare: compare.slice(),
    swap: swap === null ? null : swap.slice(),
    sorted: sorted.slice()
  }
}

// 范围数组辅助
function range(lo, hi) {
  const a = []
  for (let k = lo; k <= hi; k++) a.push(k)
  return a
}

// ---------- 冒泡排序 ----------
function bubbleSort(input) {
  const arr = input.slice()
  const steps = []
  const sorted = []
  const n = arr.length
  steps.push(snap(arr, [], null, []))
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1 - i; j++) {
      steps.push(snap(arr, [j, j + 1], null, sorted))
      if (arr[j] > arr[j + 1]) {
        const t = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = t
        steps.push(snap(arr, [j, j + 1], [j, j + 1], sorted))
      }
    }
    sorted.push(n - 1 - i)
  }
  sorted.push(0)
  steps.push(snap(arr, [], null, sorted))
  return { steps, sorted: arr.slice() }
}

// ---------- 选择排序 ----------
function selectionSort(input) {
  const arr = input.slice()
  const steps = []
  const sorted = []
  const n = arr.length
  steps.push(snap(arr, [], null, []))
  for (let i = 0; i < n - 1; i++) {
    let min = i
    for (let j = i + 1; j < n; j++) {
      steps.push(snap(arr, [min, j], null, sorted))
      if (arr[j] < arr[min]) min = j
    }
    if (min !== i) {
      const t = arr[i]; arr[i] = arr[min]; arr[min] = t
      steps.push(snap(arr, [i, min], [i, min], sorted))
    }
    sorted.push(i)
  }
  sorted.push(n - 1)
  steps.push(snap(arr, [], null, sorted))
  return { steps, sorted: arr.slice() }
}

// ---------- 插入排序 ----------
function insertionSort(input) {
  const arr = input.slice()
  const steps = []
  const sorted = []
  const n = arr.length
  steps.push(snap(arr, [], null, []))
  for (let i = 1; i < n; i++) {
    const key = arr[i]
    let j = i - 1
    while (j >= 0) {
      steps.push(snap(arr, [j, j + 1], null, sorted))
      if (arr[j] > key) {
        arr[j + 1] = arr[j]
        steps.push(snap(arr, [j, j + 1], [j, j + 1], sorted))
        j--
      } else {
        break
      }
    }
    arr[j + 1] = key
    steps.push(snap(arr, [j + 1, j + 1], [j + 1, j + 1], sorted))
    // 维护的有序前缀视为已就位（绿色反馈）
    sorted.length = 0
    for (let k = 0; k <= i; k++) sorted.push(k)
  }
  sorted.length = 0
  for (let k = 0; k < n; k++) sorted.push(k)
  steps.push(snap(arr, [], null, sorted))
  return { steps, sorted: arr.slice() }
}

// ---------- 快速排序（Lomuto 分区，递归）----------
function quickSort(input) {
  const arr = input.slice()
  const steps = []
  const sorted = []
  const n = arr.length
  steps.push(snap(arr, [], null, []))
  function qsort(lo, hi) {
    if (lo > hi) return
    if (lo === hi) { sorted.push(lo); return }
    const pivot = arr[hi]
    let i = lo
    for (let j = lo; j < hi; j++) {
      steps.push(snap(arr, [j, hi], null, sorted))
      if (arr[j] < pivot) {
        if (i !== j) {
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t
          steps.push(snap(arr, [i, j], [i, j], sorted))
        }
        i++
      }
    }
    if (i !== hi) {
      const t = arr[i]; arr[i] = arr[hi]; arr[hi] = t
      steps.push(snap(arr, [i, hi], [i, hi], sorted))
    }
    sorted.push(i) // pivot 已落位
    qsort(lo, i - 1)
    qsort(i + 1, hi)
  }
  qsort(0, n - 1)
  sorted.length = 0
  for (let k = 0; k < n; k++) sorted.push(k)
  steps.push(snap(arr, [], null, sorted))
  return { steps, sorted: arr.slice() }
}

// ---------- 归并排序（递归，带辅助数组）----------
function mergeSort(input) {
  const arr = input.slice()
  const steps = []
  const sorted = []
  const n = arr.length
  const tmp = arr.slice()
  steps.push(snap(arr, [], null, []))
  function msort(lo, hi) {
    if (lo >= hi) return
    const mid = (lo + hi) >> 1
    msort(lo, mid)
    msort(mid + 1, hi)
    for (let i = lo; i <= hi; i++) tmp[i] = arr[i]
    let i = lo, j = mid + 1, k = lo
    while (i <= mid && j <= hi) {
      steps.push(snap(arr, [i, j], null, sorted))
      if (tmp[i] <= tmp[j]) arr[k++] = tmp[i++]
      else arr[k++] = tmp[j++]
      steps.push(snap(arr, [k - 1, k - 1], [k - 1, k - 1], sorted))
    }
    while (i <= mid) arr[k++] = tmp[i++]
    while (j <= hi) arr[k++] = tmp[j++]
    // 当前归并段已局部有序，作为绿色反馈窗口
    steps.push(snap(arr, [], null, range(lo, hi)))
  }
  msort(0, n - 1)
  sorted.length = 0
  for (let k = 0; k < n; k++) sorted.push(k)
  steps.push(snap(arr, [], null, sorted))
  return { steps, sorted: arr.slice() }
}

// 算法元数据（picker 用）
const ALGOS = [
  { key: 'bubble', name: '冒泡' },
  { key: 'selection', name: '选择' },
  { key: 'insertion', name: '插入' },
  { key: 'quick', name: '快排' },
  { key: 'merge', name: '归并' }
]

module.exports = {
  randomArray,
  bubbleSort,
  selectionSort,
  insertionSort,
  quickSort,
  mergeSort,
  ALGOS
}
