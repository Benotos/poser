// MAINTENANCE=1 in Vercel env takes the whole site offline (pages and API). Remove it and redeploy to bring it back.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>POSER</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050505;color:#fff;font-family:system-ui,sans-serif;text-align:center}
h1{font-size:40px;margin:0 0 8px;background:linear-gradient(90deg,#9945ff,#14f195);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:4px}p{color:#8e8e9c;margin:0}</style></head>
<body><div><h1>POSER</h1><p>We're offline for a bit. Back soon.</p></div></body></html>`;

// returning nothing lets the request through; no next/server import needed
export function middleware(_req: Request) {
  if (process.env.MAINTENANCE !== "1") return;
  return new Response(PAGE, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "3600" } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo.png).*)"] };