import { useState, type FormEvent } from "react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { supabase } from "@/lib/supabase";
import { ALLOWED_EMAIL } from "@/lib/config";

type Stage = "email" | "sent";

export function SignIn() {
  const [email, setEmail] = useState(ALLOWED_EMAIL);
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<Stage>("email");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (email.trim().toLowerCase() !== ALLOWED_EMAIL) {
      setError("This app is single-user. Sign in with the allowed email.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setStage("sent");
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const token = code.replace(/\D/g, "");
    if (token.length < 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: "email",
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Gym Tracker</h1>
          <p className="text-sm text-muted">
            {stage === "email"
              ? "Sign in with the magic link."
              : "Check your email — tap the link, or paste the 6-digit code below."}
          </p>
        </header>

        {stage === "email" && (
          <form onSubmit={sendLink} className="space-y-3">
            <label className="block space-y-2">
              <span className="text-sm text-muted">Email</span>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={busy}
                required
              />
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Sending..." : "Send magic link"}
            </Button>
          </form>
        )}

        {stage === "sent" && (
          <form onSubmit={verifyCode} className="space-y-3">
            <label className="block space-y-2">
              <span className="text-sm text-muted">6-digit code</span>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                disabled={busy}
              />
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Verifying..." : "Verify code"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="md"
              className="w-full"
              onClick={() => {
                setStage("email");
                setCode("");
                setError(null);
              }}
            >
              Start over
            </Button>
          </form>
        )}

        {error && (
          <p role="alert" className="text-center text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
