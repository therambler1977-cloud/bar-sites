alter table bars add column photos jsonb not null default '[]'::jsonb;
