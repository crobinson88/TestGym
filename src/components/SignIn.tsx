import { useState, type FormEvent } from "react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { supabase } from "@/lib/supabase";
import { ALLOWED_EMAIL } from "@/lib/config";

export function SignIn() {
  const [email, setEmail] = useState(ALLOWED_EMAIL);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (email.trim().toLowerCase() !== ALLOWED_EMAIL) {
      setError("This app is single-user. Sign in with the allowed email.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
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
          <p className="text-sm text-muted">Sign in with your password.</p>
        </header>

        <form onSubmit={signIn} className="space-y-3">
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
          <label className="block space-y-2">
            <span className="text-sm text-muted">Password</span>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              disabled={busy}
              required
            />
          </label>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        {error && (
          <p role="alert" className="text-center text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
