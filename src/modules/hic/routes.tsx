import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";

const HicHome = lazy(() => import("./pages/HicHome"));
const HicTest = lazy(() => import("./pages/HicTest"));

function Fallback() {
  return <div className="p-6 text-center text-muted">Loading…</div>;
}

function wrap(node: React.ReactNode) {
  return <Suspense fallback={<Fallback />}>{node}</Suspense>;
}

export function hicRoutes() {
  return (
    <Route path="/hic">
      <Route index element={wrap(<HicHome />)} />
      <Route path="test/:section" element={wrap(<HicTest />)} />
    </Route>
  );
}
