import { BrowserRouter, Route, Routes } from 'react-router';
import { LandingPage } from '@/features/landing/LandingPage';
import { CreateGamePage } from '@/features/room/CreateGamePage';
import { JoinGamePage } from '@/features/room/JoinGamePage';
import { RoomPage } from '@/app/RoomPage';
import { ToastHost } from '@/shared/ui/Toast';
import { ThemeProvider } from '@/shared/ui/theme';

export const App = () => (
  <ThemeProvider>
    <BrowserRouter>
      <div className="table-grain min-h-[100dvh]">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/new" element={<CreateGamePage />} />
          <Route path="/join/:code?" element={<JoinGamePage />} />
          <Route path="/room/:code" element={<RoomPage />} />
          <Route path="*" element={<LandingPage />} />
        </Routes>
        <ToastHost />
      </div>
    </BrowserRouter>
  </ThemeProvider>
);
