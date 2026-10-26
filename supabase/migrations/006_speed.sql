-- POSER v6: stops the "deadlock" and "statement timeout" errors in the worker.
-- Run after 005_images.sql. Safe to run more than once.

-- cleanup queries were scanning whole tables
create index if not exists coin_candles_t_idx on coin_candles (t);
create index if not exists coin_ticks_ts_idx on coin_ticks (ts);
create index if not exists coin_trades_ts_idx on coin_trades (ts);
create index if not exists equity_snapshots_ts_idx on equity_snapshots (ts);
create index if not exists coin_watch_until_idx on coin_watch (until);

-- equity snapshot does only the snapshot now; old rows are cleared in small batches
create or replace function snapshot_equity(p_day date) returns void
language sql security definer set search_path = public as $$
  insert into equity_snapshots (day, profile_id, ts, equity_sol)
  select day, profile_id, date_trunc('minute', now()), equity_sol from league_entries where day = p_day
  on conflict do nothing;
  delete from coin_watch where until < now();
$$;

create or replace function prune_history() returns void
language sql security definer set search_path = public as $$
  delete from equity_snapshots where ctid in (select ctid from equity_snapshots where ts < now() - interval '14 days' limit 5000);
  delete from coin_candles where ctid in (select ctid from coin_candles where t < now() - interval '3 days' limit 20000);
  delete from coin_ticks where ctid in (select ctid from coin_ticks where ts < now() - interval '30 minutes' limit 20000);
  delete from coin_trades where ctid in (select ctid from coin_trades where ts < now() - interval '6 hours' limit 20000);
$$;

-- coins cleanup without the trade history delete (prune_history does that in batches)
create or replace function prune_coins() returns void
language sql security definer set search_path = public as $$
  delete from coins c where c.mint in (
    select c2.mint from coins c2
    where c2.created_at < now() - interval '2 days'
      and coalesce(c2.last_trade_at, c2.created_at) < now() - interval '1 day'
      and not exists (select 1 from trades t where t.mint = c2.mint)
      and not exists (select 1 from positions p where p.mint = c2.mint)
    order by c2.mint
    limit 2000
  );
$$;

revoke all on function snapshot_equity, prune_history, prune_coins from public, anon, authenticated;