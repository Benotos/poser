-- POSER v2: own charts, limit orders, watchlist, follows, equity curves, stats, XP.
-- Run after 001_poser.sql. Safe to run once.

-- ───────────────────────── candles (worker, 1 minute, in market cap SOL) ─────────────────────────
create table if not exists coin_candles (
  mint  text not null,
  t     timestamptz not null,   -- bucket start
  o     numeric not null,
  h     numeric not null,
  l     numeric not null,
  c     numeric not null,
  v     numeric not null default 0,   -- SOL volume
  n     int not null default 0,       -- trade count
  primary key (mint, t)
);

create or replace function upsert_candles(p_rows jsonb) returns void
language sql security definer set search_path = public as $$
  insert into coin_candles (mint, t, o, h, l, c, v, n)
  select x->>'mint', (x->>'t')::timestamptz, (x->>'o')::numeric, (x->>'h')::numeric, (x->>'l')::numeric,
         (x->>'c')::numeric, (x->>'v')::numeric, (x->>'n')::int
  from jsonb_array_elements(p_rows) x
  on conflict (mint, t) do update set
    h = greatest(coin_candles.h, excluded.h),
    l = least(coin_candles.l, excluded.l),
    c = excluded.c,
    v = greatest(coin_candles.v, excluded.v),
    n = greatest(coin_candles.n, excluded.n);
$$;

-- coins someone is looking at: worker streams their trades while `until` is in the future
create table if not exists coin_watch (
  mint   text primary key,
  until  timestamptz not null
);

-- ───────────────────────── social ─────────────────────────
create table if not exists follows (
  follower   uuid not null references profiles(id) on delete cascade,
  followee   uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists follows_followee_idx on follows (followee);

create table if not exists watchlist (
  profile_id uuid not null references profiles(id) on delete cascade,
  mint       text not null references coins(mint) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, mint)
);

-- ───────────────────────── limit orders ─────────────────────────
create table if not exists orders (
  id          bigserial primary key,
  profile_id  uuid not null references profiles(id) on delete cascade,
  day         date not null,
  mint        text not null references coins(mint),
  side        text not null check (side in ('buy','sell')),
  trigger     text not null check (trigger in ('mc_below','mc_above')),
  trigger_mc  numeric not null check (trigger_mc > 0),   -- market cap in SOL
  sol         numeric,                                    -- buy size
  pct         numeric,                                    -- sell fraction
  note        text check (char_length(note) <= 140),
  status      text not null default 'open' check (status in ('open','filled','cancelled','failed')),
  error       text,
  trade_id    bigint references trades(id),
  created_at  timestamptz not null default now(),
  filled_at   timestamptz
);
create index if not exists orders_open_idx on orders (status, day) where status = 'open';
create index if not exists orders_profile_idx on orders (profile_id, created_at desc);

-- ───────────────────────── equity curve ─────────────────────────
create table if not exists equity_snapshots (
  day         date not null,
  profile_id  uuid not null references profiles(id) on delete cascade,
  ts          timestamptz not null default now(),
  equity_sol  numeric not null,
  primary key (profile_id, ts)
);
create index if not exists equity_day_idx on equity_snapshots (day, profile_id, ts);

create or replace function snapshot_equity(p_day date) returns void
language sql security definer set search_path = public as $$
  insert into equity_snapshots (day, profile_id, ts, equity_sol)
  select day, profile_id, date_trunc('minute', now()), equity_sol from league_entries where day = p_day
  on conflict do nothing;
  delete from equity_snapshots where ts < now() - interval '14 days';
  delete from coin_candles where t < now() - interval '3 days';
  delete from coin_watch where until < now();
$$;

-- ───────────────────────── trades: pnl % and trade id ─────────────────────────
alter table trades add column if not exists pnl_pct numeric;

create or replace function execute_trade(
  p_profile uuid, p_day date, p_mint text, p_side text,
  p_sol numeric, p_tokens numeric, p_price numeric, p_mc numeric,
  p_fee numeric, p_note text, p_reason text,
  p_tp numeric default null, p_sl numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e   league_entries%rowtype;
  pos positions%rowtype;
  cost_out numeric;
  pnl numeric := null;
  pnlp numeric := null;
  tid bigint;
begin
  insert into league_entries (day, profile_id) values (p_day, p_profile)
    on conflict do nothing;
  select * into e from league_entries where day = p_day and profile_id = p_profile for update;

  if p_side = 'buy' then
    if p_sol <= 0 or p_tokens <= 0 then raise exception 'bad_amount'; end if;
    if e.cash_sol + 1e-9 < p_sol then raise exception 'insufficient_sol'; end if;
    update league_entries set cash_sol = cash_sol - p_sol, trades = trades + 1
      where day = p_day and profile_id = p_profile;
    insert into positions (day, profile_id, mint, tokens, cost_sol, value_sol, tp_mult, sl_mult)
      values (p_day, p_profile, p_mint, p_tokens, p_sol, p_sol, p_tp, p_sl)
    on conflict (day, profile_id, mint) do update set
      tokens = positions.tokens + excluded.tokens,
      cost_sol = positions.cost_sol + excluded.cost_sol,
      value_sol = positions.value_sol + excluded.value_sol,
      tp_mult = coalesce(excluded.tp_mult, positions.tp_mult),
      sl_mult = coalesce(excluded.sl_mult, positions.sl_mult);
  elsif p_side = 'sell' then
    select * into pos from positions
      where day = p_day and profile_id = p_profile and mint = p_mint for update;
    if not found or pos.tokens <= 0 then raise exception 'no_position'; end if;
    if p_tokens > pos.tokens * 1.000001 then raise exception 'insufficient_tokens'; end if;
    cost_out := pos.cost_sol * least(p_tokens / pos.tokens, 1);
    pnl := p_sol - cost_out;
    pnlp := case when cost_out > 0 then pnl / cost_out else null end;
    update league_entries set
      cash_sol = cash_sol + p_sol,
      realized_sol = realized_sol + pnl,
      trades = trades + 1
      where day = p_day and profile_id = p_profile;
    if pos.tokens - p_tokens <= pos.tokens * 0.000001 then
      delete from positions where day = p_day and profile_id = p_profile and mint = p_mint;
    else
      update positions set
        tokens = tokens - p_tokens,
        cost_sol = cost_sol - cost_out,
        value_sol = greatest(value_sol * (1 - p_tokens / pos.tokens), 0)
        where day = p_day and profile_id = p_profile and mint = p_mint;
    end if;
  else
    raise exception 'bad_side';
  end if;

  insert into trades (day, profile_id, mint, side, sol, tokens, price_sol, mc_sol, fee_sol, pnl_sol, pnl_pct, note, reason)
    values (p_day, p_profile, p_mint, p_side, p_sol, p_tokens, p_price, p_mc, p_fee, pnl, pnlp, nullif(trim(p_note), ''), p_reason)
    returning id into tid;

  update league_entries le set equity_sol = le.cash_sol + coalesce(
      (select sum(value_sol) from positions p where p.day = p_day and p.profile_id = p_profile), 0),
    marked_at = now()
    where le.day = p_day and le.profile_id = p_profile;

  select * into e from league_entries where day = p_day and profile_id = p_profile;
  return jsonb_build_object('trade_id', tid, 'cash_sol', e.cash_sol, 'equity_sol', e.equity_sol, 'pnl_sol', pnl, 'pnl_pct', pnlp);
end $$;
revoke all on function execute_trade from public, anon, authenticated;

-- trade_feed picks up the new column
drop view if exists trade_feed;
create view trade_feed with (security_invoker = on) as
  select t.id, t.day, t.profile_id, t.mint, t.side, t.sol, t.tokens, t.price_sol, t.mc_sol, t.fee_sol,
         t.pnl_sol, t.pnl_pct, t.note, t.reason, t.created_at,
         p.username, p.avatar_seed, p.is_agent, c.symbol, c.name as coin_name, c.image
  from trades t
  join profiles p on p.id = t.profile_id
  left join coins c on c.mint = t.mint;

-- ───────────────────────── stats + XP ─────────────────────────
create or replace view profile_stats with (security_invoker = on) as
  select p.id as profile_id, p.username, p.avatar_seed, p.is_agent,
    coalesce(t.trades, 0) as trades,
    coalesce(t.sells, 0) as sells,
    coalesce(t.wins, 0) as wins,
    case when coalesce(t.sells, 0) > 0 then t.wins::numeric / t.sells else null end as win_rate,
    coalesce(t.realized, 0) as realized_sol,
    t.best_pnl, t.best_pct, t.worst_pnl,
    coalesce(t.volume, 0) as volume_sol,
    coalesce(t.days, 0) as days_played,
    coalesce(r.top10, 0) as top10,
    coalesce(r.wins1, 0) as first_places,
    r.best_rank,
    coalesce(r.paid, 0) as earned_sol,
    ( coalesce(t.trades, 0) * 10 + coalesce(t.wins, 0) * 25 + coalesce(t.days, 0) * 50
      + coalesce(r.top10, 0) * 500 + coalesce(r.wins1, 0) * 2000 )::int as xp,
    (select count(*) from follows f where f.followee = p.id)::int as followers,
    (select count(*) from follows f where f.follower = p.id)::int as following
  from profiles p
  left join (
    select profile_id, count(*) as trades,
      count(*) filter (where side = 'sell') as sells,
      count(*) filter (where side = 'sell' and pnl_sol > 0) as wins,
      sum(pnl_sol) as realized, max(pnl_sol) as best_pnl, max(pnl_pct) as best_pct, min(pnl_sol) as worst_pnl,
      sum(sol) as volume, count(distinct day) as days
    from trades group by profile_id
  ) t on t.profile_id = p.id
  left join (
    select profile_id,
      count(*) filter (where share > 0) as top10,
      count(*) filter (where rank = 1) as wins1,
      min(rank) as best_rank,
      sum(payout_sol) as paid
    from league_results group by profile_id
  ) r on r.profile_id = p.id;

create or replace view daily_stats with (security_invoker = on) as
  select day,
    count(distinct profile_id) as posers,
    count(*) as trades,
    sum(sol) as volume_sol
  from trades group by day;

-- ───────────────────────── RLS ─────────────────────────
alter table coin_candles     enable row level security;
alter table coin_watch       enable row level security;
alter table follows          enable row level security;
alter table watchlist        enable row level security;
alter table orders           enable row level security;
alter table equity_snapshots enable row level security;

create policy "read candles" on coin_candles     for select using (true);
create policy "read follows" on follows          for select using (true);
create policy "read equity"  on equity_snapshots for select using (true);
-- watchlist, orders, coin_watch: private, server only

revoke all on function upsert_candles, snapshot_equity from public, anon, authenticated;

alter publication supabase_realtime add table coin_candles;
