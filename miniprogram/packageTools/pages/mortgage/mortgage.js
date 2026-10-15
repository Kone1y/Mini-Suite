Page({
  data: {
    amount: '100',        // 贷款总额（万元）
    rate: '3.6',          // 年利率 %
    years: '30',
    yearOptions: ['5', '10', '15', '20', '25', '30'],
    yearIndex: 5,
    mode: 'benxi',        // benxi=等额本息 benjin=等额本金
    result: null,         // { monthly, firstMonth, lastMonth, totalInterest, totalPay, months }
    schedule: [],         // 前 12 期明细
    showSchedule: false
  },

  onAmount(e) { this.setData({ amount: e.detail.value, result: null }) },
  onRate(e) { this.setData({ rate: e.detail.value, result: null }) },
  onYears(e) {
    this.setData({ yearIndex: Number(e.detail.value), years: this.data.yearOptions[Number(e.detail.value)], result: null })
  },
  onMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode, result: null, showSchedule: false })
  },

  toggleSchedule() {
    this.setData({ showSchedule: !this.data.showSchedule })
  },

  calc() {
    const W = 10000
    const P = parseFloat(this.data.amount)   // 万元
    const ratePct = parseFloat(this.data.rate)
    const n = parseInt(this.data.years, 10) * 12
    if (!(P > 0) || !(ratePct > 0) || !n) {
      wx.showToast({ title: '请输入有效的金额和利率', icon: 'none' })
      return
    }
    if (ratePct > 24) {
      wx.showToast({ title: '年利率超过 24%，请确认', icon: 'none' })
      return
    }
    const principal = P * W
    const r = ratePct / 100 / 12   // 月利率

    let result, schedule = []
    if (this.data.mode === 'benxi') {
      // 等额本息：月供 = P*r*(1+r)^n / ((1+r)^n - 1)
      const pow = Math.pow(1 + r, n)
      const monthly = principal * r * pow / (pow - 1)
      let bal = principal, sumInterest = 0
      for (let m = 1; m <= n; m++) {
        const interest = bal * r
        const principalPart = monthly - interest
        bal -= principalPart
        sumInterest += interest
        if (m <= 12) schedule.push({
          month: m, payment: monthly, interest, principal: principalPart,
          balance: Math.max(0, bal)
        })
      }
      result = {
        monthly, firstMonth: monthly, lastMonth: monthly,
        totalInterest: sumInterest, totalPay: principal + sumInterest, months: n
      }
    } else {
      // 等额本金：每月本金固定，利息递减
      const base = principal / n
      let sumInterest = 0
      for (let m = 1; m <= n; m++) {
        const interest = (principal - base * (m - 1)) * r
        const payment = base + interest
        sumInterest += interest
        if (m <= 12) schedule.push({
          month: m, payment, interest, principal: base,
          balance: Math.max(0, principal - base * m)
        })
      }
      result = {
        monthly: null, firstMonth: base + principal * r,
        lastMonth: base + base * r,
        totalInterest: sumInterest, totalPay: principal + sumInterest, months: n
      }
    }

    const fmt = v => {
      const s = v.toFixed(2)
      return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }
    schedule.forEach(s => {
      s.paymentText = fmt(s.payment)
      s.interestText = fmt(s.interest)
      s.principalText = fmt(s.principal)
      s.balanceText = fmt(s.balance)
    })
    result.monthlyText = result.monthly === null ? '—' : fmt(result.monthly)
    result.firstMonthText = fmt(result.firstMonth)
    result.lastMonthText = fmt(result.lastMonth)
    result.totalInterestText = fmt(result.totalInterest)
    result.totalPayText = fmt(result.totalPay)
    result.monthsText = Math.floor(n / 12) + ' 年 (' + n + ' 期)'

    this.setData({ result, schedule, showSchedule: false })
  }
})
