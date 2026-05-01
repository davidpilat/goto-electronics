import React, { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from 'recharts'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmtMoney = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
const fmtK = n => { const v = parseFloat(n)||0; return (v<0?'-':'')+'$'+(Math.abs(v)>=1000?(Math.abs(v)/1000).toFixed(1)+'k':Math.abs(v).toFixed(0)) }

export default function Reports({ orders, expenses, inventory = [] }) {
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [skuSearch, setSkuSearch] = useState('')
  const [expandedSkus, setExpandedSkus] = useState({})
  const years = [...new Set(orders.map(o => o.sale_date?.slice(0,4)).filter(Boolean))].sort().reverse()
  if (!years.includes(year) && years.length > 0) {}

  // Build SKU summary by matching orders to inventory via serial number or name
  const skuData = (() => {
    const groups = {}
    inventory.forEach(item => {
      const key = item.sku || ('__' + item.name)
      if (!groups[key]) groups[key] = { sku: item.sku, name: item.name, invItems: [], matchedOrders: [] }
      groups[key].invItems.push(item)
    })
    orders.forEach(order => {
      let matched = false
      if (order.serial_number) {
        for (const group of Object.values(groups)) {
          if (group.invItems.some(i => i.serial_number === order.serial_number)) {
            group.matchedOrders.push(order); matched = true; break
          }
        }
      }
      if (!matched) {
        for (const group of Object.values(groups)) {
          const on = (order.item_name||'').toLowerCase()
          const gn = (group.name||'').toLowerCase()
          if (on && gn && on.length > 4 && gn.length > 4 && (on.includes(gn.slice(0,8)) || gn.includes(on.slice(0,8)))) {
            group.matchedOrders.push(order); matched = true; break
          }
        }
      }
    })
    return Object.values(groups).filter(g => g.invItems.length > 0).map(g => {
      const totalPurchaseCost = g.invItems.reduce((s,i) => s+parseFloat(i.purchase_cost||0), 0)
      const grossSale = g.matchedOrders.reduce((s,o) => s+parseFloat(o.gross_sale||0), 0)
      const sellingFees = g.matchedOrders.reduce((s,o) => s+parseFloat(o.selling_fee||0), 0)
      const adFees = g.matchedOrders.reduce((s,o) => s+parseFloat(o.ad_fee||0), 0)
      const shippingCost = g.matchedOrders.reduce((s,o) => s+parseFloat(o.shipping_cost||0), 0)
      const itemCostFromOrders = g.matchedOrders.reduce((s,o) => s+parseFloat(o.item_cost||0), 0)
      const netRevenue = grossSale - sellingFees - adFees - shippingCost
      const grossProfit = grossSale - itemCostFromOrders
      const netProfit = netRevenue - itemCostFromOrders
      const margin = grossSale > 0 ? (netProfit/grossSale*100) : 0
      return {
        ...g,
        totalItems: g.invItems.length,
        soldCount: g.invItems.filter(i => i.status==='Sold').length,
        inStock: g.invItems.filter(i => i.status==='In Stock').length,
        totalPurchaseCost,
        avgPurchaseCost: g.invItems.length > 0 ? totalPurchaseCost/g.invItems.length : 0,
        grossSale, sellingFees, adFees, shippingCost,
        itemCostFromOrders, netRevenue, grossProfit, netProfit, margin,
        orderCount: g.matchedOrders.length,
      }
    }).sort((a,b) => b.netProfit - a.netProfit)
  })()

  const monthlyData = MONTHS.map((name, i) => {
    const monthKey = `${year}-${String(i+1).padStart(2,'0')}`
    const mo = orders.filter(o => o.sale_date?.startsWith(monthKey))
    const me = expenses.filter(e => e.expense_date?.startsWith(monthKey))

    const gross = mo.reduce((s,o) => s+parseFloat(o.gross_sale||0), 0)
    const fees = mo.reduce((s,o) => s+parseFloat(o.selling_fee||0)+parseFloat(o.ad_fee||0), 0)
    const shipping = mo.reduce((s,o) => s+parseFloat(o.shipping_cost||0), 0)
    const itemCost = mo.reduce((s,o) => s+parseFloat(o.item_cost||0), 0)
    const bizExp = me.reduce((s,e) => s+parseFloat(e.amount||0), 0)
    const net = gross - fees - shipping
    const profit = net - itemCost - bizExp
    const margin = gross > 0 ? (profit/gross*100) : 0

    return { name, gross:Math.round(gross), net:Math.round(net), fees:Math.round(fees+shipping), itemCost:Math.round(itemCost), bizExp:Math.round(bizExp), profit:Math.round(profit), margin:parseFloat(margin.toFixed(1)), orders:mo.length }
  })

  const totals = monthlyData.reduce((acc, m) => ({
    gross: acc.gross + m.gross,
    net: acc.net + m.net,
    fees: acc.fees + m.fees,
    itemCost: acc.itemCost + m.itemCost,
    bizExp: acc.bizExp + m.bizExp,
    profit: acc.profit + m.profit,
    orders: acc.orders + m.orders,
  }), { gross:0, net:0, fees:0, itemCost:0, bizExp:0, profit:0, orders:0 })

  const avgMargin = totals.gross > 0 ? (totals.profit/totals.gross*100).toFixed(1) : 0

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background:'var(--c-surface)', border:'1px solid var(--c-border)', borderRadius:8, padding:'8px 12px', fontSize:12 }}>
        <p style={{ fontWeight:600, marginBottom:4 }}>{label}</p>
        {payload.map(p => <p key={p.name} style={{ color:p.color }}>{p.name}: {fmtMoney(p.value)}</p>)}
      </div>
    )
  }

  return (
    <div>
      {/* Year selector */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:'1rem' }}>
        <span style={{ fontSize:13, color:'var(--c-text2)' }}>Year</span>
        <select value={year} onChange={e => setYear(e.target.value)} style={{ width:'auto', height:36, padding:'4px 28px 4px 10px', fontSize:13 }}>
          {(years.length ? years : [year]).map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {/* Annual summary */}
      <div className="stat-grid" style={{ marginBottom:'1rem' }}>
        {[
          { label:'Gross revenue', value:fmtMoney(totals.gross), color:'var(--c-brand)' },
          { label:'Net revenue', value:fmtMoney(totals.net), color:'var(--c-text)' },
          { label:'Total profit', value:fmtMoney(totals.profit), color:totals.profit>=0?'var(--c-green)':'var(--c-red)' },
          { label:'Avg margin', value:`${avgMargin}%`, color:parseFloat(avgMargin)>=20?'var(--c-green)':'var(--c-amber)' },
        ].map(m => (
          <div key={m.label} className="stat-card">
            <div className="stat-label">{m.label}</div>
            <div className="stat-value" style={{ fontSize:22, color:m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Cost breakdown */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:'1rem' }}>
        {[
          { label:'Platform fees + shipping', value:fmtMoney(totals.fees), pct: totals.gross > 0 ? (totals.fees/totals.gross*100).toFixed(1) : 0 },
          { label:'Item costs (COGS)', value:fmtMoney(totals.itemCost), pct: totals.gross > 0 ? (totals.itemCost/totals.gross*100).toFixed(1) : 0 },
          { label:'Business expenses', value:fmtMoney(totals.bizExp), pct: totals.gross > 0 ? (totals.bizExp/totals.gross*100).toFixed(1) : 0 },
        ].map(m => (
          <div key={m.label} className="stat-card">
            <div className="stat-label">{m.label}</div>
            <div className="stat-value" style={{ fontSize:18 }}>{m.value}</div>
            <div className="stat-sub">{m.pct}% of gross revenue</div>
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="card">
        <div className="card-title">Monthly revenue breakdown</div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top:4, right:4, left:-10, bottom:0 }} barGap={2} barSize={18}>
              <XAxis dataKey="name" tick={{ fontSize:11 }} />
              <YAxis tick={{ fontSize:10 }} tickFormatter={fmtK} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="gross" name="Gross" fill="var(--c-brand)" radius={[3,3,0,0]} opacity={0.3} />
              <Bar dataKey="net" name="Net" fill="var(--c-brand)" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Profit chart */}
      <div className="card">
        <div className="card-title">Monthly profit</div>
        <div className="chart-wrap" style={{ height:180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top:4, right:4, left:-10, bottom:0 }}>
              <XAxis dataKey="name" tick={{ fontSize:11 }} />
              <YAxis tick={{ fontSize:10 }} tickFormatter={fmtK} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="profit" name="Profit" radius={[3,3,0,0]}>
                {monthlyData.map((m,i) => <Cell key={i} fill={m.profit>=0?'var(--c-green)':'var(--c-red)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly breakdown table */}
      <div className="card">
        <div className="card-title">Monthly breakdown</div>
        <div style={{ overflowX:'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Orders</th>
                <th>Gross</th>
                <th className="hide-mobile">Fees+Ship</th>
                <th className="hide-mobile">Item cost</th>
                <th className="hide-mobile">Biz exp</th>
                <th>Profit</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.filter(m => m.orders > 0).map(m => (
                <tr key={m.name}>
                  <td style={{ fontWeight:500 }}>{m.name}</td>
                  <td style={{ color:'var(--c-text2)' }}>{m.orders}</td>
                  <td className="mono">{fmtMoney(m.gross)}</td>
                  <td className="hide-mobile mono" style={{ color:'var(--c-amber)' }}>{fmtMoney(m.fees)}</td>
                  <td className="hide-mobile mono" style={{ color:'var(--c-text2)' }}>{fmtMoney(m.itemCost)}</td>
                  <td className="hide-mobile mono" style={{ color:'var(--c-text2)' }}>{fmtMoney(m.bizExp)}</td>
                  <td className={`mono ${m.profit>=0?'profit-positive':'profit-negative'}`}>{m.profit>=0?'+':''}{fmtMoney(m.profit)}</td>
                  <td>
                    <span className={`badge ${m.margin>=20?'badge-green':m.margin>=10?'badge-amber':'badge-red'}`}>{m.margin}%</span>
                  </td>
                </tr>
              ))}
              {totals.orders > 0 && (
                <tr style={{ fontWeight:600, borderTop:'2px solid var(--c-border)' }}>
                  <td>Total</td>
                  <td>{totals.orders}</td>
                  <td className="mono">{fmtMoney(totals.gross)}</td>
                  <td className="hide-mobile mono">{fmtMoney(totals.fees)}</td>
                  <td className="hide-mobile mono">{fmtMoney(totals.itemCost)}</td>
                  <td className="hide-mobile mono">{fmtMoney(totals.bizExp)}</td>
                  <td className={`mono ${totals.profit>=0?'profit-positive':'profit-negative'}`}>{totals.profit>=0?'+':''}{fmtMoney(totals.profit)}</td>
                  <td><span className={`badge ${parseFloat(avgMargin)>=20?'badge-green':parseFloat(avgMargin)>=10?'badge-amber':'badge-red'}`}>{avgMargin}%</span></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totals.orders === 0 && <div className="empty"><div className="empty-icon">📊</div>No data for {year} yet.</div>}
      </div>
      {/* SKU Summary */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">SKU / Product summary</span>
          <input type="text" placeholder="Search SKU or name…" value={skuSearch}
            onChange={e => setSkuSearch(e.target.value)}
            style={{ height:32, width:180, fontSize:13 }} />
        </div>
        {skuData.length === 0
          ? <div className="empty"><div className="empty-icon">📦</div>No inventory data yet.</div>
          : (
            <div style={{ overflowX:'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>SKU / Item</th>
                    <th>Units</th>
                    <th className="hide-mobile">Avg cost</th>
                    <th className="hide-mobile">Selling fees</th>
                    <th className="hide-mobile">Ad fees</th>
                    <th className="hide-mobile">Shipping</th>
                    <th className="hide-mobile">Gross sale</th>
                    <th>Gross profit</th>
                    <th>Net profit</th>
                    <th>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {skuData.filter(g => {
                    if (!skuSearch) return true
                    const q = skuSearch.toLowerCase()
                    return (g.sku||'').toLowerCase().includes(q) || (g.name||'').toLowerCase().includes(q)
                  }).map((g, i) => (
                    <tr key={i}>
                      <td>
                        <div style={{ fontWeight:500 }}>{g.name}</div>
                        {g.sku && <div style={{ fontSize:11, fontFamily:"'DM Mono',monospace", color:'var(--c-brand)' }}>{g.sku}</div>}
                        <div style={{ fontSize:11, color:'var(--c-text3)' }}>{g.soldCount} sold · {g.inStock} in stock</div>
                      </td>
                      <td style={{ color:'var(--c-text2)' }}>{g.totalItems}</td>
                      <td className="hide-mobile mono" style={{ color:'var(--c-text2)' }}>{fmtMoney(g.avgPurchaseCost)}</td>
                      <td className="hide-mobile mono" style={{ color:'var(--c-amber)' }}>{g.sellingFees > 0 ? fmtMoney(g.sellingFees) : '—'}</td>
                      <td className="hide-mobile mono" style={{ color:'var(--c-amber)' }}>{g.adFees > 0 ? fmtMoney(g.adFees) : '—'}</td>
                      <td className="hide-mobile mono" style={{ color:'var(--c-amber)' }}>{g.shippingCost > 0 ? fmtMoney(g.shippingCost) : '—'}</td>
                      <td className="hide-mobile mono">{g.grossSale > 0 ? fmtMoney(g.grossSale) : '—'}</td>
                      <td className={`mono ${g.grossProfit > 0 ? 'profit-positive' : g.grossProfit < 0 ? 'profit-negative' : ''}`}>
                        {g.grossSale > 0 ? (g.grossProfit >= 0 ? '+' : '') + fmtMoney(g.grossProfit) : '—'}
                      </td>
                      <td className={`mono ${g.netProfit > 0 ? 'profit-positive' : g.netProfit < 0 ? 'profit-negative' : ''}`} style={{ fontWeight:600 }}>
                        {g.grossSale > 0 ? (g.netProfit >= 0 ? '+' : '') + fmtMoney(g.netProfit) : '—'}
                      </td>
                      <td>
                        {g.grossSale > 0
                          ? <span className={`badge ${g.margin>=20?'badge-green':g.margin>=10?'badge-amber':'badge-red'}`}>{g.margin.toFixed(1)}%</span>
                          : <span style={{ color:'var(--c-text3)', fontSize:12 }}>unsold</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}
