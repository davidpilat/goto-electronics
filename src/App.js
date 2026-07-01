import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabase'
import Dashboard from './components/Dashboard'
import Orders from './components/Orders'
import Inventory from './components/Inventory'
import BizExpenses from './components/BizExpenses'
import Reports from './components/Reports'
import ProfitCalc from './components/ProfitCalc'
import Parts from './components/Parts'
import Repairs from './components/Repairs'
import './App.css'

const TABS = ['Dashboard', 'Orders', 'Inventory', 'Parts', 'Repairs', 'Expenses', 'Reports', 'Calc']

export default function App() {
  const [tab, setTab] = useState('Dashboard')
  const [orders, setOrders] = useState([])
  const [inventory, setInventory] = useState([])
  const [expenses, setExpenses] = useState([])
  const [parts, setParts] = useState([])
  const [partLots, setPartLots] = useState([])
  const [repairReqs, setRepairReqs] = useState([])
  const [repairOrders, setRepairOrders] = useState([])
  const [repairOrderParts, setRepairOrderParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const fetchAll = useCallback(async () => {
    const [{ data: ordData }, { data: invData }, { data: expData }, { data: partsData }, { data: lotsData }, { data: reqsData }, { data: repairOrdData }, { data: repairPartsData }] = await Promise.all([
      supabase.from('orders').select('*').order('sale_date', { ascending: false }),
      supabase.from('inventory').select('*').order('created_at', { ascending: false }),
      supabase.from('biz_expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('parts').select('*').order('created_at', { ascending: false }),
      supabase.from('part_lots').select('*').order('purchase_date', { ascending: false }),
      supabase.from('repair_requirements').select('*'),
      supabase.from('repair_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('repair_order_parts').select('*'),
    ])
    if (ordData) setOrders(ordData)
    if (invData) setInventory(invData)
    if (expData) setExpenses(expData)
    if (partsData) setParts(partsData)
    if (lotsData) setPartLots(lotsData)
    if (reqsData) setRepairReqs(reqsData)
    if (repairOrdData) setRepairOrders(repairOrdData)
    if (repairPartsData) setRepairOrderParts(repairPartsData)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const channel = supabase.channel('goto-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'biz_expenses' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'part_lots' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'repair_requirements' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'repair_orders' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'repair_order_parts' }, fetchAll)
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
        {tab === 'Orders' && <Orders orders={orders} inventory={inventory} parts={parts} setSyncing={setSyncing} />}
        {tab === 'Inventory' && <Inventory inventory={inventory} parts={parts} repairReqs={repairReqs} setSyncing={setSyncing} />}
        {tab === 'Parts' && <Parts parts={parts} partLots={partLots} inventory={inventory} setSyncing={setSyncing} />}
        {tab === 'Repairs' && <Repairs repairOrders={repairOrders} repairOrderParts={repairOrderParts} parts={parts} setSyncing={setSyncing} />}
        {tab === 'Expenses' && <BizExpenses expenses={expenses} setSyncing={setSyncing} />}
        {tab === 'Reports' && <Reports orders={orders} expenses={expenses} inventory={inventory} parts={parts} repairOrders={repairOrders} repairOrderParts={repairOrderParts} />}
        {tab === 'Calc' && <ProfitCalc />}
      </main>
    </div>
  )
}
