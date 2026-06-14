/* Terra — the streaming AI chat assistant. Parses the Server-Sent Events
 * response incrementally and updates one bot bubble as chunks arrive. */

import { $, API, el, state } from "./core.js";

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
    const res = await fetch(API.chat, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: state.chat.history, footprint: state.footprint }),
    });
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
        // Only show an error if nothing has streamed yet — never wipe a reply.
        else if (payload.error && !full) { full = payload.error; bubble.textContent = full; }
      }
    }
  } catch {
    full = "Sorry — I couldn't reach the assistant. Please try again.";
    bubble.textContent = full;
  } finally {
    bubble.classList.remove("typing"); sendBtn.disabled = false;
  }
  state.chat.history.push({ role: "assistant", content: full });
}

export function sendChat(text) {
  const t = text.trim(); if (!t) return;
  addMessage("user", t);
  state.chat.history.push({ role: "user", content: t });
  streamChat(addMessage("bot", ""));
}

export function openChat() {
  $("chat-panel").hidden = false;
  $("chat-toggle").setAttribute("aria-expanded", "true");
  if (state.chat.history.length === 0) {
    addMessage("bot", "Hi! I'm Terra 🌱 your AI sustainability coach. Ask me anything, or calculate your footprint and I'll tailor my advice.");
  }
  $("chat-input").focus();
}

export function closeChat() {
  $("chat-panel").hidden = true;
  const t = $("chat-toggle"); t.setAttribute("aria-expanded", "false"); t.focus();
}
