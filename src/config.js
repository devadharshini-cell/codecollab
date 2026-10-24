// Central place for the backend URL.
// In dev this defaults to localhost:5000 (matches the backend's default PORT).
// For real deployment (Render, Railway, VPS, etc.) set REACT_APP_SERVER_URL
// in a .env file at build time, e.g.:
//   REACT_APP_SERVER_URL=https://your-backend.onrender.com
//
// Without this, the app only ever works on localhost and other people can
// never join your rooms — this is what makes it usable by everyone.
export const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

// Voice chat (WebRTC) connection helpers. STUN lets two browsers find each other
// across normal home/office networks. Some strict networks (college WiFi, some
// mobile data) block direct audio and then need a TURN relay server: set
// REACT_APP_TURN_URL (comma separated), REACT_APP_TURN_USERNAME and
// REACT_APP_TURN_CREDENTIAL in the frontend env to enable one.
const turnUrls = (process.env.REACT_APP_TURN_URL || '').split(',').map((u) => u.trim()).filter(Boolean);
export const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    ...(turnUrls.length
        ? [{
            urls: turnUrls,
            username: process.env.REACT_APP_TURN_USERNAME,
            credential: process.env.REACT_APP_TURN_CREDENTIAL,
        }]
        : []),
];