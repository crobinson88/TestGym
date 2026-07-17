import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui/Button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// A single uncaught render error used to unmount the whole React tree, leaving a
// blank screen with no way back (there was no boundary anywhere in the app). This
// catches it and shows a recovery screen instead. "Clear & reload" also drops the
// service-worker caches, which fixes the case where a stale precache from an older
// deploy is what's serving broken assets.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  private async clearAndReload() {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } finally {
      location.reload();
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-lg font-semibold text-text">Something went wrong</h1>
        <p className="max-w-xs text-sm text-muted">
          The app hit an error and couldn't render. Reloading usually fixes it.
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={() => location.reload()}>Reload</Button>
          <Button variant="ghost" onClick={() => void this.clearAndReload()}>
            Clear cache &amp; reload
          </Button>
        </div>
      </div>
    );
  }
}
