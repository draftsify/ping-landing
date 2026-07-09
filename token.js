/* ============================================================
   ping · token detail — FOMO-style layout in ping's theme:
   rich header + stats, embedded chart, banner + activity + info.
   ============================================================ */
(function () {
  "use strict";
  const q = new URLSearchParams(location.search);
  const chain = q.get("chain"), pair = q.get("pair");
  const head = document.getElementById("tkHead");
  const side = document.getElementById("tkSide");
  const frame = document.getElementById("tkChart");
  const load = document.getElementById("tkLoad");
  const CHAIN_ICON = (c) => `https://dd.dexscreener.com/ds-data/chains/${c}.png`;
  const DEX_ICON = (d) => `https://dd.dexscreener.com/ds-data/dexes/${d}.png`;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  if (!chain || !pair) { head.innerHTML = '<div class="tk-id">No token specified.</div>'; if (load) load.textContent = ""; return; }

  // TradingView-style chart, embedded from DexScreener (dark to match our theme)
  frame.src = `https://dexscreener.com/${encodeURIComponent(chain)}/${encodeURIComponent(pair)}?embed=1&theme=dark&trades=0&info=0`;
  frame.addEventListener("load", () => { if (load) load.style.display = "none"; });

  /* ---------- formatters ---------- */
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
  function pct(n) {
    if (n == null || !isFinite(n)) return { cls: "", txt: "—" };
    return { cls: n > 0 ? "pos" : n < 0 ? "neg" : "", txt: (n > 0 ? "+" : "") + n.toFixed(2) + "%" };
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
  function shortAddr(a) { return a && a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : (a || ""); }

  /* ---------- social icons ---------- */
  const ICONS = {
    web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18"/></svg>',
    twitter: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.3 8.3L23 22h-6.8l-5.3-6.9L4.8 22H1.7l7.8-8.9L1 2h7l4.8 6.3L18.9 2Zm-1.2 18h1.9L7.4 4H5.4l12.3 16Z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 18.6 20c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-4.9 9-8.1c.4-.3-.1-.5-.6-.2L6.4 13.4l-4.8-1.5c-1-.3-1-1 .2-1.5l18.7-7.2c.9-.3 1.6.2 1.4 1.1Z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  };
  const COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16c-1 0-2-1-2-2V4c0-1 1-2 2-2h10c1 0 2 1 2 2"/></svg>';

  function socialList(p) {
    const out = [];
    ((p.info && p.info.websites) || []).forEach((w) => out.push({ kind: "web", url: w.url || w }));
    ((p.info && p.info.socials) || []).forEach((s) => {
      const t = (s.type || "").toLowerCase();
      out.push({ kind: ICONS[t] ? t : "link", url: s.url });
    });
    return out;
  }

  /* ---------- render ---------- */
  fetch(`https://api.dexscreener.com/latest/dex/pairs/${encodeURIComponent(chain)}/${encodeURIComponent(pair)}`)
    .then((r) => r.json())
    .then((d) => {
      const p = d.pair || (d.pairs && d.pairs[0]);
      if (!p) { head.innerHTML = '<div class="tk-id">Pair not found.</div>'; if (load) load.textContent = ""; return; }

      const sym = (p.baseToken && p.baseToken.symbol) || "?";
      const name = (p.baseToken && p.baseToken.name) || "";
      const quote = (p.quoteToken && p.quoteToken.symbol) || "";
      const addr = (p.baseToken && p.baseToken.address) || "";
      const img = p.info && p.info.imageUrl;
      const ch = p.priceChange || {};
      const c24 = pct(ch.h24);
      document.title = "$" + sym + " · Ping";
      const banner = p.info && p.info.header;   // DexScreener header art → side banner

      /* header */
      const socs = socialList(p);
      head.innerHTML =
        `<div class="tk-id">
          <div class="tk-logo">
            ${img ? `<img src="${esc(img)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph'}))">` : `<div class="ph"></div>`}
            <img class="chip-net" src="${CHAIN_ICON(p.chainId)}" alt="" onerror="this.style.display='none'">
          </div>
          <div>
            <div class="tk-sym">${esc(sym)}<span class="quote">/ ${esc(quote)}</span></div>
            <div class="tk-sub">
              <span>${esc(name)}</span>
              <img class="dexi" src="${DEX_ICON(p.dexId)}" alt="" title="${esc(p.dexId)}" onerror="this.style.display='none'">
              ${addr ? `<button class="tk-addr" id="tkCopyTop" data-addr="${esc(addr)}">${shortAddr(addr)} ${COPY}</button>` : ""}
            </div>
          </div>
        </div>
        ${socs.length ? `<div class="tk-socials">${socs.map((s) => `<a class="tk-soc" href="${esc(s.url)}" target="_blank" rel="noopener">${ICONS[s.kind] || ICONS.link}</a>`).join("")}</div>` : ""}
        <div class="tk-metrics">
          <div class="tk-metric price"><span class="k">Price</span><span class="v">${fmtPrice(p.priceUsd != null ? +p.priceUsd : null)}</span></div>
          <div class="tk-metric"><span class="k">24h</span><span class="v ${c24.cls}">${c24.txt}</span></div>
          <div class="tk-metric"><span class="k">Market cap</span><span class="v">${abbr(p.marketCap || p.fdv)}</span></div>
          <div class="tk-metric"><span class="k">Liquidity</span><span class="v">${abbr(p.liquidity && p.liquidity.usd)}</span></div>
          <div class="tk-metric"><span class="k">Vol 24h</span><span class="v">${abbr(p.volume && p.volume.h24)}</span></div>
        </div>`;

      /* right column */
      const b = (p.txns && p.txns.h24 && p.txns.h24.buys) || 0;
      const s = (p.txns && p.txns.h24 && p.txns.h24.sells) || 0;
      const tot = b + s;
      const buyPct = tot ? (b / tot) * 100 : 50;
      const chip = (lbl, val) => { const x = pct(val); return `<div class="tk-change"><span class="lbl">${lbl}</span><b class="${x.cls}">${x.txt}</b></div>`; };
      const askUrl = "product.html?q=" + encodeURIComponent(`Explain $${sym}${addr ? " (" + addr + ")" : ""} — why is it moving?`);

      side.innerHTML =
        `<div class="tk-banner">
          ${banner
            ? `<div class="bimg" style="background-image:url('${esc(banner)}')"></div>`
            : `<img class="bear" src="assets/bear.svg" alt="" onerror="this.style.display='none'">`}
          <div class="binner">
            <span class="kicker">ping</span>
            <h3>What's the story behind $${esc(sym)}?</h3>
            <a class="tk-cta" href="${askUrl}">Analyze with ping →</a>
          </div>
        </div>

        <div class="tk-panel">
          <h4>Momentum</h4>
          <div class="tk-changes">
            ${chip("5M", ch.m5)}${chip("1H", ch.h1)}${chip("6H", ch.h6)}${chip("24H", ch.h24)}
          </div>
          <div class="tk-bar">
            <div class="row"><span class="l">${fmtInt(b)} buys</span><span class="r">${fmtInt(s)} sells</span></div>
            <div class="track"><div class="g" style="width:${buyPct.toFixed(1)}%"></div><div class="s"></div></div>
          </div>
        </div>

        <div class="tk-panel grow">
          <h4>Token info</h4>
          <div class="tk-rows">
            <div class="r"><span class="k">Exchange</span><span class="fill"></span><span class="v"><img class="dexi" src="${DEX_ICON(p.dexId)}" alt="" onerror="this.style.display='none'">${esc(p.dexId || "—")}</span></div>
            <div class="r"><span class="k">Network</span><span class="fill"></span><span class="v"><img class="dexi" src="${CHAIN_ICON(p.chainId)}" alt="" onerror="this.style.display='none'">${esc(p.chainId || "—")}</span></div>
            <div class="r"><span class="k">FDV</span><span class="fill"></span><span class="v">${abbr(p.fdv)}</span></div>
            <div class="r"><span class="k">Created</span><span class="fill"></span><span class="v">${ageStr(p.pairCreatedAt)} ago</span></div>
            ${addr ? `<div class="r"><span class="k">Contract</span><span class="fill"></span><span class="v copy" id="tkCopyRow" data-addr="${esc(addr)}">${shortAddr(addr)} ${COPY}</span></div>` : ""}
          </div>
        </div>`;

      /* copy handlers */
      const copyAddr = (el) => {
        const a = el.getAttribute("data-addr"); if (!a) return;
        navigator.clipboard && navigator.clipboard.writeText(a);
        const old = el.innerHTML; el.textContent = "Copied ✓";
        setTimeout(() => { el.innerHTML = old; }, 1100);
      };
      document.querySelectorAll("[data-addr]").forEach((el) => el.addEventListener("click", () => copyAddr(el)));
    })
    .catch(() => { head.innerHTML = '<div class="tk-id">Couldn\'t load token data.</div>'; if (load) load.textContent = ""; });
})();
