import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { StoreProvider } from './state/store';
import Alerts from './pages/Alerts';
import Network from './pages/Network';
import Plan from './pages/Plan';
import Trends from './pages/Trends';
import Crew from './pages/Crew';
import Drive from './pages/Drive';

const Tycoon = lazy(() => import('./pages/Tycoon'));

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Network />} />
            <Route path="network" element={<Network />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="plan/:id?" element={<Plan />} />
            <Route path="trends" element={<Trends />} />
            <Route path="crew" element={<Crew />} />
            <Route path="shifts" element={<Crew />} />
            <Route path="drive" element={<Drive />} />
            <Route
              path="tycoon"
              element={
                <Suspense fallback={<div className="loader"><div className="box"><div className="muted">Loading field…</div></div></div>}>
                  <Tycoon />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
