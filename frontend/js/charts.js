/* All Chart.js visualisations and the SVG gauge.
 * Chart is a global from the CDN UMD bundle (loaded before this module). */

import { $, CHART_COLORS, countUp, el, label, state } from "./core.js";

/** Doughnut of emission sources, with a synced legend and aria-label. */
export function renderDonut(items) {
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

/** Line chart of the monthly carbon score ("carbon journey"). */
export function renderTrend(trend) {
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

/** AI forecast: text summary + a line chart projecting the next period. */
export function renderForecast() {
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
  pred[trend.length - 1] = trend[trend.length - 1].score; // connect the lines
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

/** Bar chart of the user's emissions by category (tracker results). */
export function renderBreakdownChart(breakdown) {
  const entries = Object.entries(breakdown).filter(([, kg]) => kg > 0);
  const ctx = $("breakdown-chart").getContext("2d");
  if (state.charts.breakdown) state.charts.breakdown.destroy();
  state.charts.breakdown = new Chart(ctx, {
    type: "bar",
    data: { labels: entries.map(([k]) => label(k)), datasets: [{ data: entries.map(([, kg]) => kg), backgroundColor: "#16a34a", borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: "kg CO₂e / yr" } } } },
  });
}

/** Semicircular SVG gauge for the city sustainability index. */
export function renderGauge(value) {
  const gauge = $("gauge");
  gauge.replaceChildren();
  const circ = Math.PI * 70; // semicircle radius 70
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 180 100"); svg.setAttribute("width", "100%"); svg.style.maxWidth = "260px";
  const mk = (color, offset) => {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M 20 90 A 70 70 0 0 1 160 90");
    p.setAttribute("fill", "none"); p.setAttribute("stroke", color); p.setAttribute("stroke-width", "16");
    p.setAttribute("stroke-linecap", "round");
    if (offset != null) { p.setAttribute("stroke-dasharray", circ); p.setAttribute("stroke-dashoffset", offset); p.style.transition = "stroke-dashoffset 1.1s ease"; }
    return p;
  };
  svg.append(mk("#e2e8f0"));
  const fg = mk("#16a34a", circ);
  svg.append(fg);
  gauge.append(svg);
  const num = el("div", "gauge__value", "0");
  gauge.append(num, el("div", "gauge__caption", "out of 100 · higher is better"));
  setTimeout(() => fg.setAttribute("stroke-dashoffset", circ * (1 - value / 100)), 30);
  countUp(num, value, {});
}
