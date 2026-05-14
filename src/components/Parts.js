import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const today = () => new Date().toISOString().slice(0, 10)
const fmtMoney = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })

export default function Parts({ parts, partLots, setSyncing }) {
  const [activeTab, setActiveTab] = useState('inventory')

  // Lot header form
  const [lotHeader, setLotHeader] = useState({
    purchase_date: today(), lot_price: '', shipping: '', tariffs: '', vendor: '', notes: ''
  })
  // Line items — each part type in the lot
  const [lineItems, setLineItems] = useState([
    { part_name: '', color: '', quantity: '' }
  ])
  const [addingLot, setAddingLot] = useState(false)
  const [useForm, setUseForm] = useState({ part_id: '', order_number: '', notes: '' })
  const [usingPart, setUsingPart] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('Available')

  const setHeader = (k, v) => setLotHeader(prev => ({ ...prev, [k]: v }))
  const setUse = (k, v) => setUseForm(prev => ({ ...prev, [k]: v }))

  const updateLine = (i, k, v) => setLineItems(prev => prev.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  const addLine = () => setLineItems(prev => [...prev, { part_name: '', color: '', quantity: '' }])
  const removeLine = (i) => setLineItems(prev => prev.filter((_, idx) => idx !== i))

  const totalQty = lineItems.reduce((s, l) => s + (parseInt(l.quantity)||0), 0)
  const lotTotal = (parseFloat(lotHeader.lot_price)||0) + (parseFloat(lotHeader.shipping)||0) + (parseFloat(lotHeader.tariffs)||0)
  const costPerUnit = totalQty > 0 ? lotTotal / totalQty : 0

  const submitLot = async () => {
    const validLines = lineItems.filter(l => l.part_name.trim() && parseInt(l.quantity) > 0)
    if (validLines.length === 0 || !lotHeader.lot_price) return
    setAddingLot(true); setSyncing(true)

    // Create lot record with summary name
    const lotName = validLines.length === 1
      ? validLines[0].part_name.trim()
      : `Assorted (${validLines.length} types)`

    const { data: lot } = await supabase.from('part_lots').insert({
      part_name: lotName,
      purchase_date: lotHeader.purchase_date,
      lot_price: parseFloat(lotHeader.lot_price)||0,
      quantity: totalQty,
      shipping: parseFloat(lotHeader.shipping)||0,
      tariffs: parseFloat(lotHeader.tariffs)||0,
      total_cost: lotTotal,
      cost_per_unit: costPerUnit,
      vendor: lotHeader.vendor.trim() || null,
      notes: lotHeader.notes.trim() || null,
    }).select().single()

    if (lot) {
      // Create individual parts for each line item
      const partRecords = []
      for (const line of validLines) {
        const qty = parseInt(line.quantity)
        for (let i = 0; i < qty; i++) {
          partRecords.push({
            lot_id: lot.id,
            part_name: line.part_name.trim(),
            color: line.color.trim() || null,
            cost: costPerUnit,
            status: 'Available',
            purchase_date: lotHeader.purchase_date,
          })
        }
      }
      for (let i = 0; i < partRecords.length; i += 50) {
        await supabase.from('parts').insert(partRecords.slice(i, i + 50))
      }
    }

    setLotHeader({ purchase_date: today(), lot_price: '', shipping: '', tariffs: '', vendor: '', notes: '' })
    setLineItems([{ part_name: '', color: '', quantity: '' }])
    setAddingLot(false); setSyncing(false)
  }

  const usePart = async () => {
    if (!useForm.part_id || !useForm.order_number.trim()) return
    setUsingPart(true); setSyncing(true)
    await supabase.from('parts').update({
      status: 'Used',
      order_number: useForm.order_number.trim(),
      notes: useForm.notes.trim() || null,
    }).eq('id', useForm.part_id)
    setUseForm({ part_id:'', order_number:'', notes:'' })
    setUsingPart(false); setSyncing(false)
  }

  const deletePart = async (id) => {
    if (!window.confirm('Delete this part?')) return
    setSyncing(true)
    await supabase.from('parts').delete().eq('id', id)
    setSyncing(false)
  }

  const deleteLot = async (id) => {
    if (!window.confirm('Delete this lot and all its parts?')) return
    setSyncing(true)
    await supabase.from('parts').delete().eq('lot_id', id)
    await supabase.from('part_lots').delete().eq('id', id)
    setSyncing(false)
  }

  const availableParts = parts.filter(p => p.status === 'Available')
  const usedParts = parts.filter(p => p.status === 'Used')
  const totalSpent = partLots.reduce((s, l) => s + parseFloat(l.total_cost||0), 0)
  const availableValue = availableParts.reduce((s, p) => s + parseFloat(p.cost||0), 0)

  // Group available parts by name+color for the use dropdown
  const availableGroups = {}
  availableParts.forEach(p => {
    const key = p.part_name + (p.color ? ` — ${p.color}` : '')
    if (!availableGroups[key]) availableGroups[key] = []
    availableGroups[key].push(p)
  })

  const filteredParts = parts.filter(p => {
    const matchStatus = !filterStatus || p.status === filterStatus
    const matchSearch = !search ||
      p.part_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.color?.toLowerCase().includes(search.toLowerCase()) ||
      p.order_number?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  return (
    <div>
      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:'1rem' }}>
        {[
          { label:'Available parts', value:availableParts.length, color:'var(--c-green)' },
          { label:'Used parts', value:usedParts.length, color:'var(--c-text2)' },
          { label:'Total spent on parts', value:fmtMoney(totalSpent), color:'var(--c-text)' },
          { label:'Available inventory value', value:fmtMoney(availableValue), color:'var(--c-brand)' },
        ].map(m => (
          <div key={m.label} className="stat-card">
            <div className="stat-label">{m.label}</div>
            <div className="stat-value" style={{ fontSize:20, color:m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Sub tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:'1rem' }}>
        {[['inventory','Parts Inventory'],['lots','Purchase Lots'],['use','Use a Part']].map(([k,v]) => (
          <button key={k} className={`btn btn-sm ${activeTab===k?'btn-primary':''}`} onClick={() => setActiveTab(k)}>{v}</button>
        ))}
      </div>

      {/* Purchase Lots */}
      {activeTab === 'lots' && (
        <div>
          <div className="card">
            <div className="card-title">Add parts lot</div>

            {/* Lot header — pricing and logistics */}
            <div className="form-grid form-grid-4" style={{ marginBottom:10 }}>
              <div className="form-group">
                <label className="form-label">Purchase date</label>
                <input type="date" value={lotHeader.purchase_date} onChange={e => setHeader('purchase_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Lot price $ *</label>
                <input type="number" placeholder="0.00" min="0" step="0.01" value={lotHeader.lot_price} onChange={e => setHeader('lot_price', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Shipping $</label>
                <input type="number" placeholder="0.00" min="0" step="0.01" value={lotHeader.shipping} onChange={e => setHeader('shipping', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Tariffs $</label>
                <input type="number" placeholder="0.00" min="0" step="0.01" value={lotHeader.tariffs} onChange={e => setHeader('tariffs', e.target.value)} />
              </div>
            </div>
            <div className="form-grid form-grid-2" style={{ marginBottom:14 }}>
              <div className="form-group">
                <label className="form-label">Vendor</label>
                <input type="text" placeholder="e.g. iFixit, AliExpress" value={lotHeader.vendor} onChange={e => setHeader('vendor', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input type="text" placeholder="Any notes about this lot" value={lotHeader.notes} onChange={e => setHeader('notes', e.target.value)} />
              </div>
            </div>

            {/* Line items — part types */}
            <div style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <label className="form-label" style={{ margin:0 }}>Parts in this lot *</label>
                <button className="btn btn-sm" onClick={addLine}>+ Add part type</button>
              </div>
              {/* Header row */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 80px 28px', gap:6, marginBottom:4, padding:'0 4px' }}>
                <span style={{ fontSize:11, color:'var(--c-text3)' }}>Part name</span>
                <span style={{ fontSize:11, color:'var(--c-text3)' }}>Color</span>
                <span style={{ fontSize:11, color:'var(--c-text3)' }}>Qty</span>
                <span></span>
              </div>
              {lineItems.map((line, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 120px 80px 28px', gap:6, marginBottom:6 }}>
                  <input type="text" placeholder="e.g. iPhone 12 Screen" value={line.part_name}
                    onChange={e => updateLine(i, 'part_name', e.target.value)} />
                  <input type="text" placeholder="e.g. Black" value={line.color}
                    onChange={e => updateLine(i, 'color', e.target.value)} />
                  <input type="number" placeholder="0" min="1" step="1" value={line.quantity}
                    onChange={e => updateLine(i, 'quantity', e.target.value)} />
                  <button className="btn btn-sm btn-danger" onClick={() => removeLine(i)}
                    disabled={lineItems.length === 1} style={{ padding:'0 8px' }}>×</button>
                </div>
              ))}
            </div>

            {/* Cost breakdown preview */}
            {lotHeader.lot_price && totalQty > 0 && (
              <div style={{ padding:'10px 14px', background:'var(--c-surface2)', borderRadius:8, marginBottom:12, fontSize:13 }}>
                <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom: lineItems.filter(l=>l.part_name&&l.quantity).length > 1 ? 8 : 0 }}>
                  <span>Total: <strong>{fmtMoney(lotTotal)}</strong></span>
                  <span>Total qty: <strong>{totalQty}</strong></span>
                  <span>Cost per unit: <strong style={{ color:'var(--c-brand)' }}>{fmtMoney(costPerUnit)}</strong></span>
                </div>
                {lineItems.filter(l => l.part_name.trim() && parseInt(l.quantity) > 0).length > 1 && (
                  <div style={{ borderTop:'1px solid var(--c-border)', paddingTop:6, display:'flex', flexWrap:'wrap', gap:8 }}>
                    {lineItems.filter(l => l.part_name.trim() && parseInt(l.quantity) > 0).map((l, i) => (
                      <span key={i} style={{ fontSize:12, color:'var(--c-text2)' }}>
                        {l.part_name.trim()}{l.color ? ` (${l.color})` : ''}: <strong>{parseInt(l.quantity)} × {fmtMoney(costPerUnit)}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button className="btn btn-primary" onClick={submitLot} disabled={addingLot}>{addingLot ? 'Saving…' : 'Add lot'}</button>
          </div>

          <div className="card">
            <div className="card-title">{partLots.length} purchase lots · {fmtMoney(totalSpent)} total</div>
            {partLots.length === 0
              ? <div className="empty"><div className="empty-icon">📦</div>No lots yet.</div>
              : (
                <div style={{ overflowX:'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Part</th>
                        <th>Color</th>
                        <th>Qty</th>
                        <th className="hide-mobile">Lot price</th>
                        <th className="hide-mobile">Shipping</th>
                        <th className="hide-mobile">Tariffs</th>
                        <th>Total</th>
                        <th>Per unit</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...partLots].sort((a,b) => b.purchase_date?.localeCompare(a.purchase_date)).map(l => (
                        <tr key={l.id}>
                          <td style={{ fontSize:12, color:'var(--c-text2)' }}>{l.purchase_date}</td>
                          <td style={{ fontWeight:500 }}>
                            {l.part_name}
                            {l.notes && <div style={{ fontSize:11, color:'var(--c-text3)' }}>{l.notes}</div>}
                          </td>
                          <td style={{ fontSize:12, color:'var(--c-text2)' }}>{l.color || '—'}</td>
                          <td style={{ color:'var(--c-text2)' }}>{l.quantity}</td>
                          <td className="hide-mobile mono">{fmtMoney(l.lot_price)}</td>
                          <td className="hide-mobile mono" style={{ color:'var(--c-amber)' }}>{parseFloat(l.shipping||0)>0?fmtMoney(l.shipping):'—'}</td>
                          <td className="hide-mobile mono" style={{ color:'var(--c-amber)' }}>{parseFloat(l.tariffs||0)>0?fmtMoney(l.tariffs):'—'}</td>
                          <td className="mono" style={{ fontWeight:500 }}>{fmtMoney(l.total_cost)}</td>
                          <td className="mono" style={{ color:'var(--c-brand)' }}>{fmtMoney(l.cost_per_unit)}</td>
                          <td><button className="btn btn-sm btn-danger" onClick={() => deleteLot(l.id)}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        </div>
      )}

      {/* Parts Inventory */}
      {activeTab === 'inventory' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{filteredParts.length} parts</span>
            <div style={{ display:'flex', gap:8 }}>
              <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ height:32, width:140, fontSize:13 }} />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                style={{ height:32, width:110, fontSize:12 }}>
                <option value="">All</option>
                <option value="Available">Available</option>
                <option value="Used">Used</option>
              </select>
            </div>
          </div>
          {filteredParts.length === 0
            ? <div className="empty"><div className="empty-icon">🔧</div>No parts yet. Add a lot purchase first.</div>
            : (
              <div style={{ overflowX:'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Part name</th>
                      <th>Color</th>
                      <th>Cost</th>
                      <th>Status</th>
                      <th className="hide-mobile">Order #</th>
                      <th className="hide-mobile">Purchase date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParts.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight:500 }}>{p.part_name}</td>
                        <td style={{ fontSize:12, color:'var(--c-text2)' }}>{p.color || '—'}</td>
                        <td className="mono" style={{ color:'var(--c-text2)' }}>{fmtMoney(p.cost)}</td>
                        <td><span className={`badge ${p.status==='Available'?'badge-green':'badge-gray'}`}>{p.status}</span></td>
                        <td className="hide-mobile" style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:'var(--c-text2)' }}>
                          {p.order_number || '—'}
                        </td>
                        <td className="hide-mobile" style={{ fontSize:12, color:'var(--c-text3)' }}>{p.purchase_date || '—'}</td>
                        <td><button className="btn btn-sm btn-danger" onClick={() => deletePart(p.id)}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}

      {/* Use a Part */}
      {activeTab === 'use' && (
        <div className="card">
          <div className="card-title">Use a part on an order</div>
          {Object.keys(availableGroups).length === 0
            ? <div className="empty"><div className="empty-icon">🔧</div>No available parts.</div>
            : (
              <div style={{ display:'flex', flexDirection:'column', gap:10, maxWidth:480 }}>
                <div className="form-group">
                  <label className="form-label">Select part *</label>
                  <select value={useForm.part_id} onChange={e => setUse('part_id', e.target.value)}>
                    <option value="">— Choose a part —</option>
                    {Object.entries(availableGroups).map(([key, items]) => (
                      <option key={items[0].id} value={items[0].id}>
                        {key} · {items.length} available · {fmtMoney(items[0].cost)} ea
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Order number *</label>
                  <input type="text" placeholder="e.g. 12-34567-89012" value={useForm.order_number} onChange={e => setUse('order_number', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes (optional)</label>
                  <input type="text" placeholder="e.g. Screen replacement" value={useForm.notes} onChange={e => setUse('notes', e.target.value)} />
                </div>
                <button className="btn btn-primary" style={{ alignSelf:'flex-start' }} onClick={usePart} disabled={usingPart}>
                  {usingPart ? 'Saving…' : 'Mark part as used'}
                </button>
              </div>
            )
          }
        </div>
      )}
    </div>
  )
}
