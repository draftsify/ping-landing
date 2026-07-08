/* ============================================================
   ping — landing interactions
   ============================================================ */
(function () {
  "use strict";

  /* ---------- nav scroll state ---------- */
  const nav = document.getElementById("nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 20);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  /* ---------- radar blips ---------- */
  const blipsWrap = document.getElementById("blips");
  if (blipsWrap) {
    const positions = [
      [30, 34], [68, 28], [58, 62], [40, 70],
      [74, 55], [26, 58], [50, 22], [64, 74],
    ];
    positions.forEach((p, i) => {
      const b = document.createElement("span");
      b.className = "blip";
      b.style.left = p[0] + "%";
      b.style.top = p[1] + "%";
      b.style.animationDelay = (i * 0.5).toFixed(2) + "s";
      blipsWrap.appendChild(b);
    });
  }

  /* ---------- radar core counter (live jitter) ---------- */
  const scanCount = document.getElementById("scanCount");
  if (scanCount) {
    let base = 128411;
    setInterval(() => {
      base += Math.floor(Math.random() * 240) - 60;
      scanCount.textContent = base.toLocaleString("en-US");
    }, 1400);
  }

  /* ---------- product feed ---------- */
  const feed = document.getElementById("feed");
  const NARRATIVES = [
    { name: "AI dog szn", ticker: "$BONKAI", tags: ["Narrative", "TikTok"], score: 94, chg: "+412%", hot: true, src: "TikTok · CT" },
    { name: "Election coins", ticker: "$MAGA", tags: ["Politics", "CT"], score: 88, chg: "+186%", hot: true, src: "Twitter" },
    { name: "Frog revival", ticker: "$PEPE2", tags: ["Meme", "4chan"], score: 81, chg: "+97%", hot: false, src: "/biz/ · TG" },
    { name: "Quokka meta", ticker: "$QUOK", tags: ["Animal", "Rising"], score: 76, chg: "+64%", hot: false, src: "TikTok" },
    { name: "Retro gaming", ticker: "$PIXEL", tags: ["Culture", "Discord"], score: 71, chg: "+41%", hot: false, src: "Discord" },
    { name: "French bulldog", ticker: "$FRENCH", tags: ["Animal", "New"], score: 67, chg: "+33%", hot: false, src: "Telegram" },
    { name: "Moo deng redux", ticker: "$MOODENG", tags: ["Meme", "Cooling"], score: 58, chg: "-12%", hot: false, src: "CT" },
  ];

  function sparkline(hot) {
    const bars = 9;
    let html = '<div class="spark">';
    for (let i = 0; i < bars; i++) {
      const h = hot
        ? 6 + Math.round((i / bars) * 24) + Math.round(Math.random() * 6)
        : 8 + Math.round(Math.random() * 18);
      html += `<span style="height:${Math.min(h, 30)}px"></span>`;
    }
    return html + "</div>";
  }

  function render() {
    if (!feed) return;
    feed.innerHTML = NARRATIVES.map((n, i) => {
      const chgClass = n.chg.startsWith("-") ? "down" : "up";
      return `
      <div class="row" style="animation-delay:${i * 70}ms">
        <div class="row__rank">${String(i + 1).padStart(2, "0")}</div>
        <div class="row__main">
          <div class="row__name">${n.name} <span class="row__ticker">${n.ticker}</span></div>
          <div class="row__tags">${n.tags.map((t) => `<span class="row__tag">${t}</span>`).join("")}</div>
        </div>
        <div class="row__meta">${n.src}</div>
        ${sparkline(n.hot)}
        <div class="row__score">
          <div class="row__score-num ${n.hot ? "hot" : ""}">${n.score}</div>
          <div class="row__chg ${chgClass}">${n.chg}</div>
        </div>
      </div>`;
    }).join("");
  }
  render();

  // Re-render feed when it scrolls into view + subtle live score jitter
  if (feed) {
    const feedIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            render();
            feedIO.unobserve(e.target);
          }
        });
      },
      { threshold: 0.2 }
    );
    feedIO.observe(feed);
  }

  /* ---------- stat counters ---------- */
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function animateCount(el) {
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || "";
    const dur = 1600;
    let start = null;
    function step(ts) {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const val = Math.floor(easeOut(p) * target);
      el.textContent = val.toLocaleString("en-US") + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  const statIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          animateCount(e.target);
          statIO.unobserve(e.target);
        }
      });
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll(".stat__num").forEach((el) => statIO.observe(el));

  /* ---------- waitlist form ---------- */
  const form = document.getElementById("waitform");
  const note = document.getElementById("formNote");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector("input");
      const btn = form.querySelector("button");
      btn.textContent = "You're in ✓";
      btn.style.background = "#38e08a";
      input.value = "";
      input.placeholder = "See you on the radar.";
      if (note) note.textContent = "🎉 You're on the list. We'll ping you when your invite is ready.";
    });
  }
})();
