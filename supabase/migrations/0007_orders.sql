-- Online ordering built into the site. "demo" keeps orders on the site; "clover" also
-- sends them to the bar's Clover POS.
alter table bars add column online_ordering text check (online_ordering in ('demo', 'clover'));

create table orders (
  id text primary key default gen_random_uuid()::text,
  bar_id text not null references bars (id) on delete cascade,
  number integer not null,
  customer_name text not null,
  customer_phone text not null,
  pickup_date date not null,
  pickup_time text not null,
  notes text not null default '',
  lines jsonb not null,
  subtotal integer not null, -- cents
  status text not null default 'new' check (status in ('new', 'ready', 'picked_up')),
  created_at timestamptz not null default now(),
  pos_order_id text
);
create index orders_bar_idx on orders (bar_id, created_at desc);
alter table orders enable row level security;
