import React, { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from 'recharts'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const PLATFORMS = ['eBay','Facebook Marketplace','Facebook','Amazon','Craigslist','OfferUp','Other']

const fmtMoney = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = n => { const v = parseFloat(n)||0; return v >= 1000 ? '$'+(v/1000).toFixed(1)+'k' : '$'+v.toFixed(0) }

export default function Dashboard({ orders, inventory, expenses }) {
  const today = new Date()
  const [period, setPeriod] = useState('month')

  const filterDate = (dateStr) => {
    if (!dateStr) return false
    // Parse as local date to avoid UTC timezone shift
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
    if (period === 'month') return m - 1 === today.getMonth() && y === today.getFullYear()
    if (period === 'quarter') {
      const q = Math.floor(today.getMonth() / 3)
      return Math.floor((m - 1) / 3) === q && y === today.getFullYear()
    }
    return y === today.getFullYear()
  }

  const filteredOrders = orders.filter(o => filterDate(o.sale_date))
  const filteredExpenses = expenses.filter(e => filterDate(e.expense_date))

  // Previous period for comparison
  const filterPrev = (dateStr) => {
    if (!dateStr) return false
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
    if (period === 'month') {
      const prevMonth = today.getMonth() === 0 ? 11 : today.getMonth() - 1
      const prevYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
      return m - 1 === prevMonth && y === prevYear
    }
    if (period === 'quarter') {
      const prevQ = Math.floor(today.getMonth() / 3) - 1
      if (prevQ < 0) return Math.floor((m - 1) / 3) === 3 && y === today.getFullYear() - 1
      return Math.floor((m - 1) / 3) === prevQ && y === today.getFullYear()
    }
    return y === today.getFullYear() - 1
  }
  const prevOrders = orders.filter(o => filterPrev(o.sale_date))
  const prevExpenses = expenses.filter(e => filterPrev(e.expense_date))
  const prevGross = prevOrders.reduce((s,o) => s + parseFloat(o.gross_sale||0), 0)
  const prevFees = prevOrders.reduce((s,o) => s + parseFloat(o.selling_fee||0) + parseFloat(o.ad_fee||0), 0)
  const prevShipping = prevOrders.reduce((s,o) => s + parseFloat(o.shipping_cost||0), 0)
  const prevItemCost = prevOrders.reduce((s,o) => s + parseFloat(o.item_cost||0), 0)
  const prevBizExp = prevExpenses.reduce((s,e) => s + parseFloat(e.amount||0), 0)
  const prevNet = prevGross - prevFees - prevShipping
  const prevProfit = prevNet - prevItemCost - prevBizExp

  const momPct = (curr, prev) => {
    if (prev === 0) return curr > 0 ? '+∞' : null
    const pct = ((curr - prev) / Math.abs(prev) * 100).toFixed(1)
    return (curr >= prev ? '+' : '') + pct + '%'
  }
  const momColor = (curr, prev) => curr >= prev ? 'var(--c-green)' : 'var(--c-red)'
  const prevLabel = period === 'month' ? 'vs last month' : period === 'quarter' ? 'vs last quarter' : 'vs last year'

  const grossRevenue = filteredOrders.reduce((s, o) => s + parseFloat(o.gross_sale||0), 0)
  const totalFees = filteredOrders.reduce((s, o) => s + parseFloat(o.selling_fee||0) + parseFloat(o.ad_fee||0), 0)
  const totalShipping = filteredOrders.reduce((s, o) => s + parseFloat(o.shipping_cost||0), 0)
  const totalItemCost = filteredOrders.reduce((s, o) => s + parseFloat(o.item_cost||0), 0)
  const totalBizExpenses = filteredExpenses.reduce((s, e) => s + parseFloat(e.amount||0), 0)
  const netRevenue = grossRevenue - totalFees - totalShipping
  const totalProfit = netRevenue - totalItemCost - totalBizExpenses
  const margin = grossRevenue > 0 ? ((totalProfit / grossRevenue) * 100).toFixed(1) : 0
  const avgOrderValue = filteredOrders.length > 0 ? grossRevenue / filteredOrders.length : 0

  const inStock = inventory.filter(i => i.status === 'In Stock').length
  const inventoryValue = inventory.filter(i => i.status === 'In Stock').reduce((s, i) => s + parseFloat(i.purchase_cost||0) + parseFloat(i.parts_cost||0), 0)

  // Monthly trend for current year
  const monthlyData = MONTHS.map((name, i) => {
    const monthOrders = orders.filter(o => {
      if (!o.sale_date) return false
      const [y, m] = o.sale_date.slice(0, 10).split('-').map(Number)
      return m - 1 === i && y === today.getFullYear()
    })
    const monthExpenses = expenses.filter(e => {
      if (!e.expense_date) return false
      const [y, m] = e.expense_date.slice(0, 10).split('-').map(Number)
      return m - 1 === i && y === today.getFullYear()
    })
    const gross = monthOrders.reduce((s, o) => s + parseFloat(o.gross_sale||0), 0)
    const fees = monthOrders.reduce((s, o) => s + parseFloat(o.selling_fee||0) + parseFloat(o.ad_fee||0) + parseFloat(o.shipping_cost||0), 0)
    const cost = monthOrders.reduce((s, o) => s + parseFloat(o.item_cost||0), 0)
    const exp = monthExpenses.reduce((s, e) => s + parseFloat(e.amount||0), 0)
    const profit = gross - fees - cost - exp
    return { name, revenue: Math.round(gross), profit: Math.round(profit) }
  })

  // Platform breakdown — built from actual order data, not hardcoded list
  const platformData = Object.entries(
    filteredOrders.reduce((acc, o) => {
      const p = o.platform || 'Other'
      if (!acc[p]) acc[p] = { revenue: 0, count: 0 }
      acc[p].revenue += parseFloat(o.gross_sale||0)
      acc[p].count += 1
      return acc
    }, {})
  ).map(([name, d]) => ({ name, revenue: d.revenue, count: d.count }))
    .sort((a, b) => b.revenue - a.revenue)

  const PLATFORM_COLORS = ['#0ea5e9','#16a34a','#d97706','#7c3aed','#dc2626','#6b7280']

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background:'var(--c-surface)', border:'1px solid var(--c-border)', borderRadius:8, padding:'8px 12px', fontSize:12 }}>
        <p style={{ fontWeight:600, marginBottom:4 }}>{label}</p>
        {payload.map(p => <p key={p.name} style={{ color:p.color }}>{p.name}: {fmtMoney(p.value)}</p>)}
      </div>
    )
  }

  const periodLabel = period === 'month' ? 'This month' : period === 'quarter' ? 'This quarter' : 'This year'

  return (
    <div>
      {/* Period selector */}
      <div style={{ display:'flex', gap:6, marginBottom:'1rem' }}>
        {[['month','Month'],['quarter','Quarter'],['year','Year']].map(([k,v]) => (
          <button key={k} className={`btn btn-sm ${period===k?'btn-primary':''}`} onClick={() => setPeriod(k)}>{v}</button>
        ))}
      </div>

      {/* Key metrics */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Gross revenue</div>
          <div className="stat-value stat-brand">{fmtMoney(grossRevenue)}</div>
          <div className="stat-sub" style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span>{filteredOrders.length} orders · {periodLabel}</span>
            {momPct(grossRevenue, prevGross) && <span style={{ fontWeight:600, color: momColor(grossRevenue, prevGross) }}>{momPct(grossRevenue, prevGross)}</span>}
          </div>
          {prevGross > 0 && <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:2 }}>{prevLabel}: {fmtMoney(prevGross)}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Net revenue</div>
          <div className="stat-value">{fmtMoney(netRevenue)}</div>
          <div className="stat-sub" style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span>After fees & shipping</span>
            {momPct(netRevenue, prevNet) && <span style={{ fontWeight:600, color: momColor(netRevenue, prevNet) }}>{momPct(netRevenue, prevNet)}</span>}
          </div>
          {prevNet > 0 && <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:2 }}>{prevLabel}: {fmtMoney(prevNet)}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Total profit</div>
          <div className={`stat-value ${totalProfit >= 0 ? 'stat-green' : 'stat-red'}`}>{fmtMoney(totalProfit)}</div>
          <div className="stat-sub" style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span>{margin}% margin</span>
            {momPct(totalProfit, prevProfit) && <span style={{ fontWeight:600, color: momColor(totalProfit, prevProfit) }}>{momPct(totalProfit, prevProfit)}</span>}
          </div>
          {prevProfit !== 0 && <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:2 }}>{prevLabel}: {fmtMoney(prevProfit)}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg order value</div>
          <div className="stat-value">{fmtMoney(avgOrderValue)}</div>
          <div className="stat-sub" style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span>Per sale</span>
            {prevOrders.length > 0 && momPct(avgOrderValue, prevGross/prevOrders.length) && (
              <span style={{ fontWeight:600, color: momColor(avgOrderValue, prevGross/prevOrders.length) }}>{momPct(avgOrderValue, prevGross/prevOrders.length)}</span>
            )}
          </div>
          {prevOrders.length > 0 && <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:2 }}>{prevLabel}: {fmtMoney(prevGross/prevOrders.length)} · {prevOrders.length} orders</div>}
        </div>
      </div>

      {/* Secondary metrics */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:'1rem' }}>
        {[
          { label:'Total fees', value:fmtMoney(totalFees), sub:'Selling + ad fees', color:'var(--c-amber)' },
          { label:'Shipping costs', value:fmtMoney(totalShipping), sub:'Paid by you', color:'var(--c-text)' },
          { label:'Inventory (in stock)', value:`${inStock} items`, sub:`${fmtMoney(inventoryValue)} tied up`, color:'var(--c-purple)' },
          { label:'Total ever purchased', value:fmtMoney(inventory.reduce((s,i)=>s+parseFloat(i.purchase_cost||0),0)), sub:'All ' + inventory.length + ' items', color:'var(--c-text)' },
        ].map(m => (
          <div key={m.label} className="stat-card">
            <div className="stat-label">{m.label}</div>
            <div className="stat-value" style={{ fontSize:18, color:m.color }}>{m.value}</div>
            <div className="stat-sub">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Monthly trend */}
      <div className="card">
        <div className="card-title">Revenue & profit — {today.getFullYear()}</div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top:4, right:4, left:-10, bottom:0 }} barGap={3}>
              <XAxis dataKey="name" tick={{ fontSize:11 }} />
              <YAxis tick={{ fontSize:10 }} tickFormatter={fmtK} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name="Revenue" fill="var(--c-brand)" radius={[3,3,0,0]} opacity={0.35} />
              <Bar dataKey="profit" name="Profit" radius={[3,3,0,0]}>
                {monthlyData.map((m,i) => <Cell key={i} fill={m.profit >= 0 ? 'var(--c-green)' : 'var(--c-red)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Platform breakdown + recent orders */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
        <div className="card">
          <div className="card-title">Revenue by platform · {periodLabel}</div>
          {platformData.length === 0
            ? <div className="empty"><div className="empty-icon">📦</div>No sales yet</div>
            : platformData.map((p, i) => (
              <div key={p.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--c-border)', fontSize:13 }}>
                <div style={{ width:8, height:8, borderRadius:2, background:PLATFORM_COLORS[i%PLATFORM_COLORS.length], flexShrink:0 }} />
                <span style={{ flex:1 }}>{p.name}</span>
                <span style={{ color:'var(--c-text2)', fontSize:12 }}>{p.count} sales</span>
                <span className="mono" style={{ fontWeight:500 }}>{fmtMoney(p.revenue)}</span>
              </div>
            ))
          }
        </div>

        <div className="card">
          <div className="card-title">Recent orders</div>
          {orders.length === 0
            ? <div className="empty"><div className="empty-icon">🛒</div>No orders yet</div>
            : orders.slice(0, 6).map(o => {
              const profit = parseFloat(o.gross_sale||0) - parseFloat(o.selling_fee||0) - parseFloat(o.ad_fee||0) - parseFloat(o.shipping_cost||0) - parseFloat(o.item_cost||0)
              return (
                <div key={o.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom:'1px solid var(--c-border)', fontSize:13 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.item_name}</div>
                    <div style={{ fontSize:11, color:'var(--c-text3)' }}>{o.platform} · {o.sale_date}</div>
                  </div>
                  <span className={`mono ${profit >= 0 ? 'profit-positive' : 'profit-negative'}`} style={{ fontSize:12 }}>
                    {profit >= 0 ? '+' : '-'}{fmtMoney(Math.abs(profit))}
                  </span>
                </div>
              )
            })
          }
        </div>
      </div>
    </div>
  )
}
