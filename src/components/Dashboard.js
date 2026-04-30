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
    const d = new Date(dateStr)
    if (period === 'month') return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
    if (period === 'quarter') {
      const q = Math.floor(today.getMonth() / 3)
      return Math.floor(d.getMonth() / 3) === q && d.getFullYear() === today.getFullYear()
    }
    return d.getFullYear() === today.getFullYear()
  }

  const filteredOrders = orders.filter(o => filterDate(o.sale_date))
  const filteredExpenses = expenses.filter(e => filterDate(e.expense_date))

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
      const d = new Date(o.sale_date)
      return d.getMonth() === i && d.getFullYear() === today.getFullYear()
    })
    const monthExpenses = expenses.filter(e => {
      const d = new Date(e.expense_date)
      return d.getMonth() === i && d.getFullYear() === today.getFullYear()
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
          <div className="stat-sub">{filteredOrders.length} orders · {periodLabel}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Net revenue</div>
          <div className="stat-value">{fmtMoney(netRevenue)}</div>
          <div className="stat-sub">After fees & shipping</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total profit</div>
          <div className={`stat-value ${totalProfit >= 0 ? 'stat-green' : 'stat-red'}`}>{fmtMoney(totalProfit)}</div>
          <div className="stat-sub">{margin}% margin</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg order value</div>
          <div className="stat-value">{fmtMoney(avgOrderValue)}</div>
          <div className="stat-sub">Per sale</div>
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
