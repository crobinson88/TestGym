import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { Button } from "./ui/Button";

export function PwaUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateSW, setUpdateSW] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
        setTimeout(() => setOfflineReady(false), 2500);
      },
    });
    setUpdateSW(() => update);
  }, []);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="fixed inset-x-0 bottom-24 z-20 flex justify-center px-4">
      {needRefresh && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-xl">
          <span className="text-sm">New version available.</span>
          <Button
            size="sm"
            onClick={async () => {
              if (updateSW) await updateSW();
            }}
          >
            Reload
          </Button>
          <button
            onClick={() => setNeedRefresh(false)}
            className="text-sm text-muted hover:text-text"
            aria-label="Dismiss"
          >
            Later
          </button>
        </div>
      )}
      {!needRefresh && offlineReady && (
        <div
          role="status"
          className="rounded-full bg-success px-4 py-2 text-sm font-medium text-bg shadow-lg"
        >
          Ready to use offline ✓
        </div>
      )}
    </div>
  );
}
