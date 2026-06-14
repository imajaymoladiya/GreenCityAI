/* Entry point: the view router, status badge, initial data load, and event
 * wiring. Imported as a module, so it runs after the DOM is parsed. */

import { $, API, el, setStatus, state } from "./core.js";
import { renderDonut, renderForecast, renderTrend } from "./charts.js";
import {
  renderAlerts, renderKpis, renderProfile, renderRecommendations, setHero,
} from "./dashboard.js";
import {
  renderChallenges, renderCity, renderCommunity, renderProfileDetail, renderRewards,
} from "./sections.js";
import { loadOptions, onSubmit } from "./calculator.js";
import { closeChat, openChat, sendChat } from "./chat.js";

/** Show one view, sync the nav state, and resize any now-visible charts. */
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
  // Charts created while hidden render at 0px — (re)draw/resize when visible.
  if (name === "insights") renderForecast();
  Object.values(state.charts).forEach((c) => c && c.resize());
}

async function showAiStatus() {
  try {
    const { ai_enabled, provider } = await (await fetch(API.status)).json();
    const labels = { groq: "Terra AI · Groq", claude: "Terra AI · Claude" };
    $("ai-pill-text").textContent = ai_enabled ? labels[provider] || "Terra AI" : "Terra (offline)";
    if (!ai_enabled) $("ai-pill").querySelector(".ai-dot").classList.add("is-offline");
    $("settings-ai").textContent = ai_enabled
      ? (provider === "groq" ? "Groq (Llama 3.3)" : "Claude Opus 4.8")
      : "Offline fallback";
  } catch { /* the status badge is optional */ }
}

/** Render every section from the bootstrap payload. */
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
  // City selectors (top bar + settings)
  [$("city-selector"), $("settings-city")].forEach((s) => {
    s.replaceChildren();
    boot.cities.forEach((c) => { const o = el("option"); o.value = c; o.textContent = c; s.append(o); });
  });
  $("hello-city").textContent = boot.cities[0];
}

function wireEvents() {
  document.querySelectorAll("[data-view]").forEach((b) =>
    b.addEventListener("click", () => switchView(b.dataset.view)));
  document.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => switchView(b.dataset.go)));
  $("menu-toggle").addEventListener("click", () => $("sidebar").classList.toggle("is-open"));
  $("bell-btn").addEventListener("click", () => switchView("notifications"));
  [$("city-selector"), $("settings-city")].forEach((s) => s.addEventListener("change", (e) => {
    $("hello-city").textContent = e.target.value;
    $("city-selector").value = e.target.value;
    $("settings-city").value = e.target.value;
  }));

  $("footprint-form").addEventListener("submit", onSubmit);
  $("chat-toggle").addEventListener("click", openChat);
  $("chat-close").addEventListener("click", closeChat);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("chat-panel").hidden) closeChat(); });
  $("chat-form").addEventListener("submit", (e) => { e.preventDefault(); sendChat($("chat-input").value); $("chat-input").value = ""; });
  $("chat-suggestions").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) { openChat(); sendChat(c.dataset.q); } });
}

function init() {
  wireEvents();
  loadOptions().catch(() => setStatus("Could not reach the server.", true));
  showAiStatus();
  fetch(API.bootstrap)
    .then((r) => r.json())
    .then((boot) => { state.boot = boot; renderAll(boot); })
    .catch(() => setStatus("Could not load dashboard data.", true));
}

// Module scripts run after parsing; init now, or on DOMContentLoaded if needed.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
