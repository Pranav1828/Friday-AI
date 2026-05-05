# F.R.I.D.A.Y. OS — Stark Industries AI
> *"Good to meet you. I'm F.R.I.D.A.Y."*

A Tony Stark-inspired AI assistant PWA built with vanilla HTML/CSS/JS. Voice in, voice out, live world map, market intel, and full multi-turn conversation — runs entirely in the browser, no server needed.

**[▶ Launch F.R.I.D.A.Y.](https://pranav1828.github.io/Friday-AI)**

---

## Features

| | Feature | Details |
|---|---|---|
| 🎙 | Voice I/O | Web Speech API — tap the orb to speak, FRIDAY speaks back |
| 🤖 | Dual AI Backend | Google Gemini (direct) or OpenRouter (multiple free models) |
| 🌍 | World Monitor | Live Leaflet map — Dark Ops, Satellite, Topographic layers |
| 📈 | Market Intel | Ticker cards (BTC, ETH, AAPL, TSLA, NVDA, GOOGL) + news feed |
| 📱 | PWA | Add to Home Screen on Android & iOS |
| 🎨 | HUD Themes | Stark Cyan / Mark 85 Gold / Rescue Green / War Machine Red / Extremis Purple |

---

## Project Structure

```
Friday-AI/
├── index.html      # HTML shell — structure only
├── friday.css      # All styles & animations
├── friday.js       # All logic (AI, voice, map, finance)
└── README.md
```

---

## Setup

### 1. Get an API Key

**Option A — Google Gemini (recommended for starters)**
- Go to [aistudio.google.com](https://aistudio.google.com) → Get API Key
- Free tier: 15 req/min · 1,500 req/day

**Option B — OpenRouter (recommended for higher limits)**
- Go to [openrouter.ai](https://openrouter.ai) → Sign up → Copy API key
- No credit card needed for free models
- Free models available: Gemini 2.0 Flash, Llama 3.3 70B, DeepSeek R1, Mistral 7B, and more

### 2. Configure FRIDAY
1. Open the app → tap the **arc reactor icon** (top left)
2. Select your provider — **Gemini** or **OpenRouter**
3. Paste your API key
4. If using OpenRouter, pick a model from the dropdown
5. Click **Save & Engage**

---

## Deploy to GitHub Pages

1. Upload `index.html`, `friday.css`, `friday.js` to your repo root
2. Go to **Settings → Pages → Deploy from branch → main → / (root)**
3. Live at `https://YOUR_USERNAME.github.io/REPO_NAME`

---

## Browser Support

| Browser | Voice Input | Voice Output |
|---|---|---|
| Chrome | ✅ | ✅ |
| Edge | ✅ | ✅ |
| Safari | ✅ | ✅ |
| Android Chrome | ✅ | ✅ |
| Firefox | ❌ text only | ✅ |

---

## Tech Stack

- **AI** — Google Gemini 2.5 Flash API / OpenRouter API
- **Voice** — Web Speech API (STT + TTS, no keys needed)
- **Map** — Leaflet.js + OpenStreetMap / CARTO tiles
- **PWA** — Inline manifest blob, service-worker-free
- **Fonts** — Orbitron · Share Tech Mono · Exo 2

---

## HQ

Stark Tower · Pune, India · 18.52°N 73.86°E

---

*Built by [Pranav1828](https://github.com/Pranav1828) — Inspired by the MCU*
