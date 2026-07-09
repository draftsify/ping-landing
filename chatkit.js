/* ============================================================
   ping · chatkit — window.PingChat.attach(msgBodyEl, rawText)
   Adds copy / listen (TTS) / save-thesis actions under an AI message.
   Shared by product.html (Assistant) and dex.html (tokens widget).
   ============================================================ */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const IC = {
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    play: '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  const plain = (t) => (t || "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/_(.+?)_/g, "$1").replace(/[#>`]/g, "").trim();

  /* ---------- toast ---------- */
  let toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "pk-toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2000);
  }

  /* ---------- copy ---------- */
  function copy(text, btn) {
    const t = plain(text);
    const done = () => { const o = btn.innerHTML; btn.classList.add("ok"); btn.innerHTML = svg(IC.check); setTimeout(() => { btn.classList.remove("ok"); btn.innerHTML = o; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(() => toast("Copy failed"));
    else { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed"); } ta.remove(); }
  }

  /* ---------- listen (Web Speech) ---------- */
  let curBtn = null;
  function listen(text, btn) {
    const s = window.speechSynthesis;
    if (!s) { toast("Read-aloud not supported here"); return; }
    // toggle off if already speaking this one
    if (curBtn) { s.cancel(); const was = curBtn; curBtn.classList.remove("on"); curBtn.innerHTML = svg(IC.play); curBtn = null; if (was === btn) return; }
    const u = new SpeechSynthesisUtterance(plain(text));
    u.lang = /[àâçéèêëîïôûüœ]|\b(le|la|les|est|psk|parce|pour|avec|donc|coin|gens)\b/i.test(text) ? "fr-FR" : "en-US";
    u.rate = 1.05; u.pitch = 1;
    u.onend = () => { btn.classList.remove("on"); btn.innerHTML = svg(IC.play); curBtn = null; };
    s.cancel(); s.speak(u);
    curBtn = btn; btn.classList.add("on"); btn.innerHTML = svg(IC.stop);
  }

  /* ---------- save-thesis modal ---------- */
  const KEY = "ping_theses_v1";
  let modal, ta;
  function loadTheses() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function saveTheses(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
  function ensureModal() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "pk-modal";
    modal.innerHTML =
      `<div class="pk-card" role="dialog" aria-label="Save thesis">
        <div class="pk-head"><div><b>Save thesis</b><span>Edit it, then publish or keep as a draft.</span></div>
          <button class="pk-x" data-pk="close" aria-label="Close">${svg(IC.x)}</button></div>
        <div class="pk-body"><textarea class="pk-ta" placeholder="Your thesis…"></textarea></div>
        <div class="pk-foot">
          <button class="pk-btn" data-pk="draft">Save draft</button>
          <button class="pk-btn pk-btn--primary" data-pk="publish">Publish thesis</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    ta = modal.querySelector(".pk-ta");
    modal.addEventListener("click", (e) => {
      if (e.target === modal) return close();
      const a = e.target.closest("[data-pk]"); if (!a) return;
      const act = a.dataset.pk;
      if (act === "close") return close();
      const text = ta.value.trim(); if (!text) { toast("Nothing to save"); return; }
      const list = loadTheses();
      list.unshift({ text, status: act === "publish" ? "published" : "draft", ts: Date.now() });
      saveTheses(list);
      close();
      toast(act === "publish" ? "Thesis published 🚀" : "Draft saved");
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("open")) close(); });
  }
  function openSave(text) { ensureModal(); ta.value = plain(text); modal.classList.add("open"); setTimeout(() => ta.focus(), 60); }
  function close() { if (modal) modal.classList.remove("open"); }

  /* ---------- public: attach action bar under a message ---------- */
  function attach(msgBodyEl, text) {
    if (!msgBodyEl || msgBodyEl.querySelector(":scope > .acts")) return;
    const bar = document.createElement("div");
    bar.className = "acts";
    bar.innerHTML =
      `<button class="act" data-a="copy" title="Copy" aria-label="Copy">${svg(IC.copy)}</button>` +
      `<button class="act" data-a="listen" title="Listen" aria-label="Listen">${svg(IC.play)}</button>` +
      `<button class="act" data-a="save" title="Save thesis" aria-label="Save thesis">${svg(IC.save)}</button>`;
    bar.addEventListener("click", (e) => {
      const b = e.target.closest(".act"); if (!b) return;
      const a = b.dataset.a;
      if (a === "copy") copy(text, b);
      else if (a === "listen") listen(text, b);
      else if (a === "save") openSave(text);
    });
    msgBodyEl.appendChild(bar);
  }

  /* ---------- short/long length selector (Claude-style dropdown) ---------- */
  function initLenSelect(root, onChange) {
    if (!root) return;
    const btn = root.querySelector("[data-lenbtn]");
    const menu = root.querySelector(".lensel__menu");
    const label = root.querySelector("[data-lenlabel]");
    if (!btn || !menu) return;
    function setVal(v) {
      root.dataset.val = v;
      if (label) label.textContent = v === "long" ? "Long" : "Short";
      root.querySelectorAll(".lensel__opt").forEach((o) => o.classList.toggle("lensel__opt--on", o.dataset.len === v));
      if (onChange) onChange(v);
    }
    btn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    root.querySelectorAll(".lensel__opt").forEach((o) => o.addEventListener("click", () => { menu.hidden = true; setVal(o.dataset.len); }));
    document.addEventListener("click", (e) => { if (!root.contains(e.target)) menu.hidden = true; });
    setVal(root.dataset.val || "short");
  }

  window.PingChat = { attach, openSave, theses: loadTheses, initLenSelect };
})();
