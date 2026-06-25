import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";

const DoorAssessmentPage = lazy(() => import("./pages/DoorAssessment"));

function Fallback() {
  return <div className="p-6 text-center text-muted">Loading…</div>;
}

export function doorRoutes() {
  return (
    <Route
      path="/doors"
      element={
        <Suspense fallback={<Fallback />}>
          <DoorAssessmentPage />
        </Suspense>
      }
    />
  );
}
