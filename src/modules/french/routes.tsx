import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";

const FrenchHome = lazy(() => import("./pages/FrenchHome"));
const TestRunner = lazy(() => import("./pages/TestRunner"));

function Fallback() {
  return <div className="p-6 text-center text-muted">Loading French…</div>;
}

function wrap(node: React.ReactNode) {
  return <Suspense fallback={<Fallback />}>{node}</Suspense>;
}

export function frenchRoutes() {
  return (
    <Route path="/french">
      <Route index element={wrap(<FrenchHome />)} />
      <Route path="test/:kind" element={wrap(<TestRunner />)} />
    </Route>
  );
}
