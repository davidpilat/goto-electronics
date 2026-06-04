import React, { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const CONDITIONS = ['Like New','Excellent','Good','Fair','For Parts']
const STATUSES = ['In Stock','Listed','Sold','Scrapped']
const today = () => new Date().toISOString().slice(0, 10)
const fmtMoney = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })

const COL_MAP = {
  name: ['name','item','item name','title','product','description','device'],
  sku: ['sku','sku/id','product id','sku id','item id'],
  serial_number: ['serial','serial number','serial no','serial num','sn','imei','serial#'],
  condition: ['condition','grade','quality','cond'],
  purchase_cost: ['purchase cost','purchase price','buy price','paid','bought for','cost price','purchase','cost'],
  status: ['status','state'],
  purchase_date: ['purchase date','bought date','date purchased','acquired','date'],
  notes: ['notes','note','comments','comment','memo'],
}

function normalizeHeader(h) { return h.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '') }

function mapHeader(h) {
  const norm = normalizeHeader(h)
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    if (aliases.includes(norm)) return field
  }
  return null
}

function parseCSV(text) {
  const lines = text.trim().replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
  const fieldMap = headers.map(mapHeader)
  return lines.slice(1).map(line => {
    const vals = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = '' }
      else cur += ch
    }
    vals.push(cur.trim())
    const obj = {}
    fieldMap.forEach((field, i) => { if (field) obj[field] = (vals[i] || '').replace(/^"|"$/g, '').trim() })
    return obj
  }).filter(r => r.name)
}

function normalizeRow(row) {
  const condLower = (row.condition||'').toLowerCase()
  let condition = 'Good'
  if (condLower.includes('like new') || condLower === 'ln') condition = 'Like New'
  else if (condLower.includes('excel') || condLower === 'a') condition = 'Excellent'
  else if (condLower.includes('good') || condLower === 'b') condition = 'Good'
  else if (condLower.includes('fair') || condLower === 'c') condition = 'Fair'
  else if (condLower.includes('part') || condLower === 'p') condition = 'For Parts'

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
    status,
    purchase_date: row.purchase_date || today(),
    notes: row.notes || null,
  }
}

function PartPicker({ parts, value, qty, onSelect, onQtyChange, onAdd, onCreateNew, filter, onFilterChange, disabled }) {
  const available = parts.filter(p => p.status === 'Available' || p.status === 'Needed')

  const brands = [...new Set(available.map(p => p.brand).filter(Boolean))].sort()
  const afterBrand = filter.brand ? available.filter(p => p.brand === filter.brand) : available
  const partNames = [...new Set(afterBrand.map(p => p.part_name).filter(Boolean))].sort()
  const afterName = filter.part_name ? afterBrand.filter(p => p.part_name === filter.part_name) : afterBrand
  const colors = [...new Set(afterName.map(p => p.color).filter(Boolean))].sort()

  // Resolve selected part_id from filters
  const matchedPart = afterName.find(p =>
    (!filter.color || p.color === filter.color)
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
        {/* Brand */}
        <div className="form-group" style={{ margin:0 }}>
          <label className="form-label" style={{ fontSize:11 }}>Brand</label>
          <select value={filter.brand} onChange={e => {
            onFilterChange({ brand: e.target.value, part_name: '', color: '' })
            onSelect('')
          }} style={{ height:34, fontSize:12 }}>
            <option value="">— All brands —</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        {/* Part name */}
        <div className="form-group" style={{ margin:0 }}>
          <label className="form-label" style={{ fontSize:11 }}>Part name</label>
          <select value={filter.part_name} onChange={e => {
            onFilterChange({ ...filter, part_name: e.target.value, color: '' })
            onSelect('')
          }} style={{ height:34, fontSize:12 }}>
            <option value="">— All parts —</option>
            {partNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {/* Color */}
        <div className="form-group" style={{ margin:0 }}>
          <label className="form-label" style={{ fontSize:11 }}>Color</label>
          <select value={filter.color} onChange={e => {
            const newFilter = { ...filter, color: e.target.value }
            onFilterChange(newFilter)
            // Auto-select the matching part
            const match = afterName.find(p => p.color === e.target.value || (!e.target.value && true))
            if (match) onSelect(match.id)
            else onSelect('')
          }} style={{ height:34, fontSize:12 }} disabled={colors.length === 0}>
            <option value="">{colors.length === 0 ? '— No color —' : '— Any color —'}</option>
            {colors.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      {/* Qty + Add row */}
      <div style={{ display:'grid', gridTemplateColumns:'80px auto auto', gap:6, alignItems:'center' }}>
        <div className="form-group" style={{ margin:0 }}>
          <label className="form-label" style={{ fontSize:11 }}>Qty</label>
          <input type="number" min="1" step="1" value={qty}
            onChange={e => onQtyChange(e.target.value)}
            style={{ height:34 }} />
        </div>
        <button className="btn btn-primary btn-sm" style={{ alignSelf:'flex-end', height:34 }}
          onClick={onAdd}
          disabled={disabled || !value}>
          + Add requirement
        </button>
        <button className="btn btn-sm" style={{ alignSelf:'flex-end', height:34, color:'var(--c-brand)', fontSize:12 }}
          onClick={onCreateNew}>
          ＋ Create new part…
        </button>
      </div>
    </div>
  )
}

export default function Inventory({ inventory, parts = [], repairReqs = [], setSyncing }) {
  const [form, setForm] = useState({
    name: '', sku: '', serial_number: '', condition: 'Good',
    purchase_cost: '', status: 'In Stock', purchase_date: today(), notes: ''
  })
  const [adding, setAdding] = useState(false)
  const [newItemId, setNewItemId] = useState(null)   // id of just-saved item awaiting parts
  const [newItemReqs, setNewItemReqs] = useState([]) // staged reqs for new item
  const [newReqForm, setNewReqForm] = useState({ part_id: '', qty: 1 })
  const [newReqFilter, setNewReqFilter] = useState({ brand: '', part_name: '', color: '' })
  const [newPartForm, setNewPartForm] = useState(null)
  const [newPartFields, setNewPartFields] = useState({ part_name: '', brand: '', color: '', cost: '' })
  const [reqFilter, setReqFilter] = useState({}) // { [inventoryId]: { brand, part_name, color } }
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [expandedGroups, setExpandedGroups] = useState({})
  const [expandedParts, setExpandedParts] = useState({})
  const [reqForm, setReqForm] = useState({}) // { [inventoryId]: { part_id: '', qty: 1 } }
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
        setImportError('No valid rows found. Make sure your CSV has a Name column.')
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
    for (let i = 0; i < importPreview.length; i += 50) {
      await supabase.from('inventory').insert(importPreview.slice(i, i + 50))
    }
    // Check if any imported items have matching orders — mark them sold
    const serialsToCheck = importPreview.map(r => r.serial_number).filter(Boolean)
    if (serialsToCheck.length > 0) {
      const { data: matchingOrders } = await supabase
        .from('orders')
        .select('serial_number')
        .in('serial_number', serialsToCheck)
      if (matchingOrders?.length > 0) {
        const soldSerials = [...new Set(matchingOrders.map(o => o.serial_number))]
        for (const sn of soldSerials) {
          await supabase.from('inventory').update({ status: 'Sold' })
            .eq('serial_number', sn)
            .neq('status', 'Sold')
        }
      }
    }
    setImportPreview(null)
    setImporting(false); setSyncing(false)
    alert('Imported ' + importPreview.length + ' items successfully!')
  }

  const submit = async () => {
    if (!form.name.trim()) return
    setAdding(true); setSyncing(true)
    const { data: inserted } = await supabase.from('inventory').insert({
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      serial_number: form.serial_number.trim() || null,
      condition: form.condition,
      purchase_cost: parseFloat(form.purchase_cost)||0,
      status: form.status,
      purchase_date: form.purchase_date,
      notes: form.notes.trim() || null,
    }).select()
    // If serial number already has a matching order, mark as sold
    if (form.serial_number.trim()) {
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id')
        .eq('serial_number', form.serial_number.trim())
        .limit(1)
      if (existingOrder?.length > 0) {
        await supabase.from('inventory').update({ status: 'Sold' })
          .eq('serial_number', form.serial_number.trim())
          .neq('status', 'Sold')
      }
    }
    setAdding(false); setSyncing(false)
    if (inserted?.[0]?.id) {
      setNewItemId(inserted[0].id)
      setNewItemReqs([])
      setNewReqForm({ part_id: '', qty: 1 })
    }
  }

  const finishNewItem = () => {
    setNewItemId(null)
    setNewItemReqs([])
    setNewReqForm({ part_id: '', qty: 1 })
    setForm({ name:'', sku:'', serial_number:'', condition:'Good', purchase_cost:'', status:'In Stock', purchase_date:today(), notes:'' })
  }

  const addNewItemReq = async () => {
    if (!newReqForm.part_id || !newItemId) return
    const partOptions = []
    const seen = new Set()
    parts.filter(p => p.status === 'Available').forEach(p => {
      const key = `${p.brand||''}|||${p.part_name}|||${p.color||''}`
      if (!seen.has(key)) {
        seen.add(key)
        partOptions.push({ id: p.id, part_name: p.part_name, brand: p.brand, color: p.color })
      }
    })
    const selected = partOptions.find(o => o.id === newReqForm.part_id)
    if (!selected) return
    setSyncing(true)
    const { data: inserted } = await supabase.from('repair_requirements').insert({
      inventory_id: newItemId,
      part_name: selected.part_name,
      brand: selected.brand || null,
      color: selected.color || null,
      qty: parseInt(newReqForm.qty) || 1,
    }).select()
    if (inserted?.[0]) setNewItemReqs(prev => [...prev, inserted[0]])
    setNewReqForm({ part_id: '', qty: 1 })
    setSyncing(false)
  }

  const removeNewItemReq = async (reqId) => {
    setSyncing(true)
    await supabase.from('repair_requirements').delete().eq('id', reqId)
    setNewItemReqs(prev => prev.filter(r => r.id !== reqId))
    setSyncing(false)
  }

  const createAndSelectPart = async (context) => {
    if (!newPartFields.part_name.trim()) return
    setSyncing(true)
    // Insert with status 'Needed' — defines the part type without adding physical stock
    const { data: inserted } = await supabase.from('parts').insert({
      part_name: newPartFields.part_name.trim(),
      brand: newPartFields.brand.trim() || null,
      color: newPartFields.color.trim() || null,
      cost: parseFloat(newPartFields.cost) || 0,
      status: 'Needed',
      purchase_date: today(),
    }).select()
    setSyncing(false)
    if (!inserted?.[0]) return
    const newId = inserted[0].id
    if (context === 'new') {
      setNewReqForm(prev => ({ ...prev, part_id: newId }))
    } else {
      setReqForm(prev => ({ ...prev, [context]: { ...(prev[context] || { qty:1 }), part_id: newId } }))
    }
    setNewPartForm(null)
    setNewPartFields({ part_name: '', brand: '', color: '', cost: '' })
  }

  const saveEdit = async (id) => {
    setSyncing(true)
    await supabase.from('inventory').update({
      name: editForm.name,
      sku: editForm.sku || null,
      serial_number: editForm.serial_number || null,
      condition: editForm.condition,
      purchase_cost: parseFloat(editForm.purchase_cost)||0,
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
    const csv = 'Name,SKU,Serial Number,Condition,Purchase Cost,Status,Purchase Date,Notes\niPhone 12 64GB Black,IP12-64-BLK,DNPXC2XY0J4D,Good,150.00,In Stock,2024-01-15,Minor scratch on back'
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

  const totalCost = filtered.reduce((s, i) => s + parseFloat(i.purchase_cost||0), 0)
  const inStock = inventory.filter(i => i.status === 'In Stock').length
  const listed = inventory.filter(i => i.status === 'Listed').length
  const totalEverPurchased = inventory.reduce((s, i) => s + parseFloat(i.purchase_cost||0), 0)

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:'1rem' }}>
        {[
          { label:'In stock', value:inStock, color:'var(--c-green)' },
          { label:'Listed', value:listed, color:'var(--c-brand)' },
          { label:'Active inventory value', value:fmtMoney(inventory.filter(i=>i.status!=='Sold'&&i.status!=='Scrapped').reduce((s,i)=>s+parseFloat(i.purchase_cost||0),0)), color:'var(--c-text)', sub:'In stock + listed' },
          { label:'Total ever purchased', value:fmtMoney(totalEverPurchased), color:'var(--c-purple)', sub:'All ' + inventory.length + ' items' },
        ].map(m => (
          <div key={m.label} className="stat-card">
            <div className="stat-label">{m.label}</div>
            <div className="stat-value" style={{ fontSize:20, color:m.color }}>{m.value}</div>
            {m.sub && <div className="stat-sub">{m.sub}</div>}
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
          Export your Google Sheet as <strong>File → Download → CSV</strong>, then upload here.
        </p>
        {importError && (
          <div style={{ marginTop:10, padding:'8px 12px', background:'var(--c-red-bg)', color:'var(--c-red)', borderRadius:8, fontSize:13 }}>{importError}</div>
        )}
        {importPreview && (
          <div style={{ marginTop:12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:13, fontWeight:500 }}>Preview — {importPreview.length} items found</span>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-sm" onClick={() => setImportPreview(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={confirmImport} disabled={importing}>
                  {importing ? 'Importing…' : 'Import ' + importPreview.length + ' items'}
                </button>
              </div>
            </div>
            <div style={{ overflowX:'auto', maxHeight:280, overflowY:'auto' }}>
              <table className="data-table">
                <thead><tr><th>Name</th><th>SKU</th><th>Serial #</th><th>Condition</th><th>Cost</th><th>Status</th></tr></thead>
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
        {!newItemId ? (
          <>
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
                <label className="form-label">Serial number</label>
                <input type="text" placeholder="e.g. DNPXC2XY0J4D" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Purchase cost $</label>
                <input type="number" placeholder="0.00" min="0" step="0.01" value={form.purchase_cost} onChange={e => set('purchase_cost', e.target.value)} />
              </div>
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
            </div>
            <div className="form-grid form-grid-2" style={{ marginBottom:12 }}>
              <div className="form-group">
                <label className="form-label">Purchase date</label>
                <input type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input type="text" placeholder="Any notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={submit} disabled={adding}>{adding ? 'Saving…' : 'Add item'}</button>
          </>
        ) : (
          <>
            {/* Item saved — now add parts */}
            <div style={{ padding:'10px 14px', background:'var(--c-surface2)', borderRadius:8, marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ color:'var(--c-green)', fontSize:16 }}>✓</span>
              <span style={{ fontWeight:600 }}>{form.name}</span>
              <span style={{ fontSize:12, color:'var(--c-text3)' }}>saved — add parts needed for repair below, or skip</span>
            </div>

            {/* Parts already added */}
            {newItemReqs.length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
                {newItemReqs.map(req => {
                  const label = `${req.brand ? req.brand + ' ' : ''}${req.part_name}${req.color ? ' — ' + req.color : ''}`
                  return (
                    <div key={req.id} style={{
                      display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
                      borderRadius:6, fontSize:11, background:'var(--c-surface2)', border:'1px solid var(--c-border)'
                    }}>
                      <span>🔧 <strong>{label}</strong> ×{req.qty}</span>
                      <button className="btn btn-sm btn-danger" style={{ padding:'1px 6px', fontSize:11 }}
                        onClick={() => removeNewItemReq(req.id)}>×</button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add part row */}
            <div style={{ marginBottom:14 }}>
              <label className="form-label">Parts needed for repair</label>
              <PartPicker
                parts={parts}
                value={newReqForm.part_id}
                qty={newReqForm.qty}
                onSelect={id => setNewReqForm(prev => ({ ...prev, part_id: id }))}
                onQtyChange={v => setNewReqForm(prev => ({ ...prev, qty: v }))}
                onAdd={addNewItemReq}
                onCreateNew={() => { setNewPartForm('new'); setNewPartFields({ part_name:'', brand:'', color:'', cost:'' }) }}
                filter={newReqFilter}
                onFilterChange={f => { setNewReqFilter(f); setNewReqForm(prev => ({ ...prev, part_id: '' })) }}
              />
              {newPartForm === 'new' && (
                <div style={{ marginTop:8, padding:'12px', background:'var(--c-surface2)', borderRadius:8, border:'1px solid var(--c-border)' }}>
                  <div style={{ fontSize:12, fontWeight:600, marginBottom:8, color:'var(--c-brand)' }}>Define new part type</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 80px', gap:6, marginBottom:8 }}>
                    <div className="form-group" style={{ margin:0 }}>
                      <label className="form-label">Part name *</label>
                      <input type="text" placeholder="e.g. Studio 3 Headband" value={newPartFields.part_name}
                        onChange={e => setNewPartFields(prev => ({ ...prev, part_name: e.target.value }))} style={{ height:34 }} />
                    </div>
                    <div className="form-group" style={{ margin:0 }}>
                      <label className="form-label">Brand</label>
                      <input type="text" placeholder="e.g. Beats" value={newPartFields.brand}
                        onChange={e => setNewPartFields(prev => ({ ...prev, brand: e.target.value }))} style={{ height:34 }} />
                    </div>
                    <div className="form-group" style={{ margin:0 }}>
                      <label className="form-label">Color</label>
                      <input type="text" placeholder="e.g. Midnight Black" value={newPartFields.color}
                        onChange={e => setNewPartFields(prev => ({ ...prev, color: e.target.value }))} style={{ height:34 }} />
                    </div>
                    <div className="form-group" style={{ margin:0 }}>
                      <label className="form-label">Est. cost $</label>
                      <input type="number" placeholder="0.00" min="0" step="0.01" value={newPartFields.cost}
                        onChange={e => setNewPartFields(prev => ({ ...prev, cost: e.target.value }))} style={{ height:34 }} />
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-sm btn-primary" onClick={() => createAndSelectPart('new')} disabled={!newPartFields.part_name.trim()}>Create & select</button>
                    <button className="btn btn-sm" onClick={() => { setNewPartForm(null); setNewPartFields({ part_name:'', brand:'', color:'', cost:'' }) }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={finishNewItem}>Done — add another item</button>
            </div>
          </>
        )}
      </div>

      {/* Parts to Order summary */}
      {(() => {
        const activeItems = inventory.filter(i => i.status === 'In Stock' || i.status === 'Listed')

        // Build demand map from repair_requirements for active inventory only
        const demandMap = {}
        activeItems.forEach(item => {
          const reqs = repairReqs.filter(r => r.inventory_id === item.id)
          reqs.forEach(req => {
            const key = `${req.brand||''}|||${req.part_name}|||${req.color||''}`
            const label = `${req.brand ? req.brand + ' ' : ''}${req.part_name}${req.color ? ' — ' + req.color : ''}`
            if (!demandMap[key]) demandMap[key] = { label, req, totalNeeded: 0 }
            demandMap[key].totalNeeded += req.qty
          })
        })

        const shortfalls = Object.values(demandMap).map(({ label, req, totalNeeded }) => {
          const avail = parts.filter(p =>
            p.status === 'Available' &&
            p.part_name === req.part_name &&
            (req.brand ? p.brand === req.brand : true) &&
            (req.color ? p.color?.toLowerCase() === req.color.toLowerCase() : true)
          ).length
          const short = Math.max(0, totalNeeded - avail)
          return { label, totalNeeded, avail, short }
        }).filter(s => s.short > 0)

        if (shortfalls.length === 0) return null
        return (
          <div className="card" style={{ borderLeft:'3px solid var(--c-amber)', marginBottom:'1rem' }}>
            <div className="card-header" style={{ marginBottom:8 }}>
              <span className="card-title" style={{ color:'var(--c-amber)' }}>⚠ Parts to Order ({shortfalls.length})</span>
              <span style={{ fontSize:12, color:'var(--c-text3)' }}>Based on in-stock & listed inventory repair requirements</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Part needed</th>
                  <th>Total needed</th>
                  <th>In stock</th>
                  <th>Order</th>
                </tr>
              </thead>
              <tbody>
                {shortfalls.map(s => (
                  <tr key={s.label}>
                    <td style={{ fontWeight:500 }}>🔧 {s.label}</td>
                    <td style={{ color:'var(--c-text2)' }}>{s.totalNeeded}</td>
                    <td style={{ color: s.avail === 0 ? 'var(--c-red)' : 'var(--c-amber)', fontWeight:600 }}>{s.avail}</td>
                    <td style={{ color:'var(--c-red)', fontWeight:700 }}>−{s.short}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })()}

      {/* Inventory list — grouped by SKU */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">{filtered.length} items {totalCost > 0 && '· ' + fmtMoney(totalCost) + ' total cost'}</span>
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
          : (() => {
              // Group by SKU — items with no SKU get their own group by name
              const groups = {}
              filtered.forEach(item => {
                const key = item.sku ? item.sku : ('__no_sku__' + item.name)
                if (!groups[key]) groups[key] = { sku: item.sku, name: item.name, items: [] }
                groups[key].items.push(item)
              })

              return Object.entries(groups).map(([key, group]) => {
                const items = group.items
                const inStock = items.filter(i => i.status === 'In Stock').length
                const listed = items.filter(i => i.status === 'Listed').length
                const sold = items.filter(i => i.status === 'Sold').length
                const totalGroupCost = items.reduce((s, i) => s + parseFloat(i.purchase_cost||0), 0)
                const avgCost = items.length > 0 ? totalGroupCost / items.length : 0
                const isExpanded = expandedGroups[key] !== false // default expanded

                return (
                  <div key={key} style={{ marginBottom:12 }}>
                    {/* SKU group header */}
                    <div
                      onClick={() => setExpandedGroups(prev => ({ ...prev, [key]: !isExpanded }))}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--c-surface2)', borderRadius:'var(--radius)', cursor:'pointer', userSelect:'none' }}
                    >
                      <span style={{ fontSize:13, color:'var(--c-text3)', transform: isExpanded ? 'rotate(90deg)' : 'none', transition:'transform 0.15s', display:'inline-block' }}>▶</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                          {group.sku && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:600, color:'var(--c-brand)' }}>{group.sku}</span>}
                          <span style={{ fontSize:14, fontWeight:500 }}>{items[0].name}</span>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                        {inStock > 0 && <span className="badge badge-green">{inStock} in stock</span>}
                        {listed > 0 && <span className="badge badge-brand">{listed} listed</span>}
                        {sold > 0 && <span className="badge badge-gray">{sold} sold</span>}
                        <span style={{ fontSize:12, color:'var(--c-text2)', fontFamily:"'DM Mono',monospace" }}>avg {fmtMoney(avgCost)}</span>
                        <span style={{ fontSize:12, color:'var(--c-text3)' }}>{items.length} total</span>
                      </div>
                    </div>

                    {/* Expanded items table */}
                    {isExpanded && (
                      <div style={{ overflowX:'auto', marginTop:2 }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Serial #</th>
                              <th>Condition</th>
                              <th className="hide-mobile">Cost</th>
                              <th className="hide-mobile">Date</th>
                              <th className="hide-mobile">Notes</th>
                              <th>Status</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map(item => editId === item.id ? (
                              <tr key={item.id}>
                                <td colSpan={7}>
                                  <div style={{ display:'flex', flexWrap:'wrap', gap:8, padding:'8px 0', alignItems:'flex-end' }}>
                                    <input style={{ flex:'2 1 160px', height:34 }} type="text" value={editForm.name} onChange={e => setEdit('name', e.target.value)} placeholder="Name" />
                                    <input style={{ flex:'1 1 110px', height:34 }} type="text" value={editForm.serial_number||''} onChange={e => setEdit('serial_number', e.target.value)} placeholder="Serial #" />
                                    <input style={{ flex:'1 1 90px', height:34 }} type="number" value={editForm.purchase_cost} onChange={e => setEdit('purchase_cost', e.target.value)} placeholder="Cost $" />
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
                              <React.Fragment key={item.id}>
                              <tr>
                                <td style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:'var(--c-text2)' }}>{item.serial_number || '—'}</td>
                                <td>{conditionBadge(item.condition)}</td>
                                <td className="hide-mobile mono">{fmtMoney(item.purchase_cost)}</td>
                                <td className="hide-mobile" style={{ fontSize:12, color:'var(--c-text3)' }}>{item.purchase_date || '—'}</td>
                                <td className="hide-mobile" style={{ fontSize:12, color:'var(--c-text3)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.notes || '—'}</td>
                                <td>{statusBadge(item.status)}</td>
                                <td style={{ display:'flex', gap:4 }}>
                                  <button className="btn btn-sm" onClick={() => { setEditId(item.id); setEditForm({...item}) }}>Edit</button>
                                  <button className="btn btn-sm btn-danger" onClick={() => deleteItem(item.id)}>×</button>
                                </td>
                              </tr>
                              {(() => {
                                const itemReqs = repairReqs.filter(r => r.inventory_id === item.id)
                                const isOpen = expandedParts[item.id]
                                const rf = reqForm[item.id] || { part_id: '', qty: 1 }

                                const addReq = async () => {
                                  if (!rf.part_id) return
                                  const selected = parts.find(p => p.id === rf.part_id)
                                  if (!selected) return
                                  setSyncing(true)
                                  await supabase.from('repair_requirements').insert({
                                    inventory_id: item.id,
                                    part_name: selected.part_name,
                                    brand: selected.brand || null,
                                    color: selected.color || null,
                                    qty: parseInt(rf.qty) || 1,
                                  })
                                  setReqForm(prev => ({ ...prev, [item.id]: { part_id: '', qty: 1 } }))
                                  setSyncing(false)
                                }

                                const removeReq = async (reqId) => {
                                  setSyncing(true)
                                  await supabase.from('repair_requirements').delete().eq('id', reqId)
                                  setSyncing(false)
                                }

                                return (
                                  <tr>
                                    <td colSpan={7} style={{ padding:'0 4px 8px', borderBottom:'1px solid var(--c-border)' }}>
                                      <button
                                        onClick={() => setExpandedParts(prev => ({ ...prev, [item.id]: !isOpen }))}
                                        style={{ fontSize:11, background:'none', border:'none', cursor:'pointer',
                                          color: itemReqs.length > 0 ? 'var(--c-brand)' : 'var(--c-text3)',
                                          padding:'4px 0', display:'flex', alignItems:'center', gap:4 }}
                                      >
                                        🔧 Parts needed for repair ({itemReqs.length})
                                        <span style={{ fontSize:10 }}>{isOpen ? '▲' : '▼'}</span>
                                      </button>
                                      {isOpen && (
                                        <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:8, maxWidth:560 }}>
                                          {/* Existing requirements */}
                                          {itemReqs.length > 0 && (
                                            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                                              {itemReqs.map(req => {
                                                const avail = parts.filter(p =>
                                                  p.status === 'Available' &&
                                                  p.part_name === req.part_name &&
                                                  (req.brand ? p.brand === req.brand : true) &&
                                                  (req.color ? p.color?.toLowerCase() === req.color.toLowerCase() : true)
                                                ).length
                                                const ok = avail >= req.qty
                                                const label = `${req.brand ? req.brand + ' ' : ''}${req.part_name}${req.color ? ' — ' + req.color : ''}`
                                                return (
                                                  <div key={req.id} style={{
                                                    display:'flex', alignItems:'center', gap:8,
                                                    padding:'6px 10px', borderRadius:6, fontSize:11,
                                                    background: ok ? 'var(--c-surface2)' : 'rgba(255,100,100,0.08)',
                                                    border:`1px solid ${ok ? 'var(--c-border)' : 'var(--c-red)'}`,
                                                  }}>
                                                    <div>
                                                      <span style={{ fontWeight:600 }}>{label}</span>
                                                      <span style={{ color:'var(--c-text3)', marginLeft:6 }}>×{req.qty}</span>
                                                      <span style={{ marginLeft:8, color: ok ? 'var(--c-green)' : 'var(--c-red)', fontWeight:600 }}>
                                                        {avail} in stock {!ok && `(need ${req.qty - avail} more)`}
                                                      </span>
                                                    </div>
                                                    <button className="btn btn-sm btn-danger" style={{ padding:'1px 6px', fontSize:11 }}
                                                      onClick={() => removeReq(req.id)}>×</button>
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          )}
                                          {/* Add new requirement */}
                                          <div>
                                            <PartPicker
                                              parts={parts}
                                              value={rf.part_id}
                                              qty={rf.qty || 1}
                                              onSelect={id => setReqForm(prev => ({ ...prev, [item.id]: { ...rf, part_id: id } }))}
                                              onQtyChange={v => setReqForm(prev => ({ ...prev, [item.id]: { ...rf, qty: v } }))}
                                              onAdd={addReq}
                                              onCreateNew={() => { setNewPartForm(item.id); setNewPartFields({ part_name:'', brand:'', color:'', cost:'' }) }}
                                              filter={reqFilter[item.id] || { brand:'', part_name:'', color:'' }}
                                              onFilterChange={f => {
                                                setReqFilter(prev => ({ ...prev, [item.id]: f }))
                                                setReqForm(prev => ({ ...prev, [item.id]: { ...rf, part_id: '' } }))
                                              }}
                                            />
                                            {newPartForm === item.id && (
                                              <div style={{ marginTop:8, padding:'12px', background:'var(--c-surface2)', borderRadius:8, border:'1px solid var(--c-border)' }}>
                                                <div style={{ fontSize:12, fontWeight:600, marginBottom:8, color:'var(--c-brand)' }}>Define new part type</div>
                                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 80px', gap:6, marginBottom:8 }}>
                                                  <div className="form-group" style={{ margin:0 }}>
                                                    <label className="form-label">Part name *</label>
                                                    <input type="text" placeholder="e.g. Studio 3 Headband" value={newPartFields.part_name}
                                                      onChange={e => setNewPartFields(prev => ({ ...prev, part_name: e.target.value }))} style={{ height:34 }} />
                                                  </div>
                                                  <div className="form-group" style={{ margin:0 }}>
                                                    <label className="form-label">Brand</label>
                                                    <input type="text" placeholder="e.g. Beats" value={newPartFields.brand}
                                                      onChange={e => setNewPartFields(prev => ({ ...prev, brand: e.target.value }))} style={{ height:34 }} />
                                                  </div>
                                                  <div className="form-group" style={{ margin:0 }}>
                                                    <label className="form-label">Color</label>
                                                    <input type="text" placeholder="e.g. Midnight Black" value={newPartFields.color}
                                                      onChange={e => setNewPartFields(prev => ({ ...prev, color: e.target.value }))} style={{ height:34 }} />
                                                  </div>
                                                  <div className="form-group" style={{ margin:0 }}>
                                                    <label className="form-label">Est. cost $</label>
                                                    <input type="number" placeholder="0.00" min="0" step="0.01" value={newPartFields.cost}
                                                      onChange={e => setNewPartFields(prev => ({ ...prev, cost: e.target.value }))} style={{ height:34 }} />
                                                  </div>
                                                </div>
                                                <div style={{ display:'flex', gap:6 }}>
                                                  <button className="btn btn-sm btn-primary" onClick={() => createAndSelectPart(item.id)} disabled={!newPartFields.part_name.trim()}>Create & select</button>
                                                  <button className="btn btn-sm" onClick={() => { setNewPartForm(null); setNewPartFields({ part_name:'', brand:'', color:'', cost:'' }) }}>Cancel</button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })()}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })
            })()
        }
      </div>
    </div>
  )
}
