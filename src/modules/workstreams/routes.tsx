import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";

const WorkstreamsView = lazy(() => import("./pages/WorkstreamsView"));

function Fallback() {
  return <div className="p-6 text-center text-muted">Loading…</div>;
}

export function workstreamRoutes() {
  return (
    <Route
      path="/workstreams"
      element={
        <Suspense fallback={<Fallback />}>
          <WorkstreamsView />
        </Suspense>
      }
    />
  );
}
