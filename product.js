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
  let convo = [];   // {role, content} conversation memory for follow-ups
  let mode = "short";  // answer length: short | long

  // background descent video — scrubs forward (orbit -> clouds -> city) as the chat grows
  const bgVid = document.getElementById("bgvideo");
  let targetT = 0, curT = 0, rafOn = false;
  if (bgVid) {
    bgVid.pause();
    const prime = () => { try { bgVid.currentTime = 0.001; } catch (e) {} };
    if (bgVid.readyState >= 1) prime(); else bgVid.addEventListener("loadedmetadata", prime, { once: true });
  }
  function descentLoop() {
    curT += (targetT - curT) * 0.1;
    if (bgVid && bgVid.readyState >= 1) { try { bgVid.currentTime = curT; } catch (e) {} }
    if (Math.abs(targetT - curT) > 0.004) requestAnimationFrame(descentLoop);
    else rafOn = false;
  }
  function updateDescent() {
    if (!bgVid) return;
    const sh = thread.scrollHeight, ch = thread.clientHeight;
    const overflow = Math.max(sh - ch, 0);          // 0 while the chat is empty -> we stay in space
    const content = Math.min(overflow / 2200, 1);   // every new message pushes the descent further down
    const scrolled = Math.min(Math.max(thread.scrollTop / Math.max(sh - ch, 1), 0), 1);
    const p = Math.min(content * 0.85 + scrolled * 0.15, 1);
    const dur = (bgVid.duration && isFinite(bgVid.duration)) ? bgVid.duration : 10;
    targetT = p * (dur - 0.05);
    if (!rafOn) { rafOn = true; requestAnimationFrame(descentLoop); }
  }
  thread.addEventListener("scroll", updateDescent, { passive: true });

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
  const md = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, "<br>");

  // short / long answer selector (Claude-style dropdown)
  if (window.PingChat) PingChat.initLenSelect(document.getElementById("lenSel"), (v) => { mode = v; });
  const scroll = () => { thread.scrollTop = thread.scrollHeight; updateDescent(); };

  function addUser(text) {
    const el = document.createElement("div"); el.className = "msg msg--user";
    let html = "";
    if (files.length) html += `<div class="thumbs">${files.map((f) => `<img src="${f.url}" alt="">`).join("")}</div>`;
    if (text) html += `<div class="bubble">${esc(text)}</div>`;
    el.innerHTML = html; msgs.appendChild(el); scroll();
  }
  function addAI() {
    const el = document.createElement("div"); el.className = "msg msg--ai";
    el.innerHTML = `<div class="ava"><img src="assets/logo-white.png" alt="ping"></div>` +
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

  function stream(body, text, onDone) {
    body.dataset.raw = ""; body.innerHTML = "";
    const tokens = text.split(/(\s+)/); let i = 0;
    (function step() {
      if (i >= tokens.length) { if (onDone) onDone(); return; }
      body.dataset.raw += tokens.slice(i, i + 3).join(""); i += 3;
      body.innerHTML = md(body.dataset.raw);
      scroll();
      setTimeout(step, 16);
    })();
  }

  const composerEl = document.querySelector(".composer");
  // FLIP: slide the composer from centre to the bottom on the first message
  function flipComposer(firstTop) {
    if (firstTop == null || !composerEl) return;
    const last = composerEl.getBoundingClientRect().top;
    const dy = firstTop - last;
    if (!dy) return;
    composerEl.style.transition = "none";
    composerEl.style.transform = `translateY(${dy}px)`;
    requestAnimationFrame(() => {
      composerEl.style.transition = "transform .55s cubic-bezier(.2,.7,.2,1)";
      composerEl.style.transform = "";
    });
    setTimeout(() => { composerEl.style.transition = ""; }, 640);
  }

  async function askPing(text, history) {
    const r = await fetch("/api/chat", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text, history: history || [], mode }),
    });
    if (!r.ok) throw new Error("bad");
    const d = await r.json();
    if (!d.reply) throw new Error("empty");
    return d.reply;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text && !files.length) return;
    const wasChatting = document.body.classList.contains("chatting");
    const firstTop = wasChatting ? null : (composerEl ? composerEl.getBoundingClientRect().top : null);
    document.body.classList.add("chatting");
    newbtn.hidden = false;
    if (!wasChatting) flipComposer(firstTop);
    addUser(text);
    const snap = text;
    const history = convo.slice(-8);
    convo.push({ role: "user", content: snap });
    files = []; renderAtt(); input.value = ""; resize(); refresh();
    const bodyEl = addAI();
    const bearEl = bodyEl.querySelector(".thinker__bear");
    const started = Date.now();
    askPing(snap, history).catch(() => review(snap)).then((reply) => {
      const wait = Math.max(0, 1100 - (Date.now() - started));   // keep the thinking bear a beat
      setTimeout(() => {
        if (bearEl) bearEl.classList.add("out");
        setTimeout(() => stream(bodyEl, reply, () => {
          convo.push({ role: "assistant", content: reply });
          if (window.PingChat) PingChat.attach(bodyEl, reply);
        }), 320);
      }, wait);
    });
  });

  newbtn.addEventListener("click", () => {
    msgs.innerHTML = ""; convo = []; document.body.classList.remove("chatting"); newbtn.hidden = true;
    input.value = ""; resize(); refresh(); input.focus();
    updateDescent();
  });

  /* ---------- voice input: record + live transcription ---------- */
  const mic = $("mic"), voice = $("voice"), voiceStop = $("voiceStop"),
    voiceBars = $("voiceBars"), voiceTime = $("voiceTime");
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const PH = input.getAttribute("placeholder");
  const BARN = 40;
  const bars = [];
  if (voiceBars) for (let i = 0; i < BARN; i++) { const s = document.createElement("span"); voiceBars.appendChild(s); bars.push(s); }
  let recognizing = false, recog = null, media = null, actx = null, analyser = null, barRAF = null, timer = null, secs = 0, baseText = "", finalText = "";

  const fmt = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  let phTid = null;
  function flash(msg) { input.setAttribute("placeholder", msg); clearTimeout(phTid); phTid = setTimeout(() => input.setAttribute("placeholder", PH), 2600); }

  async function startRec() {
    if (recognizing) return;
    if (!SR) { flash("Voice transcription needs Chrome / a Chromium browser."); return; }
    try { media = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { flash("Microphone access denied — enable it to use voice."); return; }
    recognizing = true;
    document.body.classList.add("recording"); voice.hidden = false; mic.classList.add("rec");
    baseText = input.value.trim(); finalText = "";
    secs = 0; voiceTime.textContent = fmt(0); timer = setInterval(() => { secs++; voiceTime.textContent = fmt(secs); }, 1000);

    // real-time visualizer from mic audio
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const src = actx.createMediaStreamSource(media);
      analyser = actx.createAnalyser(); analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.78;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      (function draw() {
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < BARN; i++) {
          const v = data[Math.floor((i / BARN) * data.length)] / 255;
          bars[i].style.height = (8 + v * 92).toFixed(0) + "%";
        }
        barRAF = requestAnimationFrame(draw);
      })();
    } catch (e) {}

    // transcription
    recog = new SR(); recog.continuous = true; recog.interimResults = true; recog.lang = navigator.language || "en-US";
    recog.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      input.value = ((baseText ? baseText + " " : "") + (finalText + interim)).replace(/\s+/g, " ").replace(/^\s/, "");
      resize(); refresh();
    };
    recog.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { flash("Microphone access denied."); stopRec(); } };
    recog.onend = () => { if (recognizing) { try { recog.start(); } catch (e) {} } };
    try { recog.start(); } catch (e) {}
  }

  function stopRec() {
    if (!recognizing) return;
    recognizing = false;
    document.body.classList.remove("recording"); voice.hidden = true; mic.classList.remove("rec");
    clearInterval(timer);
    if (barRAF) cancelAnimationFrame(barRAF);
    if (recog) { recog.onend = null; try { recog.stop(); } catch (e) {} recog = null; }
    if (actx) { try { actx.close(); } catch (e) {} actx = null; }
    if (media) { media.getTracks().forEach((t) => t.stop()); media = null; }
    resize(); refresh(); input.focus();
  }

  if (mic) mic.addEventListener("click", () => (recognizing ? stopRec() : startRec()));
  if (voiceStop) voiceStop.addEventListener("click", stopRec);
})();
