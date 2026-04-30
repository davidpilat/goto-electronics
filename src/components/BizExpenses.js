import React, { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const CATEGORIES = ['Parts','Supplies','Shipping Supplies','Tools','Software','Marketing','Other']
const today = () => new Date().toISOString().slice(0, 10)
const fmtMoney = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
const CAT_COLORS = { Parts:'badge-brand', Supplies:'badge-green', 'Shipping Supplies':'badge-amber', Tools:'badge-purple', Software:'badge-purple', Marketing:'badge-red', Other:'badge-gray' }

const COL_MAP = {
  expense_date: ['date','expense date','purchase date','transaction date'],
  description: ['description','desc','item','name','title','details'],
  category: ['category','cat','type','expense type'],
  amount: ['amount','cost','price','total','expense','paid'],
  vendor: ['vendor','supplier','store','merchant','from','source'],
  order_number: ['order number','order #','order no','order id','transaction id'],
  notes: ['notes','note','comments','memo'],
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
  }).filter(r => r.description || r.amount)
}

function parseDate(str) {
  if (!str) return today()
  const clean = str.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean
  const mdy = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return mdy[3] + '-' + mdy[1].padStart(2,'0') + '-' + mdy[2].padStart(2,'0')
  const d = new Date(clean)
  if (!isNaN(d)) return d.toISOString().slice(0, 10)
  return today()
}

function normalizeCategory(cat) {
  if (!cat) return 'Other'
  const c = cat.toLowerCase()
  if (c.includes('part')) return 'Parts'
  if (c.includes('suppl') && c.includes('ship')) return 'Shipping Supplies'
  if (c.includes('suppl')) return 'Supplies'
  if (c.includes('tool')) return 'Tools'
  if (c.includes('soft') || c.includes('app') || c.includes('sub')) return 'Software'
  if (c.includes('market') || c.includes('ad') || c.includes('promot')) return 'Marketing'
  return 'Other'
}

function normalizeRow(row) {
  return {
    expense_date: parseDate(row.expense_date),
    description: row.description || 'Imported expense',
    category: normalizeCategory(row.category),
    amount: parseFloat((row.amount||'').replace(/[$,]/g,'')) || 0,
    vendor: row.vendor || null,
    order_number: row.order_number || null,
    notes: row.notes || null,
  }
}

export default function BizExpenses({ expenses, setSyncing }) {
  const [form, setForm] = useState({ expense_date:today(), description:'', category:'Parts', amount:'', vendor:'', order_number:'', notes:'' })
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [importPreview, setImportPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const fileRef = useRef()

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result)
      if (rows.length === 0) {
        setImportError('No valid rows found. Make sure your CSV has a Description or Amount column.')
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
      await supabase.from('biz_expenses').insert(importPreview.slice(i, i + 50))
    }
    setImportPreview(null)
    setImporting(false); setSyncing(false)
    alert('Imported ' + importPreview.length + ' expenses successfully!')
  }

  const downloadTemplate = () => {
    const csv = 'Date,Description,Category,Amount,Vendor,Order Number,Notes\n2024-01-15,iPhone screens batch,Parts,45.00,iFixit,12-34567-89012,10 screens\n2024-01-16,Bubble wrap rolls,Shipping Supplies,12.99,Amazon,,\n2024-01-17,eBay promoted listings,Marketing,8.50,eBay,,'
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'goto-expenses-template.csv'
    a.click()
  }

  const submit = async () => {
    if (!form.description.trim() || !form.amount) return
    setAdding(true); setSyncing(true)
    await supabase.from('biz_expenses').insert({
      expense_date: form.expense_date,
      description: form.description.trim(),
      category: form.category,
      amount: parseFloat(form.amount)||0,
      vendor: form.vendor.trim() || null,
      order_number: form.order_number.trim() || null,
      notes: form.notes.trim() || null,
    })
    setForm({ expense_date:today(), description:'', category:'Parts', amount:'', vendor:'', order_number:'', notes:'' })
    setAdding(false); setSyncing(false)
  }

  const del = async (id) => {
    setSyncing(true)
    await supabase.from('biz_expenses').delete().eq('id', id)
    setSyncing(false)
  }

  const filtered = expenses.filter(e => {
    const matchCat = !filter || e.category === filter
    const matchSearch = !search ||
      e.description?.toLowerCase().includes(search.toLowerCase()) ||
      e.vendor?.toLowerCase().includes(search.toLowerCase()) ||
      e.order_number?.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const catTotals = CATEGORIES.map(c => ({
    name: c,
    total: expenses.filter(e => e.category === c).reduce((s, e) => s + parseFloat(e.amount||0), 0)
  })).filter(c => c.total > 0).sort((a,b) => b.total - a.total)

  const grandTotal = filtered.reduce((s, e) => s + parseFloat(e.amount||0), 0)

  return (
    <div>
      {catTotals.length > 0 && (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:'1rem' }}>
          {catTotals.map(c => (
            <div key={c.name} className="stat-card" style={{ flex:'1 1 130px', padding:'10px 14px' }}>
              <div className="stat-label">{c.name}</div>
              <div className="stat-value" style={{ fontSize:18 }}>{fmtMoney(c.total)}</div>
            </div>
          ))}
        </div>
      )}

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
              <span style={{ fontSize:13, fontWeight:500 }}>Preview — {importPreview.length} expenses found</span>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-sm" onClick={() => setImportPreview(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={confirmImport} disabled={importing}>
                  {importing ? 'Importing…' : 'Import ' + importPreview.length + ' expenses'}
                </button>
              </div>
            </div>
            <div style={{ overflowX:'auto', maxHeight:280, overflowY:'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Order #</th>
                    <th>Vendor</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.slice(0, 20).map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontSize:12, color:'var(--c-text2)' }}>{r.expense_date}</td>
                      <td>{r.description}</td>
                      <td><span className={`badge ${CAT_COLORS[r.category]||'badge-gray'}`}>{r.category}</span></td>
                      <td style={{ fontSize:12, color:'var(--c-text2)', fontFamily:"'DM Mono',monospace" }}>{r.order_number || '—'}</td>
                      <td style={{ fontSize:12, color:'var(--c-text2)' }}>{r.vendor || '—'}</td>
                      <td className="mono">{fmtMoney(r.amount)}</td>
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

      {/* Add expense manually */}
      <div className="card">
        <div className="card-title">Add expense</div>
        <div className="form-grid form-grid-4" style={{ marginBottom:10 }}>
          <div className="form-group">
            <label className="form-label">Date</label>
            <input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Amount $</label>
            <input type="number" placeholder="0.00" min="0" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Order number (optional)</label>
            <input type="text" placeholder="e.g. 12-34567-89012" value={form.order_number} onChange={e => set('order_number', e.target.value)} />
          </div>
        </div>
        <div className="form-grid form-grid-2" style={{ marginBottom:12 }}>
          <div className="form-group">
            <label className="form-label">Description *</label>
            <input type="text" placeholder="e.g. iPhone screens batch" value={form.description} onChange={e => set('description', e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
          </div>
          <div className="form-group">
            <label className="form-label">Vendor (optional)</label>
            <input type="text" placeholder="e.g. iFixit, Amazon" value={form.vendor} onChange={e => set('vendor', e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={submit} disabled={adding}>{adding ? 'Saving…' : 'Add expense'}</button>
      </div>

      {/* Expenses list */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">{filtered.length} expenses · {fmtMoney(grandTotal)}</span>
          <div style={{ display:'flex', gap:8 }}>
            <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ height:32, width:130, fontSize:13 }} />
            <select value={filter} onChange={e => setFilter(e.target.value)}
              style={{ height:32, width:120, fontSize:12 }}>
              <option value="">All categories</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {filtered.length === 0
          ? <div className="empty"><div className="empty-icon">🧾</div>No expenses yet.</div>
          : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th className="hide-mobile">Order #</th>
                  <th className="hide-mobile">Vendor</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.sort((a,b) => b.expense_date?.localeCompare(a.expense_date)).map(e => (
                  <tr key={e.id}>
                    <td style={{ color:'var(--c-text2)', fontSize:12 }}>{e.expense_date}</td>
                    <td>
                      <div>{e.description}</div>
                      {e.notes && <div style={{ fontSize:11, color:'var(--c-text3)' }}>{e.notes}</div>}
                    </td>
                    <td><span className={`badge ${CAT_COLORS[e.category]||'badge-gray'}`}>{e.category}</span></td>
                    <td className="hide-mobile" style={{ color:'var(--c-text2)', fontSize:12, fontFamily:"'DM Mono',monospace" }}>{e.order_number || '—'}</td>
                    <td className="hide-mobile" style={{ color:'var(--c-text2)', fontSize:12 }}>{e.vendor||'—'}</td>
                    <td className="mono" style={{ fontWeight:500 }}>{fmtMoney(e.amount)}</td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => del(e.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>
    </div>
  )
}
