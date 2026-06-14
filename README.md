# 🌱 GreenCityAI — Smart City Sustainability Platform

A **Smart City Sustainability Intelligence Platform** — not a basic carbon
calculator. GreenCityAI gives citizens a premium, data-rich dashboard to track
their carbon footprint, receive **AI-powered recommendations**, earn **rewards**
for sustainable behaviour, climb a **city leaderboard**, and contribute to
**city-wide environmental goals** — with an always-on **AI assistant** ("Terra")
grounded in their own footprint.

Built with a Python (Flask) backend, a vanilla-JavaScript single-page dashboard
(Chart.js visualisations, zero framework lock-in), and a **provider-agnostic AI
layer** (Groq's Llama 3.3 70B by default, with Claude Opus 4.8 as an
alternative).

> **Chosen vertical:** Sustainability / Carbon Footprint Awareness for citizens
> of a "green city".

## 🖥️ The platform at a glance

A full dashboard experience with a sidebar of 10 sections:

- **Dashboard** — animated carbon-score ring, 4 KPI cards, an emission-source
  donut, your "carbon journey" line chart, AI recommendation cards, and a smart
  alert center.
- **Carbon Tracker** — the lifestyle calculator; running it **live-updates** the
  whole dashboard (score, donut, recommendations).
- **AI Insights** — predictive **AI forecast** (linear projection of your trend)
  plus all personalised recommendations.
- **Rewards** — gamified levels, a points progress bar, and redeemable rewards
  (metro pass, coupons, tree certificate…).
- **Community** — a city leaderboard with a top-3 podium, and the active
  community challenge.
- **City Analytics** — a city Sustainability Index gauge, headline metrics, and
  an interactive **area-wise emission heatmap**.
- **Challenges**, **Notifications**, **Profile**, **Settings**.
- **Terra AI** — a floating, streaming chat assistant available everywhere.

Plus a fully **responsive** layout (collapsible sidebar + bottom nav on mobile)
and micro-interactions throughout (count-up numbers, animated rings/gauges,
progress transitions, hover effects).

---

## Why this project

Most carbon calculators give you a number and stop. People are left wondering
*"okay… but what should **I** actually do?"* GreenCityAI closes that gap on three
levels:

1. **Quantify** — estimate annual CO₂e, broken down by category.
2. **Advise** — generate the few highest-impact actions for *their* life, each
   with an estimated saving, sorted biggest-win-first.
3. **Converse** — let the user ask follow-up questions to an AI assistant that
   already knows their footprint and tailors every answer to it, and surface
   curated YouTube videos for their biggest emission source.

---

## Key features

- 📊 **Footprint calculator** — transport, home energy, diet, flights, waste →
  annual CO₂e with an A–E rating and comparison to the global average and the
  Paris-aligned target.
- 🧠 **Context-aware action plan** — rule-based decision engine that only
  suggests changes that apply to the user (a cyclist is never told to drive
  less) and ranks them by impact.
- 💬 **Terra, the AI chatbot** — a streaming, AI-powered assistant (Groq or
  Claude). Ask "how do I fly less?" and get a direct, personalised answer that
  references your own biggest emission sources.
- 📺 **Curated learning resources** — reliable YouTube search links for the
  user's top emission category.
- ♿ **Accessible & responsive** — keyboard friendly, screen-reader support,
  high-contrast, reduced-motion aware.

### Graceful degradation

The chatbot picks the best available backend at runtime, so it works **with or
without** an API key:

| Priority | Provider | When | Behaviour |
| --- | --- | --- | --- |
| 1 | **Groq** | `GROQ_API_KEY` is set | Streams fast answers from Llama 3.3 70B, grounded in the user's footprint. |
| 2 | **Claude** | `ANTHROPIC_API_KEY` is set | Streams answers from Claude Opus 4.8. |
| 3 | **Offline fallback** | No key configured | A built-in keyword responder gives useful, deterministic advice — so the app (and CI) runs fully offline. |

The header badge shows which provider is active. The same streaming generator
serves all three, so the web layer is identical regardless of backend.

---

## Approach & logic

The "smart" behaviour is intentionally **transparent and explainable**:

- **Emission factors as data.** All factors (kg CO₂e) live in plain dictionaries
  in [`backend/carbon_engine.py`](backend/carbon_engine.py), sourced from public
  DEFRA / EPA / IPCC averages — easy to audit and localise.
- **Decision-making on user context.** `recommend()` inspects the user's inputs
  and their emission breakdown, emits only the suggestions that genuinely apply,
  and sorts by impact. That prioritisation is what makes the assistant feel
  intelligent.
- **The AI is grounded, not generic.** The chat endpoint passes the user's
  computed footprint into the model's system prompt, so Terra's advice is
  specific to them.
- **Separation of concerns.** The carbon engine and AI wrapper have zero web
  dependencies, so they're unit-tested in isolation. Flask is a thin
  validate-and-serialise layer.

---

## Architecture

```
GreenCityAI/
├── backend/
│   ├── carbon_engine.py     # Pure logic: validation, estimation, recommendations
│   ├── city_data.py         # Smart-city layer: profiles, leaderboard, heatmap,
│   │                        #   rewards, challenge, trends, AI forecast
│   ├── ai_assistant.py      # Provider-agnostic chat (Groq / Claude) + fallback
│   ├── youtube_resources.py # Curated, hallucination-proof learning links
│   └── app.py               # Flask REST API + SSE chat + static server
├── frontend/
│   ├── index.html           # Dashboard SPA shell (10 sections), accessible markup
│   ├── css/styles.css        # Premium design system, WCAG-AA, responsive
│   └── js/app.js            # View router, charts, animations, chat (no inline JS)
├── tests/
│   └── test_carbon_engine.py  # 44 tests: engine, city data, AI, API contract
├── requirements.txt
├── .env.example             # Copy to .env and add your API key
├── LICENSE · README.md
```

**API**

| Method | Route             | Purpose                                              |
| ------ | ----------------- | ---------------------------------------------------- |
| GET    | `/api/bootstrap`  | All dashboard data (profile, city, rewards, insights)|
| GET    | `/api/options`    | Valid dropdown choices (single source of truth)      |
| POST   | `/api/analyse`    | Footprint + score + advice + AI recommendation cards |
| GET    | `/api/resources`  | Curated YouTube links (optionally per category)      |
| POST   | `/api/chat`       | **Streaming** AI reply (Server-Sent Events)          |
| GET    | `/api/status`     | Active AI provider (groq / claude / offline)         |
| GET    | `/health`         | Liveness probe                                       |

> The smart-city data (leaderboard, heatmap, challenge, rewards) is generated
> **deterministically** in `city_data.py` — no database needed. The API contract
> the frontend consumes is identical to what a real, DB-backed product would
> serve, so it is straightforward to make multi-user later.

---

## Run it locally

```bash
# 1. Install dependencies (a virtual environment is recommended)
pip install -r requirements.txt

# 2. (Optional) enable the live AI chatbot
cp .env.example .env          # then paste your key into GROQ_API_KEY
#   Get a free Groq key at https://console.groq.com/keys
#   Skip this step to run in offline fallback mode — the app still works.

# 3. Start the server
python backend/app.py

# 4. Open the dashboard
#    http://127.0.0.1:5000
```

On Windows PowerShell, step 3 is the same: `python backend\app.py`.

## Run the tests

```bash
pytest -q          # 46 tests, no network or API key required
```

---

## Deploy to Vercel

The repo is Vercel-ready: [`api/index.py`](api/index.py) exposes the Flask app
as a serverless function and [`vercel.json`](vercel.json) routes every request
(static files + `/api/*`) to it.

1. Push the repo to GitHub (already done).
2. In the [Vercel dashboard](https://vercel.com/new), **Add New → Project** and
   import the `GreenCityAI` repository. Framework preset: **Other** (leave the
   build/output settings empty — `vercel.json` handles everything).
3. Under **Environment Variables**, add `GROQ_API_KEY` with your key (and
   optionally `ANTHROPIC_API_KEY`). **Do not** commit keys — Vercel injects them
   at runtime.
4. Click **Deploy**. Your platform is live at `https://<project>.vercel.app`.

> **Notes for the serverless model:** the AI chat still works but responses are
> buffered (delivered as one chunk) rather than token-by-token, since Vercel
> functions buffer WSGI output; and the in-memory rate limiter is per-instance.
> For native streaming and a long-lived process, a platform like **Render** or
> **Railway** runs `python backend/app.py` (or `waitress-serve`) unchanged.

---

## How each evaluation area is addressed

- **Code Quality** — small, single-responsibility modules (`carbon_engine`,
  `city_data`, `ai_assistant`, `youtube_resources`), each with type hints,
  docstrings, and meaningful comments; business logic is fully decoupled from
  Flask and from the LLM SDK; the AI layer exposes one clean generator used
  identically across providers and the offline path; the frontend is split into
  a view router plus focused render functions with no inline JS.
- **Security** — API key read from the environment and **never committed**
  (`.env` gitignored; history verified clean); **per-IP rate limiting** on the AI
  endpoint to protect the key and cost; strict input validation with bounds and
  request-key whitelisting; request-size cap; chat history length/size limits;
  security headers (CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`);
  errors never leak internals; prompt-injection note in the system prompt;
  XSS-safe frontend (`textContent` only, `rel="noopener noreferrer"` on external
  links); debug off by default; pinned dependencies.
- **Efficiency** — the footprint engine and city layer are pure O(1)/O(n)
  computation with no DB or network calls; chat responses are **streamed** (SSE)
  so tokens render as they arrive; Chart.js instances are destroyed before
  recreation (no leaks); the dashboard loads from a single `/api/bootstrap`
  call; YouTube links are computed, not fetched.
- **Testing** — 46 `pytest` cases covering validation, the footprint maths, the
  recommendation prioritisation, the smart-city data layer (levels, leaderboard,
  heatmap, rewards, forecast), the resource builder, the AI provider selection
  and offline fallback, rate limiting, and the full HTTP contract (including the
  SSE stream) — all runnable offline with no API key.
- **Accessibility** — semantic landmarks, skip link, labelled controls, visible
  focus, `aria-current="page"` on the active nav, `role="img"` + data-bearing
  `aria-label`s on every chart canvas (plus a screen-reader table for the
  tracker), live regions for results and chat, `aria-expanded`/`aria-controls`
  on the chat toggle, Escape-to-close, focus management, WCAG-AA contrast
  (including dark text on amber heatmap tiles), and `prefers-reduced-motion`
  support.
- **Problem Statement Alignment** — a *smart, dynamic assistant with logical
  decision-making based on user context*: the engine emits only applicable,
  impact-ranked actions; the dashboard, recommendations, and AI chat all adapt
  to the user's computed footprint; and the result is a practical, real-world
  Smart City sustainability platform, not a one-shot calculator.

---

## Assumptions

- Emission factors are **representative averages**, not a certified audit; the
  goal is awareness and relative comparison, not regulatory precision.
- Household-shared sources (heating, electricity) are divided evenly across
  occupants.
- "Flights per year" is modelled as short-haul return trips (~500 kg CO₂e each).
- The app is **stateless** — no personal data is stored, which keeps it private
  by design. Chat history lives only in the browser tab for the session.
- Learning resources are **YouTube search links** (not fixed video IDs) so they
  never break and always surface fresh content.

---

## License

Released under the [MIT License](LICENSE).
