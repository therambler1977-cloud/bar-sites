-- Bar Sites schema. The app connects with the service role key from the server only,
-- so row level security is on with no public policies: browsers can't read or write directly.

create table bars (
  id text primary key default gen_random_uuid()::text,
  slug text not null unique,
  name text not null,
  tagline text not null default '',
  timezone text not null default 'America/Chicago',
  phone text not null default '',
  address text not null default '',
  domains text[] not null default '{}',
  accent_color text not null default '#e0a33a',
  order_url text,
  sms_number text unique,
  owner_phones text[] not null default '{}',
  admin_password_hash text not null,
  weekly_hours jsonb not null default '{}',
  google jsonb
);
create index bars_domains_idx on bars using gin (domains);

create table events (
  id text primary key default gen_random_uuid()::text,
  bar_id text not null references bars (id) on delete cascade,
  title text not null,
  date date not null,
  start_time text not null,
  end_time text,
  description text not null default '',
  cover text,
  google_post_name text
);
create index events_bar_date_idx on events (bar_id, date);

create table specials (
  id text primary key default gen_random_uuid()::text,
  bar_id text not null references bars (id) on delete cascade,
  title text not null,
  description text not null default '',
  price text,
  days smallint[] not null default '{}',
  date date,
  start_time text,
  end_time text,
  active boolean not null default true,
  google_post_name text
);
create index specials_bar_idx on specials (bar_id);

create table menu_items (
  id text primary key default gen_random_uuid()::text,
  bar_id text not null references bars (id) on delete cascade,
  category text not null,
  name text not null,
  description text not null default '',
  price text not null,
  available boolean not null default true,
  sort_order integer not null default 0
);
create index menu_items_bar_idx on menu_items (bar_id);

create table hours_overrides (
  id text primary key default gen_random_uuid()::text,
  bar_id text not null references bars (id) on delete cascade,
  date date not null,
  closed boolean not null default false,
  open text,
  close text,
  note text not null default '',
  unique (bar_id, date)
);

create table pending_updates (
  id text primary key default gen_random_uuid()::text,
  bar_id text not null references bars (id) on delete cascade,
  from_phone text not null,
  "update" jsonb not null, -- quoted: UPDATE is a reserved word
  created_at timestamptz not null default now()
);
create index pending_updates_bar_idx on pending_updates (bar_id, from_phone);

alter table bars enable row level security;
alter table events enable row level security;
alter table specials enable row level security;
alter table menu_items enable row level security;
alter table hours_overrides enable row level security;
alter table pending_updates enable row level security;
