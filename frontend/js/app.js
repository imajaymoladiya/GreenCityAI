/* GreenCityAI frontend logic.
 *
 * Responsibilities:
 *   - populate the form's dropdowns from the API (single source of truth),
 *   - submit the user's context and render the analysis,
 *   - keep the UI accessible (status messages, text table, focus management).
 *
 * The code uses no inline event handlers and never injects raw HTML from the
 * server, which keeps the surface clear of XSS. All dynamic text is set with
 * textContent.
 */

"use strict";

const API = {
  options: "/api/options",
  analyse: "/api/analyse",
};

// Human-readable labels for machine values returned by the API.
const LABELS = {
  petrol_car: "Petrol car",
  diesel_car: "Diesel car",
  electric_car: "Electric car",
  motorbike: "Motorbike",
  bus: "Bus",
  train: "Train",
  bicycle: "Bicycle",
  walk: "Walking",
  meat_heavy: "Meat with most meals",
  average: "Average / mixed",
  low_meat: "Low meat",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  natural_gas: "Natural gas",
  oil: "Oil",
  electric: "Electric",
  heat_pump: "Heat pump",
  none: "None",
  transport: "Transport",
  diet: "Diet",
  home_heating: "Home heating",
  electricity: "Electricity",
  flights: "Flights",
  waste: "Waste",
};

const label = (value) => LABELS[value] || value;

let chart = null;

/** Replace a <select>'s contents with the given option values. */
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

/** Load valid choices from the API and populate the dropdowns. */
async function loadOptions() {
  const res = await fetch(API.options);
  if (!res.ok) throw new Error("Could not load options.");
  const data = await res.json();
  fillSelect(document.getElementById("transport_mode"), data.transport_modes, "petrol_car");
  fillSelect(document.getElementById("diet"), data.diets, "average");
  fillSelect(document.getElementById("heating"), data.heating_types, "natural_gas");
}

/** Read the form into a plain object with correctly typed values. */
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

/** Draw (or redraw) the breakdown bar chart. */
function renderChart(breakdown) {
  const entries = Object.entries(breakdown).filter(([, kg]) => kg > 0);
  const labels = entries.map(([key]) => label(key));
  const values = entries.map(([, kg]) => kg);

  const ctx = document.getElementById("breakdown-chart").getContext("2d");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "kg CO₂e / year",
          data: values,
          backgroundColor: "#22c55e",
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "kg CO₂e / yr" } } },
    },
  });
}

/** Fill the screen-reader table that mirrors the chart. */
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

/** Render the prioritised recommendation list. */
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

/** Render the headline summary (rating, total, comparison). */
function renderSummary(data) {
  document.getElementById("rating-letter").textContent = data.rating;
  document.getElementById("total-tonnes").textContent = data.total_annual_tonnes;
  const vsAvg = Math.round(data.vs_global_average_pct);
  const comparison = document.getElementById("comparison");
  comparison.textContent =
    vsAvg <= 100
      ? `That's ${100 - vsAvg}% below the global average. 🎉`
      : `That's ${vsAvg - 100}% above the global average — there's room to improve.`;
}

/** Show a status message; mark it as an error when appropriate. */
function setStatus(message, isError = false) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

/** Handle form submission end-to-end. */
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

    renderSummary(data);
    renderChart(data.breakdown);
    renderTable(data.breakdown);
    renderRecommendations(data.recommendations);

    document.getElementById("results-body").hidden = false;
    setStatus("Done — here is your personalised plan.");
    // Move focus to the results so screen-reader users land on the output.
    document.getElementById("results-heading").focus();
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    button.disabled = false;
  }
}

/** Wire everything up once the DOM is ready. */
function init() {
  document.getElementById("results-heading").setAttribute("tabindex", "-1");
  document.getElementById("footprint-form").addEventListener("submit", onSubmit);
  loadOptions().catch(() =>
    setStatus("Could not reach the server. Is the backend running?", true)
  );
}

document.addEventListener("DOMContentLoaded", init);
