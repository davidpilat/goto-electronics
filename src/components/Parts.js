import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const today = () => new Date().toISOString().slice(0, 10)
const fmtMoney = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })

export default function Parts({ parts, partLots, setSyncing }) {
  const [activeTab, setActiveTab] = useState('inventory')
  const [lotForm, setLotForm] = useState({
    part_name: '', color: '', purchase_date: today(),
    lot_price: '', quantity: '', shipping: '', tariffs: '', vendor: '', notes: ''
  })
  const [addingLot, setAddingLot] = useState(false)
  const [useForm, setUseForm] = useState({ part_id: '', order_number: '', notes: '' })
  const [usingPart, setUsingPart] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('Available')

  const setLot = (k, v) => setLotForm(prev => ({ ...prev, [k]: v }))
  const setUse = (k, v) => setUseForm(prev => ({ ...prev, [k]: v }))

  const lotQty = parseInt(lotForm.quantity) || 1
  const lotTotal = (parseFloat(lotForm.lot_price)||0) + (parseFloat(lotForm.shipping)||0) + (parseFloat(lotForm.tariffs)||0)
  const costPerUnit = lotQty > 0 ? lotTotal / lotQty : 0

  const submitLot = async () => {
    if (!lotForm.part_name.trim() || !lotForm.lot_price || !lotForm.quantity) return
    setAddingLot(true); setSyncing(true)
    const { data: lot } = await supabase.from('part_lots').insert({
      part_name: lotForm.part_name.trim(),
      color: lotForm.color.trim() || null,
      purchase_date: lotForm.purchase_date,
      lot_price: parseFloat(lotForm.lot_price)||0,
      quantity: lotQty,
      shipping: parseFloat(lotForm.shipping)||0,
      tariffs: parseFloat(lotForm.tariffs)||0,
      total_cost: lotTotal,
      cost_per_unit: costPerUnit,
      vendor: lotForm.vendor.trim() || null,
      notes: lotForm.notes.trim() || null,
    }).select().single()
    if (lot) {
      const partRecords = Array.from({ length: lotQty }, () => ({
        lot_id: lot.id,
        part_name: lotForm.part_name.trim(),
        color: lotForm.color.trim() || null,
        cost: costPerUnit,
        status: 'Available',
        purchase_date: lotForm.purchase_date,
      }))
      for (let i = 0; i < partRecords.length; i += 50) {
        await supabase.from('parts').insert(partRecords.slice(i, i + 50))
      }
    }
    setLotForm({ part_name:'', color:'', purchase_date:today(), lot_price:'', quantity:'', shipping:'', tariffs:'', vendor:'', notes:'' })
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
            <div className="form-grid form-grid-3" style={{ marginBottom:10 }}>
              <div className="form-group" style={{ gridColumn:'span 2' }}>
                <label className="form-label">Part name *</label>
                <input type="text" placeholder="e.g. iPhone 12 Screen" value={lotForm.part_name} onChange={e => setLot('part_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Color</label>
                <input type="text" placeholder="e.g. Black" value={lotForm.color} onChange={e => setLot('color', e.target.value)} />
              </div>
            </div>
            <div className="form-grid form-grid-4" style={{ marginBottom:10 }}>
              <div className="form-group">
                <label className="form-label">Purchase date</label>
                <input type="date" value={lotForm.purchase_date} onChange={e => setLot('purchase_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Quantity *</label>
                <input type="number" placeholder="0" min="1" step="1" value={lotForm.quantity} onChange={e => setLot('quantity', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Lot price $</label>
                <input type="number" placeholder="0.00" min="0" step="0.01" value={lotForm.lot_price} onChange={e => setLot('lot_price', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Vendor</label>
                <input type="text" placeholder="e.g. iFixit" value={lotForm.vendor} onChange={e => setLot('vendor', e.target.value)} />
              </div>
            </div>
            <div className="form-grid form-grid-4" style={{ marginBottom:10 }}>
              <div className="form-group">
                <label className="form-label">Shipping $</label>
                <input type="number" placeholder="0.00" min="0" step="0.01" value={lotForm.shipping} onChange={e => setLot('shipping', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Tariffs $</label>
                <input type="number" placeholder="0.00" min="0" step="0.01" value={lotForm.tariffs} onChange={e => setLot('tariffs', e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn:'span 2' }}>
                <label className="form-label">Notes</label>
                <input type="text" placeholder="Any notes" value={lotForm.notes} onChange={e => setLot('notes', e.target.value)} />
              </div>
            </div>
            {lotForm.lot_price && lotForm.quantity && (
              <div style={{ display:'flex', gap:16, padding:'10px 14px', background:'var(--c-surface2)', borderRadius:8, marginBottom:12, fontSize:13, flexWrap:'wrap' }}>
                <span>Lot price: <strong>{fmtMoney(parseFloat(lotForm.lot_price)||0)}</strong></span>
                {parseFloat(lotForm.shipping) > 0 && <span>+ Shipping: <strong>{fmtMoney(lotForm.shipping)}</strong></span>}
                {parseFloat(lotForm.tariffs) > 0 && <span>+ Tariffs: <strong>{fmtMoney(lotForm.tariffs)}</strong></span>}
                <span>= Total: <strong>{fmtMoney(lotTotal)}</strong></span>
                <span>Cost per unit: <strong style={{ color:'var(--c-brand)' }}>{fmtMoney(costPerUnit)}</strong></span>
                <span style={{ color:'var(--c-text3)' }}>{lotQty} parts will be created</span>
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
