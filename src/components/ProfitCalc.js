import React, { useState, useEffect } from 'react'

const PLATFORMS = ['eBay','Facebook Marketplace','Facebook','Amazon','Craigslist','OfferUp','Other']

const PLATFORM_DEFAULTS = {
  'eBay':                 { sellingFeeRate: 13.25, adFeeRate: 2, shippingEstimate: 8 },
  'Facebook Marketplace': { sellingFeeRate: 5,     adFeeRate: 0, shippingEstimate: 0 },
  'Facebook':             { sellingFeeRate: 5,     adFeeRate: 0, shippingEstimate: 0 },
  'Amazon':               { sellingFeeRate: 15,    adFeeRate: 3, shippingEstimate: 5 },
  'Craigslist':           { sellingFeeRate: 0,     adFeeRate: 0, shippingEstimate: 0 },
  'OfferUp':              { sellingFeeRate: 12.9,  adFeeRate: 0, shippingEstimate: 6 },
  'Other':                { sellingFeeRate: 10,    adFeeRate: 0, shippingEstimate: 5 },
}

const fmt = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
const pct = n => (parseFloat(n)||0).toFixed(1) + '%'

export default function ProfitCalc() {
  const [platform, setPlatform] = useState('eBay')
  const [salePrice, setSalePrice] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [sellingFeeRate, setSellingFeeRate] = useState(13.25)
  const [adFeeRate, setAdFeeRate] = useState(2)
  const [shippingCost, setShippingCost] = useState(8)
  const [repairCost, setRepairCost] = useState('')
  const [targetMargin, setTargetMargin] = useState(20)
  const [savedCalcs, setSavedCalcs] = useState([])
  const [saveName, setSaveName] = useState('')

  useEffect(() => {
    const d = PLATFORM_DEFAULTS[platform]
    if (d) {
      setSellingFeeRate(d.sellingFeeRate)
      setAdFeeRate(d.adFeeRate)
      setShippingCost(d.shippingEstimate)
    }
  }, [platform])

  const qty = Math.max(1, parseInt(quantity) || 1)
  const salePricePerUnit = parseFloat(salePrice) || 0
  const totalSale = salePricePerUnit * qty

  // Per-unit costs
  const sellFeePerUnit = salePricePerUnit * (parseFloat(sellingFeeRate)||0) / 100
  const adFeePerUnit = salePricePerUnit * (parseFloat(adFeeRate)||0) / 100
  const shipPerUnit = parseFloat(shippingCost) || 0  // shipping per unit (user enters per-unit)
  const repairPerUnit = parseFloat(repairCost) || 0

  // Total costs
  const totalSellFee = sellFeePerUnit * qty
  const totalAdFee = adFeePerUnit * qty
  const totalShip = shipPerUnit * qty  // multiplied by quantity
  const totalRepair = repairPerUnit * qty

  const netRevenuePerUnit = salePricePerUnit - sellFeePerUnit - adFeePerUnit - shipPerUnit
  const totalNetRevenue = netRevenuePerUnit * qty

  // Max bid for the entire lot
  const targetMarginDec = (parseFloat(targetMargin)||0) / 100
  const maxBidTotal = totalSale > 0 ? Math.max(0, totalNetRevenue - totalRepair - (totalSale * targetMarginDec)) : 0
  const maxBidPerUnit = qty > 0 ? maxBidTotal / qty : 0

  // Breakeven
  const breakevenTotal = Math.max(0, totalNetRevenue - totalRepair)
  const breakevenPerUnit = qty > 0 ? breakevenTotal / qty : 0

  const profitAtMaxBid = totalSale > 0 ? totalNetRevenue - totalRepair - maxBidTotal : 0
  const marginAtMaxBid = totalSale > 0 ? (profitAtMaxBid / totalSale * 100) : 0

  const bidScenarios = totalSale > 0 ? [
    { label: 'Max bid', bidTotal: maxBidTotal, bidUnit: maxBidPerUnit, highlight: true },
    { label: '10% margin', bidTotal: totalNetRevenue - totalRepair - (totalSale * 0.10), bidUnit: (totalNetRevenue - totalRepair - (totalSale * 0.10)) / qty },
    { label: '20% margin', bidTotal: totalNetRevenue - totalRepair - (totalSale * 0.20), bidUnit: (totalNetRevenue - totalRepair - (totalSale * 0.20)) / qty },
    { label: '30% margin', bidTotal: totalNetRevenue - totalRepair - (totalSale * 0.30), bidUnit: (totalNetRevenue - totalRepair - (totalSale * 0.30)) / qty },
    { label: 'Breakeven', bidTotal: breakevenTotal, bidUnit: breakevenPerUnit },
  ].filter(s => s.bidTotal > 0) : []

  const saveCalc = () => {
    if (!totalSale) return
    const name = saveName.trim() || 'Calc ' + (savedCalcs.length + 1)
    setSavedCalcs(prev => [{
      name, platform, salePrice: salePricePerUnit, quantity: qty,
      maxBidTotal, maxBidPerUnit, breakevenTotal, breakevenPerUnit,
      margin: marginAtMaxBid, profit: profitAtMaxBid,
      id: Date.now()
    }, ...prev].slice(0, 10))
    setSaveName('')
  }

  return (
    <div>
      <div style={{ marginBottom:'1rem' }}>
        <h2 style={{ fontSize:16, fontWeight:600, marginBottom:4 }}>Profit Calculator</h2>
        <p style={{ fontSize:13, color:'var(--c-text2)' }}>Enter expected sale price per unit to find your maximum bid and breakeven point.</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
        {/* Left: Inputs */}
        <div>
          <div className="card">
            <div className="card-title">Sale details</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div className="form-group">
                <label className="form-label">Platform</label>
                <select value={platform} onChange={e => setPlatform(e.target.value)}>
                  {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div className="form-group">
                  <label className="form-label">Sale price per unit $</label>
                  <input type="number" placeholder="0.00" min="0" step="0.01"
                    value={salePrice} onChange={e => setSalePrice(e.target.value)}
                    style={{ fontSize:16, fontWeight:600 }} autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Quantity (units)</label>
                  <input type="number" placeholder="1" min="1" step="1"
                    value={quantity} onChange={e => setQuantity(e.target.value)} />
                </div>
              </div>
              {qty > 1 && salePricePerUnit > 0 && (
                <div style={{ padding:'8px 12px', background:'var(--c-surface2)', borderRadius:8, fontSize:13, color:'var(--c-text2)' }}>
                  Total sale value: <strong style={{ color:'var(--c-text)' }}>{fmt(totalSale)}</strong> ({qty} × {fmt(salePricePerUnit)})
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Costs (per unit)</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div className="form-group">
                  <label className="form-label">Selling fee %</label>
                  <input type="number" placeholder="0" min="0" step="0.1"
                    value={sellingFeeRate} onChange={e => setSellingFeeRate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Ad fee %</label>
                  <input type="number" placeholder="0" min="0" step="0.1"
                    value={adFeeRate} onChange={e => setAdFeeRate(e.target.value)} />
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div className="form-group">
                  <label className="form-label">Shipping per unit $</label>
                  <input type="number" placeholder="0.00" min="0" step="0.01"
                    value={shippingCost} onChange={e => setShippingCost(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Repair / parts per unit $</label>
                  <input type="number" placeholder="0.00" min="0" step="0.01"
                    value={repairCost} onChange={e => setRepairCost(e.target.value)} />
                </div>
              </div>
              {qty > 1 && (
                <div style={{ padding:'8px 12px', background:'var(--c-surface2)', borderRadius:8, fontSize:12, color:'var(--c-text3)' }}>
                  Total shipping: {fmt(totalShip)} · Total repair: {fmt(totalRepair)}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Target margin</div>
            <div className="form-group">
              <label className="form-label">Minimum profit margin %</label>
              <input type="number" placeholder="20" min="0" max="100" step="1"
                value={targetMargin} onChange={e => setTargetMargin(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div>
          {totalSale > 0 ? (
            <>
              {/* Main result */}
              <div className="card" style={{ background: maxBidTotal > 0 ? 'var(--c-green-bg)' : 'var(--c-red-bg)', border: '1px solid ' + (maxBidTotal > 0 ? 'rgba(26,122,74,0.2)' : 'rgba(192,57,43,0.2)') }}>
                <div style={{ textAlign:'center', padding:'8px 0' }}>
                  <div style={{ fontSize:12, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color: maxBidTotal > 0 ? 'var(--c-green)' : 'var(--c-red)', marginBottom:6 }}>
                    Max bid at {pct(targetMargin)} margin
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns: qty > 1 ? '1fr 1fr' : '1fr', gap:16, marginBottom:8 }}>
                    {qty > 1 && (
                      <div>
                        <div style={{ fontSize:11, color:'var(--c-text2)', marginBottom:2 }}>Total lot bid</div>
                        <div style={{ fontSize:32, fontWeight:700, fontFamily:"'DM Mono',monospace", letterSpacing:'-1px', color: maxBidTotal > 0 ? 'var(--c-green)' : 'var(--c-red)', lineHeight:1 }}>
                          {fmt(maxBidTotal)}
                        </div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize:11, color:'var(--c-text2)', marginBottom:2 }}>{qty > 1 ? 'Per unit' : 'Max bid'}</div>
                      <div style={{ fontSize: qty > 1 ? 28 : 48, fontWeight:700, fontFamily:"'DM Mono',monospace", letterSpacing:'-1px', color: maxBidTotal > 0 ? 'var(--c-green)' : 'var(--c-red)', lineHeight:1 }}>
                        {fmt(maxBidPerUnit)}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize:13, color:'var(--c-text2)' }}>
                    Profit: {fmt(profitAtMaxBid)}{qty > 1 ? ' (' + fmt(profitAtMaxBid/qty) + '/unit)' : ''} · {pct(marginAtMaxBid)} margin
                  </div>
                </div>
              </div>

              {/* Cost breakdown */}
              <div className="card">
                <div className="card-title">Cost breakdown {qty > 1 ? '(total for ' + qty + ' units)' : ''}</div>
                {[
                  { label: 'Total sale' + (qty > 1 ? ' (' + qty + ' × ' + fmt(salePricePerUnit) + ')' : ''), value: totalSale, color:'var(--c-green)', bold:true },
                  { label: 'Selling fees (' + pct(sellingFeeRate) + ')', value: -totalSellFee, color:'var(--c-amber)' },
                  { label: 'Ad fees (' + pct(adFeeRate) + ')', value: -totalAdFee, color:'var(--c-amber)' },
                  { label: 'Shipping' + (qty > 1 ? ' (' + qty + ' × ' + fmt(shipPerUnit) + ')' : ''), value: -totalShip, color:'var(--c-amber)' },
                  { label: 'Repair / parts' + (qty > 1 ? ' (' + qty + ' × ' + fmt(repairPerUnit) + ')' : ''), value: -totalRepair, color:'var(--c-amber)', show: totalRepair > 0 },
                  { label: 'Net revenue', value: totalNetRevenue, color:'var(--c-text)', bold:true, divider:true },
                  { label: 'Max bid (your cost)', value: -maxBidTotal, color:'var(--c-brand)' },
                  { label: qty > 1 ? '  → per unit' : null, value: maxBidPerUnit, color:'var(--c-text3)', small:true, show: qty > 1 },
                  { label: 'Profit', value: profitAtMaxBid, color: profitAtMaxBid >= 0 ? 'var(--c-green)' : 'var(--c-red)', bold:true, divider:true },
                  { label: qty > 1 ? '  → per unit' : null, value: profitAtMaxBid/qty, color:'var(--c-text3)', small:true, show: qty > 1 },
                ].filter(r => r.show !== false && r.label !== null).map((r, i) => (
                  <div key={i}>
                    {r.divider && <div style={{ borderTop:'1px solid var(--c-border)', margin:'6px 0' }} />}
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize: r.small ? 12 : 13 }}>
                      <span style={{ color:'var(--c-text2)' }}>{r.label}</span>
                      <span style={{ fontFamily:"'DM Mono',monospace", fontWeight: r.bold ? 600 : 400, color: r.color }}>
                        {r.value < 0 ? '-' : ''}{fmt(Math.abs(r.value))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bid scenarios */}
              <div className="card">
                <div className="card-title">Bid scenarios</div>
                <div style={{ display:'grid', gridTemplateColumns: qty > 1 ? '90px 1fr 1fr 1fr' : '90px 1fr 1fr', gap:4, marginBottom:6, fontSize:11, color:'var(--c-text3)', padding:'0 10px' }}>
                  <span></span>
                  {qty > 1 && <span>Lot total</span>}
                  <span>Per unit</span>
                  <span>Profit</span>
                </div>
                {bidScenarios.map((s, i) => {
                  const scenarioProfit = totalNetRevenue - totalRepair - s.bidTotal
                  return (
                    <div key={i} style={{
                      display:'grid', gridTemplateColumns: qty > 1 ? '90px 1fr 1fr 1fr' : '90px 1fr 1fr',
                      alignItems:'center', gap:4, padding:'7px 10px',
                      borderRadius:8, marginBottom:4,
                      background: s.highlight ? 'var(--c-brand-bg)' : 'transparent',
                      border: s.highlight ? '1px solid rgba(14,165,233,0.2)' : '1px solid transparent'
                    }}>
                      <span style={{ fontSize:12, color: s.highlight ? 'var(--c-brand)' : 'var(--c-text2)', fontWeight: s.highlight ? 600 : 400 }}>{s.label}</span>
                      {qty > 1 && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:13, fontWeight:600 }}>{fmt(s.bidTotal)}</span>}
                      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:13, fontWeight: qty === 1 ? 600 : 400, color: qty > 1 ? 'var(--c-text2)' : 'var(--c-text)' }}>{fmt(s.bidUnit)}</span>
                      <span style={{ fontSize:12, color: scenarioProfit >= 0 ? 'var(--c-green)' : 'var(--c-red)', fontWeight:500 }}>{fmt(scenarioProfit)}</span>
                    </div>
                  )
                })}
              </div>

              {/* Save */}
              <div className="card">
                <div className="card-title">Save this calculation</div>
                <div style={{ display:'flex', gap:8 }}>
                  <input type="text" placeholder="e.g. iPhone 12 lot — eBay" value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveCalc()} />
                  <button className="btn btn-primary" onClick={saveCalc} style={{ flexShrink:0 }}>Save</button>
                </div>
              </div>
            </>
          ) : (
            <div className="card" style={{ textAlign:'center', padding:'3rem 1rem' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🧮</div>
              <div style={{ fontSize:15, fontWeight:500, marginBottom:6 }}>Enter a sale price to calculate</div>
              <div style={{ fontSize:13, color:'var(--c-text2)' }}>Platform fees auto-fill. Set quantity for lot purchases.</div>
            </div>
          )}
        </div>
      </div>

      {/* Saved calculations */}
      {savedCalcs.length > 0 && (
        <div className="card" style={{ marginTop:'1rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <span className="card-title" style={{ margin:0 }}>Saved calculations</span>
            <button className="btn btn-sm" onClick={() => setSavedCalcs([])}>Clear all</button>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Platform</th>
                  <th>Sale/unit</th>
                  <th>Qty</th>
                  <th>Max bid (lot)</th>
                  <th>Max bid/unit</th>
                  <th>Profit</th>
                  <th>Margin</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {savedCalcs.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight:500 }}>{c.name}</td>
                    <td><span className="badge badge-brand">{c.platform}</span></td>
                    <td className="mono">{fmt(c.salePrice)}</td>
                    <td style={{ color:'var(--c-text2)' }}>{c.quantity}</td>
                    <td className="mono" style={{ color:'var(--c-brand)', fontWeight:600 }}>{fmt(c.maxBidTotal)}</td>
                    <td className="mono" style={{ color:'var(--c-text2)' }}>{fmt(c.maxBidPerUnit)}</td>
                    <td className="mono profit-positive">{fmt(c.profit)}</td>
                    <td><span className={`badge ${c.margin >= 20 ? 'badge-green' : c.margin >= 10 ? 'badge-amber' : 'badge-red'}`}>{c.margin.toFixed(1)}%</span></td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => setSavedCalcs(prev => prev.filter(s => s.id !== c.id))}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
