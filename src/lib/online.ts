import { useEffect, useState } from "react";

// The browser's own idea of connectivity. Treated as online when unknown (SSR,
// tests) so a missing API never hides a working network.
export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

// Live connectivity for UI that degrades offline (the AI-backed French screens).
export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline);
  useEffect(() => {
    const update = () => setOnline(isOnline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
