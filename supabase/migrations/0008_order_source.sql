-- Where an order came from: the website checkout or the voice assistant.
alter table orders add column source text not null default 'web' check (source in ('web', 'voice'));
