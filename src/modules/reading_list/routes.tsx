import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";

const ReadingListHome = lazy(() => import("./pages/ReadingListHome"));
const AddReadingItem = lazy(() => import("./pages/AddReadingItem"));
const EmailDigest = lazy(() => import("./pages/EmailDigest"));

function Fallback() {
  return <div className="p-6 text-center text-muted">Loading…</div>;
}

function wrap(node: React.ReactNode) {
  return <Suspense fallback={<Fallback />}>{node}</Suspense>;
}

export function readingRoutes() {
  return (
    <Route path="/reading">
      <Route index element={wrap(<ReadingListHome />)} />
      <Route path="email" element={wrap(<EmailDigest />)} />
      <Route path="add" element={wrap(<AddReadingItem />)} />
      <Route path="add/:id" element={wrap(<AddReadingItem />)} />
    </Route>
  );
}
