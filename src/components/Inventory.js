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

// Empty repair form state factory
const emptyRepairForm = () => ({
  brand: '',
  part_name: '',
  color: '',
  qty: 1,
  repair_notes: '',
  repair_date: today(),
  partsUsed: [],   // [{ part_id, part_name, brand, color, qty, unit_cost }]
})

export default function Inventory({ inventory, parts = [], repairReqs = [], setSyncing, onRefresh }) {
  const [form, setForm] = useState({
    name: '', sku: '', serial_number: '', condition: 'Good',
    purchase_cost: '', status: 'In Stock', purchase_date: today(), notes: ''
  })
  const [adding, setAdding] = useState(false)
  const [newItemId, setNewItemId] = useState(null)
  const [newItemReqs, setNewItemReqs] = useState([])
  const [newReqForm, setNewReqForm] = useState({ part_id: '', qty: 1 })
  const [newPartForm, setNewPartForm] = useState(null)
  const [newPartFields, setNewPartFields] = useState({ part_name: '', brand: '', color: '', cost: '' })
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [expandedGroups, setExpandedGroups] = useState({})
  const [expandedParts, setExpandedParts] = useState({})
  const [reqForm, setReqForm] = useState({})
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState(null)
  const [importError, setImportError] = useState('')
  // Mark as Repaired state
  const [repairOpen, setRepairOpen] = useState({})       // { [itemId]: bool }
  const [repairForms, setRepairForms] = useState({})     // { [itemId]: repairFormState }
  const [repairSaving, setRepairSaving] = useState({})   // { [itemId]: bool }
  const fileRef = useRef()

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const setEdit = (k, v) => setEditForm(prev => ({ ...prev, [k]: v }))

  // Repair form helpers
  const getRepairForm = (itemId) => repairForms[itemId] || emptyRepairForm()
  const setRepairField = (itemId, key, val) =>
    setRepairForms(prev => ({ ...prev, [itemId]: { ...(prev[itemId] || emptyRepairForm()), [key]: val } }))

  const toggleRepair = (itemId) => {
    setRepairOpen(prev => {
      const open = !prev[itemId]
      if (open && !repairForms[itemId]) {
        setRepairForms(p => ({ ...p, [itemId]: emptyRepairForm() }))
      }
      return { ...prev, [itemId]: open }
    })
  }

  // Add a part to the repair form's partsUsed list
  const addRepairPart = (itemId) => {
    const rf = getRepairForm(itemId)
    if (!rf.part_name.trim()) return
    // Find matching available part
    const match = parts.find(p =>
      p.status === 'Available' &&
      p.part_name === rf.part_name &&
      (!rf.brand || p.brand === rf.brand) &&
      (!rf.color || p.color?.toLowerCase() === rf.color.toLowerCase())
    )
    const unit_cost = match ? parseFloat(match.cost || 0) : 0
    const entry = {
      part_id: match?.id || null,
      part_name: rf.part_name,
      brand: rf.brand || null,
      color: rf.color || null,
      qty: parseInt(rf.qty) || 1,
      unit_cost,
    }
    setRepairForms(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || emptyRepairForm()),
        partsUsed: [...(prev[itemId]?.partsUsed || []), entry],
        brand: '', part_name: '', color: '', qty: 1,
      }
    }))
  }

  const removeRepairPart = (itemId, idx) => {
    setRepairForms(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || emptyRepairForm()),
        partsUsed: (prev[itemId]?.partsUsed || []).filter((_, i) => i !== idx),
      }
    }))
  }

  // Commit the repair: mark parts Used, update inventory parts_cost + repaired
  const submitRepair = async (item) => {
    const rf = getRepairForm(item.id)
    setRepairSaving(prev => ({ ...prev, [item.id]: true }))
    setSyncing(true)

    const sn = item.serial_number || null

    // For each part used, mark one Available unit as Used
    for (const entry of rf.partsUsed) {
      // Find an available part record matching this part
      const matchParts = parts.filter(p =>
        p.status === 'Available' &&
        p.part_name === entry.part_name &&
        (!entry.brand || p.brand === entry.brand) &&
        (!entry.color || p.color?.toLowerCase() === entry.color?.toLowerCase())
      )
      // Mark qty units as Used
      const toMark = matchParts.slice(0, entry.qty)
      for (const p of toMark) {
        await supabase.from('parts').update({
          status: 'Used',
          used_on_serial: sn || null,
          used_date: rf.repair_date,
        }).eq('id', p.id)
      }
    }

    // Sum total parts cost
    const totalPartsCost = rf.partsUsed.reduce((s, e) => s + (e.unit_cost * e.qty), 0)
    const existingPartsCost = parseFloat(item.parts_cost || 0)

    // Update inventory row
    await supabase.from('inventory').update({
      repaired: true,
      repair_notes: rf.repair_notes || null,
      parts_cost: existingPartsCost + totalPartsCost,
    }).eq('id', item.id)

    setSyncing(false)
    setRepairSaving(prev => ({ ...prev, [item.id]: false }))
    setRepairOpen(prev => ({ ...prev, [item.id]: false }))
    setRepairForms(prev => ({ ...prev, [item.id]: emptyRepairForm() }))
    onRefresh?.()
  }

  // Undo repair: clear repaired flag, notes, parts_cost
  const undoRepair = async (itemId) => {
    if (!window.confirm('Clear repair status for this item?')) return
    setSyncing(true)
    await supabase.from('inventory').update({ repaired: false, repair_notes: null, parts_cost: 0 }).eq('id', itemId)
    setSyncing(false)
    onRefresh?.()
  }

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
    onRefresh?.()
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
    onRefresh?.()
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
    onRefresh?.()
  }

  const deleteItem = async (id) => {
    if (!window.confirm('Delete this item?')) return
    setSyncing(true)
    await supabase.from('inventory').delete().eq('id', id)
    setSyncing(false)
    onRefresh?.()
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

  // Unique brands and part names from available parts for cascading pickers
  const availableParts = parts.filter(p => p.status === 'Available')
  const uniqueBrands = [...new Set(availableParts.map(p => p.brand).filter(Boolean))].sort()

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
            <div style={{ padding:'10px 14px', background:'var(--c-surface2)', borderRadius:8, marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ color:'var(--c-green)', fontSize:16 }}>✓</span>
              <span style={{ fontWeight:600 }}>{form.name}</span>
              <span style={{ fontSize:12, color:'var(--c-text3)' }}>saved — add parts needed for repair below, or skip</span>
            </div>

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

            {(() => {
              const partOptions = []
              const seen = new Set()
              parts.filter(p => p.status === 'Available' || p.status === 'Needed').forEach(p => {
                const key = `${p.brand||''}|||${p.part_name}|||${p.color||''}`
                if (!seen.has(key)) {
                  seen.add(key)
                  partOptions.push({
                    id: p.id,
                    label: `${p.brand ? p.brand + ' ' : ''}${p.part_name}${p.color ? ' — ' + p.color : ''}`
                  })
                }
              })
              return (
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 64px auto', gap:6, marginBottom:6 }}>
                    <select value={newReqForm.part_id}
                      onChange={e => {
                        if (e.target.value === '__create__') { setNewPartForm('new'); setNewReqForm(prev => ({ ...prev, part_id: '' })) }
                        else setNewReqForm(prev => ({ ...prev, part_id: e.target.value }))
                      }}>
                      <option value="">— Select part needed —</option>
                      {partOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      <option value="__create__">＋ Create new part…</option>
                    </select>
                    <input type="number" min="1" step="1" value={newReqForm.qty}
                      onChange={e => setNewReqForm(prev => ({ ...prev, qty: e.target.value }))}
                      style={{ height:36 }} />
                    <button className="btn btn-sm btn-primary" onClick={addNewItemReq} disabled={!newReqForm.part_id}>+ Add</button>
                  </div>
                  {newPartForm === 'new' && (
                    <div style={{ padding:'12px', background:'var(--c-surface2)', borderRadius:8, border:'1px solid var(--c-border)' }}>
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
              )
            })()}

            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={finishNewItem}>Done — add another item</button>
            </div>
          </>
        )}
      </div>

      {/* Parts to Order summary */}
      {(() => {
        const activeItems = inventory.filter(i => i.status === 'In Stock' || i.status === 'Listed')
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

        {/* Legend */}
        <div style={{ display:'flex', gap:12, fontSize:11, color:'var(--c-text3)', marginBottom:10, flexWrap:'wrap' }}>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:2, background:'#6b7280', display:'inline-block' }} /> Needs repair</span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:2, background:'#0ea5e9', display:'inline-block' }} /> Repaired / ready</span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:2, background:'#16a34a', display:'inline-block' }} /> Parts all in stock</span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:2, background:'#d97706', display:'inline-block' }} /> Parts partial</span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:2, background:'#dc2626', display:'inline-block' }} /> Parts missing</span>
        </div>

        {filtered.length === 0
          ? <div className="empty"><div className="empty-icon">📱</div>No items yet. Import a CSV or add items above.</div>
          : (() => {
              const groups = {}
              filtered.forEach(item => {
                const key = item.sku ? item.sku : ('__no_sku__' + item.name)
                if (!groups[key]) groups[key] = { sku: item.sku, name: item.name, items: [] }
                groups[key].items.push(item)
              })

              return Object.entries(groups).map(([key, group]) => {
                const items = group.items
                const inStockG = items.filter(i => i.status === 'In Stock').length
                const listedG = items.filter(i => i.status === 'Listed').length
                const soldG = items.filter(i => i.status === 'Sold').length
                const totalGroupCost = items.reduce((s, i) => s + parseFloat(i.purchase_cost||0), 0)
                const avgCost = items.length > 0 ? totalGroupCost / items.length : 0
                const isExpanded = expandedGroups[key] === true

                return (
                  <div key={key} style={{ marginBottom:12 }}>
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
                        {inStockG > 0 && <span className="badge badge-green">{inStockG} in stock</span>}
                        {listedG > 0 && <span className="badge badge-brand">{listedG} listed</span>}
                        {soldG > 0 && <span className="badge badge-gray">{soldG} sold</span>}
                        <span style={{ fontSize:12, color:'var(--c-text2)', fontFamily:"'DM Mono',monospace" }}>avg {fmtMoney(avgCost)}</span>
                        <span style={{ fontSize:12, color:'var(--c-text3)' }}>{items.length} total</span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ overflowX:'auto', marginTop:2 }}>
                        <table className="data-table" style={{ fontSize:12 }}>
                          <thead>
                            <tr>
                              <th style={{ width:4, padding:'6px 4px' }}></th>
                              <th>Model</th>
                              <th>Color</th>
                              <th>Cond</th>
                              <th>Serial #</th>
                              <th>Cost</th>
                              <th>Status</th>
                              <th>Parts / Repair</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map(item => {
                              if (editId === item.id) return (
                                <tr key={item.id}>
                                  <td colSpan={9}>
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
                              )

                              // Repair status calculation
                              const itemReqs = repairReqs.filter(r => r.inventory_id === item.id)
                              const reqsWithStock = itemReqs.map(req => {
                                const avail = parts.filter(p =>
                                  p.status === 'Available' &&
                                  p.part_name === req.part_name &&
                                  (req.brand ? p.brand === req.brand : true) &&
                                  (req.color ? p.color?.toLowerCase() === req.color.toLowerCase() : true)
                                ).length
                                return { ...req, avail, ok: avail >= req.qty }
                              })
                              const allOk = itemReqs.length > 0 && reqsWithStock.every(r => r.ok)
                              const someOk = itemReqs.length > 0 && reqsWithStock.some(r => r.ok) && !allOk
                              const noneOk = itemReqs.length > 0 && reqsWithStock.every(r => !r.ok)
                              const isRepaired = item.repaired === true

                              // Row left-border color: blue=repaired, green=parts ok, amber=partial, red=missing, gray=no reqs
                              const rowColor = isRepaired
                                ? '#0ea5e9'
                                : allOk ? '#16a34a'
                                : someOk ? '#d97706'
                                : noneOk ? '#dc2626'
                                : '#6b7280'
                              const rowBg = isRepaired
                                ? 'rgba(14,165,233,0.05)'
                                : allOk ? 'rgba(22,163,74,0.05)'
                                : someOk ? 'rgba(217,119,6,0.05)'
                                : noneOk ? 'rgba(220,38,38,0.05)'
                                : 'transparent'

                              const isOpen = expandedParts[item.id]
                              const isRepairOpen = repairOpen[item.id]
                              const rf = reqForm[item.id] || { part_id: '', qty: 1 }
                              const repairF = getRepairForm(item.id)

                              const partOptions = []
                              const seen = new Set()
                              parts.filter(p => p.status === 'Available' || p.status === 'Needed').forEach(p => {
                                const k = `${p.brand||''}|||${p.part_name}|||${p.color||''}`
                                if (!seen.has(k)) {
                                  seen.add(k)
                                  partOptions.push({ id: p.id, label: `${p.brand ? p.brand + ' ' : ''}${p.part_name}${p.color ? ' — ' + p.color : ''}`, part_name: p.part_name, brand: p.brand, color: p.color })
                                }
                              })

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
                                onRefresh?.()
                              }

                              const removeReq = async (reqId) => {
                                setSyncing(true)
                                await supabase.from('repair_requirements').delete().eq('id', reqId)
                                setSyncing(false)
                                onRefresh?.()
                              }

                              const condShort = { 'Like New':'LN', 'Excellent':'A', 'Good':'B', 'Fair':'C', 'For Parts':'P' }
                              const condColor = { 'Like New':'var(--c-green)', 'Excellent':'var(--c-green)', 'Good':'var(--c-brand)', 'Fair':'var(--c-amber)', 'For Parts':'var(--c-red)' }

                              // Cascading part picker values for repair form
                              const rpBrands = [...new Set(availableParts.map(p => p.brand).filter(Boolean))].sort()
                              const rpPartNames = repairF.brand
                                ? [...new Set(availableParts.filter(p => p.brand === repairF.brand).map(p => p.part_name))].sort()
                                : [...new Set(availableParts.map(p => p.part_name))].sort()
                              const rpColors = (repairF.part_name
                                ? availableParts.filter(p =>
                                    p.part_name === repairF.part_name &&
                                    (!repairF.brand || p.brand === repairF.brand)
                                  ).map(p => p.color).filter(Boolean)
                                : []
                              )
                              const rpColorsUniq = [...new Set(rpColors)].sort()

                              // Count available stock for selected part
                              const rpStockCount = repairF.part_name
                                ? availableParts.filter(p =>
                                    p.part_name === repairF.part_name &&
                                    (!repairF.brand || p.brand === repairF.brand) &&
                                    (!repairF.color || p.color?.toLowerCase() === repairF.color.toLowerCase())
                                  ).length
                                : 0

                              const totalRepairCost = repairF.partsUsed.reduce((s, e) => s + e.unit_cost * e.qty, 0)

                              return (
                                <React.Fragment key={item.id}>
                                  <tr style={{ background: rowBg }}>
                                    <td style={{ padding:0, width:4 }}>
                                      <div style={{ width:4, height:'100%', minHeight:36, background: rowColor, borderRadius:2 }} />
                                    </td>
                                    <td style={{ fontSize:12, color:'var(--c-text2)' }}>{item.name}</td>
                                    <td style={{ fontSize:12 }}>{item.notes || '—'}</td>
                                    <td>
                                      <span style={{ fontSize:11, fontWeight:700, color: condColor[item.condition] || 'var(--c-text2)' }}>
                                        {condShort[item.condition] || item.condition}
                                      </span>
                                    </td>
                                    <td style={{ fontSize:11, fontFamily:"'DM Mono',monospace", color:'var(--c-text3)' }}>{item.serial_number || '—'}</td>
                                    <td style={{ fontSize:11, fontFamily:"'DM Mono',monospace" }}>
                                      <span>{fmtMoney(item.purchase_cost)}</span>
                                      {parseFloat(item.parts_cost||0) > 0 && (
                                        <span style={{ display:'block', color:'var(--c-brand)', fontSize:10 }}>+{fmtMoney(item.parts_cost)} parts</span>
                                      )}
                                    </td>
                                    <td>
                                      <div style={{ display:'flex', flexDirection:'column', gap:2, alignItems:'flex-start' }}>
                                        {statusBadge(item.status)}
                                        {isRepaired && <span style={{ fontSize:10, color:'#0ea5e9', fontWeight:600 }}>✓ Repaired</span>}
                                      </div>
                                    </td>
                                    <td>
                                      {itemReqs.length === 0 ? (
                                        <span style={{ fontSize:11, color:'var(--c-text3)' }}>—</span>
                                      ) : (
                                        <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                                          {reqsWithStock.map(req => {
                                            const label = `${req.brand ? req.brand.split(' ')[0] + ' ' : ''}${req.part_name}${req.color ? ' ('+req.color+')' : ''}`
                                            return (
                                              <span key={req.id} style={{
                                                fontSize:10, padding:'1px 5px', borderRadius:3, whiteSpace:'nowrap',
                                                background: req.ok ? 'var(--c-green-bg)' : 'var(--c-red-bg)',
                                                color: req.ok ? 'var(--c-green)' : 'var(--c-red)',
                                                border: `1px solid ${req.ok ? 'var(--c-green)' : 'var(--c-red)'}`,
                                              }}>
                                                {req.ok ? '✓' : '✗'} {label}
                                              </span>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </td>
                                    <td>
                                      <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
                                        {/* Mark as Repaired button */}
                                        {!isRepaired ? (
                                          <button
                                            className="btn btn-sm"
                                            style={{ height:26, padding:'0 8px', fontSize:11, background: isRepairOpen ? 'var(--c-brand)' : undefined, color: isRepairOpen ? '#fff' : undefined }}
                                            onClick={() => toggleRepair(item.id)}
                                            title="Log repair & parts used"
                                          >
                                            🔧 Repair
                                          </button>
                                        ) : (
                                          <button
                                            className="btn btn-sm"
                                            style={{ height:26, padding:'0 8px', fontSize:11, color:'#0ea5e9' }}
                                            onClick={() => undoRepair(item.id)}
                                            title="Clear repair status"
                                          >
                                            ✓ Repaired
                                          </button>
                                        )}
                                        <button className="btn btn-sm" style={{ height:26, padding:'0 8px', fontSize:11 }}
                                          onClick={() => setExpandedParts(prev => ({ ...prev, [item.id]: !isOpen }))}>
                                          Parts{itemReqs.length > 0 ? ` (${itemReqs.length})` : ' +'}
                                        </button>
                                        <button className="btn btn-sm" style={{ height:26, padding:'0 8px', fontSize:11 }}
                                          onClick={() => { setEditId(item.id); setEditForm({...item}) }}>Edit</button>
                                        <button className="btn btn-sm btn-danger" style={{ height:26, padding:'0 6px', fontSize:11 }}
                                          onClick={() => deleteItem(item.id)}>×</button>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* Mark as Repaired panel */}
                                  {isRepairOpen && !isRepaired && (
                                    <tr style={{ background:'rgba(14,165,233,0.04)' }}>
                                      <td colSpan={9} style={{ padding:'12px 14px 16px 14px', borderBottom:'2px solid #0ea5e9' }}>
                                        <div style={{ maxWidth:620 }}>
                                          <div style={{ fontSize:13, fontWeight:600, color:'#0ea5e9', marginBottom:10 }}>
                                            🔧 Mark as Repaired — {item.name}
                                          </div>

                                          {/* Parts used so far */}
                                          {repairF.partsUsed.length > 0 && (
                                            <div style={{ marginBottom:10 }}>
                                              <div style={{ fontSize:11, color:'var(--c-text3)', marginBottom:4 }}>Parts logged:</div>
                                              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                                                {repairF.partsUsed.map((p, i) => (
                                                  <div key={i} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:6, background:'rgba(14,165,233,0.1)', border:'1px solid #0ea5e9', fontSize:11 }}>
                                                    <span style={{ fontWeight:600 }}>
                                                      {p.brand ? p.brand + ' ' : ''}{p.part_name}{p.color ? ' — ' + p.color : ''}
                                                    </span>
                                                    <span style={{ color:'var(--c-text3)' }}>×{p.qty}</span>
                                                    {p.unit_cost > 0 && <span style={{ color:'#0ea5e9' }}>{fmtMoney(p.unit_cost * p.qty)}</span>}
                                                    <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--c-text3)', fontSize:12, lineHeight:1, padding:'0 2px' }} onClick={() => removeRepairPart(item.id, i)}>×</button>
                                                  </div>
                                                ))}
                                              </div>
                                              {totalRepairCost > 0 && (
                                                <div style={{ fontSize:12, color:'var(--c-text2)', marginTop:6 }}>
                                                  Parts cost: <strong style={{ color:'#0ea5e9' }}>{fmtMoney(totalRepairCost)}</strong>
                                                  {parseFloat(item.parts_cost||0) > 0 && <span style={{ color:'var(--c-text3)' }}> (existing: {fmtMoney(item.parts_cost)}, new total: {fmtMoney(parseFloat(item.parts_cost||0) + totalRepairCost)})</span>}
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {/* Add part row — cascading pickers */}
                                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 60px auto', gap:6, marginBottom:8, alignItems:'end' }}>
                                            <div>
                                              <div style={{ fontSize:11, color:'var(--c-text3)', marginBottom:3 }}>Brand</div>
                                              <select
                                                value={repairF.brand}
                                                onChange={e => {
                                                  setRepairField(item.id, 'brand', e.target.value)
                                                  setRepairField(item.id, 'part_name', '')
                                                  setRepairField(item.id, 'color', '')
                                                }}
                                                style={{ height:32, fontSize:12, width:'100%' }}
                                              >
                                                <option value="">All brands</option>
                                                {rpBrands.map(b => <option key={b} value={b}>{b}</option>)}
                                              </select>
                                            </div>
                                            <div>
                                              <div style={{ fontSize:11, color:'var(--c-text3)', marginBottom:3 }}>Part name</div>
                                              <select
                                                value={repairF.part_name}
                                                onChange={e => {
                                                  setRepairField(item.id, 'part_name', e.target.value)
                                                  setRepairField(item.id, 'color', '')
                                                }}
                                                style={{ height:32, fontSize:12, width:'100%' }}
                                              >
                                                <option value="">— Select part —</option>
                                                {rpPartNames.map(n => <option key={n} value={n}>{n}</option>)}
                                              </select>
                                            </div>
                                            <div>
                                              <div style={{ fontSize:11, color:'var(--c-text3)', marginBottom:3 }}>
                                                Color{rpStockCount > 0 && <span style={{ color:'var(--c-green)', marginLeft:4 }}>({rpStockCount} available)</span>}
                                              </div>
                                              <select
                                                value={repairF.color}
                                                onChange={e => setRepairField(item.id, 'color', e.target.value)}
                                                style={{ height:32, fontSize:12, width:'100%' }}
                                                disabled={rpColorsUniq.length === 0}
                                              >
                                                <option value="">Any color</option>
                                                {rpColorsUniq.map(c => <option key={c} value={c}>{c}</option>)}
                                              </select>
                                            </div>
                                            <div>
                                              <div style={{ fontSize:11, color:'var(--c-text3)', marginBottom:3 }}>Qty</div>
                                              <input
                                                type="number" min="1" step="1"
                                                value={repairF.qty}
                                                onChange={e => setRepairField(item.id, 'qty', e.target.value)}
                                                style={{ height:32, fontSize:12, width:'100%' }}
                                              />
                                            </div>
                                            <button
                                              className="btn btn-sm btn-primary"
                                              style={{ height:32 }}
                                              onClick={() => addRepairPart(item.id)}
                                              disabled={!repairF.part_name}
                                            >
                                              + Add
                                            </button>
                                          </div>

                                          {rpStockCount === 0 && repairF.part_name && (
                                            <div style={{ fontSize:11, color:'var(--c-amber)', marginBottom:8 }}>
                                              ⚠ No available stock found for this part — it will still be logged but stock count won't change.
                                            </div>
                                          )}

                                          {/* Repair notes + date */}
                                          <div style={{ display:'grid', gridTemplateColumns:'1fr 140px', gap:8, marginBottom:12 }}>
                                            <div>
                                              <div style={{ fontSize:11, color:'var(--c-text3)', marginBottom:3 }}>Repair notes (optional)</div>
                                              <input
                                                type="text"
                                                placeholder="e.g. replaced headband, cleaned contacts…"
                                                value={repairF.repair_notes}
                                                onChange={e => setRepairField(item.id, 'repair_notes', e.target.value)}
                                                style={{ height:32, fontSize:12, width:'100%' }}
                                              />
                                            </div>
                                            <div>
                                              <div style={{ fontSize:11, color:'var(--c-text3)', marginBottom:3 }}>Repair date</div>
                                              <input
                                                type="date"
                                                value={repairF.repair_date}
                                                onChange={e => setRepairField(item.id, 'repair_date', e.target.value)}
                                                style={{ height:32, fontSize:12, width:'100%' }}
                                              />
                                            </div>
                                          </div>

                                          {/* Actions */}
                                          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                                            <button
                                              className="btn btn-primary"
                                              style={{ fontSize:12 }}
                                              onClick={() => submitRepair(item)}
                                              disabled={repairSaving[item.id]}
                                            >
                                              {repairSaving[item.id] ? 'Saving…' : '✓ Mark as Repaired'}
                                            </button>
                                            <button
                                              className="btn btn-sm"
                                              onClick={() => toggleRepair(item.id)}
                                            >
                                              Cancel
                                            </button>
                                            <span style={{ fontSize:11, color:'var(--c-text3)' }}>
                                              {repairF.partsUsed.length === 0
                                                ? 'No parts logged — you can still mark as repaired'
                                                : `${repairF.partsUsed.length} part(s) will be deducted from stock`}
                                            </span>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}

                                  {/* Parts requirements panel */}
                                  {isOpen && (
                                    <tr style={{ background: rowBg }}>
                                      <td colSpan={9} style={{ padding:'4px 8px 12px 12px', borderBottom:'1px solid var(--c-border)' }}>
                                        <div style={{ display:'flex', flexDirection:'column', gap:8, maxWidth:560 }}>
                                          {itemReqs.length > 0 && (
                                            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                                              {reqsWithStock.map(req => {
                                                const ok = req.ok
                                                const label = `${req.brand ? req.brand + ' ' : ''}${req.part_name}${req.color ? ' — ' + req.color : ''}`
                                                return (
                                                  <div key={req.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 9px', borderRadius:6, fontSize:11, background: ok ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)', border:`1px solid ${ok ? 'var(--c-green)' : 'var(--c-red)'}` }}>
                                                    <span style={{ fontWeight:600 }}>{label}</span>
                                                    <span style={{ color:'var(--c-text3)' }}>×{req.qty}</span>
                                                    <span style={{ color: ok ? 'var(--c-green)' : 'var(--c-red)', fontWeight:600 }}>
                                                      {req.avail} in stock{!ok && ` (need ${req.qty - req.avail} more)`}
                                                    </span>
                                                    <button className="btn btn-sm btn-danger" style={{ padding:'0 5px', height:22, fontSize:10 }} onClick={() => removeReq(req.id)}>×</button>
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          )}
                                          <div style={{ display:'grid', gridTemplateColumns:'1fr 64px auto auto', gap:6, alignItems:'center' }}>
                                            <select value={rf.part_id} onChange={e => {
                                              if (e.target.value === '__create__') { setNewPartForm(item.id); setNewPartFields({ part_name:'', brand:'', color:'', cost:'' }); setReqForm(prev => ({ ...prev, [item.id]: { ...rf, part_id: '' } })) }
                                              else setReqForm(prev => ({ ...prev, [item.id]: { ...rf, part_id: e.target.value } }))
                                            }} style={{ height:30, fontSize:12 }}>
                                              <option value="">— Add part requirement —</option>
                                              {partOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                              <option value="__create__">＋ Create new…</option>
                                            </select>
                                            <input type="number" min="1" step="1" value={rf.qty} onChange={e => setReqForm(prev => ({ ...prev, [item.id]: { ...rf, qty: e.target.value } }))} style={{ height:30, fontSize:12 }} />
                                            <button className="btn btn-sm btn-primary" style={{ height:30, fontSize:11 }} onClick={addReq} disabled={!rf.part_id}>+ Add</button>
                                          </div>
                                          {newPartForm === item.id && (
                                            <div style={{ padding:'10px', background:'var(--c-surface2)', borderRadius:8, border:'1px solid var(--c-border)' }}>
                                              <div style={{ fontSize:11, fontWeight:600, marginBottom:8, color:'var(--c-brand)' }}>Define new part type</div>
                                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 80px', gap:6, marginBottom:8 }}>
                                                <div className="form-group" style={{ margin:0 }}>
                                                  <label className="form-label">Part name *</label>
                                                  <input type="text" placeholder="e.g. Studio 3 Headband" value={newPartFields.part_name} onChange={e => setNewPartFields(prev => ({ ...prev, part_name: e.target.value }))} style={{ height:32 }} />
                                                </div>
                                                <div className="form-group" style={{ margin:0 }}>
                                                  <label className="form-label">Brand</label>
                                                  <input type="text" placeholder="e.g. Beats" value={newPartFields.brand} onChange={e => setNewPartFields(prev => ({ ...prev, brand: e.target.value }))} style={{ height:32 }} />
                                                </div>
                                                <div className="form-group" style={{ margin:0 }}>
                                                  <label className="form-label">Color</label>
                                                  <input type="text" placeholder="e.g. Midnight Black" value={newPartFields.color} onChange={e => setNewPartFields(prev => ({ ...prev, color: e.target.value }))} style={{ height:32 }} />
                                                </div>
                                                <div className="form-group" style={{ margin:0 }}>
                                                  <label className="form-label">Cost $</label>
                                                  <input type="number" placeholder="0.00" value={newPartFields.cost} onChange={e => setNewPartFields(prev => ({ ...prev, cost: e.target.value }))} style={{ height:32 }} />
                                                </div>
                                              </div>
                                              <div style={{ display:'flex', gap:6 }}>
                                                <button className="btn btn-sm btn-primary" onClick={() => createAndSelectPart(item.id)} disabled={!newPartFields.part_name.trim()}>Create & select</button>
                                                <button className="btn btn-sm" onClick={() => { setNewPartForm(null); setNewPartFields({ part_name:'', brand:'', color:'', cost:'' }) }}>Cancel</button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              )
                            })}
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
