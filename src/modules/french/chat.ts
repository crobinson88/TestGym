export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface Scenario {
  id: string;
  title: string;
  emoji: string;
  // Brief description sent to the model to set the roleplay.
  prompt: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "cafe",
    title: "At a café",
    emoji: "☕",
    prompt: "You are a friendly waiter at a Paris café. The learner is a customer ordering a drink and something to eat.",
  },
  {
    id: "directions",
    title: "Asking directions",
    emoji: "🗺️",
    prompt: "You are a local on the street. The learner is a tourist who is lost and asking how to get to the train station.",
  },
  {
    id: "introductions",
    title: "Meeting someone",
    emoji: "👋",
    prompt: "You are meeting the learner for the first time at a party. Make small talk: names, where you're from, what you do.",
  },
  {
    id: "market",
    title: "At the market",
    emoji: "🛒",
    prompt: "You are a vendor at a French market selling fruit and vegetables. The learner is shopping and asking about prices.",
  },
  {
    id: "hobbies",
    title: "Weekend & hobbies",
    emoji: "⚽",
    prompt: "You are a friend chatting with the learner about weekend plans, hobbies and what you each like to do.",
  },
  {
    id: "free",
    title: "Free chat",
    emoji: "💬",
    prompt: "A relaxed, open conversation between two friends. Follow the learner's lead on topics.",
  },
];

export async function sendChat(
  scenario: string,
  messages: ChatTurn[],
  token: string,
): Promise<string> {
  const res = await fetch("/api/french-chat", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ scenario, messages }),
  });
  const text = await res.text();
  let parsed: { reply?: string; error?: string } | null;
  try {
    parsed = JSON.parse(text) as { reply?: string; error?: string };
  } catch {
    parsed = null;
  }
  if (!res.ok || !parsed?.reply) {
    throw new Error(parsed?.error ?? `Chat failed (${res.status})`);
  }
  return parsed.reply;
}
