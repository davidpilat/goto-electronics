import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabase'
import Dashboard from './components/Dashboard'
import Orders from './components/Orders'
import Inventory from './components/Inventory'
import BizExpenses from './components/BizExpenses'
import Reports from './components/Reports'
import ProfitCalc from './components/ProfitCalc'
import './App.css'

const TABS = ['Dashboard', 'Orders', 'Inventory', 'Expenses', 'Reports', 'Calc']

export default function App() {
  const [tab, setTab] = useState('Dashboard')
  const [orders, setOrders] = useState([])
  const [inventory, setInventory] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const fetchAll = useCallback(async () => {
    const [{ data: ordData }, { data: invData }, { data: expData }] = await Promise.all([
      supabase.from('orders').select('*').order('sale_date', { ascending: false }),
      supabase.from('inventory').select('*').order('created_at', { ascending: false }),
      supabase.from('biz_expenses').select('*').order('expense_date', { ascending: false }),
    ])
    if (ordData) setOrders(ordData)
    if (invData) setInventory(invData)
    if (expData) setExpenses(expData)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const channel = supabase.channel('goto-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'biz_expenses' }, fetchAll)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchAll])

  if (loading) return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p>Loading GoTo Electronics…</p>
    </div>
  )

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">G</div>
          <div>
            <div className="brand-name">GoTo Electronics</div>
          </div>
        </div>
        <div className="header-right">
          {syncing && <span className="sync-dot" />}
          <span style={{ fontSize:12, color:'var(--c-text3)' }}>
            {orders.length} orders · {inventory.filter(i => i.status === 'In Stock').length} in stock
          </span>
        </div>
      </header>

      <nav className="tab-nav">
        {TABS.map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>

      <main className="app-main">
        {tab === 'Dashboard' && <Dashboard orders={orders} inventory={inventory} expenses={expenses} />}
        {tab === 'Orders' && <Orders orders={orders} inventory={inventory} setSyncing={setSyncing} />}
        {tab === 'Inventory' && <Inventory inventory={inventory} setSyncing={setSyncing} />}
        {tab === 'Expenses' && <BizExpenses expenses={expenses} setSyncing={setSyncing} />}
        {tab === 'Reports' && <Reports orders={orders} expenses={expenses} />}
        {tab === 'Calc' && <ProfitCalc />}
      </main>
    </div>
  )
}
