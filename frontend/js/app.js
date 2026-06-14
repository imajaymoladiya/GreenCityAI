/* GreenCityAI frontend logic.
 *
 * Three concerns, kept separate:
 *   1. The footprint calculator (form → /api/analyse → chart + plan).
 *   2. Curated YouTube resources for the user's top emission category.
 *   3. The streaming AI chat with Terra (/api/chat over Server-Sent Events).
 *
 * Security: all dynamic text is inserted with textContent and all links are
 * built from data the server returned — no raw HTML is ever injected, so the
 * UI has no XSS surface. External links open with rel="noopener noreferrer".
 */

"use strict";

const API = {
  options: "/api/options",
  analyse: "/api/analyse",
  resources: "/api/resources",
  chat: "/api/chat",
  status: "/api/status",
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
const label = (value) => LABELS[value] || value;

let chart = null;
let lastFootprint = null; // shared with the chat for grounded answers

/* ---------------- Calculator ---------------- */

function fillSelect(select, values, selected) {
  select.replaceChildren();
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label(value);
    if (value === selected) option.selected = true;
    select.append(option);
  }
}

async function loadOptions() {
  const res = await fetch(API.options);
  if (!res.ok) throw new Error("Could not load options.");
  const data = await res.json();
  fillSelect(document.getElementById("transport_mode"), data.transport_modes, "petrol_car");
  fillSelect(document.getElementById("diet"), data.diets, "average");
  fillSelect(document.getElementById("heating"), data.heating_types, "natural_gas");
}

function readForm(form) {
  const get = (name) => form.elements[name];
  return {
    transport_mode: get("transport_mode").value,
    diet: get("diet").value,
    heating: get("heating").value,
    daily_commute_km: Number(get("daily_commute_km").value),
    monthly_electricity_kwh: Number(get("monthly_electricity_kwh").value),
    flights_per_year: Number(get("flights_per_year").value),
    household_size: Number(get("household_size").value),
    recycles: get("recycles").checked,
  };
}

function renderChart(breakdown) {
  const entries = Object.entries(breakdown).filter(([, kg]) => kg > 0);
  const ctx = document.getElementById("breakdown-chart").getContext("2d");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: entries.map(([k]) => label(k)),
      datasets: [{
        label: "kg CO₂e / year",
        data: entries.map(([, kg]) => kg),
        backgroundColor: "#1eb872",
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "kg CO₂e / yr" } } },
    },
  });
}

function renderTable(breakdown) {
  const tbody = document.querySelector("#breakdown-table tbody");
  tbody.replaceChildren();
  for (const [key, kg] of Object.entries(breakdown)) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    const value = document.createElement("td");
    name.textContent = label(key);
    value.textContent = Math.round(kg).toLocaleString();
    row.append(name, value);
    tbody.append(row);
  }
}

function renderRecommendations(recs) {
  const list = document.getElementById("recommendations");
  list.replaceChildren();
  if (recs.length === 0) {
    const li = document.createElement("li");
    li.textContent = "You're already living lightly — keep it up!";
    list.append(li);
    return;
  }
  for (const rec of recs) {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = rec.message + " ";
    const saving = document.createElement("span");
    saving.className = "rec-saving";
    saving.textContent = `saves ~${Math.round(rec.estimated_saving_kg).toLocaleString()} kg/yr`;
    li.append(text, saving);
    list.append(li);
  }
}

const YT_ICON =
  '<svg class="yt-icon" viewBox="0 0 28 20" aria-hidden="true">' +
  '<rect width="28" height="20" rx="5" fill="#FF0000"/>' +
  '<path d="M11 6l7 4-7 4z" fill="#fff"/></svg>';

function topCategory(breakdown) {
  return Object.entries(breakdown).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

async function renderResources(breakdown) {
  const list = document.getElementById("resources");
  list.replaceChildren();
  const category = topCategory(breakdown);
  try {
    const res = await fetch(`${API.resources}?category=${encodeURIComponent(category)}`);
    if (!res.ok) return;
    const data = await res.json();
    for (const item of data[category] || []) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.innerHTML = YT_ICON; // static, trusted markup only
      const span = document.createElement("span");
      span.textContent = item.title;
      a.append(span);
      li.append(a);
      list.append(li);
    }
  } catch { /* resources are non-critical */ }
}

function renderSummary(data) {
  const badge = document.getElementById("rating-badge");
  document.getElementById("rating-letter").textContent = data.rating;
  badge.setAttribute("data-rating", data.rating);
  document.getElementById("total-tonnes").textContent = data.total_annual_tonnes;
  const vsAvg = Math.round(data.vs_global_average_pct);
  document.getElementById("comparison").textContent =
    vsAvg <= 100
      ? `That's ${100 - vsAvg}% below the global average. 🎉`
      : `That's ${vsAvg - 100}% above the global average — there's room to improve.`;
}

function setStatus(message, isError = false) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  setStatus("Crunching the numbers…");

  try {
    const res = await fetch(API.analyse, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(readForm(form)),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong.");

    lastFootprint = data;
    renderSummary(data);
    renderChart(data.breakdown);
    renderTable(data.breakdown);
    renderRecommendations(data.recommendations);
    await renderResources(data.breakdown);

    document.getElementById("results-empty").hidden = true;
    document.getElementById("results-body").hidden = false;
    setStatus("Done — here is your personalised plan.");
    document.getElementById("results-heading").focus();
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    button.disabled = false;
  }
}

/* ---------------- AI chat ---------------- */

const chat = {
  history: [], // {role, content} pairs sent to the API
};

function addMessage(role, text) {
  const log = document.getElementById("chat-log");
  const div = document.createElement("div");
  div.className = `msg ${role === "user" ? "user" : "bot"}`;
  div.textContent = text;
  log.append(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

/** Stream a reply from the server, updating one bot bubble as chunks arrive. */
async function streamChat(bubble) {
  const sendBtn = document.getElementById("chat-send");
  sendBtn.disabled = true;
  bubble.classList.add("typing");

  let full = "";
  try {
    const res = await fetch(API.chat, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chat.history, footprint: lastFootprint }),
    });
    if (!res.ok || !res.body) throw new Error("chat failed");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Parse the SSE stream incrementally: events are separated by "\n\n".
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop(); // keep the trailing partial event
      for (const evt of events) {
        const line = evt.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const payload = JSON.parse(line.slice(5).trim());
        if (payload.text) {
          full += payload.text;
          bubble.textContent = full;
          document.getElementById("chat-log").scrollTop = 1e9;
        } else if (payload.error && !full) {
          // Only show the error if nothing has streamed yet — never wipe a
          // reply that already arrived.
          full = payload.error;
          bubble.textContent = full;
        }
      }
    }
  } catch {
    full = "Sorry — I couldn't reach the assistant. Please try again.";
    bubble.textContent = full;
  } finally {
    bubble.classList.remove("typing");
    sendBtn.disabled = false;
  }

  chat.history.push({ role: "assistant", content: full });
}

function sendChat(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  addMessage("user", trimmed);
  chat.history.push({ role: "user", content: trimmed });
  const bubble = addMessage("bot", "");
  streamChat(bubble);
}

function openChat() {
  const panel = document.getElementById("chat-panel");
  panel.hidden = false;
  document.getElementById("chat-toggle").setAttribute("aria-expanded", "true");
  if (chat.history.length === 0) {
    addMessage("bot", "Hi! I'm Terra 🌱 Ask me anything about cutting your carbon footprint — or calculate yours and I'll tailor my advice.");
  }
  document.getElementById("chat-input").focus();
}

function closeChat() {
  document.getElementById("chat-panel").hidden = true;
  const toggle = document.getElementById("chat-toggle");
  toggle.setAttribute("aria-expanded", "false");
  toggle.focus();
}

const PROVIDER_LABELS = { groq: "Groq", claude: "Claude" };

async function showAiStatus() {
  try {
    const res = await fetch(API.status);
    const { ai_enabled, provider } = await res.json();
    const badge = document.getElementById("ai-badge");
    const text = document.getElementById("ai-badge-text");
    const dot = badge.querySelector(".ai-dot");
    text.textContent = ai_enabled
      ? `AI online · ${PROVIDER_LABELS[provider] || "AI"}`
      : "AI assistant (offline mode)";
    if (!ai_enabled) dot.classList.add("is-offline");
    badge.hidden = false;
  } catch { /* badge is optional */ }
}

/* ---------------- Wire-up ---------------- */

function init() {
  document.getElementById("results-heading").setAttribute("tabindex", "-1");
  document.getElementById("footprint-form").addEventListener("submit", onSubmit);

  document.getElementById("chat-toggle").addEventListener("click", openChat);
  document.getElementById("chat-close").addEventListener("click", closeChat);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("chat-panel").hidden) closeChat();
  });

  document.getElementById("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    sendChat(input.value);
    input.value = "";
  });

  document.getElementById("chat-suggestions").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) sendChat(chip.dataset.q);
  });

  loadOptions().catch(() =>
    setStatus("Could not reach the server. Is the backend running?", true)
  );
  showAiStatus();
}

document.addEventListener("DOMContentLoaded", init);
