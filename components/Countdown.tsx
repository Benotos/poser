"use client";
import { useEffect, useState } from "react";
import { msToReset } from "@/lib/constants";
import { hms } from "@/lib/format";
export default function Countdown({ className = "" }: { className?: string }) {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => { setMs(msToReset()); const t = setInterval(() => setMs(msToReset()), 1000); return () => clearInterval(t); }, []);
  return <span className={"num " + className}>{ms == null ? "--:--:--" : hms(ms)}</span>;
}
