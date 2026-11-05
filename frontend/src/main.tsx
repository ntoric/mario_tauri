import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { GlassToaster } from './components/ui/GlassToaster';
import App from './App';
import { api } from './services/api';
import { useAuthStore } from './stores';
import './index.css';

async function bootstrap() {
  // Restore persisted auth before first render so the store plugin's async
  // read can't flash the login screen on a valid session.
  await Promise.all([api.hydrateToken(), useAuthStore.persist.rehydrate()]);

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
        <GlassToaster />
      </HashRouter>
    </React.StrictMode>
  );
}

void bootstrap();
