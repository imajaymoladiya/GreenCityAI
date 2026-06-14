/* Section views: rewards, community (leaderboard + challenge), city analytics
 * (gauge, metrics, heatmap), challenges, and the profile detail. */

import { $, el } from "./core.js";
import { renderGauge } from "./charts.js";

export function renderRewards(boot) {
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

export function renderCommunity(boot) {
  renderChallengeCard($("community-challenge"), boot.city.challenge);
  // Podium (top 3, arranged gold-centre)
  const podium = $("podium");
  podium.replaceChildren();
  const top = boot.city.leaderboard.slice(0, 3);
  const order = [1, 0, 2];
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
  // Full leaderboard table
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

export function renderCity(boot) {
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

export function renderChallenges(boot) {
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

export function renderProfileDetail(boot) {
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
