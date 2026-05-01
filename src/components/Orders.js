import React, { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const PLATFORMS = ['eBay','Facebook Marketplace','Facebook','Amazon','Craigslist','OfferUp','Other']
const today = () => new Date().toISOString().slice(0, 10)
const fmtMoney = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })

const COL_MAP = {
  order_number: ['order number','order #','order no','order id','transaction id','transaction #'],
  sale_date: ['sale date','date','sold date','order date','transaction date','date sold'],
  item_name: ['item name','item','title','name','description','product'],
  serial_number: ['serial number','serial','serial no','sn','imei','serial#'],
  platform: ['platform','marketplace','channel','sold on','source'],
  gross_sale: ['gross sale','gross','sale price','selling price','sold for','revenue','price','total'],
  selling_fee: ['selling fee','platform fee','ebay fee','amazon fee','fee','fees','seller fee'],
  ad_fee: ['ad fee','advertising fee','promoted fee','ad cost','promo fee','ads'],
  shipping_cost: ['shipping cost','shipping','ship cost','postage','shipping paid','shipping expense'],
  item_cost: ['item cost','cost','cogs','purchase cost','buy price','cost of goods','unit cost'],
  notes: ['notes','note','comments','comment','memo'],
  color: ['color','colour','color/storage','storage/color'],
}

function normalizeHeader(h) {
  return h.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '')
}

function mapOrderHeader(h) {
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
  const fieldMap = headers.map(mapOrderHeader)
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
    fieldMap.forEach((field, i) => {
      if (field) obj[field] = (vals[i] || '').replace(/^"|"$/g, '').trim()
    })
    return obj
  }).filter(r => r.item_name || r.gross_sale)
}

function parseDate(str) {
  if (!str) return new Date().toISOString().slice(0, 10)
  const clean = str.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean
  const mdy = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return mdy[3] + '-' + mdy[1].padStart(2,'0') + '-' + mdy[2].padStart(2,'0')
  const mdy2 = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (mdy2) return mdy2[3] + '-' + mdy2[1].padStart(2,'0') + '-' + mdy2[2].padStart(2,'0')
  const d = new Date(clean)
  if (!isNaN(d)) return d.toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

function normalizeOrderRow(row) {
  return {
    order_number: row.order_number || null,
    sale_date: parseDate(row.sale_date),
    item_name: row.item_name || 'Unknown Item',
    serial_number: row.serial_number || null,
    platform: row.platform || 'Other',
    gross_sale: parseFloat((row.gross_sale||'').replace(/[$,]/g,'')) || 0,
    selling_fee: parseFloat((row.selling_fee||'').replace(/[$,]/g,'')) || 0,
    ad_fee: parseFloat((row.ad_fee||'').replace(/[$,]/g,'')) || 0,
    shipping_cost: parseFloat((row.shipping_cost||'').replace(/[$,]/g,'')) || 0,
    item_cost: parseFloat((row.item_cost||'').replace(/[$,]/g,'')) || 0,
    color: row.color || null,
    notes: row.notes || null,
  }
}

export default function Orders({ orders, inventory, setSyncing }) {
  const [form, setForm] = useState({
    sale_date: today(), order_number: '', item_name: '', inventory_id: '',
    serial_number: '', color: '', platform: 'eBay', gross_sale: '', selling_fee: '',
    ad_fee: '', shipping_cost: '', item_cost: '', notes: ''
  })
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [filterPlatform, setFilterPlatform] = useState('')
  const [filterSku, setFilterSku] = useState('')
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [importPreview, setImportPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const fileRef = useRef()

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleInventorySelect = (id) => {
    set('inventory_id', id)
    if (id) {
      const item = inventory.find(i => i.id === id)
      if (item) {
        set('item_name', item.name)
        set('item_cost', (parseFloat(item.purchase_cost||0) + parseFloat(item.parts_cost||0)).toFixed(2))
        set('serial_number', item.serial_number || '')
        set('color', item.color || '')
      }
    } else {
      set('serial_number', '')
      set('color', '')
    }
  }

  const setEdit = (k, v) => setEditForm(prev => ({ ...prev, [k]: v }))

  const saveEdit = async (id) => {
    setSyncing(true)
    await supabase.from('orders').update({
      order_number: editForm.order_number || null,
      sale_date: editForm.sale_date,
      item_name: editForm.item_name,
      serial_number: editForm.serial_number || null,
      platform: editForm.platform,
      gross_sale: parseFloat(editForm.gross_sale)||0,
      selling_fee: parseFloat(editForm.selling_fee)||0,
      ad_fee: parseFloat(editForm.ad_fee)||0,
      shipping_cost: parseFloat(editForm.shipping_cost)||0,
      item_cost: parseFloat(editForm.item_cost)||0,
      notes: editForm.notes || null,
    }).eq('id', id)
    setEditId(null)
    setSyncing(false)
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result)
      if (rows.length === 0) {
        setImportError('No valid rows found. Make sure your CSV has Item Name or Gross Sale columns.')
        return
      }
      setImportPreview(rows.map(normalizeOrderRow))
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const confirmImport = async () => {
    if (!importPreview?.length) return
    setImporting(true); setSyncing(true)

    // Insert orders in batches
    for (let i = 0; i < importPreview.length; i += 50) {
      await supabase.from('orders').insert(importPreview.slice(i, i + 50))
    }

    // Mark matching inventory items as Sold by serial number
    const serialNumbers = importPreview
      .map(o => o.serial_number)
      .filter(Boolean)

    if (serialNumbers.length > 0) {
      for (const sn of serialNumbers) {
        await supabase
          .from('inventory')
          .update({ status: 'Sold' })
          .eq('serial_number', sn)
          .neq('status', 'Sold')
      }
    }

    setImportPreview(null)
    setImporting(false); setSyncing(false)
    const snCount = serialNumbers.length
    alert('Imported ' + importPreview.length + ' orders successfully!' + (snCount > 0 ? ' Marked ' + snCount + ' inventory item(s) as Sold.' : ''))
  }

  const downloadTemplate = () => {
    const csv = 'Order Number,Sale Date,Item Name,Serial Number,Platform,Gross Sale,Selling Fee,Ad Fee,Shipping Cost,Item Cost,Notes\n12-34567-89012,2024-01-15,iPhone 12 64GB Black,DNPXC2XY0J4D,eBay,249.99,32.50,5.00,8.99,150.00,Quick sale'
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'goto-orders-template.csv'
    a.click()
  }

  const netSale = parseFloat(form.gross_sale||0) - parseFloat(form.selling_fee||0) - parseFloat(form.ad_fee||0) - parseFloat(form.shipping_cost||0)
  const profit = netSale - parseFloat(form.item_cost||0)

  const submit = async () => {
    if (!form.item_name.trim() || !form.gross_sale) return
    setAdding(true); setSyncing(true)
    await supabase.from('orders').insert({
      sale_date: form.sale_date,
      order_number: form.order_number.trim() || null,
      item_name: form.item_name.trim(),
      inventory_id: form.inventory_id || null,
      serial_number: form.serial_number.trim() || null,
      color: form.color.trim() || null,
      platform: form.platform,
      gross_sale: parseFloat(form.gross_sale)||0,
      selling_fee: parseFloat(form.selling_fee)||0,
      ad_fee: parseFloat(form.ad_fee)||0,
      shipping_cost: parseFloat(form.shipping_cost)||0,
      item_cost: parseFloat(form.item_cost)||0,
      notes: form.notes.trim() || null,
    })
    if (form.inventory_id) {
      await supabase.from('inventory').update({ status: 'Sold' }).eq('id', form.inventory_id)
    }
    setForm({ sale_date: today(), order_number: '', item_name: '', inventory_id: '', serial_number: '', color: '', platform: 'eBay', gross_sale: '', selling_fee: '', ad_fee: '', shipping_cost: '', item_cost: '', notes: '' })
    setAdding(false); setSyncing(false)
  }

  const deleteOrder = async (id) => {
    if (!window.confirm('Delete this order?')) return
    setSyncing(true)
    await supabase.from('orders').delete().eq('id', id)
    setSyncing(false)
  }

  // Build set of serial numbers for selected SKU
  const skuSerials = filterSku
    ? new Set(inventory.filter(i => i.sku === filterSku).map(i => i.serial_number).filter(Boolean))
    : null

  // Build SKU options from inventory
  const skuOptions = [...new Set(inventory.map(i => i.sku).filter(Boolean))].sort()

  const filtered = orders.filter(o => {
    const matchSearch = !search ||
      o.item_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
      o.serial_number?.toLowerCase().includes(search.toLowerCase())
    const matchPlatform = !filterPlatform || o.platform === filterPlatform
    const matchSku = !filterSku || (o.serial_number && skuSerials.has(o.serial_number)) ||
      inventory.filter(i => i.sku === filterSku).some(i =>
        i.name && o.item_name && o.item_name.toLowerCase().includes(i.name.toLowerCase().slice(0, 8))
      )
    return matchSearch && matchPlatform && matchSku
  })

  const inStockInventory = inventory.filter(i => i.status === 'In Stock')

  return (
    <div>
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
          Column headers are flexible — recognizes common variations automatically.
        </p>

        {importError && (
          <div style={{ marginTop:10, padding:'8px 12px', background:'var(--c-red-bg)', color:'var(--c-red)', borderRadius:8, fontSize:13 }}>{importError}</div>
        )}

        {importPreview && (
          <div style={{ marginTop:12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:13, fontWeight:500 }}>Preview — {importPreview.length} orders found</span>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-sm" onClick={() => setImportPreview(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={confirmImport} disabled={importing}>
                  {importing ? 'Importing…' : 'Import ' + importPreview.length + ' orders'}
                </button>
              </div>
            </div>
            <div style={{ overflowX:'auto', maxHeight:280, overflowY:'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Date</th>
                    <th>Item</th>
                    <th>Platform</th>
                    <th>Gross</th>
                    <th>Fees</th>
                    <th>Cost</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.slice(0, 20).map((r, i) => {
                    const fees = r.selling_fee + r.ad_fee + r.shipping_cost
                    const profit = r.gross_sale - fees - r.item_cost
                    return (
                      <tr key={i}>
                        <td style={{ fontSize:12, color:'var(--c-text2)' }}>{r.order_number || '—'}</td>
                        <td style={{ fontSize:12, color:'var(--c-text2)' }}>{r.sale_date}</td>
                        <td style={{ maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.item_name}</td>
                        <td><span className="badge badge-brand">{r.platform}</span></td>
                        <td className="mono">{fmtMoney(r.gross_sale)}</td>
                        <td className="mono" style={{ color:'var(--c-amber)' }}>{fmtMoney(fees)}</td>
                        <td className="mono" style={{ color:'var(--c-text2)' }}>{fmtMoney(r.item_cost)}</td>
                        <td className={'mono ' + (profit >= 0 ? 'profit-positive' : 'profit-negative')}>
                          {profit >= 0 ? '+' : '-'}{fmtMoney(Math.abs(profit))}
                        </td>
                      </tr>
                    )
                  })}
                  {importPreview.length > 20 && (
                    <tr><td colSpan={8} style={{ color:'var(--c-text3)', fontSize:12, textAlign:'center' }}>…and {importPreview.length - 20} more</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add order form */}
      <div className="card">
        <div className="card-title">Log new order</div>
        <div className="form-grid form-grid-2" style={{ marginBottom:10 }}>
          <div className="form-group">
            <label className="form-label">Link to inventory item (optional)</label>
            <select value={form.inventory_id} onChange={e => handleInventorySelect(e.target.value)}>
              <option value="">— Manual entry —</option>
              {inStockInventory.map(i => <option key={i.id} value={i.id}>{i.name}{i.sku ? ' (' + i.sku + ')' : ''}{i.serial_number ? ' · SN: ' + i.serial_number : ''}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Item name *</label>
            <input type="text" placeholder="e.g. iPhone 12 64GB Black" value={form.item_name} onChange={e => set('item_name', e.target.value)} />
          </div>
        </div>
        <div className="form-grid" style={{ gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', gap:10, marginBottom:10 }}>
          <div className="form-group">
            <label className="form-label">Sale date</label>
            <input type="date" value={form.sale_date} onChange={e => set('sale_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Order number</label>
            <input type="text" placeholder="e.g. 12-34567-89012" value={form.order_number} onChange={e => set('order_number', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Serial number</label>
            <input type="text" placeholder="e.g. DNPXC2XY0J4D" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Color</label>
            <input type="text" placeholder="e.g. Black, Silver" value={form.color} onChange={e => set('color', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Platform</label>
            <select value={form.platform} onChange={e => set('platform', e.target.value)}>
              {PLATFORMS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="form-grid form-grid-4" style={{ marginBottom:10 }}>
          <div className="form-group">
            <label className="form-label">Gross sale $</label>
            <input type="number" placeholder="0.00" min="0" step="0.01" value={form.gross_sale} onChange={e => set('gross_sale', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Selling fee $</label>
            <input type="number" placeholder="0.00" min="0" step="0.01" value={form.selling_fee} onChange={e => set('selling_fee', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Ad fee $</label>
            <input type="number" placeholder="0.00" min="0" step="0.01" value={form.ad_fee} onChange={e => set('ad_fee', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Shipping cost $</label>
            <input type="number" placeholder="0.00" min="0" step="0.01" value={form.shipping_cost} onChange={e => set('shipping_cost', e.target.value)} />
          </div>
        </div>
        <div className="form-grid form-grid-2" style={{ marginBottom:10 }}>
          <div className="form-group">
            <label className="form-label">Item cost $</label>
            <input type="number" placeholder="0.00" min="0" step="0.01" value={form.item_cost} onChange={e => set('item_cost', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <input type="text" placeholder="Any notes about this order" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        {form.gross_sale && (
          <div style={{ display:'flex', gap:16, padding:'10px 14px', background:'var(--c-surface2)', borderRadius:8, marginBottom:12, fontSize:13, flexWrap:'wrap' }}>
            <span>Net sale: <strong>{fmtMoney(netSale)}</strong></span>
            <span>Profit: <strong className={profit >= 0 ? 'profit-positive' : 'profit-negative'}>{profit >= 0 ? '+' : ''}{fmtMoney(profit)}</strong></span>
            {parseFloat(form.gross_sale) > 0 && <span>Margin: <strong>{((profit / parseFloat(form.gross_sale)) * 100).toFixed(1)}%</strong></span>}
          </div>
        )}
        <button className="btn btn-primary" onClick={submit} disabled={adding}>{adding ? 'Saving…' : 'Save order'}</button>
      </div>

      {/* Orders list */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">{filtered.length} orders</span>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <input type="text" placeholder="Search order #, item, serial…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ height:32, width:180, fontSize:13 }} />
            <select value={filterSku} onChange={e => setFilterSku(e.target.value)}
              style={{ height:32, width:130, fontSize:12 }}>
              <option value="">All SKUs</option>
              {skuOptions.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}
              style={{ height:32, width:130, fontSize:12 }}>
              <option value="">All platforms</option>
              {PLATFORMS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        {filtered.length === 0
          ? <div className="empty"><div className="empty-icon">🛒</div>No orders yet. Log your first sale above.</div>
          : (
            <div style={{ overflowX:'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Date</th>
                    <th>Item</th>
                    <th>Platform</th>
                    <th className="hide-mobile">Serial #</th>
                    <th className="hide-mobile">Color</th>
                    <th className="hide-mobile">Gross</th>
                    <th className="hide-mobile">Fees</th>
                    <th className="hide-mobile">Cost</th>
                    <th>Net</th>
                    <th>Profit</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    if (editId === o.id) {
                      const eNet = parseFloat(editForm.gross_sale||0) - parseFloat(editForm.selling_fee||0) - parseFloat(editForm.ad_fee||0) - parseFloat(editForm.shipping_cost||0)
                      const eProfit = eNet - parseFloat(editForm.item_cost||0)
                      return (
                        <tr key={o.id} style={{ background:'var(--c-surface2)' }}>
                          <td colSpan={12}>
                            <div style={{ padding:'12px 4px' }}>
                              <div className="form-grid form-grid-4" style={{ marginBottom:8 }}>
                                <div className="form-group"><label className="form-label">Order #</label><input type="text" value={editForm.order_number||''} onChange={e => setEdit('order_number', e.target.value)} style={{ height:34 }} /></div>
                                <div className="form-group"><label className="form-label">Date</label><input type="date" value={editForm.sale_date||''} onChange={e => setEdit('sale_date', e.target.value)} style={{ height:34 }} /></div>
                                <div className="form-group" style={{ gridColumn:'span 2' }}><label className="form-label">Item name</label><input type="text" value={editForm.item_name||''} onChange={e => setEdit('item_name', e.target.value)} style={{ height:34 }} /></div>
                              </div>
                              <div className="form-grid form-grid-4" style={{ marginBottom:8 }}>
                                <div className="form-group"><label className="form-label">Serial #</label><input type="text" value={editForm.serial_number||''} onChange={e => setEdit('serial_number', e.target.value)} style={{ height:34 }} /></div>
                                <div className="form-group"><label className="form-label">Platform</label><select value={editForm.platform||''} onChange={e => setEdit('platform', e.target.value)} style={{ height:34 }}>{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select></div>
                                <div className="form-group"><label className="form-label">Gross sale $</label><input type="number" value={editForm.gross_sale||''} onChange={e => setEdit('gross_sale', e.target.value)} style={{ height:34 }} /></div>
                                <div className="form-group"><label className="form-label">Item cost $</label><input type="number" value={editForm.item_cost||''} onChange={e => setEdit('item_cost', e.target.value)} style={{ height:34 }} /></div>
                              </div>
                              <div className="form-grid form-grid-4" style={{ marginBottom:10 }}>
                                <div className="form-group"><label className="form-label">Selling fee $</label><input type="number" value={editForm.selling_fee||''} onChange={e => setEdit('selling_fee', e.target.value)} style={{ height:34 }} /></div>
                                <div className="form-group"><label className="form-label">Ad fee $</label><input type="number" value={editForm.ad_fee||''} onChange={e => setEdit('ad_fee', e.target.value)} style={{ height:34 }} /></div>
                                <div className="form-group"><label className="form-label">Shipping $</label><input type="number" value={editForm.shipping_cost||''} onChange={e => setEdit('shipping_cost', e.target.value)} style={{ height:34 }} /></div>
                                <div className="form-group"><label className="form-label">Notes</label><input type="text" value={editForm.notes||''} onChange={e => setEdit('notes', e.target.value)} style={{ height:34 }} /></div>
                              </div>
                              <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                                <span style={{ fontSize:13 }}>Net: <strong>{fmtMoney(eNet)}</strong></span>
                                <span style={{ fontSize:13 }}>Profit: <strong className={eProfit>=0?'profit-positive':'profit-negative'}>{eProfit>=0?'+':''}{fmtMoney(eProfit)}</strong></span>
                                <button className="btn btn-primary btn-sm" onClick={() => saveEdit(o.id)}>Save</button>
                                <button className="btn btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    }
                    const fees = parseFloat(o.selling_fee||0) + parseFloat(o.ad_fee||0)
                    const net = parseFloat(o.gross_sale||0) - fees - parseFloat(o.shipping_cost||0)
                    const profit = net - parseFloat(o.item_cost||0)
                    return (
                      <tr key={o.id}>
                        <td style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:'var(--c-text2)' }}>
                          {o.order_number || <span style={{ color:'var(--c-text3)' }}>—</span>}
                        </td>
                        <td style={{ color:'var(--c-text2)', fontSize:12 }}>{o.sale_date}</td>
                        <td style={{ maxWidth:160 }}>
                          <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.item_name}</div>
                          {o.notes && <div style={{ fontSize:11, color:'var(--c-text3)' }}>{o.notes}</div>}
                        </td>
                        <td><span className="badge badge-brand">{o.platform}</span></td>
                        <td className="hide-mobile" style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:'var(--c-text2)' }}>
                          {o.serial_number || <span style={{ color:'var(--c-text3)' }}>—</span>}
                        </td>
                        <td className="hide-mobile" style={{ fontSize:12, color:'var(--c-text2)' }}>{o.color || '—'}</td>
                        <td className="hide-mobile mono">{fmtMoney(o.gross_sale)}</td>
                        <td className="hide-mobile mono" style={{ color:'var(--c-amber)' }}>{fmtMoney(fees + parseFloat(o.shipping_cost||0))}</td>
                        <td className="hide-mobile mono" style={{ color:'var(--c-text2)' }}>{fmtMoney(o.item_cost)}</td>
                        <td className="mono">{fmtMoney(net)}</td>
                        <td className={'mono ' + (profit >= 0 ? 'profit-positive' : 'profit-negative')}>
                          {profit >= 0 ? '+' : '-'}{fmtMoney(Math.abs(profit))}
                        </td>
                        <td style={{ display:'flex', gap:4 }}>
                          <button className="btn btn-sm" onClick={() => { setEditId(o.id); setEditForm({...o}) }}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => deleteOrder(o.id)}>×</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}
