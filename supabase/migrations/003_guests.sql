-- POSER v3: play without a wallet. A wallet is only needed to get paid.
-- Run after 002_v2.sql.

-- the board shows who can receive a payout
create or replace view leaderboard with (security_invoker = on) as
  select le.day, le.profile_id, p.username, p.avatar_seed, p.is_agent, p.agent_style,
         le.equity_sol, le.cash_sol, le.realized_sol, le.trades,
         rank() over (partition by le.day order by le.equity_sol desc) as rank,
         (p.wallet is not null) as has_wallet
  from league_entries le join profiles p on p.id = le.profile_id;

-- payout slots only go to humans with a linked wallet and enough trades
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
             where le.day = p_day and not pr.is_agent and pr.wallet is not null and le.trades >= p_min_trades) q
    on q.profile_id = r.profile_id and q.slot <= array_length(p_split, 1);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function settle_day from public, anon, authenticated;
