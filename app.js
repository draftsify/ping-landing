/* ============================================================
   ping — minimal waitlist
   ============================================================ */
(function () {
  "use strict";

  // ambient background video
  const v = document.getElementById("bgvideo");
  if (v && v.play) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }

  // appear on load (staggered)
  function run() {
    document.querySelectorAll(".appear").forEach((el) => {
      const d = parseInt(el.dataset.delay || "0", 10);
      setTimeout(() => el.classList.add("shown"), 120 + d * 110);
    });
  }
  if (document.readyState !== "loading") run();
  else document.addEventListener("DOMContentLoaded", run);

  // waitlist form
  const form = document.getElementById("waitform");
  const note = document.getElementById("note");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector("input");
      const label = form.querySelector(".btn__label");
      if (label) { label.textContent = "You're in ✓"; label.removeAttribute("data-text"); }
      form.querySelector("button").style.pointerEvents = "none";
      input.value = "";
      input.placeholder = "See you on the radar.";
      input.blur();
      if (note) note.innerHTML = "🎉 You're on the list — we'll ping you when your invite is ready.";
    });
  }
})();
