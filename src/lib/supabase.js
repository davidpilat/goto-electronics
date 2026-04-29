import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

/* ─── SQL to run in Supabase SQL Editor ──────────────────────────────────────

-- Inventory items
create table inventory (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  sku text,
  condition text not null default 'Good',
  purchase_cost numeric(10,2) not null default 0,
  parts_cost numeric(10,2) not null default 0,
  listed_price numeric(10,2),
  platform text,
  status text not null default 'In Stock',
  notes text,
  purchase_date date
);

-- Orders (sales)
create table orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  sale_date date not null,
  inventory_id uuid references inventory(id) on delete set null,
  item_name text not null,
  platform text not null,
  gross_sale numeric(10,2) not null default 0,
  selling_fee numeric(10,2) not null default 0,
  ad_fee numeric(10,2) not null default 0,
  shipping_cost numeric(10,2) not null default 0,
  item_cost numeric(10,2) not null default 0,
  notes text
);

-- Business expenses (parts, supplies, etc.)
create table biz_expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  expense_date date not null,
  description text not null,
  category text not null default 'Parts',
  amount numeric(10,2) not null default 0,
  vendor text,
  notes text
);

-- Disable RLS for single-user app
alter table inventory disable row level security;
alter table orders disable row level security;
alter table biz_expenses disable row level security;

-- Enable realtime
alter publication supabase_realtime add table inventory;
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table biz_expenses;

─────────────────────────────────────────────────────────────────────────────*/
