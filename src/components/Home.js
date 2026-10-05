import React, { useState, useEffect } from 'react';
import { v4 as uuidV4 } from 'uuid';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const Home = () => {
    const navigate = useNavigate();
    const [roomId, setRoomId] = useState('');
    const [username, setUsername] = useState('');
    const [tab, setTab] = useState('join'); // 'join' | 'create'
    const [newRoomName, setNewRoomName] = useState('');
    const [newRoomLang, setNewRoomLang] = useState('js');
    const [typedText, setTypedText] = useState('');

    const tagline = 'Code together. Ship faster.';
    useEffect(() => {
        let i = 0;
        const timer = setInterval(() => {
            setTypedText(tagline.slice(0, i + 1));
            i++;
            if (i >= tagline.length) clearInterval(timer);
        }, 48);
        return () => clearInterval(timer);
    }, []);

    const createNewRoom = (e) => {
        e.preventDefault();
        if (!username.trim()) { toast.error('Enter your name first'); return; }
        const id = uuidV4();
        setRoomId(id);
        toast.success('Room created!');
        navigate(`/editor/${id}`, { state: { username: username.trim(), language: newRoomLang } });
    };

    const joinRoom = (e) => {
        e.preventDefault();
        if (!roomId.trim() || !username.trim()) {
            toast.error('Room ID and name are required');
            return;
        }
        navigate(`/editor/${roomId.trim()}`, { state: { username: username.trim() } });
    };

    const handleEnter = (e) => { if (e.key === 'Enter') tab === 'join' ? joinRoom(e) : createNewRoom(e); };

    const LANGS = [
        { ext: 'js', label: 'JavaScript', color: '#f7df1e' },
        { ext: 'py', label: 'Python', color: '#3572A5' },
        { ext: 'java', label: 'Java', color: '#b07219' },
        { ext: 'cpp', label: 'C++', color: '#f34b7d' },
        { ext: 'c', label: 'C', color: '#555555' },
    ];

    return (
        <div className="home-root">
            {/* BG video */}
            <video
                className="home-bg-video"
                src="/videos/home-bg.mp4"
                autoPlay
                muted
                loop
                playsInline
            />
            <div className="home-bg-overlay" />

            {/* BG grid */}
            <div className="home-bg-grid" />

            {/* Navbar */}
            <nav className="home-nav">
                <div className="home-nav-logo">
                    <div className="home-nav-icon">&lt;/&gt;</div>
                    <span>Code<span className="home-brand-accent">Collab</span></span>
                </div>
                <div className="home-nav-links">
                    <a href="#features">Features</a>
                    <a href="#langs">Languages</a>
                </div>
            </nav>

            {/* Hero */}
            <section className="home-hero">
                <div className="home-hero-badge">🚀 Real-time collaborative coding</div>
                <h1 className="home-hero-title">
                    Build together,<br />
                    <span className="home-hero-gradient">anywhere.</span>
                </h1>
                <p className="home-hero-sub">
                    <span className="home-typed">{typedText}<span className="home-cursor">|</span></span>
                </p>

                {/* Card */}
                <div className="home-card">
                    {/* Tabs */}
                    <div className="home-tabs">
                        <button
                            className={`home-tab ${tab === 'join' ? 'active' : ''}`}
                            onClick={() => setTab('join')}
                        >Join Room</button>
                        <button
                            className={`home-tab ${tab === 'create' ? 'active' : ''}`}
                            onClick={() => setTab('create')}
                        >Create Room</button>
                    </div>

                    <div className="home-card-body">
                        {/* Username - always shown */}
                        <div className="home-field">
                            <label>Your name</label>
                            <input
                                type="text"
                                placeholder="e.g. Deva"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                onKeyDown={handleEnter}
                                autoFocus
                            />
                        </div>

                        {tab === 'join' ? (
                            <>
                                <div className="home-field">
                                    <label>Room ID</label>
                                    <input
                                        type="text"
                                        placeholder="Paste room ID here"
                                        value={roomId}
                                        onChange={e => setRoomId(e.target.value)}
                                        onKeyDown={handleEnter}
                                    />
                                </div>
                                <button className="home-btn-primary" onClick={joinRoom}>
                                    Join Room →
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="home-field">
                                    <label>Language</label>
                                    <div className="home-lang-grid">
                                        {LANGS.map(l => (
                                            <button
                                                key={l.ext}
                                                className={`home-lang-btn ${newRoomLang === l.ext ? 'active' : ''}`}
                                                style={newRoomLang === l.ext ? { borderColor: l.color, color: l.color } : {}}
                                                onClick={() => setNewRoomLang(l.ext)}
                                                type="button"
                                            >
                                                {l.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button className="home-btn-primary" onClick={createNewRoom}>
                                    Create & Enter →
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="home-features" id="features">
                <h2 className="home-section-title">Everything you need</h2>
                <div className="home-features-grid">
                    {[
                        { icon: '⚡', title: 'Real-time sync', desc: 'Every keystroke synced instantly across all collaborators via WebSocket.' },
                        { icon: '🤖', title: 'AI Assistant', desc: 'Groq-powered AI to debug, explain, and improve your code on demand.' },
                        { icon: '▶️', title: 'Run code', desc: 'Execute JS, Python, Java, C, C++ directly from the built-in terminal.' },
                        { icon: '💬', title: 'Live chat', desc: 'Built-in chat so your team can discuss without leaving the editor.' },
                        { icon: '📁', title: 'Multi-file', desc: 'Open and edit multiple files with tabbed editor support.' },
                        { icon: '🔗', title: 'Share instantly', desc: 'One click to copy Room ID — share with anyone, anywhere.' },
                    ].map(f => (
                        <div className="home-feature-card" key={f.title}>
                            <div className="home-feature-icon">{f.icon}</div>
                            <h3>{f.title}</h3>
                            <p>{f.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Languages */}
            <section className="home-langs-section" id="langs">
                <h2 className="home-section-title">Supported languages</h2>
                <div className="home-langs-row">
                    {[
                        { label: 'JavaScript', color: '#f7df1e', bg: 'rgba(247,223,30,0.10)' },
                        { label: 'Python', color: '#3572A5', bg: 'rgba(53,114,165,0.15)' },
                        { label: 'Java', color: '#f89820', bg: 'rgba(248,152,32,0.12)' },
                        { label: 'C++', color: '#f34b7d', bg: 'rgba(243,75,125,0.12)' },
                        { label: 'C', color: '#888', bg: 'rgba(136,136,136,0.12)' },
                    ].map(l => (
                        <div className="home-lang-pill" key={l.label} style={{ color: l.color, background: l.bg, border: `1px solid ${l.color}33` }}>
                            {l.label}
                        </div>
                    ))}
                </div>
            </section>

            {/* Footer */}
            <footer className="home-footer">
                <span>© 2025 CodeCollab · Built with React & Socket.io</span>
            </footer>
        </div>
    );
};

export default Home;