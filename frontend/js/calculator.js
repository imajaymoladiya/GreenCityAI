/* The Carbon Tracker: load options, submit the form, render results, and
 * propagate the computed footprint to the live dashboard. */

import { $, API, countUp, el, label, setStatus, state } from "./core.js";
import { renderBreakdownChart, renderDonut } from "./charts.js";
import { breakdownToPct, renderRecommendations, setHero } from "./dashboard.js";

function fillSelect(select, values, selected) {
  select.replaceChildren();
  for (const v of values) {
    const o = el("option"); o.value = v; o.textContent = label(v);
    if (v === selected) o.selected = true;
    select.append(o);
  }
}

/** Populate the form's dropdowns from the API (single source of truth). */
export async function loadOptions() {
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

// Trusted, static markup — never built from server data.
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
  } catch { /* learning resources are non-critical */ }
}

/** Handle form submission end-to-end and refresh the dashboard. */
export async function onSubmit(event) {
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
