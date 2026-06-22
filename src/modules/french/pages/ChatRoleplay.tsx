import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Send } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { SCENARIOS, sendChat, type ChatTurn, type Scenario } from "../chat";

export default function ChatRoleplay() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const token = session?.access_token;

  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function turn(next: ChatTurn[]) {
    if (!token) {
      setError("You need to be signed in to chat.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const reply = await sendChat(scenario!.prompt, next, token);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
    } finally {
      setBusy(false);
    }
  }

  async function start(s: Scenario) {
    setScenario(s);
    setMessages([]);
    setInput("");
    setError(null);
    if (!token) {
      setError("You need to be signed in to chat.");
      return;
    }
    setBusy(true);
    try {
      const reply = await sendChat(s.prompt, [], token);
      setMessages([{ role: "assistant", content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
    } finally {
      setBusy(false);
    }
  }

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void turn([...messages, { role: "user", content: text }]);
  }

  if (!scenario) {
    return (
      <div className="space-y-4 p-4 pb-24">
        <header className="flex items-center gap-3">
          <button
            onClick={() => navigate("/french")}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface2"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold">Roleplay chat</h1>
        </header>
        <p className="px-1 text-sm text-muted">
          Pick a scene and chat in French. Margaux replies simply and gives a quick correction
          when you slip up.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => start(s)}
              className="flex flex-col items-start gap-2 rounded-2xl border border-line bg-surface p-4 text-left transition active:scale-[0.98]"
            >
              <span className="text-2xl" aria-hidden>
                {s.emoji}
              </span>
              <span className="font-semibold">{s.title}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-bg px-4 py-3">
        <button
          onClick={() => setScenario(null)}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface2"
          aria-label="Back to scenarios"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="font-semibold">
            {scenario.emoji} {scenario.title}
          </div>
          <div className="text-xs text-muted">with Margaux</div>
        </div>
        <button
          onClick={() => start(scenario)}
          disabled={busy}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface2 disabled:opacity-50"
          aria-label="Restart conversation"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                m.role === "user"
                  ? "bg-accent text-bg"
                  : "border border-line bg-surface text-text",
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm text-muted">
              …
            </div>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line bg-bg p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Écris en français…"
            className="max-h-32 min-h-[3rem] flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-accent"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-bg transition active:scale-[0.96] disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
