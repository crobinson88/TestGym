import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";

const DrivingHome = lazy(() => import("./pages/DrivingHome"));
const DrivingTest = lazy(() => import("./pages/DrivingTest"));

function Fallback() {
  return <div className="p-6 text-center text-muted">Loading…</div>;
}

function wrap(node: React.ReactNode) {
  return <Suspense fallback={<Fallback />}>{node}</Suspense>;
}

export function drivingRoutes() {
  return (
    <Route path="/driving">
      <Route index element={wrap(<DrivingHome />)} />
      <Route path="test/:section" element={wrap(<DrivingTest />)} />
    </Route>
  );
}
