/* ============================================================
   ping · token detail — DexScreener-style chart page, ping colors
   ============================================================ */
(function () {
  "use strict";
  const q = new URLSearchParams(location.search);
  const chain = q.get("chain"), pair = q.get("pair");
  const head = document.getElementById("tkHead");
  const frame = document.getElementById("tkChart");
  const load = document.getElementById("tkLoad");
  const CHAIN_ICON = (c) => `https://dd.dexscreener.com/ds-data/chains/${c}.png`;
  const DEX_ICON = (d) => `https://dd.dexscreener.com/ds-data/dexes/${d}.png`;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  if (!chain || !pair) { head.innerHTML = '<div class="tk-id">No token specified.</div>'; if (load) load.textContent = ""; return; }

  // the TradingView-style chart, embedded from DexScreener (dark to match our theme)
  frame.src = `https://dexscreener.com/${encodeURIComponent(chain)}/${encodeURIComponent(pair)}?embed=1&theme=dark&trades=0&info=0`;
  frame.addEventListener("load", () => { if (load) load.style.display = "none"; });

  /* formatters (shared look with the tokens table) */
  function fmtPrice(p) {
    if (p == null || !isFinite(p)) return "—";
    if (p >= 1) return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 0.001) return "$" + Number(p.toPrecision(4)).toString();
    const s = p.toFixed(20), m = s.match(/^0\.(0+)(\d+)/);
    if (!m) return "$" + p;
    return `$0.0<span class="sub0">${m[1].length}</span>${m[2].slice(0, 4)}`;
  }
  function abbr(x) {
    if (x == null || !isFinite(x)) return "—";
    const a = Math.abs(x);
    if (a >= 1e9) return "$" + (x / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return "$" + (x / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + (x / 1e3).toFixed(0) + "K";
    return "$" + x.toFixed(0);
  }
  function pctHtml(n) {
    if (n == null || !isFinite(n)) return '<span class="c">—</span>';
    const cls = n > 0 ? "pos" : n < 0 ? "neg" : "";
    return `<span class="c ${cls}">${(n > 0 ? "+" : "") + n.toFixed(2)}%</span>`;
  }
  function pctSpan(n) {
    if (n == null || !isFinite(n)) return "—";
    const cls = n > 0 ? "pos" : n < 0 ? "neg" : "";
    return `<b class="${cls}">${(n > 0 ? "+" : "") + n.toFixed(1)}%</b>`;
  }
  function ageStr(ms) {
    if (!ms) return "—";
    const d = (Date.now() - ms) / 86400000;
    if (d < 1) return Math.max(1, Math.round(d * 24)) + "h";
    if (d < 30) return Math.round(d) + "d";
    if (d < 365) return Math.round(d / 30) + "mo";
    return (d / 365).toFixed(1) + "y";
  }
  function fmtInt(n) { return (n == null || !isFinite(n)) ? "—" : Math.round(n).toLocaleString("en-US"); }

  fetch(`https://api.dexscreener.com/latest/dex/pairs/${encodeURIComponent(chain)}/${encodeURIComponent(pair)}`)
    .then((r) => r.json())
    .then((d) => {
      const p = d.pair || (d.pairs && d.pairs[0]);
      if (!p) { head.innerHTML = '<div class="tk-id">Pair not found.</div>'; return; }
      const sym = p.baseToken && p.baseToken.symbol || "?";
      document.title = "$" + sym + " · Ping";
      const ch = p.priceChange || {};
      const img = p.info && p.info.imageUrl;
      const txns = (p.txns && p.txns.h24 && (p.txns.h24.buys + p.txns.h24.sells)) || 0;
      head.innerHTML =
        `<div class="tk-id">
          ${img ? `<img class="logo" src="${esc(img)}" alt="" onerror="this.style.visibility='hidden'">` : `<div class="logo"></div>`}
          <div>
            <div class="tk-sym">${esc(sym)}<span> / ${esc(p.quoteToken && p.quoteToken.symbol || "")}</span></div>
            <div class="tk-name">${esc(p.baseToken && p.baseToken.name || "")}
              <img src="${CHAIN_ICON(p.chainId)}" alt="" title="${esc(p.chainId)}" onerror="this.style.display='none'">
              <img src="${DEX_ICON(p.dexId)}" alt="" title="${esc(p.dexId)}" onerror="this.style.display='none'">
            </div>
          </div>
        </div>
        <div class="tk-stats">
          <div class="tk-stat"><b>${fmtInt(txns)}</b><span>Txns 24h</span></div>
          <div class="tk-stat"><b>${abbr(p.volume && p.volume.h24)}</b><span>Vol 24h</span></div>
          <div class="tk-stat"><b>${abbr(p.liquidity && p.liquidity.usd)}</b><span>Liquidity</span></div>
          <div class="tk-stat"><b>${abbr(p.marketCap || p.fdv)}</b><span>Market cap</span></div>
          <div class="tk-stat"><b>${pctSpan(ch.h1)}</b><span>1H</span></div>
          <div class="tk-stat"><b>${pctSpan(ch.h24)}</b><span>24H</span></div>
          <div class="tk-stat"><b>${ageStr(p.pairCreatedAt)}</b><span>Age</span></div>
        </div>
        <div class="tk-price">
          <div class="p">${fmtPrice(p.priceUsd != null ? +p.priceUsd : null)}</div>
          ${pctHtml(ch.h24)}
        </div>`;
    })
    .catch(() => { head.innerHTML = '<div class="tk-id">Couldn\'t load token data.</div>'; });
})();
