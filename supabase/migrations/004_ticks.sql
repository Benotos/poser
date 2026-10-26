-- POSER v4: short term price points so the 1s / 15s charts open with recent history.
-- Run after 003_guests.sql.
create table if not exists coin_ticks (
  mint  text not null,
  ts    timestamptz not null,
  mc    numeric not null,
  primary key (mint, ts)
);
alter table coin_ticks enable row level security;
create policy "read ticks" on coin_ticks for select using (true);

create or replace function prune_ticks() returns void
language sql security definer set search_path = public as $$
  delete from coin_ticks where ts < now() - interval '30 minutes';
$$;
revoke all on function prune_ticks from public, anon, authenticated;