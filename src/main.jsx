import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Simple localStorage-based storage API
window.storage = {
  get: async (key) => {
    const value = localStorage.getItem(key);
    return { value };
  },
  set: async (key, value) => {
    localStorage.setItem(key, value);
  }
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
