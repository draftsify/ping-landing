/* ============================================================
   ping · trading board — live DexScreener API
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const rowsEl = $("rows"), stateEl = $("state"), footEl = $("foot"),
    searchEl = $("search"), refreshBtn = $("refresh"), headEl = $("dexHead");

  const API_BOOSTS = "https://api.dexscreener.com/token-boosts/top/v1";
  const API_TOKENS = "https://api.dexscreener.com/latest/dex/tokens/";
  const CHAIN_ICON = (c) => `https://dd.dexscreener.com/ds-data/chains/${c}.png`;
  const DEX_ICON = (d) => `https://dd.dexscreener.com/ds-data/dexes/${d}.png`;

  let data = [];              // normalized rows
  let sort = { key: "vol", dir: -1 };
  let filter = "";

  /* ---------- formatting ---------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function fmtPrice(p) {
    if (p == null || !isFinite(p)) return "—";
    if (p >= 1) return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 0.001) return "$" + Number(p.toPrecision(4)).toString();
    // tiny numbers: 0.0<sub>zeros</sub>digits (DexScreener style)
    const s = p.toFixed(20);
    const m = s.match(/^0\.(0+)(\d+)/);
    if (!m) return "$" + p;
    const zeros = m[1].length;
    const sig = m[2].slice(0, 4);
    return `$0.0<span class="sub0">${zeros}</span>${sig}`;
  }

  function abbr(n) {
    if (n == null || !isFinite(n)) return "—";
    const a = Math.abs(n);
    if (a >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
    return "$" + n.toFixed(0);
  }

  function fmtInt(n) {
    if (n == null || !isFinite(n)) return "—";
    return Math.round(n).toLocaleString("en-US");
  }

  function fmtPct(n) {
    if (n == null || !isFinite(n)) return { t: "0%", c: "muted" };
    const a = Math.abs(n);
    let t;
    if (a >= 1e5) t = (n / 1e3).toFixed(0) + "K%";
    else if (a >= 1000) t = Math.round(n).toLocaleString("en-US") + "%";
    else if (a >= 100) t = n.toFixed(0) + "%";
    else t = n.toFixed(2) + "%";
    return { t, c: n > 0 ? "pos" : n < 0 ? "neg" : "muted" };
  }

  function fmtAge(ms) {
    if (!ms) return { t: "—", c: "age-vold" };
    const s = (Date.now() - ms) / 1000;
    const m = s / 60, h = m / 60, d = h / 24;
    if (m < 60) return { t: Math.max(1, Math.round(m)) + "m", c: "age-new" };
    if (h < 24) return { t: Math.round(h) + "h", c: "age-new" };
    if (d < 30) return { t: Math.round(d) + "d", c: "age-mid" };
    if (d < 365) return { t: Math.round(d / 30) + "mo", c: "age-old" };
    return { t: Math.round(d / 365) + "y", c: "age-vold" };
  }

  /* ---------- social icons ---------- */
  const ICON = {
    website: '<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2c1.7 0 3.3 3.1 3.3 8s-1.6 8-3.3 8-3.3-3.1-3.3-8S10.3 4 12 4zM4.3 9h15.4M4.3 15h15.4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    twitter: '<path d="M17.5 3h2.6l-5.7 6.5L21 21h-5.3l-4.1-5.4L6.8 21H4.2l6.1-7L3 3h5.4l3.7 4.9L17.5 3z"/>',
    telegram: '<path d="M21.9 4.3l-3 14.2c-.2 1-.8 1.2-1.6.8l-4.4-3.2-2.1 2c-.2.2-.4.4-.9.4l.3-4.5 8.2-7.4c.4-.3-.1-.5-.6-.2L7.4 13.4l-4.3-1.3c-.9-.3-1-.9.2-1.4l16.8-6.5c.8-.3 1.5.2 1.8 1.1z"/>',
  };
  function social(type, url) {
    const p = ICON[type] || ICON.website;
    return `<a href="${esc(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="${type}"><svg viewBox="0 0 24 24" fill="currentColor">${p}</svg></a>`;
  }

  /* ---------- data ---------- */
  async function load(manual) {
    if (manual) refreshBtn.classList.add("spin");
    try {
      const boosts = await fetch(API_BOOSTS).then((r) => r.json());
      const seen = new Set();
      const addrs = [];
      const iconMap = {};
      (boosts || []).forEach((b) => {
        if (b && b.tokenAddress && !seen.has(b.tokenAddress)) {
          seen.add(b.tokenAddress);
          addrs.push(b.tokenAddress);
          if (b.icon) iconMap[b.tokenAddress.toLowerCase()] = b.icon;
        }
      });
      const slice = addrs.slice(0, 30);
      const tok = await fetch(API_TOKENS + slice.join(",")).then((r) => r.json());
      const pairs = (tok && tok.pairs) || [];

      // best pair per base token (by 24h volume)
      const best = {};
      pairs.forEach((p) => {
        const k = (p.chainId || "") + ":" + ((p.baseToken && p.baseToken.address) || "");
        const v = (p.volume && p.volume.h24) || 0;
        if (!best[k] || v > ((best[k].volume && best[k].volume.h24) || 0)) best[k] = p;
      });

      data = Object.values(best).map((p) => {
        const soc = {};
        ((p.info && p.info.socials) || []).forEach((s) => { if (!soc[s.type]) soc[s.type] = s.url; });
        const web = (p.info && p.info.websites && p.info.websites[0] && p.info.websites[0].url) || null;
        const addr = (p.baseToken && p.baseToken.address || "").toLowerCase();
        return {
          chainId: p.chainId, dexId: p.dexId, pairAddress: p.pairAddress,
          url: p.url || `https://dexscreener.com/${p.chainId}/${p.pairAddress}`,
          icon: (p.info && p.info.imageUrl) || iconMap[addr] || null,
          sym: (p.baseToken && p.baseToken.symbol) || "?",
          quote: (p.quoteToken && p.quoteToken.symbol) || "",
          name: (p.baseToken && p.baseToken.name) || "",
          label: (p.labels && p.labels[0]) || "",
          web, twitter: soc.twitter, telegram: soc.telegram,
          price: p.priceUsd != null ? Number(p.priceUsd) : null,
          age: p.pairCreatedAt || 0,
          txns: ((p.txns && p.txns.h24 && (p.txns.h24.buys + p.txns.h24.sells)) || 0),
          vol: (p.volume && p.volume.h24) || 0,
          makers: null,
          c5: p.priceChange && p.priceChange.m5, c1: p.priceChange && p.priceChange.h1,
          c6: p.priceChange && p.priceChange.h6, c24: p.priceChange && p.priceChange.h24,
          liq: (p.liquidity && p.liquidity.usd) || 0,
          mcap: p.marketCap || p.fdv || 0,
        };
      });

      render();
      const t = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      footEl.textContent = `${data.length} pairs · live from DexScreener · updated ${t} · auto-refreshes every 45s`;
    } catch (e) {
      stateEl.classList.remove("hide");
      stateEl.innerHTML = "<span>Couldn't reach the DexScreener API. Retrying shortly…</span>";
    } finally {
      if (manual) setTimeout(() => refreshBtn.classList.remove("spin"), 500);
    }
  }

  /* ---------- render ---------- */
  function render() {
    const key = sort.key, dir = sort.dir;
    const num = { price: "price", age: "age", txns: "txns", vol: "vol", makers: "makers", c5: "c5", c1: "c1", c6: "c6", c24: "c24", liq: "liq", mcap: "mcap" };
    let list = data.slice();
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter((r) =>
        r.sym.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) ||
        (r.chainId || "").toLowerCase().includes(q) || (r.dexId || "").toLowerCase().includes(q));
    }
    const f = num[key] || "vol";
    list.sort((a, b) => {
      const av = a[f], bv = b[f];
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });

    if (!list.length) {
      rowsEl.innerHTML = "";
      stateEl.classList.remove("hide");
      stateEl.innerHTML = "<span>No pairs match your filter.</span>";
      return;
    }
    stateEl.classList.add("hide");

    rowsEl.innerHTML = list.map((r, i) => {
      const age = fmtAge(r.age);
      const c5 = fmtPct(r.c5), c1 = fmtPct(r.c1), c6 = fmtPct(r.c6), c24 = fmtPct(r.c24);
      const socials = [
        r.web && social("website", r.web),
        r.twitter && social("twitter", r.twitter),
        r.telegram && social("telegram", r.telegram),
      ].filter(Boolean).join("");
      const tokImg = r.icon
        ? `<img class="tok" src="${esc(r.icon)}" loading="lazy" alt="" onerror="this.style.visibility='hidden'">`
        : `<div class="tok"></div>`;
      return `<div class="dex-row" data-url="${esc(r.url)}">
        <div class="cell c-token">
          <span class="rank">#${i + 1}</span>
          <div class="icons">
            ${tokImg}
            <img class="chain" src="${CHAIN_ICON(r.chainId)}" loading="lazy" alt="" onerror="this.style.display='none'" title="${esc(r.chainId)}">
          </div>
          <div class="tok-meta">
            <div class="tok-line">
              ${r.label ? `<span class="tok-badge">${esc(r.label)}</span>` : ""}
              <span class="tok-sym">${esc(r.sym)}</span><span class="tok-quote">/${esc(r.quote)}</span>
              <img class="dexico" src="${DEX_ICON(r.dexId)}" loading="lazy" alt="" onerror="this.style.display='none'" title="${esc(r.dexId)}">
            </div>
            <div class="tok-sub">
              <span class="tok-name">${esc(r.name)}</span>
              <span class="socials">${socials}</span>
            </div>
          </div>
        </div>
        <div class="cell c-price">${fmtPrice(r.price)}</div>
        <div class="cell ${age.c}">${age.t}</div>
        <div class="cell">${fmtInt(r.txns)}</div>
        <div class="cell">${abbr(r.vol)}</div>
        <div class="cell muted">${r.makers == null ? "—" : fmtInt(r.makers)}</div>
        <div class="cell ${c5.c}">${c5.t}</div>
        <div class="cell ${c1.c}">${c1.t}</div>
        <div class="cell ${c6.c}">${c6.t}</div>
        <div class="cell ${c24.c}">${c24.t}</div>
        <div class="cell">${abbr(r.liq)}</div>
        <div class="cell">${abbr(r.mcap)}</div>
      </div>`;
    }).join("");
  }

  // open the pair on DexScreener when a row (but not a social link) is clicked
  rowsEl.addEventListener("click", (e) => {
    if (e.target.closest(".socials")) return;
    const row = e.target.closest(".dex-row");
    if (row && row.dataset.url) window.open(row.dataset.url, "_blank", "noopener");
  });

  /* ---------- sort headers ---------- */
  headEl.addEventListener("click", (e) => {
    const th = e.target.closest("[data-sort]");
    if (!th) return;
    const key = th.dataset.sort;
    if (sort.key === key) sort.dir *= -1;
    else sort = { key, dir: -1 };
    headEl.querySelectorAll(".th").forEach((el) => {
      el.classList.remove("sorted");
      const a = el.querySelector(".arrow"); if (a) a.remove();
    });
    th.classList.add("sorted");
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = sort.dir < 0 ? "▼" : "▲";
    th.appendChild(arrow);
    render();
  });

  searchEl.addEventListener("input", () => { filter = searchEl.value.trim(); render(); });
  refreshBtn.addEventListener("click", () => load(true));

  /* ---------- navbar views ---------- */
  const VIEW = {
    trending: { key: "vol", dir: -1 },
    gainers: { key: "c24", dir: -1 },
    new: { key: "age", dir: -1 },   // newest first (largest created timestamp)
    top: { key: "mcap", dir: -1 },
  };
  const viewsEl = $("views");
  if (viewsEl) viewsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".ntab"); if (!b) return;
    viewsEl.querySelectorAll(".ntab").forEach((t) => t.classList.remove("ntab--on"));
    b.classList.add("ntab--on");
    sort = Object.assign({}, VIEW[b.dataset.view] || VIEW.trending);
    headEl.querySelectorAll(".th").forEach((el) => { el.classList.remove("sorted"); const a = el.querySelector(".arrow"); if (a) a.remove(); });
    render();
  });

  /* ---------- floating bear assistant + chat ---------- */
  (function () {
    const asst = $("asst"), bear = $("asstBear"), closeBtn = $("asstClose"), chat = $("asstChat");
    const cxMsgs = $("cxMsgs"), cxThread = $("cxThread"), cxForm = $("cxForm"),
      cxInput = $("cxInput"), cxSend = $("cxSend"), cxChips = $("cxChips");
    if (!asst) return;
    chat.hidden = false;              // now driven by the .open class
    let greeted = false;

    const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/_(.+?)_/g, "<em>$1</em>").replace(/\n/g, "<br>");
    const scroll = () => { cxThread.scrollTop = cxThread.scrollHeight; };

    function greet() {
      const el = document.createElement("div");
      el.className = "cx__greet";
      el.innerHTML = "<b>Hey, I'm ping 🐻</b>Paste a thesis, a narrative or an X link and I'll tell you what's actually moving — before CT.";
      cxMsgs.appendChild(el);
    }
    function openChat() { asst.classList.add("open"); if (!greeted) { greet(); greeted = true; } setTimeout(() => cxInput.focus(), 260); }
    function closeChat() { asst.classList.remove("open"); }
    bear.addEventListener("click", openChat);
    closeBtn.addEventListener("click", closeChat);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && asst.classList.contains("open")) closeChat(); });

    function addUser(t) {
      const g = cxMsgs.querySelector(".cx__greet"); if (g) g.remove();
      const el = document.createElement("div"); el.className = "msg msg--user";
      el.innerHTML = `<div class="bubble">${esc(t)}</div>`;
      cxMsgs.appendChild(el); scroll();
    }
    function addAI() {
      const el = document.createElement("div"); el.className = "msg msg--ai";
      el.innerHTML = `<div class="ava"><img src="assets/logo-white.png" alt=""></div>` +
        `<div class="body"><div class="thinker"><div class="thinker__bear"><img src="assets/logo-white.png" alt="">` +
        `<span class="bub b1"></span><span class="bub b2"></span><span class="bub b3"></span></div></div></div>`;
      cxMsgs.appendChild(el); scroll(); return el.querySelector(".body");
    }
    function review(text) {
      const ticker = (text.match(/\$[A-Za-z0-9]{2,10}/) || [])[0];
      const subj = ticker || "this";
      const score = 62 + Math.floor(Math.random() * 30);
      return [
        `**Read on ${subj}.** Momentum first, opinion second.`,
        `**Momentum** — chatter is building but still early. Velocity is positive on CT & Telegram, thinner on TikTok. Reads _forming_, not _peaked_.`,
        `**What you're glossing over** — mentions are concentrated in a handful of accounts and there's no fresh-wallet confirmation on-chain yet. Loud but shallow is still noise.`,
        `**Verdict** — conviction ${score}/100. Worth a starter watch with a hard invalidation if velocity flattens over the next few hours.`,
        `_Demo — a live model wired to real-time ping signals is coming to the beta._`,
      ].join("\n\n");
    }
    function stream(body, text) {
      body.dataset.raw = ""; body.innerHTML = "";
      const tk = text.split(/(\s+)/); let i = 0;
      (function step() {
        if (i >= tk.length) return;
        body.dataset.raw += tk.slice(i, i + 3).join(""); i += 3;
        body.innerHTML = md(body.dataset.raw); scroll();
        setTimeout(step, 16);
      })();
    }
    const resize = () => { cxInput.style.height = "auto"; cxInput.style.height = Math.min(cxInput.scrollHeight, 120) + "px"; };
    const refreshSend = () => { cxSend.disabled = !cxInput.value.trim(); };
    cxInput.addEventListener("input", () => { resize(); refreshSend(); });
    cxInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); cxForm.requestSubmit(); } });
    cxChips.addEventListener("click", (e) => {
      const c = e.target.closest(".cx__chip"); if (!c) return;
      cxInput.value = (c.dataset.tpl || "").replace(/\\n/g, "\n"); resize(); refreshSend(); cxInput.focus();
      cxInput.setSelectionRange(cxInput.value.length, cxInput.value.length);
    });
    async function askPing(text) {
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!r.ok) throw new Error("bad");
      const d = await r.json(); if (!d.reply) throw new Error("empty"); return d.reply;
    }
    cxForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const t = cxInput.value.trim(); if (!t) return;
      chat.classList.add("chatting");
      addUser(t); cxInput.value = ""; resize(); refreshSend();
      const bodyEl = addAI();
      const bearEl = bodyEl.querySelector(".thinker__bear");
      const started = Date.now();
      askPing(t).catch(() => review(t)).then((reply) => {
        const wait = Math.max(0, 1000 - (Date.now() - started));
        setTimeout(() => { if (bearEl) bearEl.classList.add("out"); setTimeout(() => stream(bodyEl, reply), 320); }, wait);
      });
    });
  })();

  load();
  setInterval(() => load(false), 45000);
})();
