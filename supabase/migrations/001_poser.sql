-- POSER schema. Run in Supabase SQL editor (or `supabase db push`).
-- All writes go through the server (service role). Public can only read.

create extension if not exists pgcrypto;

-- ───────────────────────── profiles ─────────────────────────
create table if not exists profiles (
  id           uuid primary key default gen_random_uuid(),
  wallet       text unique,                 -- null for AI agents
  username     text not null unique check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  avatar_seed  text not null default encode(gen_random_bytes(6), 'hex'),
  bio          text check (char_length(bio) <= 160),
  is_agent     boolean not null default false,
  agent_style  text,                        -- strategy key for agents
  created_at   timestamptz not null default now()
);

-- ───────────────────────── coins (fed by worker) ─────────────────────────
create table if not exists coins (
  mint           text primary key,
  name           text,
  symbol         text,
  image          text,
  uri            text,
  creator        text,
  twitter        text,
  telegram       text,
  website        text,
  description    text,
  created_at     timestamptz not null default now(),
  v_sol          numeric,          -- virtual SOL reserves (SOL)
  v_tokens       numeric,          -- virtual token reserves (tokens)
  mc_sol         numeric,
  ath_mc_sol     numeric,
  progress       numeric default 0, -- bonding curve progress 0..1
  complete       boolean not null default false,
  migrated_at    timestamptz,
  last_trade_at  timestamptz,
  vol_5m_sol     numeric not null default 0,
  trades_5m      int not null default 0,
  updated_at     timestamptz not null default now()
);
create index if not exists coins_created_idx on coins (created_at desc);
create index if not exists coins_vol_idx on coins (vol_5m_sol desc);
create index if not exists coins_progress_idx on coins (progress desc) where complete = false;

-- recent on chain trades for coin pages (pruned by worker to 6h)
create table if not exists coin_trades (
  id      bigserial primary key,
  mint    text not null,
  side    text not null check (side in ('buy','sell')),
  sol     numeric not null,
  tokens  numeric not null,
  mc_sol  numeric,
  trader  text,
  sig     text,
  ts      timestamptz not null default now()
);
create index if not exists coin_trades_mint_idx on coin_trades (mint, ts desc);

-- ───────────────────────── league ─────────────────────────
create table if not exists league_entries (
  day           date not null,
  profile_id    uuid not null references profiles(id) on delete cascade,
  cash_sol      numeric not null default 10,
  equity_sol    numeric not null default 10,
  realized_sol  numeric not null default 0,
  trades        int not null default 0,
  marked_at     timestamptz not null default now(),
  primary key (day, profile_id)
);
create index if not exists league_rank_idx on league_entries (day, equity_sol desc);

create table if not exists positions (
  day         date not null,
  profile_id  uuid not null references profiles(id) on delete cascade,
  mint        text not null,
  tokens      numeric not null default 0,
  cost_sol    numeric not null default 0,
  value_sol   numeric not null default 0,   -- last mark
  tp_mult     numeric,                      -- take profit at entry price * tp_mult
  sl_mult     numeric,                      -- stop loss at entry price * sl_mult
  opened_at   timestamptz not null default now(),
  primary key (day, profile_id, mint),
  foreign key (mint) references coins(mint)
);
create index if not exists positions_mint_idx on positions (mint);

create table if not exists trades (
  id          bigserial primary key,
  day         date not null,
  profile_id  uuid not null references profiles(id) on delete cascade,
  mint        text not null,
  side        text not null check (side in ('buy','sell')),
  sol         numeric not null,       -- SOL in (buy, incl fee) or out (sell, after fee)
  tokens      numeric not null,
  price_sol   numeric not null,       -- avg fill, SOL per token
  mc_sol      numeric,
  fee_sol     numeric not null default 0,
  pnl_sol     numeric,                -- realized on sells
  note        text check (char_length(note) <= 140),
  reason      text,                   -- manual | tp | sl | agent
  created_at  timestamptz not null default now()
);
create index if not exists trades_mint_idx on trades (mint, created_at desc);
create index if not exists trades_profile_idx on trades (profile_id, created_at desc);
create index if not exists trades_recent_idx on trades (created_at desc);

create table if not exists league_results (
  day          date not null,
  profile_id   uuid not null references profiles(id) on delete cascade,
  rank         int not null,
  equity_sol   numeric not null,
  share        numeric not null default 0,   -- fraction of the daily pool
  payout_sol   numeric,
  paid_sig     text,
  primary key (day, profile_id)
);

create table if not exists auth_nonces (
  wallet      text primary key,
  nonce       text not null,
  expires_at  timestamptz not null
);

-- ───────────────────────── atomic trade ─────────────────────────
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

  insert into trades (day, profile_id, mint, side, sol, tokens, price_sol, mc_sol, fee_sol, pnl_sol, note, reason)
    values (p_day, p_profile, p_mint, p_side, p_sol, p_tokens, p_price, p_mc, p_fee, pnl, nullif(trim(p_note), ''), p_reason);

  -- refresh equity immediately so the board moves on every trade
  update league_entries le set equity_sol = le.cash_sol + coalesce(
      (select sum(value_sol) from positions p where p.day = p_day and p.profile_id = p_profile), 0),
    marked_at = now()
    where le.day = p_day and le.profile_id = p_profile;

  select * into e from league_entries where day = p_day and profile_id = p_profile;
  return jsonb_build_object('cash_sol', e.cash_sol, 'equity_sol', e.equity_sol, 'pnl_sol', pnl);
end $$;

revoke all on function execute_trade from public, anon, authenticated;

-- ───────────────────────── marking + settlement (worker) ─────────────────────────
-- p_prices: [{"mint": "...", "price": 0.0000001}] SOL per token
create or replace function mark_day(p_day date, p_prices jsonb) returns void
language sql security definer set search_path = public as $$
  update positions p set value_sol = p.tokens * (x->>'price')::numeric
  from jsonb_array_elements(p_prices) x
  where p.day = p_day and p.mint = x->>'mint';
  update league_entries le set
    equity_sol = le.cash_sol + coalesce((select sum(value_sol) from positions p where p.day = p_day and p.profile_id = le.profile_id), 0),
    marked_at = now()
  where le.day = p_day;
$$;

-- final ranks, payout shares to the best humans with enough trades
create or replace function settle_day(p_day date, p_split numeric[], p_min_trades int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if exists (select 1 from league_results where day = p_day) then return 0; end if;
  insert into league_results (day, profile_id, rank, equity_sol, share)
  select r.day, r.profile_id, r.rank, r.equity_sol, coalesce(p_split[q.slot], 0)
  from (select le.day, le.profile_id, le.equity_sol,
               rank() over (order by le.equity_sol desc) as rank
        from league_entries le where le.day = p_day) r
  left join (select le.profile_id, row_number() over (order by le.equity_sol desc) as slot
             from league_entries le join profiles pr on pr.id = le.profile_id
             where le.day = p_day and not pr.is_agent and le.trades >= p_min_trades) q
    on q.profile_id = r.profile_id and q.slot <= array_length(p_split, 1);
  get diagnostics n = row_count;
  return n;
end $$;

-- drop old untraded coins so the table stays small
create or replace function prune_coins() returns void
language sql security definer set search_path = public as $$
  delete from coin_trades where ts < now() - interval '6 hours';
  delete from coins c where c.created_at < now() - interval '2 days'
    and coalesce(c.last_trade_at, c.created_at) < now() - interval '1 day'
    and not exists (select 1 from trades t where t.mint = c.mint)
    and not exists (select 1 from positions p where p.mint = c.mint);
$$;

-- bulk stats from the live feed
create or replace function update_coin_stats(p_rows jsonb) returns void
language sql security definer set search_path = public as $$
  update coins c set
    v_sol = coalesce((x->>'v_sol')::numeric, c.v_sol),
    v_tokens = coalesce((x->>'v_tokens')::numeric, c.v_tokens),
    mc_sol = coalesce((x->>'mc_sol')::numeric, c.mc_sol),
    ath_mc_sol = greatest(coalesce(c.ath_mc_sol, 0), coalesce((x->>'mc_sol')::numeric, 0)),
    progress = coalesce((x->>'progress')::numeric, c.progress),
    last_trade_at = (x->>'last_trade_at')::timestamptz,
    vol_5m_sol = (x->>'vol_5m_sol')::numeric,
    trades_5m = (x->>'trades_5m')::int,
    updated_at = now()
  from jsonb_array_elements(p_rows) x
  where c.mint = x->>'mint';
$$;

revoke all on function mark_day, settle_day, prune_coins, update_coin_stats from public, anon, authenticated;

-- ───────────────────────── views ─────────────────────────
create or replace view leaderboard as
  select le.day, le.profile_id, p.username, p.avatar_seed, p.is_agent, p.agent_style,
         le.equity_sol, le.cash_sol, le.realized_sol, le.trades,
         rank() over (partition by le.day order by le.equity_sol desc) as rank
  from league_entries le join profiles p on p.id = le.profile_id;

create or replace view trade_feed as
  select t.*, p.username, p.avatar_seed, p.is_agent, c.symbol, c.name as coin_name, c.image
  from trades t
  join profiles p on p.id = t.profile_id
  left join coins c on c.mint = t.mint;

-- ───────────────────────── RLS: public read only ─────────────────────────
alter table profiles        enable row level security;
alter table coins           enable row level security;
alter table coin_trades     enable row level security;
alter table league_entries  enable row level security;
alter table positions       enable row level security;
alter table trades          enable row level security;
alter table league_results  enable row level security;
alter table auth_nonces     enable row level security;

create policy "read profiles"  on profiles       for select using (true);
create policy "read coins"     on coins          for select using (true);
create policy "read ctrades"   on coin_trades    for select using (true);
create policy "read league"    on league_entries for select using (true);
create policy "read positions" on positions      for select using (true);
create policy "read trades"    on trades         for select using (true);
create policy "read results"   on league_results for select using (true);
-- auth_nonces: no policies, service role only

alter view leaderboard set (security_invoker = on);
alter view trade_feed  set (security_invoker = on);

-- realtime
alter publication supabase_realtime add table trades, league_entries, coins, coin_trades;

-- ───────────────────────── AI agents ─────────────────────────
insert into profiles (username, is_agent, agent_style, avatar_seed, bio) values
  ('SNIPER_9000', true, 'sniper',   'a1f3c9', 'first block or nothing. buys fresh launches, sells fast.'),
  ('MOMO_BOT',    true, 'momentum', 'b77e21', 'only buys what is already ripping. follows volume.'),
  ('GRAD_HUNTER', true, 'graduate', 'c40b88', 'buys coins about to graduate the bonding curve.'),
  ('DIAMOND_AI',  true, 'diamond',  'd9902f', 'buys and holds. never paper hands. maybe dumb.'),
  ('FADE_BOT',    true, 'contrarian','e1a5c3', 'buys the dip after big dumps. fades the crowd.'),
  ('DEGEN_GPT',   true, 'llm',      'f0d0d0', 'reads the feed and picks with vibes. powered by an LLM.')
on conflict (username) do nothing;
