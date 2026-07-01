import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const STATUSES = ['Received', 'In Progress', 'Complete', 'Shipped']
const STATUS_COLORS = {
  'Received':    { bg:'var(--c-surface2)', color:'var(--c-text2)', border:'var(--c-border)' },
  'In Progress': { bg:'rgba(59,130,246,0.12)', color:'#60a5fa', border:'#3b82f6' },
  'Complete':    { bg:'rgba(34,197,94,0.12)', color:'var(--c-green)', border:'var(--c-green)' },
  'Shipped':     { bg:'rgba(168,85,247,0.12)', color:'#c084fc', border:'#a855f7' },
}
const today = () => new Date().toISOString().slice(0, 10)
const fmtMoney = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS['Received']
  return (
    <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:4,
      background:s.bg, color:s.color, border:`1px solid ${s.border}` }}>
      {status}
    </span>
  )
}

export default function Repairs({ repairOrders, repairOrderParts, parts = [], setSyncing }) {
  const [activeTab, setActiveTab] = useState('orders')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  // Add order form
  const emptyForm = {
    order_number:'', customer_name:'', customer_email:'',
    make:'', model:'', serial_number:'',
    repair_price:'', shipping_cost:'', notes:'',
    received_date: today(), status:'Received'
  }
  const [form, setForm] = useState(emptyForm)
  const [adding, setAdding] = useState(false)
  const [newOrderId, setNewOrderId] = useState(null)
  const [partLines, setPartLines] = useState([])
  const [partFilter, setPartFilter] = useState({ brand:'', part_name:'', color:'' })
  const [selectedPartId, setSelectedPartId] = useState('')

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  // Edit state
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const submit = async () => {
    if (!form.customer_name.trim() && !form.order_number.trim()) return
    setAdding(true); setSyncing(true)
    const { data: inserted } = await supabase.from('repair_orders').insert({
      order_number: form.order_number.trim() || null,
      customer_name: form.customer_name.trim() || null,
      customer_email: form.customer_email.trim() || null,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim() || null,
      repair_price: parseFloat(form.repair_price) || 0,
      shipping_cost: parseFloat(form.shipping_cost) || 0,
      notes: form.notes.trim() || null,
      received_date: form.received_date,
      status: form.status,
    }).select()
    setAdding(false); setSyncing(false)
    if (inserted?.[0]) {
      setNewOrderId(inserted[0].id)
      setPartLines([])
      setPartFilter({ brand:'', part_name:'', color:'' })
      setSelectedPartId('')
    }
  }

  const addPartToOrder = async () => {
    if (!selectedPartId || !newOrderId) return
    const part = parts.find(p => p.id === selectedPartId)
    if (!part) return
    setSyncing(true)
    // Insert repair_order_parts record
    await supabase.from('repair_order_parts').insert({
      repair_order_id: newOrderId,
      part_id: part.id,
      part_name: part.part_name,
      brand: part.brand || null,
      color: part.color || null,
      cost: parseFloat(part.cost) || 0,
    })
    // Mark part as Used
    await supabase.from('parts').update({ status: 'Used' }).eq('id', part.id)
    setPartLines(prev => [...prev, part])
    setSelectedPartId('')
    setPartFilter({ brand:'', part_name:'', color:'' })
    setSyncing(false)
  }

  const finishOrder = () => {
    setNewOrderId(null)
    setPartLines([])
    setForm(emptyForm)
    setPartFilter({ brand:'', part_name:'', color:'' })
    setSelectedPartId('')
  }

  const updateStatus = async (id, status) => {
    setSyncing(true)
    const updates = { status }
    if (status === 'Shipped') updates.shipped_date = today()
    await supabase.from('repair_orders').update(updates).eq('id', id)
    setSyncing(false)
  }

  const deleteOrder = async (id) => {
    if (!window.confirm('Delete this repair order?')) return
    setSyncing(true)
    await supabase.from('repair_orders').delete().eq('id', id)
    setSyncing(false)
  }

  const saveEdit = async () => {
    setSyncing(true)
    await supabase.from('repair_orders').update({
      order_number: editForm.order_number?.trim() || null,
      customer_name: editForm.customer_name?.trim() || null,
      customer_email: editForm.customer_email?.trim() || null,
      make: editForm.make?.trim() || null,
      model: editForm.model?.trim() || null,
      serial_number: editForm.serial_number?.trim() || null,
      repair_price: parseFloat(editForm.repair_price) || 0,
      shipping_cost: parseFloat(editForm.shipping_cost) || 0,
      notes: editForm.notes?.trim() || null,
      received_date: editForm.received_date,
      status: editForm.status,
    }).eq('id', editId)
    setEditId(null)
    setSyncing(false)
  }

  // Cascading part filter
  const availableParts = parts.filter(p => p.status === 'Available')
  const brands = [...new Set(availableParts.map(p => p.brand).filter(Boolean))].sort()
  const afterBrand = partFilter.brand ? availableParts.filter(p => p.brand === partFilter.brand) : availableParts
  const partNames = [...new Set(afterBrand.map(p => p.part_name).filter(Boolean))].sort()
  const afterName = partFilter.part_name ? afterBrand.filter(p => p.part_name === partFilter.part_name) : afterBrand
  const colors = [...new Set(afterName.map(p => p.color).filter(Boolean))].sort()

  const filtered = repairOrders.filter(r => {
    const matchStatus = !filterStatus || r.status === filterStatus
    const matchSearch = !search ||
      r.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.order_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.make?.toLowerCase().includes(search.toLowerCase()) ||
      r.model?.toLowerCase().includes(search.toLowerCase()) ||
      r.serial_number?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  // Summary stats
  const totalRevenue = repairOrders.reduce((s,r) => s + parseFloat(r.repair_price||0), 0)
  const totalShipping = repairOrders.reduce((s,r) => s + parseFloat(r.shipping_cost||0), 0)
  const totalPartsCost = repairOrderParts.reduce((s,p) => s + parseFloat(p.cost||0), 0)
  const totalProfit = totalRevenue - totalShipping - totalPartsCost
  const activeCount = repairOrders.filter(r => r.status !== 'Shipped').length

  return (
    <div>
      {/* Summary stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:'1rem' }}>
        {[
          { label:'Active repairs', value: activeCount, mono:false },
          { label:'Total revenue', value: fmtMoney(totalRevenue), mono:true },
          { label:'Parts cost', value: fmtMoney(totalPartsCost), mono:true },
          { label:'Net profit', value: fmtMoney(totalProfit), mono:true, color: totalProfit >= 0 ? 'var(--c-green)' : 'var(--c-red)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize:20, color: s.color || 'var(--c-text)', fontFamily: s.mono ? "'DM Mono',monospace" : undefined }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Sub tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:'1rem' }}>
        {['orders','add'].map(t => (
          <button key={t} className={`tab-btn ${activeTab===t?'active':''}`} onClick={() => setActiveTab(t)}>
            {t === 'orders' ? 'Repair Orders' : 'New Repair'}
          </button>
        ))}
      </div>

      {/* New Repair form */}
      {activeTab === 'add' && (
        <div className="card">
          <div className="card-title">New repair order</div>
          {!newOrderId ? (
            <>
              <div className="form-grid form-grid-4" style={{ marginBottom:10 }}>
                <div className="form-group">
                  <label className="form-label">Order number</label>
                  <input type="text" placeholder="e.g. RPR-001" value={form.order_number} onChange={e => set('order_number', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Received date</label>
                  <input type="date" value={form.received_date} onChange={e => set('received_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Repair price $</label>
                  <input type="number" placeholder="0.00" min="0" step="0.01" value={form.repair_price} onChange={e => set('repair_price', e.target.value)} />
                </div>
              </div>
              <div className="form-grid form-grid-2" style={{ marginBottom:10 }}>
                <div className="form-group">
                  <label className="form-label">Customer name</label>
                  <input type="text" placeholder="e.g. John Smith" value={form.customer_name} onChange={e => set('customer_name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Customer email</label>
                  <input type="email" placeholder="e.g. john@email.com" value={form.customer_email} onChange={e => set('customer_email', e.target.value)} />
                </div>
              </div>
              <div className="form-grid form-grid-4" style={{ marginBottom:10 }}>
                <div className="form-group">
                  <label className="form-label">Make</label>
                  <input type="text" placeholder="e.g. Beats" value={form.make} onChange={e => set('make', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Model</label>
                  <input type="text" placeholder="e.g. Studio 3" value={form.model} onChange={e => set('model', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Serial number</label>
                  <input type="text" placeholder="e.g. DNPXC2XY0J4D" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Shipping cost $</label>
                  <input type="number" placeholder="0.00" min="0" step="0.01" value={form.shipping_cost} onChange={e => set('shipping_cost', e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom:12 }}>
                <label className="form-label">Notes</label>
                <input type="text" placeholder="Issue description, customer notes…" value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={submit} disabled={adding || (!form.customer_name.trim() && !form.order_number.trim())}>
                {adding ? 'Saving…' : 'Create repair order'}
              </button>
            </>
          ) : (
            <>
              {/* Order saved — add parts */}
              <div style={{ padding:'10px 14px', background:'var(--c-surface2)', borderRadius:8, marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ color:'var(--c-green)', fontSize:16 }}>✓</span>
                <span style={{ fontWeight:600 }}>{form.customer_name || form.order_number}</span>
                <span style={{ fontSize:12, color:'var(--c-text3)' }}>— {form.make} {form.model} — add parts used below, or skip</span>
              </div>

              {/* Parts added */}
              {partLines.length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
                  {partLines.map((p, i) => (
                    <span key={i} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, background:'var(--c-surface2)', border:'1px solid var(--c-border)' }}>
                      🔧 {p.brand ? p.brand + ' ' : ''}{p.part_name}{p.color ? ' — ' + p.color : ''}
                    </span>
                  ))}
                </div>
              )}

              {/* Cascading part picker */}
              {availableParts.length > 0 ? (
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:6 }}>
                    <div className="form-group" style={{ margin:0 }}>
                      <label className="form-label" style={{ fontSize:11 }}>Brand</label>
                      <select value={partFilter.brand} onChange={e => { setPartFilter({ brand:e.target.value, part_name:'', color:'' }); setSelectedPartId('') }} style={{ height:34, fontSize:12 }}>
                        <option value="">— All brands —</option>
                        {brands.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ margin:0 }}>
                      <label className="form-label" style={{ fontSize:11 }}>Part name</label>
                      <select value={partFilter.part_name} onChange={e => {
                        const newFilter = { ...partFilter, part_name: e.target.value, color:'' }
                        setPartFilter(newFilter)
                        const filtered = afterBrand.filter(p => p.part_name === e.target.value)
                        const uniqueColors = [...new Set(filtered.map(p => p.color).filter(Boolean))]
                        if (uniqueColors.length === 0 && filtered[0]) setSelectedPartId(filtered[0].id)
                        else setSelectedPartId('')
                      }} style={{ height:34, fontSize:12 }}>
                        <option value="">— All parts —</option>
                        {partNames.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ margin:0 }}>
                      <label className="form-label" style={{ fontSize:11 }}>Color</label>
                      <select value={partFilter.color} onChange={e => {
                        setPartFilter(prev => ({ ...prev, color: e.target.value }))
                        const match = afterName.find(p => p.color === e.target.value)
                        if (match) setSelectedPartId(match.id)
                        else setSelectedPartId('')
                      }} style={{ height:34, fontSize:12 }} disabled={colors.length === 0}>
                        <option value="">{colors.length === 0 ? '— No color —' : '— Any color —'}</option>
                        {colors.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={addPartToOrder} disabled={!selectedPartId}>+ Add part</button>
                </div>
              ) : (
                <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:14 }}>No available parts in stock.</div>
              )}

              <button className="btn btn-primary" onClick={finishOrder}>Done</button>
            </>
          )}
        </div>
      )}

      {/* Repair Orders list */}
      {activeTab === 'orders' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{filtered.length} repair orders</span>
            <div style={{ display:'flex', gap:8 }}>
              <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ height:32, width:140, fontSize:13 }} />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ height:32, width:120, fontSize:12 }}>
                <option value="">All statuses</option>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {filtered.length === 0
            ? <div className="empty"><div className="empty-icon">🔧</div>No repair orders yet.</div>
            : filtered.map(r => {
                const orderParts = repairOrderParts.filter(p => p.repair_order_id === r.id)
                const partsCost = orderParts.reduce((s,p) => s+parseFloat(p.cost||0), 0)
                const profit = parseFloat(r.repair_price||0) - parseFloat(r.shipping_cost||0) - partsCost
                const isExpanded = expandedId === r.id
                const isEditing = editId === r.id

                return (
                  <div key={r.id} style={{ borderBottom:'1px solid var(--c-border)', padding:'12px 4px' }}>
                    {isEditing ? (
                      <div>
                        <div className="form-grid form-grid-4" style={{ marginBottom:8 }}>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">Order #</label>
                            <input type="text" value={editForm.order_number||''} onChange={e => setEditForm(p=>({...p,order_number:e.target.value}))} />
                          </div>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">Status</label>
                            <select value={editForm.status||'Received'} onChange={e => setEditForm(p=>({...p,status:e.target.value}))}>
                              {STATUSES.map(s => <option key={s}>{s}</option>)}
                            </select>
                          </div>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">Repair price $</label>
                            <input type="number" value={editForm.repair_price||''} onChange={e => setEditForm(p=>({...p,repair_price:e.target.value}))} />
                          </div>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">Shipping cost $</label>
                            <input type="number" value={editForm.shipping_cost||''} onChange={e => setEditForm(p=>({...p,shipping_cost:e.target.value}))} />
                          </div>
                        </div>
                        <div className="form-grid form-grid-2" style={{ marginBottom:8 }}>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">Customer name</label>
                            <input type="text" value={editForm.customer_name||''} onChange={e => setEditForm(p=>({...p,customer_name:e.target.value}))} />
                          </div>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">Customer email</label>
                            <input type="email" value={editForm.customer_email||''} onChange={e => setEditForm(p=>({...p,customer_email:e.target.value}))} />
                          </div>
                        </div>
                        <div className="form-grid form-grid-4" style={{ marginBottom:8 }}>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">Make</label>
                            <input type="text" value={editForm.make||''} onChange={e => setEditForm(p=>({...p,make:e.target.value}))} />
                          </div>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">Model</label>
                            <input type="text" value={editForm.model||''} onChange={e => setEditForm(p=>({...p,model:e.target.value}))} />
                          </div>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">Serial #</label>
                            <input type="text" value={editForm.serial_number||''} onChange={e => setEditForm(p=>({...p,serial_number:e.target.value}))} />
                          </div>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">Received date</label>
                            <input type="date" value={editForm.received_date||''} onChange={e => setEditForm(p=>({...p,received_date:e.target.value}))} />
                          </div>
                        </div>
                        <div className="form-group" style={{ margin:'0 0 10px' }}>
                          <label className="form-label">Notes</label>
                          <input type="text" value={editForm.notes||''} onChange={e => setEditForm(p=>({...p,notes:e.target.value}))} />
                        </div>
                        <div style={{ display:'flex', gap:6 }}>
                          <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                          <button className="btn btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Order header row */}
                        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                          <div style={{ display:'flex', flexDirection:'column', gap:4, flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                              <span style={{ fontWeight:600, fontSize:14 }}>{r.customer_name || '—'}</span>
                              {r.order_number && <span style={{ fontSize:12, color:'var(--c-text3)', fontFamily:"'DM Mono',monospace" }}>{r.order_number}</span>}
                              <StatusBadge status={r.status} />
                            </div>
                            <div style={{ fontSize:12, color:'var(--c-text2)' }}>
                              {[r.make, r.model].filter(Boolean).join(' ')}
                              {r.serial_number && <span style={{ marginLeft:8, fontFamily:"'DM Mono',monospace", color:'var(--c-text3)' }}>{r.serial_number}</span>}
                            </div>
                            {r.customer_email && <div style={{ fontSize:11, color:'var(--c-text3)' }}>{r.customer_email}</div>}
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                            <div style={{ display:'flex', gap:6 }}>
                              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight:600, color:'var(--c-green)' }}>{fmtMoney(r.repair_price)}</span>
                              <span style={{ fontSize:12, color: profit >= 0 ? 'var(--c-green)' : 'var(--c-red)', fontFamily:"'DM Mono',monospace" }}>
                                ({profit >= 0 ? '+' : ''}{fmtMoney(profit)})
                              </span>
                            </div>
                            <div style={{ fontSize:11, color:'var(--c-text3)' }}>{r.received_date}</div>
                          </div>
                        </div>

                        {/* Parts pills */}
                        {orderParts.length > 0 && (
                          <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:8 }}>
                            {orderParts.map(p => (
                              <span key={p.id} style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:'var(--c-surface2)', border:'1px solid var(--c-border)', color:'var(--c-text2)' }}>
                                🔧 {p.brand ? p.brand + ' ' : ''}{p.part_name}{p.color ? ' — '+p.color : ''}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap', alignItems:'center' }}>
                          {/* Status stepper */}
                          {STATUSES.map((s, i) => {
                            const currentIdx = STATUSES.indexOf(r.status)
                            if (i <= currentIdx) return null
                            if (i > currentIdx + 1) return null
                            return (
                              <button key={s} className="btn btn-sm btn-primary" style={{ fontSize:11 }}
                                onClick={() => updateStatus(r.id, s)}>
                                → {s}
                              </button>
                            )
                          })}
                          <button className="btn btn-sm" style={{ fontSize:11 }} onClick={() => { setEditId(r.id); setEditForm({...r}) }}>Edit</button>
                          {r.notes && (
                            <button className="btn btn-sm" style={{ fontSize:11 }} onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                              {isExpanded ? 'Hide notes' : 'Notes'}
                            </button>
                          )}
                          <button className="btn btn-sm btn-danger" style={{ fontSize:11 }} onClick={() => deleteOrder(r.id)}>×</button>
                        </div>

                        {/* Notes */}
                        {isExpanded && r.notes && (
                          <div style={{ marginTop:8, fontSize:12, color:'var(--c-text2)', padding:'8px 12px', background:'var(--c-surface2)', borderRadius:6 }}>
                            {r.notes}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })
          }
        </div>
      )}
    </div>
  )
}
