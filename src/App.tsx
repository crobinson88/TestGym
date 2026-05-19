import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { SignIn } from "@/components/SignIn";
import { RequireAuth } from "@/components/RequireAuth";
import { AppLayout } from "@/components/AppLayout";
import { SyncProvider } from "@/components/SyncProvider";
import { Today } from "@/routes/Today";
import { AddSet } from "@/routes/AddSet";
import { History } from "@/routes/History";

const ExerciseDetail = lazy(() => import("@/routes/ExerciseDetail"));
const Dashboard = lazy(() => import("@/routes/Dashboard"));

function SignInRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (session) {
    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";
    return <Navigate to={from} replace />;
  }
  return <SignIn />;
}

function ChartFallback() {
  return <div className="p-6 text-center text-muted">Loading charts...</div>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignInRoute />} />
          <Route element={<RequireAuth />}>
            <Route
              element={
                <SyncProvider>
                  <AppLayout />
                </SyncProvider>
              }
            >
              <Route index element={<Today />} />
              <Route path="/add" element={<AddSet />} />
              <Route path="/history" element={<History />} />
              <Route
                path="/history/:id"
                element={
                  <Suspense fallback={<ChartFallback />}>
                    <ExerciseDetail />
                  </Suspense>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <Suspense fallback={<ChartFallback />}>
                    <Dashboard />
                  </Suspense>
                }
              />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
