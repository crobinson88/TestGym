import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";

const VenmoView = lazy(() => import("./pages/VenmoView"));

function Fallback() {
  return <div className="p-6 text-center text-muted">Loading...</div>;
}

export function venmoRoutes() {
  return (
    <Route
      path="/venmo"
      element={
        <Suspense fallback={<Fallback />}>
          <VenmoView />
        </Suspense>
      }
    />
  );
}
