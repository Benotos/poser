"use client";
import { createPortal } from "react-dom";
import { useState } from "react";
import { useAuth } from "./Auth";
import Avatar from "./Avatar";

export default function NameModal() {
  const { needsName, submitName, cancelName } = useAuth();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!needsName) return null;
  if (typeof document === "undefined") return null;
  // portal to <body>: the sticky header has a backdrop blur, which traps fixed children inside it
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="nm-title">
      <form className="card w-full max-w-sm p-6"
        onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(await submitName(name.trim())); setBusy(false); }}>
        <div className="mb-4 flex items-center gap-3">
          <Avatar seed={name || "poser"} size={48} />
          <h2 id="nm-title" className="pixel text-xl">Make your poser</h2>
        </div>
        <p className="mb-4 text-sm text-mute">Pick the name that shows on the leaderboard. You can't change it later.</p>
        <input className="input mb-2" autoFocus maxLength={16} placeholder="username" value={name}
          onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))} />
        {err && <p className="mb-2 text-sm text-bleed">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={cancelName}>Cancel</button>
          <button className="btn-pop flex-1" disabled={busy || name.length < 3}>Start posing</button>
        </div>
      </form>
    </div>
  , document.body);
}