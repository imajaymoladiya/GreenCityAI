# 🌱 GreenCityAI — Carbon Footprint Awareness Assistant

A smart, dynamic assistant that turns a person's everyday lifestyle choices into
a personalised carbon-footprint estimate and a **prioritised action plan** for
reducing it. Built with a Python (Flask) backend and a vanilla JavaScript
dashboard.

> **Chosen vertical:** Sustainability / Carbon Footprint Awareness for citizens
> of a "green city".

---

## Why this project

Most carbon calculators give you a number and stop. People are then left
wondering *"okay… but what should **I** actually do?"* GreenCityAI closes that
gap: it reasons about the user's specific context and tells them the **few
highest-impact changes** for *their* life — and quantifies the saving of each.

---

## What it does

1. The user describes their lifestyle: transport, home heating, electricity use,
   diet, flights, household size, and recycling habits.
2. The backend estimates their **annual CO₂e** broken down by category.
3. A rule-based decision engine generates **context-aware recommendations**,
   sorted by estimated impact (biggest win first). It never suggests something
   that doesn't apply — e.g. a cyclist is never told to "drive less".
4. The dashboard shows an A–E rating, a comparison to the global average and the
   Paris-aligned target, a breakdown chart, and the personalised action plan.

---

## Approach & logic

The "smart" behaviour is intentionally **transparent and explainable** rather
than a black box:

- **Emission factors as data.** All factors (kg CO₂e) live in plain
  dictionaries in [`backend/carbon_engine.py`](backend/carbon_engine.py), sourced
  from public DEFRA / EPA / IPCC averages, so they are easy to audit and localise.
- **Decision making based on user context.** `recommend()` inspects the user's
  inputs and their emission breakdown, then emits only the suggestions that
  genuinely apply, each with an estimated annual saving. Results are sorted by
  impact — that prioritisation is what makes the assistant feel intelligent.
- **Separation of concerns.** The engine has zero web dependencies, so it can be
  unit-tested in isolation and reused from any context. Flask is a thin,
  validate-and-serialise layer on top.

---

## Architecture

```
GreenCityAI/
├── backend/
│   ├── carbon_engine.py   # Pure logic: validation, estimation, recommendations
│   └── app.py             # Flask REST API + static file server
├── frontend/
│   ├── index.html         # Accessible, semantic markup
│   ├── css/styles.css     # WCAG-AA contrast, focus states, responsive
│   └── js/app.js          # Fetches API, renders chart + action plan (no inline JS)
├── tests/
│   └── test_carbon_engine.py  # Engine + API tests (pytest)
├── requirements.txt
├── LICENSE
└── README.md
```

**API**

| Method | Route           | Purpose                                   |
| ------ | --------------- | ----------------------------------------- |
| GET    | `/api/options`  | Valid dropdown choices (single source)    |
| POST   | `/api/analyse`  | Validate context → footprint + advice     |
| GET    | `/health`       | Liveness probe                            |

---

## Run it locally

```bash
# 1. Install dependencies (a virtual environment is recommended)
pip install -r requirements.txt

# 2. Start the server
python backend/app.py

# 3. Open the dashboard
#    http://127.0.0.1:5000
```

## Run the tests

```bash
pytest -q
```

---

## How each evaluation area is addressed

- **Code Quality** — small, single-responsibility modules; type hints,
  docstrings, and meaningful comments; logic decoupled from the web framework.
- **Security** — strict input validation with bounds, key whitelisting, request
  size limit, security headers (CSP, `X-Frame-Options`, `nosniff`), no
  `eval`/`exec`, debug off by default, pinned dependencies, and an XSS-safe
  frontend that uses `textContent` (never raw HTML injection).
- **Efficiency** — O(1) arithmetic with no external API calls or database; the
  engine is pure and instantaneous.
- **Testing** — `pytest` suite covering validation, the footprint maths, the
  recommendation prioritisation, and the HTTP contract.
- **Accessibility** — semantic landmarks, a skip link, labelled controls,
  visible focus states, a screen-reader table mirroring the chart, live status
  regions, focus management, and `prefers-reduced-motion` support.

---

## Assumptions

- Emission factors are **representative averages**, not a certified audit; the
  goal is awareness and relative comparison, not regulatory precision.
- Household-shared sources (heating, electricity) are divided evenly across
  occupants.
- "Flights per year" is modelled as short-haul return trips (~500 kg CO₂e each).
- The app is stateless — no personal data is stored, which keeps it private by
  design.

---

## License

Released under the [MIT License](LICENSE).
