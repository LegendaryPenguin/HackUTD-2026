import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { StoreProvider } from './state/store';
import Alerts from './pages/Alerts';
import Network from './pages/Network';
import Plan from './pages/Plan';
import Trends from './pages/Trends';
import ShiftLog from './pages/ShiftLog';

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* Step 1 for night shift: field map at real coordinates */}
            <Route index element={<Network />} />
            <Route path="network" element={<Network />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="plan/:id?" element={<Plan />} />
            <Route path="trends" element={<Trends />} />
            <Route path="log" element={<ShiftLog />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
