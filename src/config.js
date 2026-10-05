// Central place for the backend URL.
// In dev this defaults to localhost:5000 (matches the backend's default PORT).
// For real deployment (Render, Railway, VPS, etc.) set REACT_APP_SERVER_URL
// in a .env file at build time, e.g.:
//   REACT_APP_SERVER_URL=https://your-backend.onrender.com
//
// Without this, the app only ever works on localhost and other people can
// never join your rooms — this is what makes it usable by everyone.
export const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';
