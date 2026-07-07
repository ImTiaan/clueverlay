import { BrowserRouter, Route, Routes } from 'react-router-dom';
import LeaderboardPage from '@/pages/LeaderboardPage';
import OverlayPage from '@/pages/OverlayPage';
import AdminPage from '@/pages/AdminPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LeaderboardPage />} />
        <Route path="/overlay" element={<OverlayPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}
