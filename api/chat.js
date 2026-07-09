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
    image: p.info?.imageUrl || null,
    website: p.info?.websites?.[0]?.url || null,
    socials: (p.info?.socials || []).map((s) => ({ type: s.type, url: s.url })),
    ch: { m5: n(p.priceChange?.m5), h1: n(p.priceChange?.h1), h6: n(p.priceChange?.h6), h24: n(p.priceChange?.h24) },
    txns24: (p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0),
    buys24: p.txns?.h24?.buys || 0, sells24: p.txns?.h24?.sells || 0,
    ageMs: p.pairCreatedAt || 0,
  };
}
// pump.fun metadata (Solana) — name/symbol/description/image/launch-tweet, works for coins
// with NO DexScreener paid profile (or not even indexed on a DEX yet)
async function getPumpFun(mint) {
  try {
    const pf = await fetchJSON("https://frontend-api-v3.pump.fun/coins/" + encodeURIComponent(mint),
      { headers: { "user-agent": "Mozilla/5.0", "accept": "application/json" } }, 8000);
    if (pf && pf.name) return pf;
  } catch (e) {}
  return null;
}

// read the ACTUAL content behind the coin's links (so the AI analyzes it, not a canned description)
function tweetId(url) { const m = String(url || "").match(/status\/(\d+)/); return m ? m[1] : null; }
function synToken(id) { return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, ""); }
async function readTweet(url) {
  const id = tweetId(url); if (!id) return null;
  try {
    const j = await fetchJSON(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${synToken(id)}`, { headers: { "user-agent": "Mozilla/5.0" } }, 7000);
    if (!j || !j.text) return null;
    return { author: j.user ? "@" + j.user.screen_name : null, name: j.user?.name || null, followers: j.user?.followers_count ?? null, text: j.text, likes: j.favorite_count ?? null, date: j.created_at || null };
  } catch (e) { return null; }
}
async function readSite(url) {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const c = new AbortController(); const to = setTimeout(() => c.abort(), 7000);
    const r = await fetch(url, { signal: c.signal, headers: { "user-agent": "Mozilla/5.0", "accept": "text/html" } });
    clearTimeout(to);
    const html = (await r.text()).slice(0, 200000);
    const title = ((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "").trim();
    const desc = ((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || [])[1]
      || (html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i) || [])[1] || "").trim();
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
    if (!title && !desc && !text) return null;
    return { title, desc, text };
  } catch (e) { return null; }
}
async function getMarket(message) {
  const out = { token: null, trending: [] };
  const addr = (message.match(/\b(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/) || [])[1];
  const ticker = (message.match(/\$([A-Za-z0-9]{2,15})/) || [])[1];
  try {
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
      pairs.sort((a, b) => ((b.volume?.h24 || 0) - (a.volume?.h24 || 0)) || ((b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)));
      out.token = normalizePair(pairs[0]);
    }
  } catch (e) {}

  // enrich (or fully resolve) via pump.fun for Solana mints — covers unpaid / undexed coins
  try {
    const mint = (out.token && out.token.chain === "solana" && out.token.address) ? out.token.address
               : (addr && !/^0x/.test(addr)) ? addr : null;
    if (mint) {
      const pf = await getPumpFun(mint);
      if (pf) {
        if (!out.token) out.token = {
          symbol: pf.symbol, name: pf.name, chain: "solana", address: mint, quote: "SOL",
          priceUsd: null, mcap: n(pf.usd_market_cap), liq: null, vol24: null,
          ch: {}, txns24: 0, buys24: 0, sells24: 0, ageMs: pf.created_timestamp || 0,
          socials: [], website: null, url: "https://dexscreener.com/solana/" + mint,
        };
        out.token.description = pf.description || out.token.description || "";
        out.token.image = out.token.image || pf.image_uri || null;
        out.token.athMcap = n(pf.ath_market_cap);
        out.token.pumpTweet = pf.twitter || null;
        out.token.pfTelegram = pf.telegram || null;
        out.token.pfWebsite = pf.website || null;
        out.token.pumpUrl = "https://pump.fun/coin/" + mint;
        if (!out.token.mcap) out.token.mcap = n(pf.usd_market_cap);
        if (!out.token.ageMs && pf.created_timestamp) out.token.ageMs = pf.created_timestamp;
      }
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

  // read what's actually behind the coin's links: the launch tweet + the website
  if (out.token) {
    const tw = out.token.pumpTweet || (out.token.socials || []).map((s) => s.url).find((u) => /status\/\d+/.test(u || ""));
    const site = out.token.website || out.token.pfWebsite;
    try {
      const [tweet, siteInfo] = await Promise.all([readTweet(tw), readSite(site)]);
      out.token.tweet = tweet;
      out.token.site = siteInfo;
    } catch (e) {}
  }
  return out;
}

/* ---------- TikTok virality (only when it's actually tied to the coin) ---------- */
async function getTikTok(market, message) {
  const key = process.env.RAPIDAPI_KEY;
  const host = process.env.TIKTOK_RAPIDAPI_HOST; // e.g. tiktok-scraper7.p.rapidapi.com
  if (!key || !host) return null;
  const t = market && market.token;
  // don't fabricate a TikTok narrative: only pull it if the coin actually links TikTok,
  // its description mentions it, or the user explicitly asks about TikTok.
  const linked = !!t && (
    (t.socials || []).some((s) => /tiktok/i.test(s.type) || /tiktok/i.test(s.url || "")) ||
    /tiktok|tik tok/i.test(t.description || "") ||
    /tiktok|tik tok/i.test(message)
  );
  if (!linked) return null;
  const kwRaw = (t && (t.name || t.symbol)) || (message.match(/\$([A-Za-z0-9]{2,15})/) || [])[1] || "";
  const kw = String(kwRaw).replace(/[^A-Za-z0-9 ]/g, "").trim();
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
const SYSTEM = `You are Ping, a memecoin analyst who lives on Crypto Twitter. Explain like a sharp friend, in plain language.
- 1–3 short sentences. Lead with the real reason it's moving, plus one concrete detail (who launched or pushed it, where the meme comes from, or a number that actually matters).
- Analyze the REAL material provided — the coin's NAME, the actual LAUNCH-TWEET TEXT, the WEBSITE content, the LOGO image, and market stats — plus your own knowledge. Read the tweet/site wording; don't just repeat a description. If something isn't there, say "unclear" — never invent numbers, wallets, founders or names.
- No filler words, no hype clichés ("community is bullish", "gaining traction", "the meme took off"), no corporate hedging ("it appears", "it seems").
- If the coin's logo image is attached, look at it: templated/low-effort pump.fun art vs a distinctive piece, and whether it copies a known logo or rides a visible meta — mention it only if it actually matters.
- Only mention TikTok if TikTok data is present in the context. If it's not there, do NOT bring up TikTok at all.
- Reply in English. Use the conversation history for follow-ups.`;

const SYSTEM_LONG = `You are Ping, a memecoin analyst who lives on Crypto Twitter. Explain clearly and naturally — like a smart friend who actually did the homework. Not a corporate AI, not a rigid template.

Write a few short, dense paragraphs (no section headers, no bullet lists, no filler). Flow naturally through:
- What it is and where the name / meme comes from — READ the actual launch-tweet text and the website content provided, look at the logo, and analyze the name itself; use those to nail the real story and who's behind it. Do NOT just parrot a description.
- Why it's moving now: who launched or amplified it, the hook, the TikTok/X buzz — tie each point to the real data or things you actually know.
- A quick honest read on momentum and risk from the market data (mcap vs liquidity, volume, buys vs sells, pair age, distance from ATH) — plain words, but spell out the logic (e.g. "thin liquidity against a big mcap means it dumps fast the second flow stops").

Also, if the coin's logo image is attached, actually LOOK at it: is the art low-effort/templated (generic pump.fun style — weak originality) or distinctive? Does it copy a known logo (e.g. the Solana mark, a big brand, another popular coin) or clearly ride a current visual meta (animal, AI, politics, a platform's look)? Copying a recognizable style can mean it's surfing a trend — say so, and say if it looks like a low-effort ripoff.

Rules: dense with logic, light on words — every sentence earns its place, no padding. Ground every claim in the data provided or things you genuinely know; if you don't have it, say "unclear" or "no signal yet" — never invent a number, wallet, founder or KOL. Only discuss TikTok if TikTok data is actually in the context — otherwise never mention TikTok. No hype clichés ("community is bullish", "gaining traction", "the meme took off"), no corporate hedging, no disclaimers. You may **bold** a few key words. Reply in English. Use the conversation history for follow-ups.`;

function groundingText(market, tiktok) {
  const lines = [];
  const t = market?.token;
  if (t) {
    lines.push(`COIN: name "${t.name || t.symbol}", ticker $${t.symbol}, on ${t.chain}${t.quote ? ` (pair vs ${t.quote}${t.dex ? " on " + t.dex : ""})` : ""}. Analyze the name itself too.`);
    if (t.tweet) lines.push(`LAUNCH/ANNOUNCEMENT TWEET (read it and analyze the wording) — by ${t.tweet.author || "?"}${t.tweet.name ? ` (${t.tweet.name})` : ""}${t.tweet.followers != null ? `, ${t.tweet.followers} followers` : ""}${t.tweet.likes != null ? `, ${t.tweet.likes} likes` : ""}: "${String(t.tweet.text).slice(0, 500)}"`);
    if (t.site) lines.push(`WEBSITE CONTENT (read it) — ${t.site.title || "site"}: "${String(t.site.desc || t.site.text || "").slice(0, 450)}"`);
    const links = [];
    if (t.pumpTweet) links.push("tweet: " + t.pumpTweet);
    (t.socials || []).forEach((s) => links.push(`${s.type}: ${s.url}`));
    if (t.website || t.pfWebsite) links.push("website: " + (t.website || t.pfWebsite));
    if (t.pfTelegram) links.push("telegram: " + t.pfTelegram);
    if (links.length) lines.push("Other links: " + links.join(" · "));
    const mk = [];
    if (t.priceUsd != null) mk.push("price $" + t.priceUsd);
    if (t.mcap) mk.push("mcap " + abbr(t.mcap));
    if (t.athMcap) mk.push("ATH mcap " + abbr(t.athMcap));
    if (t.liq) mk.push("liquidity " + abbr(t.liq));
    if (t.vol24) mk.push("24h vol " + abbr(t.vol24));
    if (t.ch && t.ch.h24 != null) mk.push("24h " + pct(t.ch.h24));
    if (t.ageMs) mk.push("age " + ageStr(t.ageMs));
    if (t.txns24) mk.push(`${t.txns24} txns/24h (${t.buys24 || 0} buys / ${t.sells24 || 0} sells)`);
    if (mk.length) lines.push("Market data (real, live): " + mk.join(", ") + ".");
  } else {
    lines.push("No specific coin resolved — answer from your own knowledge, or ask for a $ticker / contract address.");
  }
  if (tiktok && !tiktok.error) {
    lines.push(`TikTok: "${tiktok.keyword}" has ${tiktok.posts} recent posts, virality ${tiktok.viralityScore}/100 — how much it's spreading beyond Crypto Twitter (${tiktok.viralityScore >= 55 ? "spreading" : "still niche"}).`);
  }
  if (market?.trending?.length) {
    lines.push("Also getting attention right now: " + market.trending.map((x) => x.symbol).join(", ") + ".");
  }
  return lines.join("\n");
}

/* ---------- LLM callers ---------- */
function cleanImg(u) {
  if (!u || !/^https?:\/\//.test(u)) return null;
  return u.includes("cdn.dexscreener.com") ? u.split("?")[0] : u;   // dexscreener 422s with query params
}
async function callOpenAICompat({ baseURL, key, model, messages, maxTokens, imageUrl }) {
  let msgs = messages;
  if (imageUrl) {   // attach the coin's logo to the last user turn for vision
    msgs = messages.slice();
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        msgs[i] = { role: "user", content: [{ type: "text", text: msgs[i].content }, { type: "image_url", image_url: { url: imageUrl } }] };
        break;
      }
    }
  }
  const bodyObj = { model, messages: msgs, temperature: 0.6, max_tokens: maxTokens || 220 };
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
  const maxTokens = long ? 620 : 220;
  const grounding = groundingText(market, tiktok);
  const user = `User message:\n"""${message}"""\n\nContext I've gathered:\n${grounding}`;
  const hist = Array.isArray(history) ? history.slice(-6).filter((m) => m && m.role && m.content) : [];
  const messages = [{ role: "system", content: sys }, ...hist, { role: "user", content: user }];
  const imageUrl = cleanImg(market && market.token && market.token.image);
  // try with the logo (vision); if that errors, retry the same engine without the image
  const tryImg = async (fn) => { try { return await fn(imageUrl); } catch (e) { if (imageUrl) return await fn(null); throw e; } };

  // try funded providers in order; skip any that error (no credits / bad key) -> rule-based
  const attempts = [];
  if (process.env.XAI_API_KEY) attempts.push({ engine: "grok", fn: () => tryImg((img) => callOpenAICompat({ baseURL: "https://api.x.ai/v1", key: process.env.XAI_API_KEY, model: process.env.XAI_MODEL || "grok-4.3", messages, maxTokens, imageUrl: img })) });
  if (process.env.OPENAI_API_KEY) attempts.push({ engine: "openai", fn: () => tryImg((img) => callOpenAICompat({ baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1", key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || "gpt-4o", messages, maxTokens, imageUrl: img })) });
  if (process.env.ANTHROPIC_API_KEY) attempts.push({ engine: "anthropic", fn: () => callAnthropic({ key: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5", system: sys, user, maxTokens }) });

  for (const a of attempts) {
    try { const text = await a.fn(); if (text) return { reply: text, engine: a.engine }; } catch (e) {}
  }
  return { reply: ruleBased(message, market, tiktok), engine: "rule-based" };
}

// real official links (X / Telegram / website / chart) from DexScreener -> "Posts" card in the UI
function buildSources(market) {
  const t = market && market.token;
  if (!t) return [];
  const out = [], seen = new Set();
  const add = (type, url, label) => { if (url && !seen.has(url)) { seen.add(url); out.push(label ? { type, url, label } : { type, url }); } };
  if (t.pumpTweet) add("x", t.pumpTweet, "Launch post on X");
  (t.socials || []).forEach((s) => add(s.type, s.url));
  add("telegram", t.pfTelegram);
  add("website", t.website || t.pfWebsite);
  if (t.chain && t.address) add("chart", `https://dexscreener.com/${t.chain}/${t.address}`, "DexScreener chart");
  if (t.pumpUrl) add("website", t.pumpUrl, "pump.fun page");
  return out;
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
  try { market = await getMarket(message); } catch (e) {}
  try { tiktok = await getTikTok(market, message); } catch (e) {}   // only if TikTok is actually tied to the coin

  const mode = body.mode === "long" ? "long" : "short";
  let result;
  try { result = await generate(message, market, tiktok, body.history, mode); }
  catch (e) { result = { reply: ruleBased(message, market, tiktok), engine: "rule-based" }; }
  if (!result || !result.reply) result = { reply: ruleBased(message, market, tiktok), engine: "rule-based" };

  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    reply: result.reply,
    sources: buildSources(market),   // real X / Telegram / site / chart links -> "Posts" card
    grounded: { token: market.token ? market.token.symbol : null, tiktok: tiktok && !tiktok.error ? tiktok.viralityScore : null },
    engine: result.engine,
  }));
};
