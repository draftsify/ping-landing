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

  /* ---------- sources ("Posts") card + popup ---------- */
  const escAttr = (s) => String(s || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  function srcIcon(type) {
    if (/x|twitter/i.test(type)) return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2.5h3.3l-7.2 8.2L23.5 21.5h-6.6l-5.2-6.8-6 6.8H2.4l7.7-8.8L1.9 2.5h6.8l4.7 6.2 5.5-6.2zM17.7 19.6h1.8L7.4 4.3H5.5z"/></svg>';
    if (/telegram/i.test(type)) return svg('<path d="M21.5 4.3L3 11.4c-1 .4-1 1.3 0 1.6l4.6 1.4 1.7 5.4c.2.7.6.8 1.2.3l2.6-2.4 4.5 3.3c.8.5 1.4.2 1.6-.7l3-13.7c.2-1-.4-1.5-1.3-1.3z"/>');
    if (/site|web/i.test(type)) return svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18"/>');
    if (/chart/i.test(type)) return svg('<path d="M4 20V10M10 20V4M16 20v-7M20.5 20H3"/>');
    return svg('<path d="M10 14L21 3M15 3h6v6"/>');
  }
  function srcLabel(type) {
    if (/x|twitter/i.test(type)) return "X — posts";
    if (/telegram/i.test(type)) return "Telegram";
    if (/site|web/i.test(type)) return "Website";
    if (/chart/i.test(type)) return "DexScreener chart";
    return "Link";
  }
  const CHEV = '<svg class="srcs__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  let srcModal;
  function openSources(sources) {
    if (!srcModal) {
      srcModal = document.createElement("div");
      srcModal.className = "pk-modal";
      srcModal.innerHTML =
        `<div class="pk-card"><div class="pk-head"><div><b>Posts &amp; links</b><span>Tap one — it opens the source directly.</span></div>` +
        `<button class="pk-x" data-x aria-label="Close">${svg(IC.x)}</button></div><div class="pk-body"><div class="src-list"></div></div></div>`;
      document.body.appendChild(srcModal);
      srcModal.addEventListener("click", (e) => { if (e.target === srcModal || e.target.closest("[data-x]")) srcModal.classList.remove("open"); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && srcModal.classList.contains("open")) srcModal.classList.remove("open"); });
    }
    const list = srcModal.querySelector(".src-list");
    list.innerHTML = sources.map((s) =>
      `<button type="button" class="src-row" data-url="${escAttr(s.url)}">` +
      `<span class="src-ic">${srcIcon(s.type)}</span>` +
      `<span class="src-meta"><span class="src-t">${escAttr(s.label || srcLabel(s.type))}</span><span class="src-u">${escAttr(s.url)}</span></span>` +
      `<svg class="src-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14L21 3M15 3h6v6"/></svg></button>`).join("");
    list.querySelectorAll(".src-row").forEach((r) => r.addEventListener("click", () => { const u = r.dataset.url; if (u) window.open(u, "_blank", "noopener"); }));
    srcModal.classList.add("open");
  }

  /* ---------- public: attach sources card + action bar under a message ---------- */
  function attach(msgBodyEl, text, sources) {
    if (!msgBodyEl || msgBodyEl.querySelector(":scope > .acts")) return;
    if (Array.isArray(sources) && sources.length) {
      const card = document.createElement("button");
      card.type = "button"; card.className = "srcs";
      card.innerHTML = `<span class="srcs__ic">${srcIcon(sources[0].type)}</span>Posts <span class="srcs__n">${sources.length}</span>${CHEV}`;
      card.addEventListener("click", () => openSources(sources));
      msgBodyEl.appendChild(card);
    }
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

  window.PingChat = { attach, openSave, openSources, theses: loadTheses, initLenSelect };
})();
