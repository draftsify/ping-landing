/* ============================================================
   ping — interactions
   ============================================================ */
(function () {
  "use strict";
  const body = document.body;
  const nav = document.getElementById("nav");
  const video = document.getElementById("bgvideo");

  /* ---------- background: scrub sky→space on scroll + flip theme ---------- */
  const coarse = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scrub = video && !coarse && !reduce;

  if (video) {
    if (scrub) {
      video.pause();
      // prime decoding so paused seeks render a frame
      const prime = () => { video.play().then(() => video.pause()).catch(() => {}); };
      if (video.readyState >= 2) prime();
      else video.addEventListener("loadeddata", prime, { once: true });
    } else {
      // touch / reduced-motion: gentle ambient loop instead of scrubbing
      video.loop = true;
      video.autoplay = true;
      video.play().catch(() => {});
    }
  }

  // continuous theme interpolation: light -> dusk -> dark (no snapping)
  const PAL = {
    light: { base:[234,241,251,1], ink:[16,26,46,1], ink2:[70,83,110,1], ink3:[123,133,152,1],
      card:[255,255,255,0.66], panel:[255,255,255,0.82], surface:[255,255,255,0.9], rim:[255,255,255,0.75],
      border:[18,30,55,0.08], border2:[18,30,55,0.14], halo:[255,255,255,0.55], soft:[47,107,255,0.1],
      veilRGB:[234,241,251], veilA:[0.28,0.34,0.86] },
    dusk: { base:[38,49,76,1], ink:[234,241,252,1], ink2:[180,193,220,1], ink3:[128,142,176,1],
      card:[255,255,255,0.08], panel:[30,40,66,0.58], surface:[255,255,255,0.11], rim:[255,255,255,0.16],
      border:[255,255,255,0.12], border2:[255,255,255,0.2], halo:[18,26,50,0.5], soft:[120,160,255,0.18],
      veilRGB:[38,49,76], veilA:[0.34,0.5,0.9] },
    dark: { base:[5,7,15,1], ink:[238,243,252,1], ink2:[166,178,204,1], ink3:[106,117,144,1],
      card:[255,255,255,0.05], panel:[16,24,44,0.62], surface:[255,255,255,0.06], rim:[255,255,255,0.12],
      border:[255,255,255,0.09], border2:[255,255,255,0.16], halo:[0,0,0,0.5], soft:[91,147,255,0.16],
      veilRGB:[5,7,15], veilA:[0.28,0.52,0.95] },
  };
  const KEYS = { base:"--base", ink:"--ink", ink2:"--ink-2", ink3:"--ink-3", card:"--card",
    panel:"--panel", surface:"--surface", rim:"--rim", border:"--border", border2:"--border-2",
    halo:"--halo", soft:"--accent-soft" };
  const smooth = (t) => t * t * (3 - 2 * t);
  const rgba = (c) => "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + (c[3]).toFixed(3) + ")";
  function mix(a, b, t) { return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t, (a[3]!==undefined?a[3]:1)+((b[3]!==undefined?b[3]:1)-(a[3]!==undefined?a[3]:1))*t]; }
  let lastTheme = -1;
  function setTheme(p) {
    let A, B, t;
    if (p < 0.485) { A = PAL.light; B = PAL.dusk; t = smooth(Math.min(Math.max((p - 0.12) / 0.32, 0), 1)); }
    else { A = PAL.dusk; B = PAL.dark; t = smooth(Math.min(Math.max((p - 0.50) / 0.24, 0), 1)); }
    const key = (p < 0.485 ? 0 : 1) * 1000 + Math.round(t * 240);
    if (key === lastTheme) return;
    lastTheme = key;
    const s = body.style;
    for (const k in KEYS) s.setProperty(KEYS[k], rgba(mix(A[k], B[k], t)));
    const vr = mix([...A.veilRGB, 1], [...B.veilRGB, 1], t);
    const a0 = A.veilA[0] + (B.veilA[0] - A.veilA[0]) * t;
    const a1 = A.veilA[1] + (B.veilA[1] - A.veilA[1]) * t;
    const a2 = A.veilA[2] + (B.veilA[2] - A.veilA[2]) * t;
    const R = Math.round(vr[0]), G = Math.round(vr[1]), Bl = Math.round(vr[2]);
    s.setProperty("--veil", "linear-gradient(180deg, rgba(" + R + "," + G + "," + Bl + "," + a0.toFixed(3) +
      ") 0%, rgba(" + R + "," + G + "," + Bl + "," + a1.toFixed(3) + ") 52%, rgba(" + R + "," + G + "," + Bl + "," + a2.toFixed(3) + ") 100%)");
  }

  // motion blur that masks scrub stepping + the theme flip
  let lastY = window.scrollY;
  let curBlur = 0, targetBlur = 0, blurRaf = null;
  function blurLoop() {
    curBlur += (targetBlur - curBlur) * 0.2;
    targetBlur *= 0.84;
    if (video) video.style.filter = curBlur > 0.25 ? "blur(" + curBlur.toFixed(2) + "px)" : "";
    if (curBlur > 0.25 || targetBlur > 0.25) { blurRaf = requestAnimationFrame(blurLoop); }
    else { curBlur = 0; targetBlur = 0; if (video) video.style.filter = ""; blurRaf = null; }
  }

  let ticking = false;
  function frame() {
    ticking = false;
    const y = window.scrollY;
    const journey = window.innerHeight * 2.4;
    const p = Math.min(Math.max(y / journey, 0), 1);
    if (scrub && video && video.duration) {
      const t = p * (video.duration - 0.06);
      if (Math.abs(video.currentTime - t) > 0.04) { try { video.currentTime = t; } catch (e) {} }
    }
    setTheme(p); // continuous light -> dusk -> dark
    if (nav) nav.classList.toggle("scrolled", y > 16);

    if (!reduce && video) {
      const delta = Math.abs(y - lastY);
      const band = (p > 0.24 && p < 0.68) ? 5 : 0;       // extra blur across both flip zones
      targetBlur = Math.min(Math.max(targetBlur, delta * 0.55 + band), 22);
      if (!blurRaf && targetBlur > 0.25) blurRaf = requestAnimationFrame(blurLoop);
    }
    lastY = y;
  }
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
  window.addEventListener("resize", frame, { passive: true });
  frame();

  /* ---------- appear on load (staggered) ---------- */
  function runAppear() {
    document.querySelectorAll(".appear").forEach((el) => {
      const d = parseInt(el.dataset.delay || "0", 10);
      setTimeout(() => el.classList.add("shown"), 120 + d * 110);
    });
  }
  if (document.readyState !== "loading") runAppear();
  else document.addEventListener("DOMContentLoaded", runAppear);

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  /* ---------- product feed ---------- */
  const feed = document.getElementById("feed");
  const NARRATIVES = [
    { name: "AI dog szn", tk: "$BONKAI", tags: ["Narrative", "TikTok"], src: "TikTok · CT", score: 94, chg: "+412%", hot: true },
    { name: "Election coins", tk: "$MAGA", tags: ["Politics", "CT"], src: "Twitter", score: 88, chg: "+186%", hot: true },
    { name: "Frog revival", tk: "$PEPE2", tags: ["Meme", "Rising"], src: "Telegram", score: 81, chg: "+97%", hot: false },
    { name: "Quokka meta", tk: "$QUOK", tags: ["Animal", "New"], src: "TikTok", score: 76, chg: "+64%", hot: false },
    { name: "Retro gaming", tk: "$PIXEL", tags: ["Culture"], src: "Discord", score: 71, chg: "+41%", hot: false },
    { name: "Moo Deng redux", tk: "$MOODENG", tags: ["Meme", "Cooling"], src: "CT", score: 58, chg: "-12%", hot: false },
  ];
  function spark(hot) {
    let h = '<div class="spark">';
    for (let i = 0; i < 9; i++) {
      const v = hot ? 6 + Math.round((i / 9) * 22) + Math.round(Math.random() * 5)
                    : 8 + Math.round(Math.random() * 16);
      h += `<span style="height:${Math.min(v, 28)}px"></span>`;
    }
    return h + "</div>";
  }
  function render() {
    if (!feed) return;
    feed.innerHTML = NARRATIVES.map((n, i) => {
      const cls = n.chg.startsWith("-") ? "down" : "up";
      return `<div class="frow" style="animation-delay:${i * 70}ms">
        <div class="frow__rank">${String(i + 1).padStart(2, "0")}</div>
        <div class="frow__main">
          <div class="frow__name">${n.name} <span class="frow__tk">${n.tk}</span></div>
          <div class="frow__tags">${n.tags.map((t) => `<span class="frow__tag">${t}</span>`).join("")}</div>
        </div>
        <div class="frow__src">${n.src}</div>
        ${spark(n.hot)}
        <div class="frow__score">
          <div class="frow__num ${n.hot ? "hot" : ""}">${n.score}</div>
          <div class="frow__chg ${cls}">${n.chg}</div>
        </div>
      </div>`;
    }).join("");
  }
  if (feed) {
    const fio = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { render(); fio.unobserve(e.target); } });
    }, { threshold: 0.15 });
    fio.observe(feed);
  }

  /* ---------- stat counters ---------- */
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function count(el) {
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || "";
    const dur = 1500;
    let start = null;
    function step(ts) {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      el.textContent = Math.floor(easeOut(p) * target).toLocaleString("en-US") + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  const sio = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { count(e.target); sio.unobserve(e.target); } });
  }, { threshold: 0.5 });
  document.querySelectorAll(".stat__n").forEach((el) => sio.observe(el));

  /* ---------- waitlist form ---------- */
  const form = document.getElementById("waitform");
  const note = document.getElementById("formNote");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector("input");
      const label = form.querySelector(".btn__label");
      if (label) { label.textContent = "You're in ✓"; label.removeAttribute("data-text"); }
      form.querySelector("button").style.pointerEvents = "none";
      input.value = "";
      input.placeholder = "See you on the radar.";
      if (note) note.textContent = "🎉 You're on the list — we'll ping you when your invite is ready.";
    });
  }
})();
