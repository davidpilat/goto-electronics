import React, { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from 'recharts'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmtMoney = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
const fmtK = n => { const v = parseFloat(n)||0; return (v<0?'-':'')+'$'+(Math.abs(v)>=1000?(Math.abs(v)/1000).toFixed(1)+'k':Math.abs(v).toFixed(0)) }

export default function Reports({ orders, expenses, inventory = [], parts = [], repairOrders = [], repairOrderParts = [] }) {
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
    // Match orders to inventory groups via serial number ONLY (exact match)
    orders.forEach(order => {
      if (order.serial_number) {
        for (const group of Object.values(groups)) {
          if (group.invItems.some(i => i.serial_number === order.serial_number)) {
            group.matchedOrders.push(order)
            break
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
      const inStockItems = g.invItems.filter(i => i.status === 'In Stock' || i.status === 'Listed')
      const soldOrders = g.matchedOrders.filter(o => parseFloat(o.gross_sale||0) > 0)
      const avgSellingPrice = soldOrders.length > 0 ? grossSale / soldOrders.length : 0
      const avgFeeRate = grossSale > 0 ? (sellingFees + adFees + shippingCost) / grossSale : 0
      const potentialGrossSale = avgSellingPrice * inStockItems.length
      const potentialFees = potentialGrossSale * avgFeeRate
      const potentialItemCost = inStockItems.reduce((s,i) => s+parseFloat(i.purchase_cost||0), 0)
      const potentialNetRevenue = potentialGrossSale - potentialFees
      const potentialProfit = potentialNetRevenue - potentialItemCost
      const potentialMargin = potentialGrossSale > 0 ? (potentialProfit / potentialGrossSale * 100) : 0
      return {
        ...g,
        totalItems: g.invItems.length,
        soldCount: g.invItems.filter(i => i.status==='Sold').length,
        inStock: inStockItems.length,
        totalPurchaseCost,
        avgPurchaseCost: g.invItems.length > 0 ? totalPurchaseCost/g.invItems.length : 0,
        avgSellingPrice,
        grossSale, sellingFees, adFees, shippingCost,
        itemCostFromOrders, netRevenue, grossProfit, netProfit, margin,
        orderCount: g.matchedOrders.length,
        potentialGrossSale, potentialFees, potentialItemCost,
        potentialNetRevenue, potentialProfit, potentialMargin,
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

  const totalInventoryCost = inventory.reduce((s, i) => s + parseFloat(i.purchase_cost||0), 0)
  const realizedProfit = totals.gross - totals.fees - totals.bizExp - totalInventoryCost

  const avgMargin = totals.gross > 0 ? (totals.profit/totals.gross*100).toFixed(1) : 0

  // Repair revenue — only count Complete or Shipped orders
  const completedRepairs = repairOrders.filter(r => r.status === 'Complete' || r.status === 'Shipped')
  const completedRepairIds = new Set(completedRepairs.map(r => r.id))
  const repairRevenue = completedRepairs.reduce((s,r) => s + parseFloat(r.repair_price||0), 0)
  const repairShipping = completedRepairs.reduce((s,r) => s + parseFloat(r.shipping_cost||0), 0)
  const repairPartsCost = repairOrderParts.filter(p => completedRepairIds.has(p.repair_order_id)).reduce((s,p) => s + parseFloat(p.cost||0), 0)
  const repairProfit = repairRevenue - repairShipping - repairPartsCost
  const combinedGross = totals.gross + repairRevenue
  const combinedProfit = totals.profit + repairProfit

  // Year projections
  const currentYear = new Date().getFullYear().toString()
  const currentMonth = new Date().getMonth() // 0-indexed
  const isCurrentYear = year === currentYear
  const monthsElapsed = isCurrentYear ? Math.max(1, currentMonth) : 12 // months with full data
  const monthsRemaining = isCurrentYear ? 12 - currentMonth : 0

  // YTD actuals (months with data)
  const ytdMonths = monthlyData.slice(0, isCurrentYear ? currentMonth : 12)
  const ytdGross = ytdMonths.reduce((s,m) => s + m.gross, 0)
  const ytdProfit = ytdMonths.reduce((s,m) => s + m.profit, 0)
  const ytdOrders = ytdMonths.reduce((s,m) => s + m.orders, 0)
  const ytdBizExp = ytdMonths.reduce((s,m) => s + m.bizExp, 0)

  const avgMonthlyGross = monthsElapsed > 0 ? ytdGross / monthsElapsed : 0
  const avgMonthlyProfit = monthsElapsed > 0 ? ytdProfit / monthsElapsed : 0
  const avgMonthlyOrders = monthsElapsed > 0 ? ytdOrders / monthsElapsed : 0
  const avgMonthlyBizExp = monthsElapsed > 0 ? ytdBizExp / monthsElapsed : 0

  // Inventory potential: use avg selling price & margin from skuData
  const inStockItems = inventory.filter(i => i.status === 'In Stock' || i.status === 'Listed')
  const invPotentialRevenue = skuData.reduce((s,g) => s + g.potentialGrossSale, 0)
  const invPotentialProfit = skuData.reduce((s,g) => s + g.potentialProfit, 0)

  // Projected full year = YTD actuals + remaining months at avg rate
  const projectedGross = ytdGross + (avgMonthlyGross * monthsRemaining)
  const projectedProfit = ytdProfit + (avgMonthlyProfit * monthsRemaining)
  const projectedOrders = Math.round(ytdOrders + (avgMonthlyOrders * monthsRemaining))
  const projectedBizExp = ytdBizExp + (avgMonthlyBizExp * monthsRemaining)

  // Full year including inventory sell-through
  const projectedGrossWithInv = projectedGross + invPotentialRevenue
  const projectedProfitWithInv = projectedProfit + invPotentialProfit

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

      {/* Profit breakdown */}
      <div className="card" style={{ marginBottom:'1rem' }}>
        <div className="card-title">Profit breakdown</div>
        <div style={{ display:'flex', flexDirection:'column', gap:0, maxWidth:420 }}>
          {[
            { label:'Gross revenue', value:totals.gross, color:'var(--c-text)', sign:null },
            { label:'− Platform fees + shipping', value:totals.fees, color:'var(--c-amber)', sign:'−' },
            { label:'= Net revenue', value:totals.net, color:'var(--c-text)', sign:null, bold:true, borderTop:true },
            { label:'− Item costs (COGS)', value:totals.itemCost, color:'var(--c-amber)', sign:'−' },
            { label:'− Business expenses', value:totals.bizExp, color:'var(--c-amber)', sign:'−' },
            { label:'= Total profit', value:totals.profit, color:totals.profit>=0?'var(--c-green)':'var(--c-red)', sign:null, bold:true, borderTop:true },
            { label:'− Total inventory purchased', value:totalInventoryCost, color:'var(--c-amber)', sign:'−' },
            { label:'= Realized profit', value:realizedProfit, color:realizedProfit>=0?'var(--c-green)':'var(--c-red)', sign:null, bold:true, borderTop:true },
          ].map(row => (
            <div key={row.label} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'8px 4px',
              borderTop: row.borderTop ? '1px solid var(--c-border)' : undefined,
              marginTop: row.borderTop ? 4 : undefined,
            }}>
              <span style={{ fontSize:13, color:'var(--c-text2)', fontWeight: row.bold ? 600 : 400 }}>{row.label}</span>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight: row.bold ? 700 : 500, color:row.color }}>
                {fmtMoney(row.value)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Repair revenue breakdown */}
      {repairOrders.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:'1rem' }}>
          <div className="card" style={{ margin:0 }}>
            <div className="card-title">Repair revenue <span style={{ fontSize:11, color:'var(--c-text3)', fontWeight:400 }}>(Complete + Shipped only)</span></div>
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {[
                { label:'Repair revenue', value:repairRevenue, color:'var(--c-text)', bold:true },
                { label:'− Shipping costs', value:repairShipping, color:'var(--c-amber)' },
                { label:'− Parts cost', value:repairPartsCost, color:'var(--c-amber)' },
                { label:'= Repair profit', value:repairProfit, color:repairProfit>=0?'var(--c-green)':'var(--c-red)', bold:true, borderTop:true },
              ].map(row => (
                <div key={row.label} style={{ display:'flex', justifyContent:'space-between', padding:'7px 4px', borderTop: row.borderTop ? '1px solid var(--c-border)' : undefined, marginTop: row.borderTop ? 4 : undefined }}>
                  <span style={{ fontSize:13, color:'var(--c-text2)', fontWeight: row.bold ? 600 : 400 }}>{row.label}</span>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight: row.bold ? 700 : 500, color:row.color }}>{fmtMoney(row.value)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ margin:0 }}>
            <div className="card-title">Combined totals</div>
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {[
                { label:'Resale revenue', value:totals.gross, color:'var(--c-text2)' },
                { label:'+ Repair revenue', value:repairRevenue, color:'var(--c-text2)' },
                { label:'= Combined revenue', value:combinedGross, color:'var(--c-text)', bold:true, borderTop:true },
                { label:'Resale profit', value:totals.profit, color:'var(--c-text2)' },
                { label:'+ Repair profit', value:repairProfit, color:'var(--c-text2)' },
                { label:'= Combined profit', value:combinedProfit, color:combinedProfit>=0?'var(--c-green)':'var(--c-red)', bold:true, borderTop:true },
              ].map(row => (
                <div key={row.label} style={{ display:'flex', justifyContent:'space-between', padding:'7px 4px', borderTop: row.borderTop ? '1px solid var(--c-border)' : undefined, marginTop: row.borderTop ? 4 : undefined }}>
                  <span style={{ fontSize:13, color:'var(--c-text2)', fontWeight: row.bold ? 600 : 400 }}>{row.label}</span>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight: row.bold ? 700 : 500, color:row.color }}>{fmtMoney(row.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Year projections */}
      {isCurrentYear && ytdGross > 0 && (
        <div className="card" style={{ marginBottom:'1rem' }}>
          <div className="card-header" style={{ marginBottom:12 }}>
            <span className="card-title">📈 {year} Projections</span>
            <span style={{ fontSize:12, color:'var(--c-text3)' }}>Based on {monthsElapsed} month{monthsElapsed !== 1 ? 's' : ''} of actuals · {monthsRemaining} remaining</span>
          </div>

          {/* Projection stat cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
            {[
              { label:'Projected revenue', ytd: ytdGross, projected: projectedGross, color:'var(--c-brand)' },
              { label:'Projected profit', ytd: ytdProfit, projected: projectedProfit, color: projectedProfit >= 0 ? 'var(--c-green)' : 'var(--c-red)' },
              { label:'Projected orders', ytd: ytdOrders, projected: projectedOrders, isMono:true, color:'var(--c-text)' },
              { label:'Projected expenses', ytd: ytdBizExp, projected: projectedBizExp, color:'var(--c-amber)' },
            ].map(s => (
              <div key={s.label} className="stat-card">
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ fontSize:18, color:s.color }}>
                  {typeof s.projected === 'number' && !s.isMono ? fmtMoney(s.projected) : Math.round(s.projected)}
                </div>
                <div className="stat-sub" style={{ fontSize:11, color:'var(--c-text3)' }}>
                  YTD: {s.isMono ? Math.round(s.ytd) : fmtMoney(s.ytd)} · avg {fmtMoney(s.isMono ? s.ytd/monthsElapsed : s.ytd/monthsElapsed)}/mo
                </div>
              </div>
            ))}
          </div>

          {/* Inventory sell-through potential */}
          {inStockItems.length > 0 && (
            <div style={{ borderTop:'1px solid var(--c-border)', paddingTop:12 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--c-text2)', marginBottom:8 }}>
                + If all {inStockItems.length} in-stock items sell at historical avg prices:
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                {[
                  { label:'Additional revenue', value: invPotentialRevenue, color:'var(--c-brand)' },
                  { label:'Additional profit', value: invPotentialProfit, color: invPotentialProfit >= 0 ? 'var(--c-green)' : 'var(--c-red)' },
                  { label:'Total projected profit', value: projectedProfitWithInv, color: projectedProfitWithInv >= 0 ? 'var(--c-green)' : 'var(--c-red)' },
                ].map(s => (
                  <div key={s.label} style={{ padding:'10px 14px', background:'var(--c-surface2)', borderRadius:8, border:'1px solid var(--c-border)' }}>
                    <div style={{ fontSize:11, color:'var(--c-text3)', marginBottom:4 }}>{s.label}</div>
                    <div style={{ fontSize:18, fontWeight:700, fontFamily:"'DM Mono',monospace", color:s.color }}>{fmtMoney(s.value)}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:8 }}>
                ⚠ Inventory projections use historical avg selling price per SKU. Items without sales history are excluded.
              </div>
            </div>
          )}
        </div>
      )}

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
      {/* Potential Revenue Summary */}
      {(() => {
        const unsoldSkus = skuData.filter(g => g.inStock > 0 && g.avgSellingPrice > 0)
        if (unsoldSkus.length === 0) return null
        const totalPotentialGross = unsoldSkus.reduce((s,g) => s+g.potentialGrossSale, 0)
        const totalPotentialProfit = unsoldSkus.reduce((s,g) => s+g.potentialProfit, 0)
        const totalUnsoldCost = unsoldSkus.reduce((s,g) => s+g.potentialItemCost, 0)
        const totalUnsoldUnits = unsoldSkus.reduce((s,g) => s+g.inStock, 0)
        return (
          <div className="card" style={{ marginBottom:'1rem', border:'1px solid rgba(14,165,233,0.2)', background:'var(--c-brand-bg)' }}>
            <div className="card-title" style={{ color:'var(--c-brand)' }}>Potential revenue — unsold inventory</div>
            <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:12 }}>
              Based on average selling price from past sales. {totalUnsoldUnits} units across {unsoldSkus.length} SKUs.
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
              {[
                { label:'Potential gross revenue', value:fmtMoney(totalPotentialGross), color:'var(--c-brand)' },
                { label:'Tied up in inventory', value:fmtMoney(totalUnsoldCost), color:'var(--c-text2)' },
                { label:'Potential profit', value:(totalPotentialProfit>=0?'+':'')+fmtMoney(totalPotentialProfit), color:totalPotentialProfit>=0?'var(--c-green)':'var(--c-red)' },
                { label:'Potential margin', value:totalPotentialGross>0?(totalPotentialProfit/totalPotentialGross*100).toFixed(1)+'%':'—', color:'var(--c-text)' },
              ].map(m => (
                <div key={m.label} className="stat-card">
                  <div className="stat-label">{m.label}</div>
                  <div className="stat-value" style={{ fontSize:20, color:m.color }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

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
                    <th className="hide-mobile">Total cost</th>
                    <th className="hide-mobile">Selling fees</th>
                    <th className="hide-mobile">Ad fees</th>
                    <th className="hide-mobile">Shipping</th>
                    <th className="hide-mobile">Gross sale</th>
                    <th>Net profit (sold)</th>
                    <th>Total profit (all units)</th>
                    <th className="hide-mobile">Potential gross</th>
                    <th className="hide-mobile">Potential profit</th>
                    <th>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {skuData.filter(g => {
                    if (!skuSearch) return true
                    const q = skuSearch.toLowerCase()
                    return (g.sku||'').toLowerCase().includes(q) || (g.name||'').toLowerCase().includes(q)
                  }).map((g, i) => {
                    // Total profit = net profit from sales minus ALL units' purchase cost
                    const totalProfitAllUnits = g.netRevenue - g.totalPurchaseCost
                    const totalMarginAllUnits = g.grossSale > 0 ? (totalProfitAllUnits / g.grossSale * 100) : null
                    return (
                      <tr key={i}>
                        <td>
                          <div style={{ fontWeight:500 }}>{g.name}</div>
                          {g.sku && <div style={{ fontSize:11, fontFamily:"'DM Mono',monospace", color:'var(--c-brand)' }}>{g.sku}</div>}
                          <div style={{ fontSize:11, color:'var(--c-text3)' }}>{g.soldCount} sold · {g.inStock} in stock</div>
                        </td>
                        <td style={{ color:'var(--c-text2)' }}>{g.totalItems}</td>
                        <td className="hide-mobile">
                          <div className="mono" style={{ color:'var(--c-text2)' }}>{fmtMoney(g.totalPurchaseCost)}</div>
                          <div style={{ fontSize:11, color:'var(--c-text3)' }}>avg {fmtMoney(g.avgPurchaseCost)}</div>
                        </td>
                        <td className="hide-mobile mono" style={{ color:'var(--c-amber)' }}>{g.sellingFees > 0 ? fmtMoney(g.sellingFees) : '—'}</td>
                        <td className="hide-mobile mono" style={{ color:'var(--c-amber)' }}>{g.adFees > 0 ? fmtMoney(g.adFees) : '—'}</td>
                        <td className="hide-mobile mono" style={{ color:'var(--c-amber)' }}>{g.shippingCost > 0 ? fmtMoney(g.shippingCost) : '—'}</td>
                        <td className="hide-mobile mono">{g.grossSale > 0 ? fmtMoney(g.grossSale) : '—'}</td>
                        <td className={`mono ${g.netProfit > 0 ? 'profit-positive' : g.netProfit < 0 ? 'profit-negative' : ''}`}>
                          {g.grossSale > 0 ? (g.netProfit >= 0 ? '+' : '') + fmtMoney(g.netProfit) : '—'}
                        </td>
                        <td>
                          {g.grossSale > 0 ? (
                            <div>
                              <div className={`mono ${totalProfitAllUnits > 0 ? 'profit-positive' : 'profit-negative'}`} style={{ fontWeight:600 }}>
                                {totalProfitAllUnits >= 0 ? '+' : ''}{fmtMoney(totalProfitAllUnits)}
                              </div>
                              {g.inStock > 0 && (
                                <div style={{ fontSize:11, color:'var(--c-text3)' }}>{g.inStock} unsold @ {fmtMoney(g.avgPurchaseCost)} ea</div>
                              )}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="hide-mobile">
                          {g.inStock > 0 && g.avgSellingPrice > 0 ? (
                            <div>
                              <div className="mono" style={{ color:'var(--c-brand)' }}>{fmtMoney(g.potentialGrossSale)}</div>
                              <div style={{ fontSize:11, color:'var(--c-text3)' }}>{g.inStock} × {fmtMoney(g.avgSellingPrice)}</div>
                            </div>
                          ) : <span style={{ color:'var(--c-text3)' }}>—</span>}
                        </td>
                        <td className="hide-mobile">
                          {g.inStock > 0 && g.avgSellingPrice > 0 ? (
                            <div className={`mono ${g.potentialProfit>=0?'profit-positive':'profit-negative'}`} style={{ fontWeight:600 }}>
                              {g.potentialProfit>=0?'+':''}{fmtMoney(g.potentialProfit)}
                              <div style={{ fontSize:11, fontWeight:400, color:'var(--c-text3)' }}>{g.potentialMargin.toFixed(1)}% margin</div>
                            </div>
                          ) : <span style={{ color:'var(--c-text3)' }}>—</span>}
                        </td>
                        <td>
                          {g.grossSale > 0
                            ? <span className={`badge ${g.margin>=20?'badge-green':g.margin>=10?'badge-amber':'badge-red'}`}>{g.margin.toFixed(1)}%</span>
                            : <span style={{ color:'var(--c-text3)', fontSize:12 }}>unsold</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}
