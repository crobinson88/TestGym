import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { syncEngine } from "@/lib/sync";

export function SyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return;
    void syncEngine.start();
    return () => {
      void syncEngine.stop();
    };
  }, [session]);

  return <>{children}</>;
}
