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
  const [sellingFeeRate, setSellingFeeRate] = useState(13.25)
  const [adFeeRate, setAdFeeRate] = useState(2)
  const [shippingCost, setShippingCost] = useState(8)
  const [repairCost, setRepairCost] = useState('')
  const [targetMargin, setTargetMargin] = useState(20)
  const [savedCalcs, setSavedCalcs] = useState([])
  const [saveName, setSaveName] = useState('')

  // Update defaults when platform changes
  useEffect(() => {
    const d = PLATFORM_DEFAULTS[platform]
    if (d) {
      setSellingFeeRate(d.sellingFeeRate)
      setAdFeeRate(d.adFeeRate)
      setShippingCost(d.shippingEstimate)
    }
  }, [platform])

  const sale = parseFloat(salePrice) || 0
  const sellFee = sale * (parseFloat(sellingFeeRate)||0) / 100
  const adFee = sale * (parseFloat(adFeeRate)||0) / 100
  const ship = parseFloat(shippingCost) || 0
  const repair = parseFloat(repairCost) || 0
  const totalCosts = sellFee + adFee + ship + repair
  const netRevenue = sale - sellFee - adFee - ship

  // Max bid = what you can pay and still hit target margin
  const targetMarginDec = (parseFloat(targetMargin)||0) / 100
  const maxBid = sale > 0 ? Math.max(0, netRevenue - repair - (sale * targetMarginDec)) : 0

  // Breakeven bid (0% margin)
  const breakevenBid = Math.max(0, netRevenue - repair)

  // Profit at various bid prices
  const bidScenarios = sale > 0 ? [
    { label: 'Max bid', bid: maxBid, highlight: true },
    { label: '10% margin', bid: netRevenue - repair - (sale * 0.10) },
    { label: '20% margin', bid: netRevenue - repair - (sale * 0.20) },
    { label: '30% margin', bid: netRevenue - repair - (sale * 0.30) },
    { label: 'Breakeven', bid: breakevenBid },
  ].filter(s => s.bid > 0) : []

  const profitAtMaxBid = sale > 0 ? netRevenue - repair - maxBid : 0
  const marginAtMaxBid = sale > 0 ? (profitAtMaxBid / sale * 100) : 0

  const saveCalc = () => {
    if (!sale) return
    const name = saveName.trim() || 'Calc ' + (savedCalcs.length + 1)
    setSavedCalcs(prev => [{
      name, platform, salePrice: sale, maxBid, breakevenBid,
      margin: marginAtMaxBid, profit: profitAtMaxBid,
      id: Date.now()
    }, ...prev].slice(0, 10))
    setSaveName('')
  }

  return (
    <div>
      <div style={{ marginBottom:'1rem' }}>
        <h2 style={{ fontSize:16, fontWeight:600, marginBottom:4 }}>Profit Calculator</h2>
        <p style={{ fontSize:13, color:'var(--c-text2)' }}>Enter expected sale price to find your maximum bid and breakeven point.</p>
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
              <div className="form-group">
                <label className="form-label">Expected sale price $</label>
                <input type="number" placeholder="0.00" min="0" step="0.01"
                  value={salePrice} onChange={e => setSalePrice(e.target.value)}
                  style={{ fontSize:18, fontWeight:600 }} autoFocus />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Costs</div>
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
                  <label className="form-label">Shipping $</label>
                  <input type="number" placeholder="0.00" min="0" step="0.01"
                    value={shippingCost} onChange={e => setShippingCost(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Repair / parts $</label>
                  <input type="number" placeholder="0.00" min="0" step="0.01"
                    value={repairCost} onChange={e => setRepairCost(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Target margin</div>
            <div className="form-group">
              <label className="form-label">Minimum profit margin %</label>
              <input type="number" placeholder="20" min="0" max="100" step="1"
                value={targetMargin} onChange={e => setTargetMargin(e.target.value)} />
            </div>
            <p style={{ fontSize:12, color:'var(--c-text3)', marginTop:8 }}>
              Max bid is calculated so your profit equals this % of the sale price.
            </p>
          </div>
        </div>

        {/* Right: Results */}
        <div>
          {sale > 0 ? (
            <>
              {/* Main result */}
              <div className="card" style={{ background: maxBid > 0 ? 'var(--c-green-bg)' : 'var(--c-red-bg)', border: '1px solid ' + (maxBid > 0 ? 'rgba(26,122,74,0.2)' : 'rgba(192,57,43,0.2)') }}>
                <div style={{ textAlign:'center', padding:'8px 0' }}>
                  <div style={{ fontSize:12, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color: maxBid > 0 ? 'var(--c-green)' : 'var(--c-red)', marginBottom:6 }}>
                    Max bid at {pct(targetMargin)} margin
                  </div>
                  <div style={{ fontSize:48, fontWeight:700, fontFamily:"'DM Mono',monospace", letterSpacing:'-2px', color: maxBid > 0 ? 'var(--c-green)' : 'var(--c-red)', lineHeight:1 }}>
                    {fmt(maxBid)}
                  </div>
                  <div style={{ fontSize:13, color:'var(--c-text2)', marginTop:8 }}>
                    Profit: {fmt(profitAtMaxBid)} · {pct(marginAtMaxBid)} margin
                  </div>
                </div>
              </div>

              {/* Cost breakdown */}
              <div className="card">
                <div className="card-title">Cost breakdown</div>
                {[
                  { label: 'Sale price', value: sale, color: 'var(--c-green)', bold: true },
                  { label: 'Selling fee (' + pct(sellingFeeRate) + ')', value: -sellFee, color: 'var(--c-amber)' },
                  { label: 'Ad fee (' + pct(adFeeRate) + ')', value: -adFee, color: 'var(--c-amber)' },
                  { label: 'Shipping', value: -ship, color: 'var(--c-amber)' },
                  { label: 'Repair / parts', value: -repair, color: 'var(--c-amber)', show: repair > 0 },
                  { label: 'Net revenue', value: netRevenue, color: 'var(--c-text)', bold: true, divider: true },
                  { label: 'Max bid (your cost)', value: -maxBid, color: 'var(--c-brand)' },
                  { label: 'Profit', value: profitAtMaxBid, color: profitAtMaxBid >= 0 ? 'var(--c-green)' : 'var(--c-red)', bold: true, divider: true },
                ].filter(r => r.show !== false).map((r, i) => (
                  <div key={i}>
                    {r.divider && <div style={{ borderTop:'1px solid var(--c-border)', margin:'6px 0' }} />}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', fontSize:13 }}>
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
                {bidScenarios.map((s, i) => {
                  const scenarioProfit = netRevenue - repair - s.bid
                  const scenarioMargin = sale > 0 ? (scenarioProfit / sale * 100) : 0
                  return (
                    <div key={i} style={{
                      display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
                      borderRadius:8, marginBottom:4,
                      background: s.highlight ? 'var(--c-brand-bg)' : 'transparent',
                      border: s.highlight ? '1px solid rgba(14,165,233,0.2)' : '1px solid transparent'
                    }}>
                      <span style={{ fontSize:12, color: s.highlight ? 'var(--c-brand)' : 'var(--c-text2)', minWidth:90, fontWeight: s.highlight ? 600 : 400 }}>{s.label}</span>
                      <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:600, fontSize:14 }}>{fmt(s.bid)}</span>
                      <span style={{ marginLeft:'auto', fontSize:12, color:'var(--c-text3)' }}>profit: <strong style={{ color: scenarioProfit >= 0 ? 'var(--c-green)' : 'var(--c-red)' }}>{fmt(scenarioProfit)}</strong></span>
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
              <div style={{ fontSize:13, color:'var(--c-text2)' }}>Platform fees auto-fill based on your selected platform.</div>
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
                  <th>Sale price</th>
                  <th>Max bid</th>
                  <th>Breakeven</th>
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
                    <td className="mono" style={{ color:'var(--c-brand)', fontWeight:600 }}>{fmt(c.maxBid)}</td>
                    <td className="mono" style={{ color:'var(--c-text2)' }}>{fmt(c.breakevenBid)}</td>
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
