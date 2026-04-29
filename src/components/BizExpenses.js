import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const CATEGORIES = ['Parts','Supplies','Shipping Supplies','Tools','Software','Marketing','Other']
const today = () => new Date().toISOString().slice(0, 10)
const fmtMoney = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
const CAT_COLORS = { Parts:'badge-brand', Supplies:'badge-green', 'Shipping Supplies':'badge-amber', Tools:'badge-purple', Software:'badge-purple', Marketing:'badge-red', Other:'badge-gray' }

export default function BizExpenses({ expenses, setSyncing }) {
  const [form, setForm] = useState({ expense_date:today(), description:'', category:'Parts', amount:'', vendor:'', notes:'' })
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const submit = async () => {
    if (!form.description.trim() || !form.amount) return
    setAdding(true); setSyncing(true)
    await supabase.from('biz_expenses').insert({
      expense_date: form.expense_date,
      description: form.description.trim(),
      category: form.category,
      amount: parseFloat(form.amount)||0,
      vendor: form.vendor.trim() || null,
      notes: form.notes.trim() || null,
    })
    setForm({ expense_date:today(), description:'', category:'Parts', amount:'', vendor:'', notes:'' })
    setAdding(false); setSyncing(false)
  }

  const del = async (id) => {
    setSyncing(true)
    await supabase.from('biz_expenses').delete().eq('id', id)
    setSyncing(false)
  }

  const filtered = expenses.filter(e => {
    const matchCat = !filter || e.category === filter
    const matchSearch = !search || e.description?.toLowerCase().includes(search.toLowerCase()) || e.vendor?.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  // Category totals
  const catTotals = CATEGORIES.map(c => ({
    name: c,
    total: expenses.filter(e => e.category === c).reduce((s, e) => s + parseFloat(e.amount||0), 0)
  })).filter(c => c.total > 0).sort((a,b) => b.total - a.total)

  const grandTotal = filtered.reduce((s, e) => s + parseFloat(e.amount||0), 0)

  return (
    <div>
      {/* Category summary */}
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

      {/* Add expense */}
      <div className="card">
        <div className="card-title">Add expense</div>
        <div className="form-grid form-grid-3" style={{ marginBottom:10 }}>
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
