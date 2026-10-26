"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, IChartApi, ISeriesApi, UTCTimestamp, SeriesMarker, CrosshairMode, IPriceLine, MouseEventParams } from "lightweight-charts";
import { sb } from "@/lib/supabase";
import { useMc } from "./useMc";
import { compact } from "@/lib/format";
import { leagueDay } from "@/lib/constants";

type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Tick = { t: number; mc: number; sol: number };
type Mark = { ts: string; side: "buy" | "sell"; mine: boolean };

// every timeframe loads real history from pump.fun, live trades keep the newest bar moving
const TFS = [["1s", 1], ["15s", 15], ["1m", 60], ["5m", 300], ["15m", 900], ["1h", 3600], ["4h", 14400], ["1D", 86400]] as const;

function bucketize(bars: Bar[], tf: number): Bar[] {
  const out = new Map<number, Bar>();
  for (const b of bars) {
    const k = Math.floor(b.time / tf) * tf;
    const x = out.get(k);
    if (!x) out.set(k, { ...b, time: k });
    else { x.high = Math.max(x.high, b.high); x.low = Math.min(x.low, b.low); x.close = b.close; x.volume += b.volume; }
  }
  return [...out.values()].sort((a, b) => a.time - b.time);
}

/** push live price points onto a bar list, extending the current bucket or opening new ones */
function applyTicks(base: Bar[], ticks: Tick[], tf: number): Bar[] {
  const out = base.slice();
  // price points arrive from several sources and can be out of order: sort, and never step back in time.
  // An out of order bar makes the chart library throw and freeze.
  const sorted = ticks.slice().sort((a, b) => a.t - b.t);
  for (const t of sorted) {
    const k = Math.floor(t.t / tf) * tf;
    const last = out[out.length - 1];
    if (last && k < last.time) continue;
    if (last && last.time === k) {
      out[out.length - 1] = { ...last, high: Math.max(last.high, t.mc), low: Math.min(last.low, t.mc), close: t.mc, volume: last.volume + t.sol };
    } else {
      const o = last ? last.close : t.mc;
      out.push({ time: k, open: o, high: Math.max(o, t.mc), low: Math.min(o, t.mc), close: t.mc, volume: t.sol });
    }
  }
  return out;
}

export default function Chart({ mint, liveMc, entryMc, myId }: { mint: string; liveMc: number | null; entryMc: number | null; myId?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candle = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const vol = useRef<ISeriesApi<"Histogram"> | null>(null);
  const entryLine = useRef<IPriceLine | null>(null);
  const fitted = useRef<string>("");
  const drawn = useRef<{ sig: string; len: number }>({ sig: "", len: 0 });
  // remembers your last timeframe across coins and visits
  const [tf, setTfState] = useState<number>(60);
  useEffect(() => {
    try { const v = Number(localStorage.getItem("poser:tf")); if (TFS.some(([, x]) => x === v)) setTfState(v); } catch {}
  }, []);
  const setTf = (v: number) => { setTfState(v); try { localStorage.setItem("poser:tf", String(v)); } catch {} };
  const [histData, setHistData] = useState<{ key: string; bars: Bar[] }>({ key: "", bars: [] });
  const [histRev, setHistRev] = useState(0);
  // older history, loaded page by page as you scroll left
  const [older, setOlder] = useState<{ key: string; bars: Bar[]; done: boolean }>({ key: "", bars: [], done: false });
  const olderBusy = useRef(false);
  const olderRef = useRef(older);
  olderRef.current = older;
  const shiftBy = useRef(0);
  const [histState, setHistState] = useState<"loading" | "ok" | "empty">("loading");
  const [dbMinutes, setDbMinutes] = useState<Bar[]>([]);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [showMarks, setShowMarks] = useState(true);
  const [hover, setHover] = useState<Bar | null>(null);
  const mc = useMc();
  const liveRef = useRef(liveMc);
  liveRef.current = liveMc;

  // real history for the chosen timeframe, refreshed often (every 2s on 1s / 15s)
  useEffect(() => {
    let alive = true;
    let lastSig = "";
    const hk = `${mint}:${tf}`;
    setHistState("loading");
    const load = () => fetch(`/api/candles/${mint}?tf=${tf}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      const next: Bar[] = j.bars ?? [];
      const sig = `${next.length}:${next[0]?.time}:${next[next.length - 1]?.time}:${next[next.length - 1]?.close}`;
      if (sig !== lastSig) {
        // only a full redraw when older bars changed, a new last bar is a cheap update
        const firstChanged = !lastSig || lastSig.split(":")[1] !== String(next[0]?.time);
        lastSig = sig;
        setHistData({ key: hk, bars: next });
        if (firstChanged) setHistRev((r) => r + 1);
      }
      setHistState((h) => (next.length || h === "ok" ? "ok" : "empty"));
    }).catch(() => alive && setHistState((h) => (h === "ok" ? "ok" : "empty")));
    load();
    const t = setInterval(load, tf < 60 ? 2000 : tf <= 900 ? 10_000 : 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [mint, tf]);

  // our own recorded data: fallback candles, recent trades, POSER trade markers
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: cs }, { data: tr }, { data: pt }, { data: tk }] = await Promise.all([
        sb().from("coin_candles").select("t,o,h,l,c,v").eq("mint", mint).gte("t", new Date(Date.now() - 24 * 3600_000).toISOString()).order("t").limit(1440),
        sb().from("coin_trades").select("ts,mc_sol,sol").eq("mint", mint).gte("ts", new Date(Date.now() - 15 * 60_000).toISOString()).order("ts").limit(3000),
        sb().from("trades").select("created_at,side,profile_id").eq("mint", mint).eq("day", leagueDay()).order("created_at").limit(500),
        sb().from("coin_ticks").select("ts,mc").eq("mint", mint).gte("ts", new Date(Date.now() - 15 * 60_000).toISOString()).order("ts").limit(3000),
      ]);
      if (!alive) return;
      setDbMinutes((cs ?? []).map((c: any) => ({ time: Date.parse(c.t) / 1000, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v })));
      const seed = [
        ...(tk ?? []).map((t: any) => ({ t: Date.parse(t.ts) / 1000, mc: +t.mc, sol: 0 })),
        ...(tr ?? []).filter((t: any) => +t.mc_sol > 0).map((t: any) => ({ t: Date.parse(t.ts) / 1000, mc: +t.mc_sol, sol: +t.sol })),
      ].sort((x, y) => x.t - y.t);
      // keep anything the live poll already added
      setTicks((cur) => [...seed, ...cur.filter((c) => !seed.length || c.t > seed[seed.length - 1].t)]);
      setMarks((pt ?? []).map((p: any) => ({ ts: p.created_at, side: p.side, mine: p.profile_id === myId })));
    })();
    // live ticks already come from /api/trades; POSER trade markers refresh from the cached read route
    const mk = setInterval(async () => {
      const { data: pt } = await sb().from("trades").select("created_at,side,profile_id").eq("mint", mint).eq("day", leagueDay()).order("created_at").limit(500);
      if (alive && pt) setMarks(pt.map((p: any) => ({ ts: p.created_at, side: p.side, mine: p.profile_id === myId })));
    }, 8000);
    return () => { alive = false; clearInterval(mk); };
  }, [mint, myId]);

  // real swaps from any DEX (GeckoTerminal): seconds level history + live trades, every 4s
  useEffect(() => {
    let alive = true;
    const seen = new Set<string>();
    const load = () => fetch(`/api/trades/${mint}`).then((r) => r.json()).then((j) => {
      if (!alive || !j.trades?.length) return;
      const fresh = (j.trades as { t: number; mc: number; sol: number; sig: string | null }[])
        .filter((x) => x.mc > 0 && !seen.has(`${x.sig}:${x.t}`));
      fresh.forEach((x) => seen.add(`${x.sig}:${x.t}`));
      if (fresh.length) setTicks((arr) => [...arr, ...fresh.map((x) => ({ t: x.t, mc: x.mc, sol: x.sol }))].sort((a, b) => a.t - b.t).slice(-8000));
    }).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [mint]);

  // a live quote only counts when the price actually moved (a trade happened), so no flat filler bars
  useEffect(() => {
    if (!liveMc) return;
    const t = Date.now() / 1000;
    setTicks((arr) => {
      const last = arr[arr.length - 1];
      if (last && Math.abs(last.mc / liveMc - 1) < 1e-6) return arr;
      return [...arr.slice(-7999), { t, mc: liveMc, sol: 0 }];
    });
  }, [liveMc]);

  // history only counts for the timeframe it was loaded for
  const hist = useMemo(() => (histData.key === `${mint}:${tf}` ? histData.bars : []), [histData, mint, tf]);
  const histReady = hist.length > 0;
  const bars = useMemo(() => {
    // drop stray points far away from the live price (bad feed data)
    const ref = liveMc ?? null;
    const clean = ref ? ticks.filter((t) => t.mc < ref * 25 && t.mc > ref / 25) : ticks;
    const recent = hist.length ? hist : tf >= 60 && tf <= 3600 ? bucketize(dbMinutes, tf) : [];
    const old = older.key === `${mint}:${tf}` && recent.length ? older.bars.filter((b) => b.time < recent[0].time) : [];
    const base = old.length ? [...old, ...recent] : recent;
    // live points only add to the end, never rewrite history
    const lastT = base.length ? base[base.length - 1].time : 0;
    return applyTicks(base, clean.filter((x) => x.t >= lastT), tf);
  }, [hist, older, dbMinutes, ticks, tf, liveMc, mint]);

  // scrolled near the left edge: fetch the page before the oldest bar
  const barsRef = useRef(bars);
  barsRef.current = bars;
  useEffect(() => {
    const c = chart.current;
    if (!c || tf < 60) return;
    const key = `${mint}:${tf}`;
    const onRange = (r: { from: number; to: number } | null) => {
      if (!r || r.from > 30 || olderBusy.current) return;
      const first = barsRef.current[0]?.time;
      if (!first) return;
      const o = olderRef.current;
      if (o.key === key && o.done) return;
      olderBusy.current = true;
      fetch(`/api/candles/${mint}?tf=${tf}&before=${first}`).then((x) => x.json()).then((j) => {
        const got: Bar[] = (j.bars ?? []).filter((b: Bar) => b.time < first);
        const prev = olderRef.current.key === key ? olderRef.current.bars : [];
        const merged = new Map<number, Bar>();
        for (const x of [...got, ...prev]) merged.set(x.time, x);
        shiftBy.current = got.length;
        setOlder({ key, bars: [...merged.values()].sort((p, q) => p.time - q.time), done: got.length === 0 });
        if (got.length) setHistRev((v) => v + 1);
      }).catch(() => {}).finally(() => { olderBusy.current = false; });
    };
    c.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    return () => c.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
  }, [mint, tf]);

  // chart instance
  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#8e8e9c", fontFamily: "Schibsted Grotesk, sans-serif", fontSize: 11 },
      grid: { vertLines: { color: "rgba(31,31,38,.6)" }, horzLines: { color: "rgba(31,31,38,.6)" } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(153,69,255,.6)", labelBackgroundColor: "#9945ff" },
        horzLine: { color: "rgba(153,69,255,.6)", labelBackgroundColor: "#9945ff" },
      },
      rightPriceScale: { borderColor: "#1f1f26", scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: { borderColor: "#1f1f26", timeVisible: true, secondsVisible: true, rightOffset: 8, barSpacing: 8, minBarSpacing: 2 },
      localization: { priceFormatter: (v: number) => compact(v) },
    });
    candle.current = c.addCandlestickSeries({
      upColor: "#14f195", downColor: "#ff4d6a", borderVisible: false, wickUpColor: "#14f195", wickDownColor: "#ff4d6a",
      priceLineColor: "#9945ff", priceLineStyle: 2,
      priceFormat: { type: "custom", minMove: 0.000001, formatter: (v: number) => compact(v) },
      autoscaleInfoProvider: (orig: () => any) => {
        const r = orig();
        if (r?.priceRange && r.priceRange.minValue < 0) r.priceRange.minValue = 0;
        return r;
      },
    });
    vol.current = c.addHistogramSeries({ priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    vol.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const onMove = (p: MouseEventParams) => {
      const d = p.seriesData.get(candle.current!) as any;
      setHover(d && d.open != null ? { time: Number(p.time), open: d.open, high: d.high, low: d.low, close: d.close, volume: 0 } : null);
    };
    c.subscribeCrosshairMove(onMove);
    chart.current = c;
    return () => { c.unsubscribeCrosshairMove(onMove); c.remove(); chart.current = null; };
  }, []);

  // data
  useEffect(() => {
    if (!candle.current || !vol.current || !chart.current) return;
    const u = mc.toUnit;
    const cBar = (b: Bar) => ({ time: b.time as UTCTimestamp, open: u(b.open), high: u(b.high), low: u(b.low), close: u(b.close) });
    const vBar = (b: Bar) => ({ time: b.time as UTCTimestamp, value: b.volume, color: b.close >= b.open ? "rgba(20,241,149,.28)" : "rgba(255,77,106,.28)" });
    const prev = drawn.current;
    const sig = `${mint}:${tf}:${mc.inUsd}:${bars[0]?.time ?? 0}:${histRev}:${histReady}`;
    try {
      // same series with only the newest bar changed or added: cheap live update
      if (prev.sig === sig && bars.length >= prev.len && bars.length - prev.len <= 1 && bars.length > 0) {
        if (bars.length === prev.len + 1 && prev.len > 0) { candle.current.update(cBar(bars[bars.length - 2])); vol.current.update(vBar(bars[bars.length - 2])); }
        candle.current.update(cBar(bars[bars.length - 1]));
        vol.current.update(vBar(bars[bars.length - 1]));
      } else {
        const ts = chart.current.timeScale();
        const r = shiftBy.current ? ts.getVisibleLogicalRange() : null;
        candle.current.setData(bars.map(cBar));
        vol.current.setData(bars.map(vBar));
        if (r && shiftBy.current) ts.setVisibleLogicalRange({ from: r.from + shiftBy.current, to: r.to + shiftBy.current });
        shiftBy.current = 0;
      }
      drawn.current = { sig, len: bars.length };
    } catch {
      // anything odd: redraw from scratch next time instead of freezing
      drawn.current = { sig: "", len: 0 };
      try { candle.current.setData(bars.map(cBar)); vol.current.setData(bars.map(vBar)); } catch {}
    }

    // POSER trades: grouped per bar so arrows never stack into a tower
    let ms: SeriesMarker<UTCTimestamp>[] = [];
    if (showMarks && bars.length) {
      const first = bars[0].time;
      const groups = new Map<string, { time: number; side: "buy" | "sell"; mine: boolean; n: number }>();
      for (const m of marks) {
        const time = Math.floor(Date.parse(m.ts) / 1000 / tf) * tf;
        if (time < first) continue;
        const k = `${time}:${m.side}:${m.mine}`;
        const g = groups.get(k);
        if (g) g.n++; else groups.set(k, { time, side: m.side, mine: m.mine, n: 1 });
      }
      ms = [...groups.values()].sort((a, b) => a.time - b.time).map((g) => ({
        time: g.time as UTCTimestamp,
        position: g.side === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
        shape: g.mine ? (g.side === "buy" ? ("arrowUp" as const) : ("arrowDown" as const)) : ("circle" as const),
        color: g.mine ? "#ffd24d" : g.side === "buy" ? "rgba(20,241,149,.8)" : "rgba(255,77,106,.8)",
        size: g.mine ? 1.2 : 0.6,
        text: g.mine ? (g.side === "buy" ? "B" : "S") : g.n > 1 ? String(g.n) : "",
      }));
    }
    try { candle.current.setMarkers(ms); } catch {}

    // frame the latest ~150 bars once per coin + timeframe (again when real history lands), then leave the user's zoom alone
    const key = `${mint}:${tf}:${mc.inUsd}:${histReady}`;
    if (bars.length && fitted.current !== key) {
      fitted.current = key;
      const to = bars.length - 1 + 8;
      chart.current.timeScale().setVisibleLogicalRange({ from: Math.max(-2, bars.length - 150), to });
    }
  }, [bars, marks, showMarks, tf, mint, mc.inUsd, mc.usd, histRev, histReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // your average entry
  useEffect(() => {
    if (!candle.current) return;
    if (entryLine.current) { candle.current.removePriceLine(entryLine.current); entryLine.current = null; }
    if (entryMc) entryLine.current = candle.current.createPriceLine({ price: mc.toUnit(entryMc), color: "#ffd24d", lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: "entry" });
  }, [entryMc, mc.inUsd, mc.usd]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = hover ?? bars[bars.length - 1] ?? null;
  const u = mc.toUnit;
  const chg = shown ? shown.close / shown.open - 1 : 0;
  const pre = mc.inUsd ? "$" : "";
  const live = tf < 60;
  const empty = histState !== "loading" && bars.length < 2;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5 text-xs">
        {TFS.map(([l, s]) => (
          <button key={l} onClick={() => setTf(s)} className={"rounded px-2 py-1 " + (tf === s ? "bg-ink text-white" : "text-mute hover:text-white")}>{l}</button>
        ))}
        <span className="mx-2 h-4 w-px bg-line" />
        <span className="text-mute">Market cap {mc.inUsd ? "USD" : "SOL"}</span>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-mute">
          <input type="checkbox" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} className="accent-pop" /> POSER trades
        </label>
      </div>
      <div className="relative h-[460px]">
        <div ref={el} className="absolute inset-0" />
        {shown && (
          <div className="num pointer-events-none absolute left-3 top-2 z-10 flex flex-wrap gap-x-3 text-[11px]">
            <span className="text-mute">O <span className="text-white">{pre}{compact(u(shown.open))}</span></span>
            <span className="text-mute">H <span className="text-white">{pre}{compact(u(shown.high))}</span></span>
            <span className="text-mute">L <span className="text-white">{pre}{compact(u(shown.low))}</span></span>
            <span className="text-mute">C <span className="text-white">{pre}{compact(u(shown.close))}</span></span>
            <span className={chg >= 0 ? "text-mint" : "text-bleed"}>{chg >= 0 ? "+" : ""}{(chg * 100).toFixed(2)}%</span>
          </div>
        )}
        {(histState === "loading" && !bars.length) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><p className="pixel text-xs text-mute">Loading chart</p></div>
        )}
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="pixel rounded bg-ink/80 px-4 py-2 text-xs text-mute">
              {live ? "No trades yet. Bars appear as people trade." : "No history for this coin yet."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}