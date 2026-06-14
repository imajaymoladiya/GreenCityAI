/* Dashboard widgets: profile, hero score ring, KPI cards, AI recommendations,
 * and the smart alert center. */

import { $, countUp, el, label, scoreStatus } from "./core.js";

export function renderProfile(p) {
  $("profile-initials").textContent = p.initials;
  $("topbar-avatar").textContent = p.initials;
  $("profile-name").textContent = p.name;
  $("profile-level").textContent = p.level;
  $("hello-name").textContent = p.name.split(" ")[0];
  countUp($("profile-points"), p.points, {});
}

/** Animate the hero ring + score and fill in the supporting metrics. */
export function setHero(score, boot) {
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

export function renderKpis(boot) {
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

/** Convert engine breakdown {category: kg} into [{category, pct, kg}], desc. */
export function breakdownToPct(breakdown) {
  const entries = Object.entries(breakdown).filter(([, kg]) => kg > 0);
  const total = entries.reduce((s, [, kg]) => s + kg, 0) || 1;
  return entries
    .map(([category, kg]) => ({ category: label(category), pct: Math.round((kg / total) * 100), kg }))
    .sort((a, b) => b.kg - a.kg);
}

function recCard(r) {
  const card = el("div", "rec");
  card.append(el("p", "rec__title", r.title));
  const meta = el("div", "rec__meta");
  meta.append(el("span", "rec__impact", `−${r.impact_kg_month} kg CO₂/mo`));
  meta.append(el("span", "rec__diff diff-" + r.difficulty, r.difficulty));
  if (r.savings_inr_month) meta.append(el("span", "rec__save", `≈ ₹${r.savings_inr_month}/mo`));
  card.append(meta);
  const btn = el("button", "rec__btn", "Apply recommendation");
  btn.addEventListener("click", () => { btn.textContent = "✓ Applied"; btn.classList.add("is-applied"); btn.disabled = true; });
  card.append(btn);
  return card;
}

export function renderRecommendations(recs) {
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

export function renderAlerts(alerts) {
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
