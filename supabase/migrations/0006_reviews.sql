alter table bars add column reviews jsonb not null default '[]'::jsonb;
