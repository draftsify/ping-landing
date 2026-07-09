/* ============================================================
   ping · thesis desk
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const input = $("input"), form = $("composer"), send = $("send"), attach = $("attach"),
    file = $("file"), attWrap = $("attachments"), msgs = $("msgs"), thread = $("thread"),
    chips = $("chips"), newbtn = $("newchat");
  let files = [];

  // background planet zoom — grows as the conversation grows
  const bgEl = document.querySelector(".bg");
  let zoomQueued = false;
  function updateZoom() {
    if (zoomQueued) return;
    zoomQueued = true;
    requestAnimationFrame(() => {
      zoomQueued = false;
      if (!bgEl) return;
      const sh = thread.scrollHeight, ch = thread.clientHeight;
      const content = Math.min(sh / 1000, 1);                       // total chat length
      const scrolled = Math.min(Math.max(thread.scrollTop / Math.max(sh - ch, 1), 0), 1);
      const scale = 1 + content * 0.5 + scrolled * 0.18;            // up to ~1.68x
      bgEl.style.transform = "scale(" + scale.toFixed(3) + ")";
    });
  }
  thread.addEventListener("scroll", updateZoom, { passive: true });

  // appear on load
  document.querySelectorAll(".appear").forEach((el) => {
    const d = parseInt(el.dataset.delay || "0", 10);
    setTimeout(() => el.classList.add("shown"), 120 + d * 110);
  });

  const resize = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 200) + "px"; };
  const refresh = () => { send.disabled = !(input.value.trim() || files.length); };
  input.addEventListener("input", () => { resize(); refresh(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  // attachments
  attach.addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    [...file.files].forEach((f) => { if (f.type.startsWith("image/")) files.push({ url: URL.createObjectURL(f) }); });
    file.value = ""; renderAtt(); refresh();
  });
  function renderAtt() {
    attWrap.innerHTML = files.map((f, i) => `<div class="att"><img src="${f.url}" alt=""><button type="button" data-i="${i}" aria-label="Remove">✕</button></div>`).join("");
    attWrap.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { files.splice(+b.dataset.i, 1); renderAtt(); refresh(); }));
  }

  // quick actions
  chips.addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    if (c.dataset.chart) { attach.click(); return; }
    input.value = (c.dataset.tpl || "").replace(/\\n/g, "\n");
    resize(); refresh(); input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/_(.+?)_/g, "<em>$1</em>").replace(/\n/g, "<br>");
  const scroll = () => { thread.scrollTop = thread.scrollHeight; updateZoom(); };

  function addUser(text) {
    const el = document.createElement("div"); el.className = "msg msg--user";
    let html = "";
    if (files.length) html += `<div class="thumbs">${files.map((f) => `<img src="${f.url}" alt="">`).join("")}</div>`;
    if (text) html += `<div class="bubble">${esc(text)}</div>`;
    el.innerHTML = html; msgs.appendChild(el); scroll();
  }
  function addAI() {
    const el = document.createElement("div"); el.className = "msg msg--ai";
    el.innerHTML = `<div class="ava"><img src="assets/favicon.png" alt="ping"></div>` +
      `<div class="body"><div class="thinker"><div class="thinker__bear"><img src="assets/logo-white.png" alt="">` +
      `<span class="bub b1"></span><span class="bub b2"></span><span class="bub b3"></span></div></div></div>`;
    msgs.appendChild(el); scroll(); return el.querySelector(".body");
  }

  function review(text) {
    const ticker = (text.match(/\$[A-Za-z0-9]{2,10}/) || [])[0];
    const hasX = /(x\.com|twitter\.com)/i.test(text);
    const subj = ticker || (hasX ? "this post" : "your thesis");
    const score = 62 + Math.floor(Math.random() * 30);
    return [
      `**Read on ${subj}.** Momentum first, opinion second — here's what the signal actually says.`,
      `**Momentum** — chatter is building but still early. Velocity is positive on CT and Telegram, thinner on TikTok. It reads _forming_, not _peaked_.`,
      `**Narrative fit** — it maps onto an active meta, which is both the upside and the risk: the story isn't differentiated yet. What makes this the one, not the tenth clone?`,
      `**What you're glossing over** — the mentions are concentrated in a handful of accounts, and there's no on-chain confirmation from fresh wallets yet. Loud but shallow is still noise.`,
      `**Verdict** — conviction ${score}/100. Worth a starter watch with a hard invalidation if velocity flattens over the next few hours. Size for the fact that being early also means you can be early _and_ wrong.`,
      `_Demo response — a live model wired to real-time ping signals is coming to the beta._`,
    ].join("\n\n");
  }

  function stream(body, text) {
    body.dataset.raw = ""; body.innerHTML = "";
    const tokens = text.split(/(\s+)/); let i = 0;
    (function step() {
      if (i >= tokens.length) return;
      body.dataset.raw += tokens.slice(i, i + 3).join(""); i += 3;
      body.innerHTML = md(body.dataset.raw);
      scroll();
      setTimeout(step, 16);
    })();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text && !files.length) return;
    document.body.classList.add("chatting");
    newbtn.hidden = false;
    addUser(text);
    const snap = text;
    files = []; renderAtt(); input.value = ""; resize(); refresh();
    const body = addAI();
    const bear = body.querySelector(".thinker__bear");
    setTimeout(() => {
      if (bear) bear.classList.add("out");
      setTimeout(() => stream(body, review(snap)), 360);
    }, 1800);
  });

  newbtn.addEventListener("click", () => {
    msgs.innerHTML = ""; document.body.classList.remove("chatting"); newbtn.hidden = true;
    input.value = ""; resize(); refresh(); input.focus();
    if (bgEl) bgEl.style.transform = "scale(1)";
  });
})();
