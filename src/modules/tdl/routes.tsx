import { lazy, Suspense } from "react";
import { Navigate, Route } from "react-router-dom";
import { todayIsoDate } from "@/lib/utils";

const DayView = lazy(() => import("./pages/DayView"));
const HistoryView = lazy(() => import("./pages/HistoryView"));
const ArchiveView = lazy(() => import("./pages/ArchiveView"));
const SnoozedView = lazy(() => import("./pages/SnoozedView"));
const CategoriesView = lazy(() => import("./pages/CategoriesView"));

function Fallback() {
  return <div className="p-6 text-center text-muted">Loading TDL...</div>;
}

export function tdlRoutes() {
  return (
    <Route path="/tdl">
      <Route index element={<Navigate to={`/tdl/${todayIsoDate()}`} replace />} />
      <Route path="today" element={<Navigate to={`/tdl/${todayIsoDate()}`} replace />} />
      <Route path="history" element={<Suspense fallback={<Fallback />}><HistoryView /></Suspense>} />
      <Route path="archive" element={<Suspense fallback={<Fallback />}><ArchiveView /></Suspense>} />
      <Route path="snoozed" element={<Suspense fallback={<Fallback />}><SnoozedView /></Suspense>} />
      <Route path="categories" element={<Suspense fallback={<Fallback />}><CategoriesView /></Suspense>} />
      <Route path=":date" element={<Suspense fallback={<Fallback />}><DayView /></Suspense>} />
    </Route>
  );
}
