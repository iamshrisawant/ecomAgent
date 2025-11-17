// client/src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import setAuthToken from './services/setAuthToken'; // <-- IMPORT THE UTILITY

// --- START FIX ---
// Check localStorage for a token on app startup
// This ensures you stay logged in and authenticated on refresh
if (localStorage.token) {
    // If a token is found, set it in the axios headers
    setAuthToken(localStorage.token);
}
// --- END FIX ---

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

reportWebVitals();