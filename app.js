/* ============================================================
   ping — waitlist + admin
   ============================================================ */
(function () {
  "use strict";
  const ADMIN_CODE = "190905150306";
  const KEY = "ping_waitlist_v2";

  /* ambient background video — seamless crossfade loop (no hard cut) */
  (function () {
    const A = document.getElementById("bgvideo");
    const B = document.getElementById("bgvideo2");
    const play = (el) => { const p = el && el.play && el.play(); if (p && p.catch) p.catch(() => {}); };
    if (!A) return;
    if (!B) { play(A); A.loop = true; return; }
    const FADE = 1.1; // seconds, matches CSS opacity transition
    A.style.opacity = "1"; B.style.opacity = "0";
    play(A);
    let active = A, idle = B, swapping = false;
    function tick() {
      const d = active.duration;
      if (d && !swapping && active.currentTime >= d - FADE) {
        swapping = true;
        try { idle.currentTime = 0; } catch (e) {}
        play(idle);
        idle.style.opacity = "1";
        active.style.opacity = "0";
        const finished = active;
        setTimeout(() => { try { finished.pause(); finished.currentTime = 0; } catch (e) {} }, FADE * 1000 + 150);
        const t = active; active = idle; idle = t;
        setTimeout(() => { swapping = false; }, FADE * 1000 + 250);
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();

  /* appear on load */
  function run() {
    document.querySelectorAll(".appear").forEach((el) => {
      const d = parseInt(el.dataset.delay || "0", 10);
      setTimeout(() => el.classList.add("shown"), 120 + d * 110);
    });
  }
  if (document.readyState !== "loading") run();
  else document.addEventListener("DOMContentLoaded", run);

  /* storage */
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }

  // seed a few sample signups on first visit so the panel isn't empty
  if (localStorage.getItem(KEY) === null) {
    const now = Date.now(), M = 60000, H = 3600000;
    save([
      { value: "@0xgigachad", type: "x", ts: now - 2 * M },
      { value: "@degenmike", type: "x", ts: now - 26 * M },
      { value: "@solmaxi", type: "x", ts: now - 3 * H },
      { value: "@anoncap", type: "x", ts: now - 5 * H },
      { value: "@memecoinmom", type: "x", ts: now - 9 * H },
      { value: "@ctdrifter", type: "x", ts: now - 27 * H },
      { value: "@basedjeet", type: "x", ts: now - 49 * H },
    ]);
  }

  /* classify input: admin code / email / x handle / invalid */
  function classify(raw) {
    const s = (raw || "").trim();
    if (!s) return { empty: true };
    if (s === ADMIN_CODE) return { admin: true };
    if (s === "drafts1503") return { product: true };
    if (/^@?[A-Za-z0-9_]{2,20}$/.test(s)) return { type: "x", value: "@" + s.replace(/^@/, "") };
    return { invalid: true };
  }

  /* waitlist form */
  const form = document.getElementById("waitform");
  const input = document.getElementById("wl-input");
  const join = document.getElementById("join");
  const success = document.getElementById("success");
  const who = document.getElementById("success-who");

  function flagInvalid() {
    form.classList.remove("shake"); void form.offsetWidth; form.classList.add("shake");
    input.setAttribute("placeholder", "enter your @handle");
    input.focus();
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const r = classify(input.value);
      if (r.admin) { input.value = ""; openAdmin(); return; }
      if (r.product) { window.location.href = "product.html"; return; }
      if (r.empty || r.invalid) { flagInvalid(); return; }
      const list = load();
      list.push({ value: r.value, type: r.type, ts: Date.now() });
      save(list);
      if (who) who.textContent = r.value;
      join.classList.add("gone");
      setTimeout(() => {
        join.style.display = "none";
        success.hidden = false;
        requestAnimationFrame(() => success.classList.add("in"));
      }, 420);
    });
  }

  /* ---------- admin panel ---------- */
  const admin = document.getElementById("admin");
  const listEl = document.getElementById("admin-list");
  const countEl = document.getElementById("admin-count");
  const footEl = document.getElementById("admin-foot");
  const searchEl = document.getElementById("admin-search");

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
    const d = Math.floor(h / 24); return d + "d ago";
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function renderAdmin() {
    const all = load().slice().sort((a, b) => b.ts - a.ts);
    const q = (searchEl.value || "").trim().toLowerCase();
    const rows = all.filter((e) => !q || e.value.toLowerCase().includes(q));
    countEl.textContent = all.length;
    if (!rows.length) {
      listEl.innerHTML = '<div class="admin__empty">' + (all.length ? "No matches." : "No signups yet.") + "</div>";
    } else {
      listEl.innerHTML = rows.map((e, i) => {
        const badge = e.type === "x"
          ? '<span class="arow__badge badge-x">X</span>'
          : '<span class="arow__badge badge-mail">Email</span>';
        return '<div class="arow"><div class="arow__i">' + (i + 1) +
          '</div><div class="arow__v">' + badge + "<span>" + esc(e.value) +
          '</span></div><div class="arow__t">' + timeAgo(e.ts) + "</div></div>";
      }).join("");
    }
    footEl.textContent = all.length + " total · stored locally in this browser";
  }
  function openAdmin() { admin.hidden = false; renderAdmin(); requestAnimationFrame(() => admin.classList.add("in")); }
  function closeAdmin() { admin.classList.remove("in"); setTimeout(() => { admin.hidden = true; }, 300); }

  if (admin) {
    document.getElementById("admin-close").addEventListener("click", closeAdmin);
    admin.addEventListener("click", (e) => { if (e.target === admin) closeAdmin(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !admin.hidden) closeAdmin(); });
    searchEl.addEventListener("input", renderAdmin);
    document.getElementById("admin-clear").addEventListener("click", () => {
      if (confirm("Clear all waitlist entries? This can't be undone.")) { save([]); renderAdmin(); }
    });
    document.getElementById("admin-export").addEventListener("click", () => {
      const all = load().slice().sort((a, b) => b.ts - a.ts);
      const rows = [["value", "type", "joined_at_iso"]].concat(
        all.map((e) => [e.value, e.type, new Date(e.ts).toISOString()])
      );
      const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "ping-waitlist.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }
})();
