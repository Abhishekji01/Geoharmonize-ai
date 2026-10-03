import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";

const Workbench = lazy(() => import("./pages/Workbench"));

export default function App() {
  return (
    <Suspense fallback={<p className="muted pad">Loading…</p>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/workbench" element={<Workbench />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </Suspense>
  );
}
