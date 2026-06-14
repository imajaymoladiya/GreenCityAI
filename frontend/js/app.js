/* GreenCityAI — Smart City platform frontend.
 *
 * A small vanilla-JS single-page app: a view router, data wiring to the Flask
 * API, Chart.js visualisations, SVG ring/gauge, count-up animations, and the
 * streaming Terra chat. All dynamic text uses textContent and all external
 * links use rel="noopener noreferrer", so there is no XSS surface.
 */

"use strict";

const API = {
  options: "/api/options", analyse: "/api/analyse", resources: "/api/resources",
  chat: "/api/chat", status: "/api/status", bootstrap: "/api/bootstrap",
};

const LABELS = {
  petrol_car: "Petrol car", diesel_car: "Diesel car", electric_car: "Electric car",
  motorbike: "Motorbike", bus: "Bus", train: "Train", bicycle: "Bicycle", walk: "Walking",
  meat_heavy: "Meat with most meals", average: "Average / mixed", low_meat: "Low meat",
  vegetarian: "Vegetarian", vegan: "Vegan",
  natural_gas: "Natural gas", oil: "Oil", electric: "Electric", heat_pump: "Heat pump", none: "None",
  transport: "Transport", diet: "Diet", home_heating: "Home heating",
  electricity: "Electricity", flights: "Flights", waste: "Waste",
};
const label = (v) => LABELS[v] || v;
const CHART_COLORS = ["#16a34a", "#22c55e", "#f59e0b", "#0ea5e9", "#a855f7", "#64748b"];

const state = { boot: null, footprint: null, charts: {}, chat: { history: [] } };
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/* ----------------------------- Animations ----------------------------- */
function countUp(node, target, { suffix = "", decimals = 0, duration = 900 } = {}) {
  const finalText = target.toFixed(decimals) + suffix;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || document.hidden) { node.textContent = finalText; return; }
  const start = performance.now();
  function step(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = (target * eased).toFixed(decimals) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  // Safety net: guarantee the final value even if rAF is throttled (e.g. the
  // tab is backgrounded), so a number never gets stuck mid-animation.
  setTimeout(() => (node.textContent = finalText), duration + 80);
}

/* ----------------------------- Status helpers ----------------------------- */
function scoreStatus(score) {
  if (score <= 25) return { text: "Excellent", cls: "excellent", color: "#16a34a" };
  if (score <= 45) return { text: "Good", cls: "good", color: "#16a34a" };
  if (score <= 65) return { text: "Moderate", cls: "moderate", color: "#f59e0b" };
  return { text: "High", cls: "high", color: "#ef4444" };
}

/* ============================== ROUTER ============================== */
function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== `view-${name}`));
  document.querySelectorAll("[data-view]").forEach((b) => {
    const active = b.dataset.view === name;
    b.classList.toggle("is-active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $("sidebar").classList.remove("is-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
  // Charts created while hidden render at 0px — resize them now they're visible.
  if (name === "insights") renderForecast();
  Object.values(state.charts).forEach((c) => c && c.resize());
}

/* ============================== DASHBOARD ============================== */
function renderProfile(p) {
  $("profile-initials").textContent = p.initials;
  $("topbar-avatar").textContent = p.initials;
  $("profile-name").textContent = p.name;
  $("profile-level").textContent = p.level;
  $("hello-name").textContent = p.name.split(" ")[0];
  countUp($("profile-points"), p.points, {});
}

function setHero(score, boot) {
  const st = scoreStatus(score);
  const ring = $("hero-ring");
  const circ = 2 * Math.PI * 84;
  ring.style.strokeDasharray = circ;
  ring.style.strokeDashoffset = circ * (1 - score / 100);
  ring.style.stroke = st.color;
  countUp($("hero-score"), score, {});
  const statusEl = $("hero-status");
  statusEl.textContent = st.text;
  statusEl.className = `hero__status status--${st.cls}`;
  $("hero-city-avg").textContent = boot.city.index.avg_carbon_score + "%";
  $("hero-rank").textContent = "#" + boot.profile.rank;
  $("hero-co2").textContent = "125 kg";
  const tr = $("hero-trend");
  const f = boot.insights.forecast;
  tr.textContent = f.direction === "up" ? "↑ rising" : "↓ improving";
  tr.className = f.direction === "up" ? "trend-up" : "trend-down";
}

function renderKpis(boot) {
  const data = [
    { icon: "🌍", label: "CO₂ Saved (mo)", value: 125, suffix: " kg", trend: "+18%", up: true },
    { icon: "⭐", label: "Green Points", value: boot.profile.points, suffix: "", trend: boot.profile.level, up: true },
    { icon: "🏅", label: "Leaderboard Rank", value: boot.profile.rank, suffix: "", prefix: "#", trend: "Top 1%", up: true },
    { icon: "🔥", label: "Eco Streak", value: boot.profile.streak_days, suffix: " days", trend: "Active", up: true },
  ];
  const grid = $("kpi-grid");
  grid.replaceChildren();
  for (const k of data) {
    const card = el("div", "kpi");
    card.append(el("div", "kpi__icon", k.icon), el("div", "kpi__label", k.label));
    const val = el("div", "kpi__value");
    if (k.prefix) val.textContent = k.prefix;
    const num = el("span"); val.append(num);
    if (k.suffix) val.append(document.createTextNode(k.suffix));
    card.append(val, el("div", "kpi__trend " + (k.up ? "up" : "down"), k.trend));
    grid.append(card);
    countUp(num, k.value, {});
  }
}

function breakdownToPct(breakdown) {
  // Convert engine breakdown {category: kg} into [{category, pct, kg}] sorted desc.
  const entries = Object.entries(breakdown).filter(([, kg]) => kg > 0);
  const total = entries.reduce((s, [, kg]) => s + kg, 0) || 1;
  return entries
    .map(([category, kg]) => ({ category: label(category), pct: Math.round((kg / total) * 100), kg }))
    .sort((a, b) => b.kg - a.kg);
}

function renderDonut(items) {
  const ctx = $("donut-chart").getContext("2d");
  if (state.charts.donut) state.charts.donut.destroy();
  state.charts.donut = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: items.map((i) => i.category),
      datasets: [{ data: items.map((i) => i.pct), backgroundColor: CHART_COLORS, borderWidth: 0, hoverOffset: 8 }],
    },
    options: { cutout: "64%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw}%` } } } },
  });
  $("donut-chart").setAttribute("aria-label",
    "Emission sources: " + items.map((i) => `${i.category} ${i.pct}%`).join(", "));
  const legend = $("donut-legend");
  legend.replaceChildren();
  items.forEach((it, i) => {
    const li = el("li");
    const sw = el("span", "swatch"); sw.style.background = CHART_COLORS[i % CHART_COLORS.length];
    li.append(sw, el("span", null, it.category), el("span", "legend-pct", it.pct + "%"));
    legend.append(li);
  });
}

function renderTrend(trend) {
  $("trend-chart").setAttribute("aria-label",
    "Monthly carbon score: " + trend.map((t) => `${t.month} ${t.score}%`).join(", "));
  const ctx = $("trend-chart").getContext("2d");
  if (state.charts.trend) state.charts.trend.destroy();
  state.charts.trend = new Chart(ctx, {
    type: "line",
    data: {
      labels: trend.map((t) => t.month),
      datasets: [{
        data: trend.map((t) => t.score), label: "Carbon score",
        borderColor: "#16a34a", backgroundColor: "rgba(22,163,74,0.12)",
        fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: "#16a34a", borderWidth: 3,
      }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: "Score (lower is greener)" } } } },
  });
}

function difficultyClass(d) { return "rec__diff diff-" + d; }

function recCard(r) {
  const card = el("div", "rec");
  card.append(el("p", "rec__title", r.title));
  const meta = el("div", "rec__meta");
  meta.append(el("span", "rec__impact", `−${r.impact_kg_month} kg CO₂/mo`));
  meta.append(el("span", difficultyClass(r.difficulty), r.difficulty));
  if (r.savings_inr_month) meta.append(el("span", "rec__save", `≈ ₹${r.savings_inr_month}/mo`));
  card.append(meta);
  const btn = el("button", "rec__btn", "Apply recommendation");
  btn.addEventListener("click", () => { btn.textContent = "✓ Applied"; btn.classList.add("is-applied"); btn.disabled = true; });
  card.append(btn);
  return card;
}

function renderRecommendations(recs) {
  for (const id of ["rec-list", "rec-grid"]) {
    const box = $(id);
    if (!box) continue;
    box.replaceChildren();
    recs.forEach((r) => box.append(recCard(r)));
  }
}

function alertCard(a) {
  const icon = { warning: "⚠️", success: "✅", info: "ℹ️" }[a.severity] || "•";
  const card = el("div", `alert alert--${a.severity}`);
  card.append(el("span", "alert__icon", icon));
  const body = el("div");
  body.append(el("p", "alert__title", a.title), el("p", "alert__detail", a.detail));
  card.append(body);
  return card;
}

function renderAlerts(alerts) {
  for (const id of ["alert-list", "alert-list-2", "alert-list-3"]) {
    const box = $(id);
    if (!box) continue;
    box.replaceChildren();
    alerts.forEach((a) => box.append(alertCard(a)));
  }
  const count = alerts.filter((a) => a.severity === "warning").length;
  $("bell-count").textContent = count || "";
  $("nav-alert-count").textContent = count || "";
}

/* ============================== REWARDS ============================== */
function renderRewards(boot) {
  $("rewards-level").textContent = boot.profile.level;
  $("rewards-points").textContent = boot.profile.points.toLocaleString();
  $("rewards-next").textContent = boot.profile.points_for_next.toLocaleString();
  // setTimeout (not rAF) so the bar still fills if the tab is backgrounded.
  setTimeout(() => ($("rewards-progress").style.width = boot.profile.level_progress_pct + "%"), 30);
  const grid = $("reward-grid");
  grid.replaceChildren();
  for (const r of boot.rewards) {
    const card = el("div", "reward");
    card.append(el("div", "reward__icon", r.icon), el("p", "reward__name", r.name), el("p", "reward__desc", r.description));
    card.append(el("span", `reward__status ${r.unlocked ? "unlocked" : "locked"}`,
      r.unlocked ? "Unlocked" : `🔒 ${r.cost} pts`));
    grid.append(card);
  }
}

/* ============================== COMMUNITY ============================== */
function renderChallengeCard(container, c) {
  container.replaceChildren();
  container.append(el("h3", null, "🏆 " + c.name));
  container.append(el("p", null, `Goal: reduce ${c.goal_tons} tonnes CO₂ this month`));
  const prog = el("div", "progress");
  const bar = el("div", "progress__bar"); prog.append(bar);
  container.append(prog);
  setTimeout(() => (bar.style.width = c.progress_pct + "%"), 30);
  const row = el("div", "challenge__row");
  const mk = (lbl, val) => { const d = el("div"); d.append(el("b", null, val), document.createTextNode(lbl)); return d; };
  row.append(mk("Completed", `${c.completed_tons} / ${c.goal_tons} t`), mk("Progress", c.progress_pct + "%"),
    mk("Participants", c.participants.toLocaleString()), mk("Days left", c.days_left));
  container.append(row);
}

function renderCommunity(boot) {
  renderChallengeCard($("community-challenge"), boot.city.challenge);
  // Podium (top 3)
  const podium = $("podium");
  podium.replaceChildren();
  const top = boot.city.leaderboard.slice(0, 3);
  const order = [1, 0, 2]; // silver, gold, bronze visual order
  const heights = { 0: 90, 1: 64, 2: 50 };
  order.forEach((idx) => {
    const u = top[idx]; if (!u) return;
    const col = el("div", "podium__col");
    col.append(el("div", "podium__avatar", u.name.split(" ").map((w) => w[0]).slice(0, 2).join("")));
    col.append(el("div", "podium__name", u.name), el("div", "podium__pts", u.points.toLocaleString() + " pts"));
    const stand = el("div", "podium__stand", "#" + u.rank); stand.style.height = heights[idx] + "px";
    col.append(stand);
    podium.append(col);
  });
  // Table
  const table = $("leaderboard");
  table.replaceChildren();
  const head = el("tr");
  ["Rank", "Citizen", "Points", "Carbon Score", "Badge"].forEach((h) => head.append(el("th", null, h)));
  const thead = el("thead"); thead.append(head); table.append(thead);
  const tbody = el("tbody");
  boot.city.leaderboard.forEach((u) => {
    const tr = el("tr"); if (u.is_you) tr.className = "is-you";
    tr.append(el("td", "rank-pill", "#" + u.rank), el("td", null, u.name), el("td", null, u.points.toLocaleString()), el("td", null, u.carbon_score + "%"));
    const badge = el("td"); badge.append(el("span", "badge-tag", u.badge)); tr.append(badge);
    tbody.append(tr);
  });
  table.append(tbody);
}

/* ============================== CITY ANALYTICS ============================== */
function renderGauge(value) {
  const gauge = $("gauge");
  gauge.replaceChildren();
  const r = 70, circ = Math.PI * r; // semicircle
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 180 100"); svg.setAttribute("width", "100%"); svg.style.maxWidth = "260px";
  const mk = (cls, color, offset) => {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M 20 90 A 70 70 0 0 1 160 90");
    p.setAttribute("fill", "none"); p.setAttribute("stroke", color); p.setAttribute("stroke-width", "16");
    p.setAttribute("stroke-linecap", "round");
    if (offset != null) { p.setAttribute("stroke-dasharray", circ); p.setAttribute("stroke-dashoffset", offset); p.style.transition = "stroke-dashoffset 1.1s ease"; }
    return p;
  };
  svg.append(mk("bg", "#e2e8f0"));
  const fg = mk("fg", "#16a34a", circ);
  svg.append(fg);
  gauge.append(svg);
  const num = el("div", "gauge__value", "0");
  gauge.append(num, el("div", "gauge__caption", "out of 100 · higher is better"));
  setTimeout(() => fg.setAttribute("stroke-dashoffset", circ * (1 - value / 100)), 30);
  countUp(num, value, {});
}

function renderCity(boot) {
  renderGauge(boot.city.index.sustainability_index);
  const m = boot.city.index;
  const metrics = [
    ["Total Citizens", m.total_citizens.toLocaleString()],
    ["Avg Carbon Score", m.avg_carbon_score + "%"],
    ["Total CO₂ Saved", m.total_co2_saved_tons + " t"],
    ["Most Sustainable", m.best_area],
    ["Highest Emission", m.worst_area],
    ["Sustainability Index", m.sustainability_index + "/100"],
  ];
  const grid = $("city-metrics");
  grid.replaceChildren();
  metrics.forEach(([lbl, val]) => {
    const c = el("div", "metric");
    c.append(el("div", "metric__label", lbl), el("div", "metric__value", val));
    grid.append(c);
  });
  const heat = $("heatmap");
  heat.replaceChildren();
  boot.city.areas.forEach((a) => {
    const tile = el("div", `heat-tile ${a.level}`);
    tile.append(el("div", "heat-tile__name", a.name), el("div", "heat-tile__score", a.score),
      el("div", "heat-tile__lvl", a.level + " emission"));
    heat.append(tile);
  });
}

/* ============================== CHALLENGES ============================== */
function renderChallenges(boot) {
  const grid = $("challenge-grid");
  grid.replaceChildren();
  const c = boot.city.challenge;
  const items = [
    { icon: "🏙️", name: c.name, desc: `Reduce ${c.goal_tons} t CO₂ city-wide · ${c.progress_pct}% done`, status: `${c.participants.toLocaleString()} joined` },
    { icon: "🚲", name: "Car-Free Week", desc: "Skip the car for 7 days and log your trips.", status: "+150 pts" },
    { icon: "💡", name: "Energy Saver", desc: "Cut home electricity 10% this month.", status: "+120 pts" },
    { icon: "🥗", name: "Meatless Mondays", desc: "Go plant-based every Monday in June.", status: "+90 pts" },
  ];
  items.forEach((it) => {
    const card = el("div", "reward");
    card.append(el("div", "reward__icon", it.icon), el("p", "reward__name", it.name), el("p", "reward__desc", it.desc));
    card.append(el("span", "reward__status unlocked", it.status));
    grid.append(card);
  });
}

/* ============================== PROFILE ============================== */
function renderProfileDetail(boot) {
  const box = $("profile-detail");
  box.replaceChildren();
  box.append(el("div", "profile-detail__avatar", boot.profile.initials));
  const stats = el("div", "profile-stats");
  const add = (lbl, val) => { const m = el("div", "metric"); m.append(el("div", "metric__label", lbl), el("div", "metric__value", val)); stats.append(m); };
  add("Name", boot.profile.name);
  add("Level", boot.profile.level);
  add("Points", boot.profile.points.toLocaleString());
  add("City Rank", "#" + boot.profile.rank);
  add("Eco Streak", boot.profile.streak_days + " days");
  add("Next Level", boot.profile.next_level);
  box.append(stats);
}

/* ============================== FORECAST ============================== */
function renderForecast() {
  if (!state.boot) return;
  const f = state.boot.insights.forecast;
  const box = $("forecast");
  box.replaceChildren();
  box.append(el("div", "forecast__num", f.predicted_score + "%"));
  const txt = el("div", "forecast__txt");
  txt.append(el("strong", null, "Predicted carbon score next period"));
  const note = f.exceeds_threshold
    ? `⚠ You may exceed the recommended threshold of ${f.threshold}%.`
    : f.direction === "down" ? "✅ You're trending greener — keep it up!" : "Holding steady.";
  txt.append(document.createElement("br"), document.createTextNode(note));
  box.append(txt);
  const trend = state.boot.insights.trend;
  const labels = trend.map((t) => t.month).concat(["Next"]);
  const base = trend.map((t) => t.score).concat([null]);
  const pred = trend.map(() => null).concat([f.predicted_score]);
  pred[trend.length - 1] = trend[trend.length - 1].score; // connect line
  const ctx = $("forecast-chart").getContext("2d");
  if (state.charts.forecast) state.charts.forecast.destroy();
  state.charts.forecast = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { data: base, borderColor: "#16a34a", backgroundColor: "rgba(22,163,74,0.1)", fill: true, tension: 0.4, pointRadius: 3, borderWidth: 3 },
        { data: pred, borderColor: "#f59e0b", borderDash: [6, 5], tension: 0.4, pointRadius: 5, pointBackgroundColor: "#f59e0b", borderWidth: 3 },
      ],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } },
  });
}

/* ============================== CALCULATOR ============================== */
function fillSelect(select, values, selected) {
  select.replaceChildren();
  for (const v of values) {
    const o = el("option"); o.value = v; o.textContent = label(v);
    if (v === selected) o.selected = true; select.append(o);
  }
}

async function loadOptions() {
  const res = await fetch(API.options);
  if (!res.ok) throw new Error("options");
  const d = await res.json();
  fillSelect($("transport_mode"), d.transport_modes, "petrol_car");
  fillSelect($("diet"), d.diets, "average");
  fillSelect($("heating"), d.heating_types, "natural_gas");
}

function readForm(form) {
  const g = (n) => form.elements[n];
  return {
    transport_mode: g("transport_mode").value, diet: g("diet").value, heating: g("heating").value,
    daily_commute_km: Number(g("daily_commute_km").value),
    monthly_electricity_kwh: Number(g("monthly_electricity_kwh").value),
    flights_per_year: Number(g("flights_per_year").value),
    household_size: Number(g("household_size").value), recycles: g("recycles").checked,
  };
}

function renderBreakdownChart(breakdown) {
  const entries = Object.entries(breakdown).filter(([, kg]) => kg > 0);
  const ctx = $("breakdown-chart").getContext("2d");
  if (state.charts.breakdown) state.charts.breakdown.destroy();
  state.charts.breakdown = new Chart(ctx, {
    type: "bar",
    data: { labels: entries.map(([k]) => label(k)), datasets: [{ data: entries.map(([, kg]) => kg), backgroundColor: "#16a34a", borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: "kg CO₂e / yr" } } } },
  });
}

function renderResultTable(breakdown) {
  const tbody = document.querySelector("#breakdown-table tbody");
  tbody.replaceChildren();
  for (const [k, kg] of Object.entries(breakdown)) {
    const tr = el("tr");
    tr.append(el("td", null, label(k)), el("td", null, Math.round(kg).toLocaleString()));
    tbody.append(tr);
  }
}

function renderResultRecs(recs) {
  const list = $("recommendations");
  list.replaceChildren();
  if (!recs.length) { list.append(el("li", null, "You're already living lightly — keep it up!")); return; }
  for (const r of recs) {
    const li = el("li");
    li.append(el("span", null, r.message + " "));
    li.append(el("span", "rec-saving", `saves ~${Math.round(r.estimated_saving_kg).toLocaleString()} kg/yr`));
    list.append(li);
  }
}

const YT_ICON = '<svg class="yt-icon" viewBox="0 0 28 20" aria-hidden="true"><rect width="28" height="20" rx="5" fill="#FF0000"/><path d="M11 6l7 4-7 4z" fill="#fff"/></svg>';

async function renderResources(breakdown) {
  const list = $("resources"); list.replaceChildren();
  const top = Object.entries(breakdown).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  try {
    const res = await fetch(`${API.resources}?category=${encodeURIComponent(top)}`);
    if (!res.ok) return;
    const data = await res.json();
    for (const item of data[top] || []) {
      const li = el("li"); const a = el("a");
      a.href = item.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.innerHTML = YT_ICON; a.append(el("span", null, item.title));
      li.append(a); list.append(li);
    }
  } catch { /* non-critical */ }
}

function setStatus(msg, isError = false) {
  const s = $("status"); s.textContent = msg; s.classList.toggle("error", isError);
}

async function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true; setStatus("Crunching the numbers…");
  try {
    const res = await fetch(API.analyse, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(readForm(form)) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    state.footprint = data;

    // Tracker results
    $("rating-letter").textContent = data.rating;
    $("rating-badge").setAttribute("data-rating", data.rating);
    countUp($("total-tonnes"), data.total_annual_tonnes, { decimals: 2 });
    const vs = Math.round(data.vs_global_average_pct);
    $("comparison").textContent = vs <= 100 ? `That's ${100 - vs}% below the global average. 🎉` : `That's ${vs - 100}% above the global average — room to improve.`;
    renderBreakdownChart(data.breakdown);
    renderResultTable(data.breakdown);
    renderResultRecs(data.recommendations);
    await renderResources(data.breakdown);
    $("results-empty").hidden = true;
    $("results-body").hidden = false;
    setStatus("Done — your dashboard has been updated.");

    // Propagate to the live dashboard
    setHero(data.score, state.boot);
    renderDonut(breakdownToPct(data.breakdown));
    if (data.recommendation_cards && data.recommendation_cards.length) renderRecommendations(data.recommendation_cards);
    $("results-heading").focus();
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

/* ============================== TERRA CHAT ============================== */
function addMessage(role, text) {
  const log = $("chat-log");
  const div = el("div", `msg ${role === "user" ? "user" : "bot"}`, text);
  log.append(div); log.scrollTop = log.scrollHeight;
  return div;
}

async function streamChat(bubble) {
  const sendBtn = $("chat-send"); sendBtn.disabled = true; bubble.classList.add("typing");
  let full = "";
  try {
    const res = await fetch(API.chat, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: state.chat.history, footprint: state.footprint }) });
    if (!res.ok || !res.body) throw new Error("chat");
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const events = buf.split("\n\n"); buf = events.pop();
      for (const evt of events) {
        const line = evt.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const payload = JSON.parse(line.slice(5).trim());
        if (payload.text) { full += payload.text; bubble.textContent = full; $("chat-log").scrollTop = 1e9; }
        else if (payload.error && !full) { full = payload.error; bubble.textContent = full; }
      }
    }
  } catch { full = "Sorry — I couldn't reach the assistant. Please try again."; bubble.textContent = full; }
  finally { bubble.classList.remove("typing"); sendBtn.disabled = false; }
  state.chat.history.push({ role: "assistant", content: full });
}

function sendChat(text) {
  const t = text.trim(); if (!t) return;
  addMessage("user", t);
  state.chat.history.push({ role: "user", content: t });
  streamChat(addMessage("bot", ""));
}

function openChat() {
  $("chat-panel").hidden = false;
  $("chat-toggle").setAttribute("aria-expanded", "true");
  if (state.chat.history.length === 0)
    addMessage("bot", "Hi! I'm Terra 🌱 your AI sustainability coach. Ask me anything, or calculate your footprint and I'll tailor my advice.");
  $("chat-input").focus();
}
function closeChat() {
  $("chat-panel").hidden = true;
  const t = $("chat-toggle"); t.setAttribute("aria-expanded", "false"); t.focus();
}

/* ============================== STATUS / BOOT ============================== */
async function showAiStatus() {
  try {
    const { ai_enabled, provider } = await (await fetch(API.status)).json();
    const labels = { groq: "Terra AI · Groq", claude: "Terra AI · Claude" };
    $("ai-pill-text").textContent = ai_enabled ? labels[provider] || "Terra AI" : "Terra (offline)";
    if (!ai_enabled) $("ai-pill").querySelector(".ai-dot").classList.add("is-offline");
    $("settings-ai").textContent = ai_enabled ? (provider === "groq" ? "Groq (Llama 3.3)" : "Claude Opus 4.8") : "Offline fallback";
  } catch { /* optional */ }
}

function renderAll(boot) {
  renderProfile(boot.profile);
  setHero(boot.insights.demo_score, boot);
  renderKpis(boot);
  renderDonut(boot.insights.demo_breakdown.map((b) => ({ category: b.category, pct: b.pct })));
  renderTrend(boot.insights.trend);
  renderRecommendations(boot.insights.recommendations);
  renderAlerts(boot.insights.alerts);
  renderRewards(boot);
  renderCommunity(boot);
  renderCity(boot);
  renderChallenges(boot);
  renderProfileDetail(boot);
  // City selectors
  const sels = [$("city-selector"), $("settings-city")];
  sels.forEach((s) => { s.replaceChildren(); boot.cities.forEach((c) => { const o = el("option"); o.value = c; o.textContent = c; s.append(o); }); });
  $("hello-city").textContent = boot.cities[0];
}

function init() {
  // Navigation
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.go)));
  $("menu-toggle").addEventListener("click", () => $("sidebar").classList.toggle("is-open"));
  $("bell-btn").addEventListener("click", () => switchView("notifications"));
  [$("city-selector"), $("settings-city")].forEach((s) => s.addEventListener("change", (e) => {
    $("hello-city").textContent = e.target.value;
    $("city-selector").value = e.target.value; $("settings-city").value = e.target.value;
  }));

  // Calculator + chat
  $("footprint-form").addEventListener("submit", onSubmit);
  $("chat-toggle").addEventListener("click", openChat);
  $("chat-close").addEventListener("click", closeChat);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("chat-panel").hidden) closeChat(); });
  $("chat-form").addEventListener("submit", (e) => { e.preventDefault(); sendChat($("chat-input").value); $("chat-input").value = ""; });
  $("chat-suggestions").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) { openChat(); sendChat(c.dataset.q); } });

  loadOptions().catch(() => setStatus("Could not reach the server.", true));
  showAiStatus();
  fetch(API.bootstrap).then((r) => r.json()).then((boot) => { state.boot = boot; renderAll(boot); })
    .catch(() => setStatus("Could not load dashboard data.", true));
}

document.addEventListener("DOMContentLoaded", init);
