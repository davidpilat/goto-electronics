import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const CONDITIONS = ['Like New','Excellent','Good','Fair','For Parts']
const PLATFORMS = ['eBay','Facebook Marketplace','Amazon','Craigslist','OfferUp','Other']
const STATUSES = ['In Stock','Listed','Sold','Scrapped']
const today = () => new Date().toISOString().slice(0, 10)
const fmtMoney = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })

export default function Inventory({ inventory, setSyncing }) {
  const [form, setForm] = useState({
    name: '', sku: '', condition: 'Good', purchase_cost: '',
    parts_cost: '', listed_price: '', platform: '', status: 'In Stock',
    purchase_date: today(), notes: ''
  })
  const [adding, setAdding] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const setEdit = (k, v) => setEditForm(prev => ({ ...prev, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) return
    setAdding(true); setSyncing(true)
    await supabase.from('inventory').insert({
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      condition: form.condition,
      purchase_cost: parseFloat(form.purchase_cost)||0,
      parts_cost: parseFloat(form.parts_cost)||0,
      listed_price: form.listed_price ? parseFloat(form.listed_price) : null,
      platform: form.platform || null,
      status: form.status,
      purchase_date: form.purchase_date,
      notes: form.notes.trim() || null,
    })
    setForm({ name:'', sku:'', condition:'Good', purchase_cost:'', parts_cost:'', listed_price:'', platform:'', status:'In Stock', purchase_date:today(), notes:'' })
    setAdding(false); setSyncing(false)
  }

  const saveEdit = async (id) => {
    setSyncing(true)
    await supabase.from('inventory').update({
      name: editForm.name,
      sku: editForm.sku || null,
      condition: editForm.condition,
      purchase_cost: parseFloat(editForm.purchase_cost)||0,
      parts_cost: parseFloat(editForm.parts_cost)||0,
      listed_price: editForm.listed_price ? parseFloat(editForm.listed_price) : null,
      platform: editForm.platform || null,
      status: editForm.status,
      notes: editForm.notes || null,
    }).eq('id', id)
    setEditId(null); setSyncing(false)
  }

  const deleteItem = async (id) => {
    if (!window.confirm('Delete this item?')) return
    setSyncing(true)
    await supabase.from('inventory').delete().eq('id', id)
    setSyncing(false)
  }

  const statusBadge = (s) => {
    const map = { 'In Stock':'badge-green', 'Listed':'badge-brand', 'Sold':'badge-gray', 'Scrapped':'badge-red' }
    return <span className={`badge ${map[s]||'badge-gray'}`}>{s}</span>
  }

  const conditionBadge = (c) => {
    const map = { 'Like New':'badge-green', 'Excellent':'badge-brand', 'Good':'badge-amber', 'Fair':'badge-purple', 'For Parts':'badge-red' }
    return <span className={`badge ${map[c]||'badge-gray'}`}>{c}</span>
  }

  const filtered = inventory.filter(i => {
    const matchStatus = !filterStatus || i.status === filterStatus
    const matchSearch = !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.sku?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const totalCost = filtered.reduce((s, i) => s + parseFloat(i.purchase_cost||0) + parseFloat(i.parts_cost||0), 0)
  const inStock = inventory.filter(i => i.status === 'In Stock').length
  const listed = inventory.filter(i => i.status === 'Listed').length

  return (
    <div>
      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:'1rem' }}>
        {[
          { label:'In stock', value:inStock, color:'var(--c-green)' },
          { label:'Listed', value:listed, color:'var(--c-brand)' },
          { label:'Total inventory value', value:fmtMoney(inventory.filter(i=>i.status!=='Sold'&&i.status!=='Scrapped').reduce((s,i)=>s+parseFloat(i.purchase_cost||0)+parseFloat(i.parts_cost||0),0)), color:'var(--c-text)' },
        ].map(m => (
          <div key={m.label} className="stat-card">
            <div className="stat-label">{m.label}</div>
            <div className="stat-value" style={{ fontSize:20, color:m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Add item */}
      <div className="card">
        <div className="card-title">Add inventory item</div>
        <div className="form-grid form-grid-3" style={{ marginBottom:10 }}>
          <div className="form-group" style={{ gridColumn:'span 2' }}>
            <label className="form-label">Item name *</label>
            <input type="text" placeholder="e.g. iPhone 12 64GB Black" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">SKU / ID</label>
            <input type="text" placeholder="e.g. IP12-64-BLK" value={form.sku} onChange={e => set('sku', e.target.value)} />
          </div>
        </div>
        <div className="form-grid form-grid-4" style={{ marginBottom:10 }}>
          <div className="form-group">
            <label className="form-label">Purchase cost $</label>
            <input type="number" placeholder="0.00" min="0" step="0.01" value={form.purchase_cost} onChange={e => set('purchase_cost', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Parts cost $</label>
            <input type="number" placeholder="0.00" min="0" step="0.01" value={form.parts_cost} onChange={e => set('parts_cost', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Listed price $</label>
            <input type="number" placeholder="0.00" min="0" step="0.01" value={form.listed_price} onChange={e => set('listed_price', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Purchase date</label>
            <input type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} />
          </div>
        </div>
        <div className="form-grid form-grid-4" style={{ marginBottom:12 }}>
          <div className="form-group">
            <label className="form-label">Condition</label>
            <select value={form.condition} onChange={e => set('condition', e.target.value)}>
              {CONDITIONS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Platform to sell on</label>
            <select value={form.platform} onChange={e => set('platform', e.target.value)}>
              <option value="">— Not decided —</option>
              {PLATFORMS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <input type="text" placeholder="Any notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={submit} disabled={adding}>{adding ? 'Saving…' : 'Add item'}</button>
      </div>

      {/* Inventory list */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">{filtered.length} items {totalCost > 0 && `· ${fmtMoney(totalCost)} total cost`}</span>
          <div style={{ display:'flex', gap:8 }}>
            <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ height:32, width:130, fontSize:13 }} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ height:32, width:110, fontSize:12 }}>
              <option value="">All status</option>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {filtered.length === 0
          ? <div className="empty"><div className="empty-icon">📱</div>No items yet. Add your first item above.</div>
          : (
            <div style={{ overflowX:'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Condition</th>
                    <th className="hide-mobile">Cost</th>
                    <th className="hide-mobile">Listed</th>
                    <th className="hide-mobile">Platform</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => editId === item.id ? (
                    <tr key={item.id}>
                      <td colSpan={7}>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:8, padding:'8px 0', alignItems:'flex-end' }}>
                          <input style={{ flex:'2 1 160px', height:34 }} type="text" value={editForm.name} onChange={e => setEdit('name', e.target.value)} />
                          <input style={{ flex:'1 1 90px', height:34 }} type="number" value={editForm.purchase_cost} onChange={e => setEdit('purchase_cost', e.target.value)} placeholder="Cost $" />
                          <input style={{ flex:'1 1 90px', height:34 }} type="number" value={editForm.listed_price||''} onChange={e => setEdit('listed_price', e.target.value)} placeholder="List $" />
                          <select style={{ flex:'1 1 100px', height:34 }} value={editForm.condition} onChange={e => setEdit('condition', e.target.value)}>
                            {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                          </select>
                          <select style={{ flex:'1 1 100px', height:34 }} value={editForm.status} onChange={e => setEdit('status', e.target.value)}>
                            {STATUSES.map(s => <option key={s}>{s}</option>)}
                          </select>
                          <button className="btn btn-primary btn-sm" onClick={() => saveEdit(item.id)}>Save</button>
                          <button className="btn btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight:500 }}>{item.name}</div>
                        {item.sku && <div style={{ fontSize:11, color:'var(--c-text3)' }}>{item.sku}</div>}
                        {item.notes && <div style={{ fontSize:11, color:'var(--c-text3)' }}>{item.notes}</div>}
                      </td>
                      <td>{conditionBadge(item.condition)}</td>
                      <td className="hide-mobile">
                        <div className="mono">{fmtMoney(parseFloat(item.purchase_cost||0)+parseFloat(item.parts_cost||0))}</div>
                        {parseFloat(item.parts_cost||0) > 0 && <div style={{ fontSize:11, color:'var(--c-text3)' }}>+{fmtMoney(item.parts_cost)} parts</div>}
                      </td>
                      <td className="hide-mobile mono">{item.listed_price ? fmtMoney(item.listed_price) : '—'}</td>
                      <td className="hide-mobile">{item.platform ? <span className="badge badge-brand">{item.platform}</span> : '—'}</td>
                      <td>{statusBadge(item.status)}</td>
                      <td style={{ display:'flex', gap:4 }}>
                        <button className="btn btn-sm" onClick={() => { setEditId(item.id); setEditForm({...item}) }}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteItem(item.id)}>×</button>
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
