import React, { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const CONDITIONS = ['Like New','Excellent','Good','Fair','For Parts']
const PLATFORMS = ['eBay','Facebook Marketplace','Amazon','Craigslist','OfferUp','Other']
const STATUSES = ['In Stock','Listed','Sold','Scrapped']
const today = () => new Date().toISOString().slice(0, 10)
const fmtMoney = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })

// Maps common column name variations to our field names
const COL_MAP = {
  name: ['name','item','item name','title','product','description','device'],
  sku: ['sku','id','item id','sku/id','product id','sku id'],
  serial_number: ['serial','serial number','serial no','sn','imei','serial#'],
  condition: ['condition','grade','quality','cond'],
  purchase_cost: ['purchase cost','cost','purchase price','buy price','paid','purchase','bought for','cost price'],
  parts_cost: ['parts cost','parts','repair cost','parts/repair'],
  listed_price: ['listed price','list price','selling price','price','asking price','retail'],
  platform: ['platform','sell on','marketplace','channel'],
  status: ['status','state'],
  purchase_date: ['purchase date','date','bought date','date purchased','acquired'],
  notes: ['notes','note','comments','comment','memo'],
}

function normalizeHeader(h) {
  return h.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '')
}

function mapHeader(h) {
  const norm = normalizeHeader(h)
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    if (aliases.includes(norm)) return field
  }
  return null
}

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
  const fieldMap = headers.map(mapHeader)
  return lines.slice(1).map(line => {
    // Handle quoted commas
    const vals = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = '' }
      else cur += ch
    }
    vals.push(cur.trim())
    const obj = {}
    fieldMap.forEach((field, i) => {
      if (field) obj[field] = (vals[i] || '').replace(/^"|"$/g, '').trim()
    })
    return obj
  }).filter(r => r.name) // must have a name
}

function normalizeRow(row) {
  // Normalize condition
  const condLower = (row.condition||'').toLowerCase()
  let condition = 'Good'
  if (condLower.includes('like new') || condLower === 'ln') condition = 'Like New'
  else if (condLower.includes('excel') || condLower === 'a') condition = 'Excellent'
  else if (condLower.includes('good') || condLower === 'b') condition = 'Good'
  else if (condLower.includes('fair') || condLower === 'c') condition = 'Fair'
  else if (condLower.includes('part') || condLower === 'p') condition = 'For Parts'

  // Normalize status
  const statLower = (row.status||'').toLowerCase()
  let status = 'In Stock'
  if (statLower.includes('list')) status = 'Listed'
  else if (statLower.includes('sold')) status = 'Sold'
  else if (statLower.includes('scrap')) status = 'Scrapped'

  return {
    name: row.name || '',
    sku: row.sku || null,
    serial_number: row.serial_number || null,
    condition,
    purchase_cost: parseFloat((row.purchase_cost||'').replace(/[$,]/g,'')) || 0,
    parts_cost: parseFloat((row.parts_cost||'').replace(/[$,]/g,'')) || 0,
    listed_price: parseFloat((row.listed_price||'').replace(/[$,]/g,'')) || null,
    platform: row.platform || null,
    status,
    purchase_date: row.purchase_date || today(),
    notes: row.notes || null,
  }
}

export default function Inventory({ inventory, setSyncing }) {
  const [form, setForm] = useState({
    name: '', sku: '', serial_number: '', condition: 'Good', purchase_cost: '',
    parts_cost: '', listed_price: '', platform: '', status: 'In Stock',
    purchase_date: today(), notes: ''
  })
  const [adding, setAdding] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState(null)
  const [importError, setImportError] = useState('')
  const fileRef = useRef()

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const setEdit = (k, v) => setEditForm(prev => ({ ...prev, [k]: v }))

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result)
      if (rows.length === 0) {
        setImportError('No valid rows found. Make sure your CSV has a "Name" column header.')
        return
      }
      setImportPreview(rows.map(normalizeRow))
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const confirmImport = async () => {
    if (!importPreview?.length) return
    setImporting(true); setSyncing(true)
    // Insert in batches of 50
    for (let i = 0; i < importPreview.length; i += 50) {
      await supabase.from('inventory').insert(importPreview.slice(i, i + 50))
    }
    setImportPreview(null)
    setImporting(false); setSyncing(false)
    alert(`✓ Imported ${importPreview.length} items successfully!`)
  }

  const submit = async () => {
    if (!form.name.trim()) return
    setAdding(true); setSyncing(true)
    await supabase.from('inventory').insert({
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      serial_number: form.serial_number.trim() || null,
      condition: form.condition,
      purchase_cost: parseFloat(form.purchase_cost)||0,
      parts_cost: parseFloat(form.parts_cost)||0,
      listed_price: form.listed_price ? parseFloat(form.listed_price) : null,
      platform: form.platform || null,
      status: form.status,
      purchase_date: form.purchase_date,
      notes: form.notes.trim() || null,
    })
    setForm({ name:'', sku:'', serial_number:'', condition:'Good', purchase_cost:'', parts_cost:'', listed_price:'', platform:'', status:'In Stock', purchase_date:today(), notes:'' })
    setAdding(false); setSyncing(false)
  }

  const saveEdit = async (id) => {
    setSyncing(true)
    await supabase.from('inventory').update({
      name: editForm.name,
      sku: editForm.sku || null,
      serial_number: editForm.serial_number || null,
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

  const downloadTemplate = () => {
    const csv = 'Name,SKU,Serial Number,Condition,Purchase Cost,Parts Cost,Listed Price,Platform,Status,Purchase Date,Notes\niPhone 12 64GB Black,IP12-64-BLK,DNPXC2XY0J4D,Good,150.00,25.00,249.99,eBay,In Stock,2024-01-15,Minor scratch on back'
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'goto-inventory-template.csv'
    a.click()
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
    const matchSearch = !search || 
      i.name?.toLowerCase().includes(search.toLowerCase()) || 
      i.sku?.toLowerCase().includes(search.toLowerCase()) ||
      i.serial_number?.toLowerCase().includes(search.toLowerCase())
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
          { label:'Inventory value', value:fmtMoney(inventory.filter(i=>i.status!=='Sold'&&i.status!=='Scrapped').reduce((s,i)=>s+parseFloat(i.purchase_cost||0)+parseFloat(i.parts_cost||0),0)), color:'var(--c-text)' },
        ].map(m => (
          <div key={m.label} className="stat-card">
            <div className="stat-label">{m.label}</div>
            <div className="stat-value" style={{ fontSize:20, color:m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* CSV Import */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Import from CSV</span>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-sm" onClick={downloadTemplate}>↓ Download template</button>
            <button className="btn btn-sm btn-primary" onClick={() => fileRef.current.click()}>↑ Upload CSV</button>
            <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }} onChange={handleFileSelect} />
          </div>
        </div>
        <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom: importPreview ? 12 : 0 }}>
          Export your Google Sheet as <strong>File → Download → CSV</strong>, then upload it here. 
          Column headers are flexible — it recognizes names like "Item", "Cost", "Serial", etc.
        </p>

        {importError && (
          <div style={{ marginTop:10, padding:'8px 12px', background:'var(--c-red-bg)', color:'var(--c-red)', borderRadius:8, fontSize:13 }}>
            {importError}
          </div>
        )}

        {importPreview && (
          <div style={{ marginTop:12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:13, fontWeight:500 }}>Preview — {importPreview.length} items found</span>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-sm" onClick={() => setImportPreview(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={confirmImport} disabled={importing}>
                  {importing ? 'Importing…' : `Import ${importPreview.length} items`}
                </button>
              </div>
            </div>
            <div style={{ overflowX:'auto', maxHeight:280, overflowY:'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>SKU</th>
                    <th>Serial #</th>
                    <th>Condition</th>
                    <th>Cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.slice(0, 20).map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td>
                      <td style={{ color:'var(--c-text2)', fontSize:12 }}>{r.sku || '—'}</td>
                      <td style={{ color:'var(--c-text2)', fontSize:12 }}>{r.serial_number || '—'}</td>
                      <td>{conditionBadge(r.condition)}</td>
                      <td className="mono">{fmtMoney(r.purchase_cost)}</td>
                      <td>{statusBadge(r.status)}</td>
                    </tr>
                  ))}
                  {importPreview.length > 20 && (
                    <tr><td colSpan={6} style={{ color:'var(--c-text3)', fontSize:12, textAlign:'center' }}>…and {importPreview.length - 20} more</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add item manually */}
      <div className="card">
        <div className="card-title">Add item manually</div>
        <div className="form-grid form-grid-4" style={{ marginBottom:10 }}>
          <div className="form-group" style={{ gridColumn:'span 2' }}>
            <label className="form-label">Item name *</label>
            <input type="text" placeholder="e.g. iPhone 12 64GB Black" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">SKU / ID</label>
            <input type="text" placeholder="e.g. IP12-64-BLK" value={form.sku} onChange={e => set('sku', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Serial number</label>
            <input type="text" placeholder="e.g. DNPXC2XY0J4D" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
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
            <input type="text" placeholder="Search name, SKU, serial…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ height:32, width:160, fontSize:13 }} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ height:32, width:110, fontSize:12 }}>
              <option value="">All status</option>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {filtered.length === 0
          ? <div className="empty"><div className="empty-icon">📱</div>No items yet. Import a CSV or add items above.</div>
          : (
            <div style={{ overflowX:'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Condition</th>
                    <th className="hide-mobile">Serial #</th>
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
                      <td colSpan={8}>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:8, padding:'8px 0', alignItems:'flex-end' }}>
                          <input style={{ flex:'2 1 160px', height:34 }} type="text" value={editForm.name} onChange={e => setEdit('name', e.target.value)} />
                          <input style={{ flex:'1 1 110px', height:34 }} type="text" value={editForm.serial_number||''} onChange={e => setEdit('serial_number', e.target.value)} placeholder="Serial #" />
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
                      <td className="hide-mobile" style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:'var(--c-text2)' }}>{item.serial_number || '—'}</td>
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
