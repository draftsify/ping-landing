/* ============================================================
   ping · /api/chat  — real, data-grounded AI analyst
   Serverless (Vercel Node function). No secrets in the client.

   Grounding sources (best-effort, all guarded):
     • DexScreener (free, no key)  -> live market data & trending
     • TikTok search (optional)    -> virality signal   [RAPIDAPI_KEY + TIKTOK_RAPIDAPI_HOST]
   Reasoning:
     • Grok / xAI (preferred)      [XAI_API_KEY, XAI_MODEL]         + live X/web search
     • OpenAI-compatible fallback  [OPENAI_API_KEY, OPENAI_MODEL]
     • Anthropic fallback          [ANTHROPIC_API_KEY, ANTHROPIC_MODEL]
     • Rule-based fallback (always works, grounded on the numbers)
   ============================================================ */

const UA = "ping-bot/1.0";

function readBody(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d));
    req.on("error", () => resolve(""));
  });
}
async function fetchJSON(url, opts = {}, ms = 9000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: c.signal, headers: { "user-agent": UA, ...(opts.headers || {}) } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* ---------- number helpers ---------- */
const n = (x) => (x == null || !isFinite(x) ? null : Number(x));
function abbr(x) {
  if (x == null || !isFinite(x)) return "n/a";
  const a = Math.abs(x);
  if (a >= 1e9) return "$" + (x / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return "$" + (x / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return "$" + (x / 1e3).toFixed(0) + "K";
  return "$" + x.toFixed(0);
}
const pct = (x) => (x == null ? "n/a" : (x > 0 ? "+" : "") + x.toFixed(1) + "%");
function ageStr(ms) {
  if (!ms) return "n/a";
  const d = (Date.now() - ms) / 86400000;
  if (d < 1) return Math.max(1, Math.round(d * 24)) + "h";
  if (d < 30) return Math.round(d) + "d";
  if (d < 365) return Math.round(d / 30) + "mo";
  return (d / 365).toFixed(1) + "y";
}

/* ---------- market grounding (DexScreener) ---------- */
function normalizePair(p) {
  if (!p) return null;
  return {
    symbol: p.baseToken?.symbol, name: p.baseToken?.name, quote: p.quoteToken?.symbol,
    chain: p.chainId, dex: p.dexId, address: p.baseToken?.address, url: p.url,
    priceUsd: n(+p.priceUsd), mcap: n(p.marketCap || p.fdv), liq: n(p.liquidity?.usd),
    vol24: n(p.volume?.h24), vol1: n(p.volume?.h1),
    website: p.info?.websites?.[0]?.url || null,
    socials: (p.info?.socials || []).map((s) => ({ type: s.type, url: s.url })),
    ch: { m5: n(p.priceChange?.m5), h1: n(p.priceChange?.h1), h6: n(p.priceChange?.h6), h24: n(p.priceChange?.h24) },
    txns24: (p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0),
    buys24: p.txns?.h24?.buys || 0, sells24: p.txns?.h24?.sells || 0,
    ageMs: p.pairCreatedAt || 0,
  };
}
async function getMarket(message) {
  const out = { token: null, trending: [] };
  try {
    const addr = (message.match(/\b(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/) || [])[1];
    const ticker = (message.match(/\$([A-Za-z0-9]{2,15})/) || [])[1];
    let pairs = [];
    if (addr) {
      const d = await fetchJSON("https://api.dexscreener.com/latest/dex/tokens/" + encodeURIComponent(addr));
      pairs = d.pairs || [];
    } else if (ticker) {
      const d = await fetchJSON("https://api.dexscreener.com/latest/dex/search/?q=" + encodeURIComponent(ticker));
      pairs = (d.pairs || []).filter((p) => (p.baseToken?.symbol || "").toLowerCase() === ticker.toLowerCase());
      if (!pairs.length) pairs = d.pairs || [];
    }
    if (pairs.length) {
      // prefer the actively-traded pair (24h volume), tiebreak on liquidity
      pairs.sort((a, b) => ((b.volume?.h24 || 0) - (a.volume?.h24 || 0)) || ((b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)));
      out.token = normalizePair(pairs[0]);
    }
  } catch (e) {}
  // trending / boosted snapshot for market context
  try {
    const boosts = await fetchJSON("https://api.dexscreener.com/token-boosts/top/v1");
    const addrs = [...new Set((boosts || []).map((b) => b.tokenAddress).filter(Boolean))].slice(0, 12);
    if (addrs.length) {
      const d = await fetchJSON("https://api.dexscreener.com/latest/dex/tokens/" + addrs.join(","));
      const best = {};
      (d.pairs || []).forEach((p) => {
        const k = p.baseToken?.address; const v = p.volume?.h24 || 0;
        if (!best[k] || v > (best[k].volume?.h24 || 0)) best[k] = p;
      });
      out.trending = Object.values(best)
        .map(normalizePair)
        .sort((a, b) => (b.vol24 || 0) - (a.vol24 || 0))
        .slice(0, 6);
    }
  } catch (e) {}
  return out;
}

/* ---------- TikTok virality (optional) ---------- */
async function getTikTok(message) {
  const key = process.env.RAPIDAPI_KEY;
  const host = process.env.TIKTOK_RAPIDAPI_HOST; // e.g. tiktok-scraper7.p.rapidapi.com
  if (!key || !host) return null;
  const kw = ((message.match(/\$([A-Za-z0-9]{2,15})/) || [])[1]) ||
    ((message.match(/#(\w{2,30})/) || [])[1]) ||
    (message.split(/\s+/).find((w) => w.length > 3) || "").replace(/[^A-Za-z0-9]/g, "");
  if (!kw) return null;
  try {
    const d = await fetchJSON(
      `https://${host}/feed/search?keywords=${encodeURIComponent(kw)}&count=20&region=us`,
      { headers: { "x-rapidapi-key": key, "x-rapidapi-host": host } }, 9000);
    const list = d?.data?.videos || d?.videos || d?.aweme_list || [];
    if (!Array.isArray(list) || !list.length) return { keyword: kw, posts: 0 };
    let views = 0, likes = 0;
    for (const v of list) {
      views += v.play_count || v.statistics?.play_count || v.stats?.playCount || 0;
      likes += v.digg_count || v.statistics?.digg_count || v.stats?.diggCount || 0;
    }
    const avgViews = Math.round(views / list.length);
    const score = Math.min(100, Math.round((Math.log10(Math.max(avgViews, 10)) / 6) * 100));
    return { keyword: kw, posts: list.length, totalViews: views, totalLikes: likes, avgViews, viralityScore: score };
  } catch (e) { return { keyword: kw, error: "tiktok_fetch_failed" }; }
}

/* ---------- prompt ---------- */
const SYSTEM = `You are ping. You explain memecoins to a friend in the SIMPLEST way possible.

Hard rules:
- Answer in 1 to 2 short sentences. Three only if really needed. NEVER more. Keep it tiny and easy to read.
- Plain everyday words. NO crypto jargon dumps — avoid words like "meta", "KOL", "vibe", "twist", "narrative-driven", "branding", "positionne". If a beginner wouldn't get a word, don't use it.
- Just say what it is and WHY it's pumping. Nothing else. No intro ("This is a memecoin that…"), no recap, no closing question, no lists, no numbers (unless they explicitly ask about the price).
- Sound like a real person texting — casual, direct, a bit blunt. Example register: "En gros Ansem a hype le coin tôt et sa commu a suivi, c'est ça qui l'a fait pump." or "$CASHCAT c'est parce que Robinhood devait s'appeler Cashcat au début et les fondateurs ont follow le compte."
- If they ask whether it's worth aping: ONE honest line, say NFA, simple reasoning. No long hedging.
- Never invent facts or numbers. If you don't know the story, say it in one short line.
- Use simple, common words. Many readers are NOT native speakers — avoid rare words, complicated sentences, and heavy slang or idioms that are hard to understand.
- ALWAYS reply in English, even if the user writes in another language. Use the conversation history for follow-ups.`;

const SYSTEM_LONG = `You are ping. Give a clear, COMPLETE explanation of the memecoin, but in SIMPLE, easy words — many readers are NOT native speakers, so avoid rare words, long complicated sentences, and heavy slang.

Write a few short paragraphs, flowing naturally (no rigid headers, no bullet lists):
1. What it is and where the name / meme comes from — the story, who is behind it, what started it.
2. Why people are paying attention now — the hype, the community, the TikTok/X buzz.
3. A short honest take: is it hot or risky right now? Say NFA.

Keep sentences short and easy to read. You may **bold** a couple of key words. Do NOT invent facts, fake founders, or numbers — only use numbers that are in the data provided. ALWAYS reply in English, even if the user writes in another language. Use the conversation history for follow-ups.`;

function groundingText(market, tiktok) {
  const lines = [];
  const t = market?.token;
  if (t) {
    lines.push(`COIN: ${t.name || t.symbol} ($${t.symbol}) — ${t.chain} chain, trading as ${t.symbol}/${t.quote} on ${t.dex}.`);
    const links = [];
    if (t.website) links.push("website " + t.website);
    (t.socials || []).forEach((s) => links.push(`${s.type}: ${s.url}`));
    if (links.length) lines.push("Official links (use these to figure out the story): " + links.join(" · "));
    lines.push(`(Market snapshot — ONLY mention if the user asks about the trade/price: mcap ${abbr(t.mcap)}, liquidity ${abbr(t.liq)}, 24h vol ${abbr(t.vol24)}, 24h ${pct(t.ch.h24)}, age ${ageStr(t.ageMs)}.)`);
  } else {
    lines.push("No specific coin resolved from the message — answer from your own knowledge / ask them for a $ticker or contract.");
  }
  if (tiktok && !tiktok.error) {
    lines.push(`TikTok buzz for "${tiktok.keyword}": ${tiktok.posts} recent posts, virality ${tiktok.viralityScore}/100 — i.e. how much it's spreading beyond Crypto Twitter (${tiktok.viralityScore >= 55 ? "spreading" : "still niche"}).`);
  }
  if (market?.trending?.length) {
    lines.push("For context, coins getting attention right now: " + market.trending.map((x) => x.symbol).join(", ") + ".");
  }
  return lines.join("\n");
}

/* ---------- LLM callers ---------- */
async function callOpenAICompat({ baseURL, key, model, messages, search, maxTokens }) {
  const bodyObj = { model, messages, temperature: 0.6, max_tokens: maxTokens || 200 };
  if (search) bodyObj.search_parameters = { mode: "auto", sources: [{ type: "x" }, { type: "web" }, { type: "news" }] };
  const r = await fetch(baseURL + "/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + key },
    body: JSON.stringify(bodyObj),
  });
  if (!r.ok) throw new Error("LLM HTTP " + r.status + " " + (await r.text()).slice(0, 300));
  const d = await r.json();
  return d.choices?.[0]?.message?.content?.trim();
}
async function callAnthropic({ key, model, system, user, maxTokens }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: maxTokens || 300, system, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error("Anthropic HTTP " + r.status + " " + (await r.text()).slice(0, 300));
  const d = await r.json();
  return (d.content || []).map((b) => b.text).join("").trim();
}

async function generate(message, market, tiktok, history, mode) {
  const long = mode === "long";
  const sys = long ? SYSTEM_LONG : SYSTEM;
  const maxTokens = long ? 850 : 200;
  const grounding = groundingText(market, tiktok);
  const user = `User message:\n"""${message}"""\n\nContext I've gathered:\n${grounding}`;
  const hist = Array.isArray(history) ? history.slice(-6).filter((m) => m && m.role && m.content) : [];
  const messages = [{ role: "system", content: sys }, ...hist, { role: "user", content: user }];

  // try funded providers in order; skip any that error (no credits / bad key) -> rule-based
  const attempts = [];
  if (process.env.XAI_API_KEY) attempts.push({ engine: "grok", fn: () => callOpenAICompat({ baseURL: "https://api.x.ai/v1", key: process.env.XAI_API_KEY, model: process.env.XAI_MODEL || "grok-4.3", messages, maxTokens }) });
  if (process.env.OPENAI_API_KEY) attempts.push({ engine: "openai", fn: () => callOpenAICompat({ baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1", key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || "gpt-4o", messages, maxTokens }) });
  if (process.env.ANTHROPIC_API_KEY) attempts.push({ engine: "anthropic", fn: () => callAnthropic({ key: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5", system: sys, user, maxTokens }) });

  for (const a of attempts) {
    try { const text = await a.fn(); if (text) return { reply: text, engine: a.engine }; } catch (e) {}
  }
  return { reply: ruleBased(message, market, tiktok), engine: "rule-based" };
}

// real official links (X / Telegram / website / chart) from DexScreener — appended in long mode
function linksBlock(market) {
  const t = market && market.token;
  if (!t) return "";
  const out = [];
  const x = (t.socials || []).find((s) => /twitter|^x$/i.test(s.type));
  const tg = (t.socials || []).find((s) => /telegram/i.test(s.type));
  if (x) out.push("X: " + x.url);
  if (tg) out.push("Telegram: " + tg.url);
  if (t.website) out.push("Site: " + t.website);
  if (t.url) out.push("Chart: " + t.url);
  return out.length ? "\n\n**Links** — " + out.join("  ·  ") : "";
}

/* ---------- rule-based, data-grounded fallback ---------- */
function ruleBased(message, market, tiktok) {
  const t = market?.token;
  if (!t) {
    const tr = market?.trending || [];
    const top = tr.slice(0, 4).map((x) => `**${x.symbol}** (${pct(x.ch.h24)}, ${abbr(x.vol24)} vol)`).join(", ");
    return [
      `**Read.** I couldn't pin a specific token from that — drop a **$ticker** or a contract address and I'll pull it live.`,
      tr.length ? `**What's hot right now** — by 24h volume: ${top}. That's where flow is concentrating.` : `**Market** — trending feed is quiet or unavailable right now.`,
      `_Signal, not advice. Connect a model + TikTok key for full narrative/virality reasoning._`,
    ].join("\n\n");
  }
  const v = [t.ch.m5, t.ch.h1, t.ch.h6, t.ch.h24];
  const ups = v.filter((x) => x != null && x > 0).length;
  const accel = (t.ch.h1 != null && t.ch.h6 != null && t.ch.h1 > t.ch.h6);
  const liqRatio = t.liq && t.mcap ? t.liq / t.mcap : null;
  const buyRatio = t.txns24 ? t.buys24 / t.txns24 : null;
  const ageDays = t.ageMs ? (Date.now() - t.ageMs) / 86400000 : null;

  let score = 50;
  score += (ups - 2) * 6;
  if (accel) score += 8;
  if (buyRatio != null) score += (buyRatio - 0.5) * 40;
  if (liqRatio != null) score += liqRatio > 0.08 ? 6 : liqRatio < 0.02 ? -12 : 0;
  if (ageDays != null && ageDays < 2) score += 5;
  if (tiktok && tiktok.viralityScore != null) score += (tiktok.viralityScore - 50) * 0.25;
  score = Math.max(5, Math.min(95, Math.round(score)));

  const momentum = ups >= 3 ? "broadly green across timeframes" : ups <= 1 ? "fading — most timeframes red" : "mixed";
  const flow = buyRatio == null ? "flow data thin" : buyRatio > 0.55 ? "buyers in control" : buyRatio < 0.45 ? "sellers pressing" : "balanced buy/sell flow";
  const liqNote = liqRatio == null ? "liquidity vs mcap unknown" :
    liqRatio > 0.08 ? "healthy liquidity vs mcap" : liqRatio < 0.02 ? "thin liquidity vs mcap — slippage/rug risk" : "moderate liquidity depth";

  const parts = [
    `**Read on ${t.symbol}.** ${t.name || ""} on ${t.chain}. Momentum first.`,
    `**Momentum** — ${momentum} (1h ${pct(t.ch.h1)}, 6h ${pct(t.ch.h6)}, 24h ${pct(t.ch.h24)})${accel ? ", and 1h is outpacing 6h → accelerating" : ""}. ${abbr(t.vol24)} 24h volume, ${flow}.`,
  ];
  if (tiktok && !tiktok.error) {
    parts.push(`**Virality** — TikTok "${tiktok.keyword}" shows ${tiktok.posts} recent posts, ~${(tiktok.avgViews || 0).toLocaleString()} avg views (virality ${tiktok.viralityScore}/100). ${tiktok.viralityScore >= 55 ? "Narrative is spreading off-CT — that's the edge." : "Off-platform buzz is still light."}`);
  }
  parts.push(`**What you're glossing over** — ${liqNote}; mcap ${abbr(t.mcap)} on ${abbr(t.liq)} liquidity, ${t.txns24} txns/24h, age ${ageStr(t.ageMs)}. ${ageDays != null && ageDays < 1 ? "Brand new — reflexive and fragile." : ""}`);
  parts.push(`**Verdict** — conviction **${score}/100**. ${score >= 66 ? "Worth a starter watch" : score >= 45 ? "Watch-only, no size yet" : "Pass / stalk for a reset"}; hard invalidation if 1h velocity flips negative on falling volume.`);
  parts.push(`_Grounded on live DexScreener${tiktok && !tiktok.error ? " + TikTok" : ""} data. Signal, not advice._`);
  return parts.join("\n\n");
}

/* ---------- handler ---------- */
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST") { res.statusCode = 405; return res.end(JSON.stringify({ error: "POST only" })); }

  let body = {};
  try { body = JSON.parse((await readBody(req)) || "{}"); } catch (e) {}
  const message = (body.message || "").toString().slice(0, 4000).trim();
  if (!message) { res.statusCode = 400; res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ error: "empty message" })); }

  let market = { token: null, trending: [] }, tiktok = null;
  try { [market, tiktok] = await Promise.all([getMarket(message), getTikTok(message)]); } catch (e) {}

  const mode = body.mode === "long" ? "long" : "short";
  let result;
  try { result = await generate(message, market, tiktok, body.history, mode); }
  catch (e) { result = { reply: ruleBased(message, market, tiktok), engine: "rule-based" }; }
  if (!result || !result.reply) result = { reply: ruleBased(message, market, tiktok), engine: "rule-based" };
  if (mode === "long") result.reply += linksBlock(market);   // real X/site/TG/chart links

  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    reply: result.reply,
    grounded: { token: market.token ? market.token.symbol : null, tiktok: tiktok && !tiktok.error ? tiktok.viralityScore : null },
    engine: result.engine,
  }));
};
