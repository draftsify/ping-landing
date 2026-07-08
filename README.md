# ping

> The radar for the memecoin internet. See what pumps before CT does.

A web app that tracks, in real time, the **narratives, viral memes and cultural signals** driving the memecoin market — so degens catch the move while it's still noise, not exit liquidity.

This repo is the **landing page** (first milestone). Next: web app, then iOS app.

## Stack
Static site — plain HTML / CSS / JS. No build step. Deployed on Vercel.

## Design
Light "sky" theme with a Framer-style feel. Hero uses a 15s cinematic video
background (`assets/rise.mp4`) — a camera ascent from Earth's sky into space,
generated with Higgsfield / Seedance 2.0 from the `assets/sky.png` still (also
Higgsfield). Glassmorphism cards, bento grid, floating nav pill, gradient-blur
accents, scrolling ticker, big gradient footer watermark, on-load appear
animations. Font: DM Sans throughout. Inspired by the Fluence AI Framer template.

## Local dev
Just open `index.html`, or serve it:
```bash
npx serve .
```

## Structure
- `index.html` — markup
- `styles.css` — design system + layout
- `app.js` — radar blips, live feed, counters, scroll reveals

---
© 2026 ping. Not financial advice.
