import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";

const FoodDiaryHome = lazy(() => import("./pages/FoodDiaryHome"));
const AddFoodEntry = lazy(() => import("./pages/AddFoodEntry"));
const FoodGoals = lazy(() => import("./pages/FoodGoals"));

function Fallback() {
  return <div className="p-6 text-center text-muted">Loading…</div>;
}

function wrap(node: React.ReactNode) {
  return <Suspense fallback={<Fallback />}>{node}</Suspense>;
}

export function foodRoutes() {
  return (
    <Route path="/food">
      <Route index element={wrap(<FoodDiaryHome />)} />
      <Route path="goals" element={wrap(<FoodGoals />)} />
      <Route path="add" element={wrap(<AddFoodEntry />)} />
      <Route path="add/:id" element={wrap(<AddFoodEntry />)} />
    </Route>
  );
}
