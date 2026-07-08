# ping

> The radar for the memecoin internet. See what pumps before CT does.

A web app that tracks, in real time, the **narratives, viral memes and cultural signals** driving the memecoin market — so degens catch the move while it's still noise, not exit liquidity.

This repo is the **landing page** (first milestone). Next: web app, then iOS app.

## Stack
Static site — plain HTML / CSS / JS. No build step. Deployed on Vercel.

## Design
Light "sky" theme: pale-blue background (a sky image generated with Higgsfield,
`assets/sky.png`), glassmorphism cards, bento grid, floating nav pill, clean
animated buttons. Fonts: General Sans (display) + Inter (body) + JetBrains Mono (data).
Inspired by the Fluence AI Framer template.

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
