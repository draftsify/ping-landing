/* ============================================================
   ping — interactions
   ============================================================ */
(function () {
  "use strict";

  /* nav scroll state */
  const nav = document.getElementById("nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 16);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* reveal on scroll */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  /* product feed */
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

  /* stat counters */
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

  /* waitlist form */
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
