"use client";
import { useEffect, useRef } from "react";
import { createChart, UTCTimestamp } from "lightweight-charts";

type Pt = { time: number; value: number };

/** small area (equity) or histogram (daily PnL) chart */
export default function MiniChart({ data, kind, base = 10, height = 220 }: { data: Pt[]; kind: "area" | "bars"; base?: number; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current || !data.length) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#8e8e9c", fontFamily: "Schibsted Grotesk, sans-serif", fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(31,31,38,.5)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: kind === "area" },
      handleScroll: false, handleScale: false,
    });
    const last = data[data.length - 1].value;
    if (kind === "area") {
      const up = last >= base;
      const s = c.addAreaSeries({
        lineColor: up ? "#14f195" : "#ff4d6a", lineWidth: 2,
        topColor: up ? "rgba(20,241,149,.28)" : "rgba(255,77,106,.28)", bottomColor: "rgba(0,0,0,0)",
        priceFormat: { type: "price", precision: 3, minMove: 0.001 },
      });
      s.setData(data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
      s.createPriceLine({ price: base, color: "#1f1f26", lineStyle: 2, lineWidth: 1, axisLabelVisible: false, title: "" });
    } else {
      const s = c.addHistogramSeries({ priceFormat: { type: "price", precision: 2, minMove: 0.01 } });
      s.setData(data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value, color: d.value >= 0 ? "#14f195" : "#ff4d6a" })));
    }
    c.timeScale().fitContent();
    return () => c.remove();
  }, [data, kind, base]);
  if (!data.length) return <div style={{ height }} className="flex items-center justify-center text-sm text-mute">No data yet.</div>;
  return <div ref={el} style={{ height }} />;
}
