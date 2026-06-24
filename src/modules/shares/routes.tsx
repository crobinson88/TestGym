import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";

const SharesView = lazy(() => import("./pages/SharesView"));
const AddTrade = lazy(() => import("./pages/AddTrade"));
const AddHolding = lazy(() => import("./pages/AddHolding"));
const TradeDetail = lazy(() => import("./pages/TradeDetail"));
const StockView = lazy(() => import("./pages/StockView"));
const ModelBuilder = lazy(() => import("./pages/ModelBuilder"));
const TipsView = lazy(() => import("./pages/TipsView"));
const AddTip = lazy(() => import("./pages/AddTip"));

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
      <Route path="add-holding" element={wrap(<AddHolding />)} />
      <Route path="tips" element={wrap(<TipsView />)} />
      <Route path="tips/add" element={wrap(<AddTip />)} />
      <Route path="tips/add/:id" element={wrap(<AddTip />)} />
      <Route path="stock/:ticker" element={wrap(<StockView />)} />
      <Route path="stock/:ticker/model" element={wrap(<ModelBuilder />)} />
      <Route path=":id" element={wrap(<TradeDetail />)} />
    </Route>
  );
}
