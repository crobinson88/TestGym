import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";

const SharesView = lazy(() => import("./pages/SharesView"));
const AddTrade = lazy(() => import("./pages/AddTrade"));
const TradeDetail = lazy(() => import("./pages/TradeDetail"));

function Fallback() {
  return <div className="p-6 text-center text-muted">Loading…</div>;
}

function wrap(node: React.ReactNode) {
  return <Suspense fallback={<Fallback />}>{node}</Suspense>;
}

export function sharesRoutes() {
  return (
    <Route path="/shares">
      <Route index element={wrap(<SharesView />)} />
      <Route path="add" element={wrap(<AddTrade />)} />
      <Route path=":id" element={wrap(<TradeDetail />)} />
    </Route>
  );
}
