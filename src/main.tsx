import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { App } from './app/App';
import './styles.css';
import { captureRecovery, establishRecovery, invalidRecovery } from './data/recovery';
import { configuredClient } from './data/client';
import { PasswordRecoveryPage } from './pages/PasswordRecoveryPage';

const callback = captureRecovery(new URL(window.location.href), url => window.history.replaceState(null, '', url));
const recoveryClient = callback ? configuredClient(true).client : null;
const recoverySession = callback ? (recoveryClient
  ? establishRecovery(recoveryClient.auth, callback)
  : Promise.reject(new Error(invalidRecovery))) : null;
// Attach immediately; the component presents failures after mounting.
void recoverySession?.catch(() => {});

const Router = import.meta.env.PROD ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{recoverySession ? <PasswordRecoveryPage session={recoverySession} client={recoveryClient} /> : <Router><App /></Router>}</React.StrictMode>,
);
