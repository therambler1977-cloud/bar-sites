-- When food is served, if it differs from bar hours. null = kitchen follows bar hours.
alter table bars add column kitchen_hours jsonb;
