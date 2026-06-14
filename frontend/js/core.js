/* Core: shared state, constants, and tiny DOM/animation helpers.
 * Imported by every other module — a single source of truth. */

export const API = {
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
export const label = (v) => LABELS[v] || v;

export const CHART_COLORS = ["#16a34a", "#22c55e", "#f59e0b", "#0ea5e9", "#a855f7", "#64748b"];

/** Shared, mutable app state (single instance across modules). */
export const state = { boot: null, footprint: null, charts: {}, chat: { history: [] } };

/** Shorthand for getElementById. */
export const $ = (id) => document.getElementById(id);

/** Create an element with an optional class and text content. */
export const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** Animate a number from 0 to `target`, with a guaranteed final value. */
export function countUp(node, target, { suffix = "", decimals = 0, duration = 900 } = {}) {
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

/** Map a 0-100 carbon score to a status label, CSS class, and colour. */
export function scoreStatus(score) {
  if (score <= 25) return { text: "Excellent", cls: "excellent", color: "#16a34a" };
  if (score <= 45) return { text: "Good", cls: "good", color: "#16a34a" };
  if (score <= 65) return { text: "Moderate", cls: "moderate", color: "#f59e0b" };
  return { text: "High", cls: "high", color: "#ef4444" };
}

/** Show a status line under the tracker results. */
export function setStatus(msg, isError = false) {
  const s = $("status");
  s.textContent = msg;
  s.classList.toggle("error", isError);
}
