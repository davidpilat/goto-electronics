import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const today = () => new Date().toISOString().slice(0, 10)
const fmtMoney = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })

export default function Parts({ parts, partLots, setSyncing }) {
  const [activeTab, setActiveTab] = useState('inventory')

  // Lot header form
  const [lotHeader, setLotHeader] = useState({
    purchase_date: today(), shipping: '', tariffs: '', vendor: '', notes: ''
  })
  // Line items — each part type in the lot
  const [lineItems, setLineItems] = useState([
    { part_name: '', brand: '', color: '', quantity: '', price: '' }
  ])
  const [addingLot, setAddingLot] = useState(false)
  const [useForm, setUseForm] = useState({ part_id: '', order_number: '', serial_number: '', notes: '' })
  const [usingPart, setUsingPart] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('Available')
  const [expandedLots, setExpandedLots] = useState({})
  const [addingToLot, setAddingToLot] = useState(null)
  const [addToLotLine, setAddToLotLine] = useState({ part_name:'', color:'', quantity:'', price:'' })
  const [editPartId, setEditPartId] = useState(null)
  const [editPartForm, setEditPartForm] = useState({})
  // Cascading selectors for Use a Part
  const [filterBrand, setFilterBrand] = useState('')
  const [filterColor, setFilterColor] = useState('')

  const setHeader = (k, v) => setLotHeader(prev => ({ ...prev, [k]: v }))
  const setUse = (k, v) => setUseForm(prev => ({ ...prev, [k]: v }))

  const updateLine = (i, k, v) => setLineItems(prev => prev.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  const addLine = () => setLineItems(prev => [...prev, { part_name: '', brand: '', color: '', quantity: '', price: '' }])
  const removeLine = (i) => setLineItems(prev => prev.filter((_, idx) => idx !== i))

  const totalQty = lineItems.reduce((s, l) => s + (parseInt(l.quantity)||0), 0)
  const partsSubtotal = lineItems.reduce((s, l) => s + (parseFloat(l.price)||0) * (parseInt(l.quantity)||0), 0)
  const shippingTotal = parseFloat(lotHeader.shipping)||0
  const tariffsTotal = parseFloat(lotHeader.tariffs)||0
  const lotTotal = partsSubtotal + shippingTotal + tariffsTotal
  const shippingPerUnit = totalQty > 0 ? shippingTotal / totalQty : 0
  const tariffsPerUnit = totalQty > 0 ? tariffsTotal / totalQty : 0

  const submitLot = async () => {
    const validLines = lineItems.filter(l => (l.part_name||'').trim() && parseInt(l.quantity) > 0)
    if (validLines.length === 0 || partsSubtotal === 0) return
    setAddingLot(true); setSyncing(true)

    const lotName = validLines.length === 1
      ? validLines[0].part_name.trim()
      : `Assorted (${validLines.length} types)`

    const { data: lot } = await supabase.from('part_lots').insert({
      part_name: lotName,
      purchase_date: lotHeader.purchase_date,
      lot_price: partsSubtotal,
      quantity: totalQty,
      shipping: shippingTotal,
      tariffs: tariffsTotal,
      total_cost: lotTotal,
      cost_per_unit: totalQty > 0 ? lotTotal / totalQty : 0,
      vendor: lotHeader.vendor.trim() || null,
      notes: lotHeader.notes.trim() || null,
    }).select().single()

    if (lot) {
      const partRecords = []
      for (const line of validLines) {
        const qty = parseInt(line.quantity)
        const partPrice = parseFloat(line.price)||0
        // Each part's cost = its own price + its share of shipping + tariffs
        const costPerThisPart = partPrice + shippingPerUnit + tariffsPerUnit
        for (let i = 0; i < qty; i++) {
          partRecords.push({
            lot_id: lot.id,
            part_name: line.part_name.trim(),
            color: (line.color||'').trim() || null,
            brand: (line.brand||'').trim() || null,
            cost: costPerThisPart,
            status: 'Available',
            purchase_date: lotHeader.purchase_date,
          })
        }
      }
      for (let i = 0; i < partRecords.length; i += 50) {
        await supabase.from('parts').insert(partRecords.slice(i, i + 50))
      }
    }

    setLotHeader({ purchase_date: today(), shipping: '', tariffs: '', vendor: '', notes: '' })
    setLineItems([{ part_name: '', brand: '', color: '', quantity: '', price: '' }])
    setAddingLot(false); setSyncing(false)
  }

  const usePart = async () => {
    if (!useForm.part_id || !useForm.order_number.trim()) return
    setUsingPart(true); setSyncing(true)
    await supabase.from('parts').update({
      status: 'Used',
      order_number: useForm.order_number.trim(),
      serial_number: useForm.serial_number.trim() || null,
      notes: useForm.notes.trim() || null,
    }).eq('id', useForm.part_id)
    setUseForm({ part_id:'', order_number:'', serial_number:'', notes:'' })
    setUsingPart(false); setSyncing(false)
  }

  const deletePart = async (id) => {
    if (!window.confirm('Delete this part?')) return
    setSyncing(true)
    await supabase.from('parts').delete().eq('id', id)
    setSyncing(false)
  }

  const savePart = async (id) => {
    setSyncing(true)
    await supabase.from('parts').update({
      part_name: (editPartForm.part_name||'').trim(),
      brand: (editPartForm.brand||'').trim() || null,
      color: (editPartForm.color||'').trim() || null,
      cost: parseFloat(editPartForm.cost)||0,
      status: editPartForm.status,
      order_number: (editPartForm.order_number||'').trim() || null,
      serial_number: (editPartForm.serial_number||'').trim() || null,
      notes: (editPartForm.notes||'').trim() || null,
    }).eq('id', id)
    setEditPartId(null)
    setSyncing(false)
  }

  const deleteLot = async (id) => {
    if (!window.confirm('Delete this lot and all its parts?')) return
    setSyncing(true)
    await supabase.from('parts').delete().eq('lot_id', id)
    await supabase.from('part_lots').delete().eq('id', id)
    setSyncing(false)
  }

  const addPartsToLot = async (lot) => {
    const qty = parseInt(addToLotLine.quantity)
    if (!addToLotLine.part_name.trim() || !qty || qty < 1) return
    setSyncing(true)
    // Recalculate cost per unit for the existing lot based on new total qty
    const newTotalQty = lot.quantity + qty
    const partPrice = parseFloat(addToLotLine.price) || 0
    const addedSubtotal = partPrice * qty
    const newLotPrice = (parseFloat(lot.lot_price)||0) + addedSubtotal
    const newTotal = newLotPrice + (parseFloat(lot.shipping)||0) + (parseFloat(lot.tariffs)||0)
    const newCostPerUnit = newTotalQty > 0 ? newTotal / newTotalQty : 0
    const costForThisPart = partPrice + (parseFloat(lot.shipping)||0)/newTotalQty + (parseFloat(lot.tariffs)||0)/newTotalQty
    // Update lot totals
    await supabase.from('part_lots').update({
      quantity: newTotalQty,
      lot_price: newLotPrice,
      total_cost: newTotal,
      cost_per_unit: newCostPerUnit,
    }).eq('id', lot.id)
    // Create new part records
    const partRecords = Array.from({ length: qty }, () => ({
      lot_id: lot.id,
      part_name: addToLotLine.part_name.trim(),
      color: addToLotLine.color.trim() || null,
      cost: costForThisPart,
      status: 'Available',
      purchase_date: lot.purchase_date,
    }))
    for (let i = 0; i < partRecords.length; i += 50) {
      await supabase.from('parts').insert(partRecords.slice(i, i + 50))
    }
    setAddingToLot(null)
    setAddToLotLine({ part_name:'', color:'', quantity:'', price:'' })
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

            {/* Lot header */}
            <div className="form-grid form-grid-4" style={{ marginBottom:10 }}>
              <div className="form-group">
                <label className="form-label">Purchase date</label>
                <input type="date" value={lotHeader.purchase_date} onChange={e => setHeader('purchase_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Vendor</label>
                <input type="text" placeholder="e.g. iFixit, AliExpress" value={lotHeader.vendor} onChange={e => setHeader('vendor', e.target.value)} />
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
                <label className="form-label">Notes</label>
                <input type="text" placeholder="Any notes about this lot" value={lotHeader.notes} onChange={e => setHeader('notes', e.target.value)} />
              </div>
            </div>

            {/* Line items */}
            <div style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <label className="form-label" style={{ margin:0 }}>Parts in this lot *</label>
                <button className="btn btn-sm" onClick={addLine}>+ Add part type</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 70px 90px 28px', gap:6, marginBottom:4, padding:'0 4px' }}>
                <span style={{ fontSize:11, color:'var(--c-text3)' }}>Part name</span>
                <span style={{ fontSize:11, color:'var(--c-text3)' }}>Brand</span>
                <span style={{ fontSize:11, color:'var(--c-text3)' }}>Color</span>
                <span style={{ fontSize:11, color:'var(--c-text3)' }}>Qty</span>
                <span style={{ fontSize:11, color:'var(--c-text3)' }}>Price ea $</span>
                <span></span>
              </div>
              {lineItems.map((line, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 70px 90px 28px', gap:6, marginBottom:6 }}>
                  <input type="text" placeholder="e.g. iPhone 12 Screen" value={line.part_name}
                    onChange={e => updateLine(i, 'part_name', e.target.value)} />
                  <input type="text" placeholder="Apple" value={line.brand||''}
                    onChange={e => updateLine(i, 'brand', e.target.value)} />
                  <input type="text" placeholder="Black" value={line.color}
                    onChange={e => updateLine(i, 'color', e.target.value)} />
                  <input type="number" placeholder="0" min="1" step="1" value={line.quantity}
                    onChange={e => updateLine(i, 'quantity', e.target.value)} />
                  <input type="number" placeholder="0.00" min="0" step="0.01" value={line.price}
                    onChange={e => updateLine(i, 'price', e.target.value)} />
                  <button className="btn btn-sm btn-danger" onClick={() => removeLine(i)}
                    disabled={lineItems.length === 1} style={{ padding:'0 8px' }}>×</button>
                </div>
              ))}
            </div>

            {/* Cost breakdown preview */}
            {partsSubtotal > 0 && totalQty > 0 && (
              <div style={{ padding:'10px 14px', background:'var(--c-surface2)', borderRadius:8, marginBottom:12, fontSize:13 }}>
                <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:8 }}>
                  <span>Parts: <strong>{fmtMoney(partsSubtotal)}</strong></span>
                  {shippingTotal > 0 && <span>+ Shipping: <strong>{fmtMoney(shippingTotal)}</strong> ({fmtMoney(shippingPerUnit)}/unit)</span>}
                  {tariffsTotal > 0 && <span>+ Tariffs: <strong>{fmtMoney(tariffsTotal)}</strong> ({fmtMoney(tariffsPerUnit)}/unit)</span>}
                  <span>= <strong>Total: {fmtMoney(lotTotal)}</strong></span>
                </div>
                {lineItems.filter(l => l.part_name.trim() && parseInt(l.quantity) > 0 && parseFloat(l.price) > 0).map((l, i) => {
                  const costPerThisPart = (parseFloat(l.price)||0) + shippingPerUnit + tariffsPerUnit
                  return (
                    <div key={i} style={{ fontSize:12, color:'var(--c-text2)', marginBottom:2 }}>
                      {l.part_name.trim()}{l.color ? ` (${l.color})` : ''}: {parseInt(l.quantity)} × {fmtMoney(parseFloat(l.price)||0)}
                      {(shippingTotal > 0 || tariffsTotal > 0) && <span style={{ color:'var(--c-text3)' }}> + {fmtMoney(shippingPerUnit + tariffsPerUnit)} fees</span>}
                      {' = '}<strong style={{ color:'var(--c-brand)' }}>{fmtMoney(costPerThisPart)}/unit</strong>
                    </div>
                  )
                })}
              </div>
            )}
            <button className="btn btn-primary" onClick={submitLot} disabled={addingLot}>{addingLot ? 'Saving…' : 'Add lot'}</button>
          </div>

          <div className="card">
            <div className="card-title">{partLots.length} purchase lots · {fmtMoney(totalSpent)} total</div>
            {partLots.length === 0
              ? <div className="empty"><div className="empty-icon">📦</div>No lots yet.</div>
              : [...partLots].sort((a,b) => b.purchase_date?.localeCompare(a.purchase_date)).map(l => {
                  const lotParts = parts.filter(p => p.lot_id === l.id)
                  const isExpanded = expandedLots[l.id]
                  const isAddingToThis = addingToLot === l.id
                  return (
                    <div key={l.id} style={{ marginBottom:12 }}>
                      {/* Lot header row */}
                      <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 60px 80px 80px 80px 90px 90px 80px', gap:6, alignItems:'center', padding:'8px 4px', borderBottom:'1px solid var(--c-border)', fontSize:13 }}>
                        <span style={{ color:'var(--c-text2)', fontSize:12 }}>{l.purchase_date}</span>
                        <span style={{ fontWeight:500 }}>{l.part_name}{l.notes && <span style={{ fontSize:11, color:'var(--c-text3)', marginLeft:6 }}>{l.notes}</span>}</span>
                        <span style={{ color:'var(--c-text2)' }}>{l.quantity}</span>
                        <span className="mono">{fmtMoney(l.lot_price)}</span>
                        <span className="mono" style={{ color:'var(--c-amber)' }}>{parseFloat(l.shipping||0)>0?fmtMoney(l.shipping):'—'}</span>
                        <span className="mono" style={{ color:'var(--c-amber)' }}>{parseFloat(l.tariffs||0)>0?fmtMoney(l.tariffs):'—'}</span>
                        <span className="mono" style={{ fontWeight:500 }}>{fmtMoney(l.total_cost)}</span>
                        <span className="mono" style={{ color:'var(--c-brand)' }}>{fmtMoney(l.cost_per_unit)}</span>
                        <div style={{ display:'flex', gap:4 }}>
                          <button className="btn btn-sm" onClick={() => setExpandedLots(prev => ({ ...prev, [l.id]: !isExpanded }))}>
                            {isExpanded ? 'Hide' : 'Parts'}
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => deleteLot(l.id)}>×</button>
                        </div>
                      </div>

                      {/* Expanded parts list */}
                      {isExpanded && (
                        <div style={{ padding:'8px 0 4px 12px' }}>
                          <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:6 }}>{lotParts.length} parts in this lot</div>
                          {lotParts.length > 0 && (
                            <table className="data-table" style={{ marginBottom:10 }}>
                              <thead>
                                <tr>
                                  <th>Part</th>
                                  <th>Color</th>
                                  <th>Cost</th>
                                  <th>Status</th>
                                  <th>Order #</th>
                                  <th>Serial #</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {lotParts.map(p => (
                                  <tr key={p.id}>
                                    <td>{p.part_name}</td>
                                    <td style={{ fontSize:12, color:'var(--c-text2)' }}>{p.color || '—'}</td>
                                    <td className="mono" style={{ color:'var(--c-text2)' }}>{fmtMoney(p.cost)}</td>
                                    <td><span className={`badge ${p.status==='Available'?'badge-green':'badge-gray'}`}>{p.status}</span></td>
                                    <td style={{ fontSize:12, color:'var(--c-text2)', fontFamily:"'DM Mono',monospace" }}>{p.order_number || '—'}</td>
                                    <td style={{ fontSize:12, color:'var(--c-text2)', fontFamily:"'DM Mono',monospace" }}>{p.serial_number || '—'}</td>
                                    <td><button className="btn btn-sm btn-danger" onClick={() => deletePart(p.id)}>×</button></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}

                          {/* Add part to this lot */}
                          {isAddingToThis ? (
                            <div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 70px 90px 28px', gap:6, marginBottom:6 }}>
                                <input type="text" placeholder="Part name" value={addToLotLine.part_name} onChange={e => setAddToLotLine(prev => ({ ...prev, part_name: e.target.value }))} />
                                <input type="text" placeholder="Color" value={addToLotLine.color} onChange={e => setAddToLotLine(prev => ({ ...prev, color: e.target.value }))} />
                                <input type="number" placeholder="Qty" min="1" value={addToLotLine.quantity} onChange={e => setAddToLotLine(prev => ({ ...prev, quantity: e.target.value }))} />
                                <input type="number" placeholder="Price ea $" min="0" step="0.01" value={addToLotLine.price} onChange={e => setAddToLotLine(prev => ({ ...prev, price: e.target.value }))} />
                                <span></span>
                              </div>
                              <div style={{ display:'flex', gap:8 }}>
                                <button className="btn btn-primary btn-sm" onClick={() => addPartsToLot(l)}>Add parts</button>
                                <button className="btn btn-sm" onClick={() => { setAddingToLot(null); setAddToLotLine({ part_name:'', color:'', quantity:'', price:'' }) }}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <button className="btn btn-sm" onClick={() => setAddingToLot(l.id)}>+ Add part type to this lot</button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
            }
          </div>
        </div>
      )}

      {/* Parts Inventory */}
      {activeTab === 'inventory' && (
        <div>
          {/* Grouped summary */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Parts breakdown</span>
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
            {(() => {
              const groups = {}
              filteredParts.forEach(p => {
                const brand = p.brand || 'No Brand'
                const key = `${brand}|||${p.part_name}`
                if (!groups[key]) groups[key] = { brand, part_name: p.part_name, colors: {} }
                const color = p.color || 'No Color'
                if (!groups[key].colors[color]) groups[key].colors[color] = []
                groups[key].colors[color].push(p)
              })
              const sortedGroups = Object.values(groups).sort((a, b) => {
                if (a.brand !== b.brand) return a.brand.localeCompare(b.brand)
                return a.part_name.localeCompare(b.part_name)
              })
              if (sortedGroups.length === 0) return (
                <div className="empty"><div className="empty-icon">🔧</div>No parts yet.</div>
              )
              // Group by brand for section headers
              const byBrand = {}
              sortedGroups.forEach(g => {
                if (!byBrand[g.brand]) byBrand[g.brand] = []
                byBrand[g.brand].push(g)
              })
              return (
                <div>
                  {Object.entries(byBrand).map(([brand, brandGroups]) => (
                    <div key={brand} style={{ marginBottom: 20 }}>
                      {/* Brand header */}
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--c-brand)', padding:'2px 8px', background:'var(--c-brand-bg)', borderRadius:4 }}>
                          {brand !== 'No Brand' ? brand : 'Other'}
                        </div>
                        <div style={{ flex:1, height:1, background:'var(--c-border)' }} />
                      </div>
                      {/* Part cards */}
                      {brandGroups.map(g => {
                        const colorEntries = Object.entries(g.colors).sort(([a],[b]) => a.localeCompare(b))
                        const totalQtyForPart = colorEntries.reduce((s,[,items]) => s + items.length, 0)
                        return (
                          <div key={`${brand}|||${g.part_name}`} style={{ background:'var(--c-surface)', border:'1px solid var(--c-border)', borderRadius:10, marginBottom:10, overflow:'hidden' }}>
                            {/* Part name header */}
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'var(--c-surface2)', borderBottom:'1px solid var(--c-border)' }}>
                              <span style={{ fontWeight:600, fontSize:14 }}>{g.part_name}</span>
                              <span style={{ fontSize:12, color:'var(--c-text3)' }}>{totalQtyForPart} total in stock</span>
                            </div>
                            {/* Color swatches */}
                            <div style={{ display:'flex', flexWrap:'wrap', gap:8, padding:'12px 14px' }}>
                              {colorEntries.map(([color, items]) => {
                                const qty = items.length
                                const avgCost = items.reduce((s,p) => s+parseFloat(p.cost||0),0) / qty
                                const editKey = `${brand}|||${g.part_name}|||${color}`
                                const isEditing = editPartId === editKey
                                const stockColor = qty === 0 ? 'var(--c-text3)' : qty <= 2 ? 'var(--c-amber)' : 'var(--c-green)'
                                return (
                                  <div key={editKey} style={{
                                    display:'flex', flexDirection:'column', gap:4,
                                    padding:'10px 14px', borderRadius:8,
                                    background:'var(--c-surface2)',
                                    border: `1px solid ${qty <= 2 && qty > 0 ? 'var(--c-amber)' : 'var(--c-border)'}`,
                                    minWidth:120, flex:'0 0 auto'
                                  }}>
                                    <div style={{ fontSize:12, color:'var(--c-text2)', fontWeight:500 }}>
                                      {color !== 'No Color' ? color : '—'}
                                    </div>
                                    {isEditing ? (
                                      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                                        <input type="number" min="0" step="1"
                                          value={editPartForm.qty}
                                          onChange={e => setEditPartForm(prev => ({ ...prev, qty: e.target.value }))}
                                          style={{ width:52, height:28, fontSize:13 }} />
                                        <button className="btn btn-primary btn-sm" onClick={async () => {
                                          setSyncing(true)
                                          const newQty = parseInt(editPartForm.qty)
                                          const diff = newQty - qty
                                          if (diff < 0) {
                                            const toRemove = items.filter(p => p.status === 'Available').slice(0, Math.abs(diff))
                                            for (const p of toRemove) await supabase.from('parts').delete().eq('id', p.id)
                                          } else if (diff > 0) {
                                            const newParts = Array.from({ length: diff }, () => ({
                                              lot_id: items[0].lot_id,
                                              part_name: g.part_name,
                                              brand: brand !== 'No Brand' ? brand : null,
                                              color: color !== 'No Color' ? color : null,
                                              cost: avgCost,
                                              status: 'Available',
                                              purchase_date: items[0].purchase_date,
                                            }))
                                            await supabase.from('parts').insert(newParts)
                                          }
                                          setEditPartId(null)
                                          setSyncing(false)
                                        }}>✓</button>
                                        <button className="btn btn-sm" onClick={() => setEditPartId(null)}>✕</button>
                                      </div>
                                    ) : (
                                      <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                                        <span style={{ fontSize:22, fontWeight:700, color: stockColor, lineHeight:1 }}>{qty}</span>
                                        <span style={{ fontSize:11, color:'var(--c-text3)' }}>in stock</span>
                                      </div>
                                    )}
                                    <div style={{ fontSize:11, color:'var(--c-text3)' }}>{fmtMoney(avgCost)} ea</div>
                                    {qty <= 2 && qty > 0 && (
                                      <div style={{ fontSize:10, color:'var(--c-amber)', fontWeight:600 }}>⚠ Low stock</div>
                                    )}
                                    {!isEditing && (
                                      <button className="btn btn-sm" style={{ marginTop:2, fontSize:11 }}
                                        onClick={() => { setEditPartId(editKey); setEditPartForm({ qty }) }}>
                                        Edit qty
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>

          {/* Individual parts list */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">{filteredParts.length} individual parts</span>
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
                        <th className="hide-mobile">Serial #</th>
                        <th className="hide-mobile">Purchase date</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredParts.map(p => editPartId === p.id ? (
                        <tr key={p.id} style={{ background:'var(--c-surface2)' }}>
                          <td colSpan={8}>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:8, padding:'8px 0', alignItems:'flex-end' }}>
                              <input style={{ flex:'2 1 140px', height:34 }} type="text" placeholder="Part name" value={editPartForm.part_name||''} onChange={e => setEditPartForm(prev => ({ ...prev, part_name: e.target.value }))} />
                              <input style={{ flex:'1 1 100px', height:34 }} type="text" placeholder="Brand" value={editPartForm.brand||''} onChange={e => setEditPartForm(prev => ({ ...prev, brand: e.target.value }))} />
                              <input style={{ flex:'1 1 80px', height:34 }} type="text" placeholder="Color" value={editPartForm.color||''} onChange={e => setEditPartForm(prev => ({ ...prev, color: e.target.value }))} />
                              <input style={{ flex:'1 1 80px', height:34 }} type="number" placeholder="Cost $" step="0.01" value={editPartForm.cost||''} onChange={e => setEditPartForm(prev => ({ ...prev, cost: e.target.value }))} />
                              <select style={{ flex:'1 1 100px', height:34 }} value={editPartForm.status||'Available'} onChange={e => setEditPartForm(prev => ({ ...prev, status: e.target.value }))}>
                                <option>Available</option>
                                <option>Used</option>
                              </select>
                              <input style={{ flex:'1 1 120px', height:34 }} type="text" placeholder="Order #" value={editPartForm.order_number||''} onChange={e => setEditPartForm(prev => ({ ...prev, order_number: e.target.value }))} />
                              <input style={{ flex:'1 1 130px', height:34 }} type="text" placeholder="Serial #" value={editPartForm.serial_number||''} onChange={e => setEditPartForm(prev => ({ ...prev, serial_number: e.target.value }))} />
                              <button className="btn btn-primary btn-sm" onClick={() => savePart(p.id)}>Save</button>
                              <button className="btn btn-sm" onClick={() => setEditPartId(null)}>Cancel</button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={p.id}>
                          <td style={{ fontWeight:500 }}>{p.part_name}{p.brand && <span style={{ fontSize:11, color:'var(--c-text3)', marginLeft:4 }}>({p.brand})</span>}</td>
                          <td style={{ fontSize:12, color:'var(--c-text2)' }}>{p.color || '—'}</td>
                          <td className="mono" style={{ color:'var(--c-text2)' }}>{fmtMoney(p.cost)}</td>
                          <td><span className={`badge ${p.status==='Available'?'badge-green':'badge-gray'}`}>{p.status}</span></td>
                          <td className="hide-mobile" style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:'var(--c-text2)' }}>{p.order_number || '—'}</td>
                          <td className="hide-mobile" style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:'var(--c-text2)' }}>{p.serial_number || '—'}</td>
                          <td className="hide-mobile" style={{ fontSize:12, color:'var(--c-text3)' }}>{p.purchase_date || '—'}</td>
                          <td style={{ display:'flex', gap:4 }}>
                            <button className="btn btn-sm" onClick={() => { setEditPartId(p.id); setEditPartForm({...p}) }}>Edit</button>
                            <button className="btn btn-sm btn-danger" onClick={() => deletePart(p.id)}>×</button>
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
      )}

      {/* Use a Part */}
      {activeTab === 'use' && (
        <div className="card">
          <div className="card-title">Use a part on an order</div>
          {availableParts.length === 0
            ? <div className="empty"><div className="empty-icon">🔧</div>No available parts.</div>
            : (() => {
                // Build cascading options from available parts
                const brands = [...new Set(availableParts.map(p => p.brand).filter(Boolean))].sort()
                const hasBrands = brands.length > 0

                const partsAfterBrand = filterBrand
                  ? availableParts.filter(p => p.brand === filterBrand)
                  : availableParts

                const colors = [...new Set(partsAfterBrand.map(p => p.color).filter(Boolean))].sort()

                const partsAfterColor = filterColor
                  ? partsAfterBrand.filter(p => p.color === filterColor)
                  : partsAfterBrand

                // Group final filtered parts by name
                const partGroups = {}
                partsAfterColor.forEach(p => {
                  const key = p.part_name
                  if (!partGroups[key]) partGroups[key] = []
                  partGroups[key].push(p)
                })

                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:10, maxWidth:520 }}>
                    {/* Step 1: Brand */}
                    {hasBrands && (
                      <div className="form-group">
                        <label className="form-label">1. Brand</label>
                        <select value={filterBrand} onChange={e => { setFilterBrand(e.target.value); setFilterColor(''); setUse('part_id', '') }}>
                          <option value="">— All brands —</option>
                          {brands.map(b => (
                            <option key={b} value={b}>{b} ({availableParts.filter(p => p.brand === b).length} parts)</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Step 2: Color */}
                    {colors.length > 0 && (
                      <div className="form-group">
                        <label className="form-label">{hasBrands ? '2.' : '1.'} Color</label>
                        <select value={filterColor} onChange={e => { setFilterColor(e.target.value); setUse('part_id', '') }}>
                          <option value="">— All colors —</option>
                          {colors.map(c => (
                            <option key={c} value={c}>{c} ({partsAfterBrand.filter(p => p.color === c).length} parts)</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Step 3: Part */}
                    <div className="form-group">
                      <label className="form-label">{hasBrands ? '3.' : colors.length > 0 ? '2.' : '1.'} Select part *</label>
                      <select value={useForm.part_id} onChange={e => setUse('part_id', e.target.value)}>
                        <option value="">— Choose a part —</option>
                        {Object.entries(partGroups).map(([name, items]) => (
                          <option key={items[0].id} value={items[0].id}>
                            {name} · {items.length} available · {fmtMoney(items[0].cost)} ea
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Order number *</label>
                      <input type="text" placeholder="e.g. 12-34567-89012" value={useForm.order_number} onChange={e => setUse('order_number', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Item serial number (optional)</label>
                      <input type="text" placeholder="e.g. DNPXC2XY0J4D" value={useForm.serial_number} onChange={e => setUse('serial_number', e.target.value)} />
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
              })()
          }
        </div>
      )}
    </div>
  )
}
