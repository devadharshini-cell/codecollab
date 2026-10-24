import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ICE_SERVERS } from '../config';

// Room voice chat. Audio goes directly browser-to-browser (WebRTC, one connection
// per person); the backend only relays the connection handshake over the socket.
const VoiceChat = ({ socketRef, socketReady, roomId, clients, collapsed }) => {
    const [joined, setJoined] = useState(false);
    const [muted, setMuted] = useState(false);
    const [starting, setStarting] = useState(false);
    const [voiceIds, setVoiceIds] = useState([]); // socket ids currently in voice
    const localStreamRef = useRef(null);
    const audioBoxRef = useRef(null);

    // Who is in voice right now. Everyone in the room sees this, even before joining.
    useEffect(() => {
        const socket = socketRef.current;
        if (!socketReady || !socket) return;
        const onUsers = (ids) => setVoiceIds(ids);
        socket.on('voice:users', onUsers);
        socket.emit('voice:who', { roomId });
        return () => socket.off('voice:users', onUsers);
    }, [socketReady, socketRef, roomId]);

    // While joined: manage one RTCPeerConnection per other person in voice.
    useEffect(() => {
        const socket = socketRef.current;
        const stream = localStreamRef.current;
        if (!joined || !socket || !stream) return;

        const peers = {};   // socketId -> RTCPeerConnection
        const chains = {};  // socketId -> promise chain, keeps handshake messages in order
        let active = true;

        const closePeer = (id) => {
            const pc = peers[id];
            if (pc) {
                pc.onicecandidate = null;
                pc.ontrack = null;
                pc.onconnectionstatechange = null;
                pc.close();
                delete peers[id];
            }
            const el = document.getElementById(`voice-audio-${id}`);
            if (el) { el.srcObject = null; el.remove(); }
            delete chains[id];
        };

        const createPeer = (id, initiator) => {
            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            peers[id] = pc;
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));

            pc.onicecandidate = (e) => {
                if (e.candidate) socket.emit('voice:signal', { to: id, data: { candidate: e.candidate.toJSON() } });
            };
            pc.ontrack = (e) => {
                let el = document.getElementById(`voice-audio-${id}`);
                if (!el) {
                    el = document.createElement('audio');
                    el.id = `voice-audio-${id}`;
                    el.autoplay = true;
                    audioBoxRef.current?.appendChild(el);
                }
                el.srcObject = e.streams[0];
                const p = el.play();
                if (p && p.catch) p.catch(() => {});
            };
            pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'failed') {
                    toast.error('Could not connect voice with one participant. Their network may block direct audio.');
                }
            };

            if (initiator) {
                pc.createOffer()
                    .then((offer) => pc.setLocalDescription(offer))
                    .then(() => socket.emit('voice:signal', {
                        to: id,
                        data: { sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } },
                    }))
                    .catch((err) => console.error('voice offer failed', err));
            }
            return pc;
        };

        // People already in voice: we are the newcomer, so we send each of them an offer.
        const onPeers = (ids) => {
            if (!active) return;
            ids.forEach((id) => { if (!peers[id]) createPeer(id, true); });
        };

        const onSignal = ({ from, data }) => {
            if (!active) return;
            const prev = chains[from] || Promise.resolve();
            chains[from] = prev.then(async () => {
                if (!active) return;
                let pc = peers[from];
                if (data.sdp) {
                    if (!pc) pc = createPeer(from, false);
                    await pc.setRemoteDescription(data.sdp);
                    if (data.sdp.type === 'offer') {
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        socket.emit('voice:signal', {
                            to: from,
                            data: { sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } },
                        });
                    }
                } else if (data.candidate && pc) {
                    try { await pc.addIceCandidate(data.candidate); } catch (e) { /* stale candidate */ }
                }
            }).catch((err) => console.error('voice signal error', err));
        };

        const onPeerLeft = ({ socketId }) => closePeer(socketId);

        socket.on('voice:peers', onPeers);
        socket.on('voice:signal', onSignal);
        socket.on('voice:peer-left', onPeerLeft);
        socket.emit('voice:join', { roomId });

        return () => {
            active = false;
            socket.off('voice:peers', onPeers);
            socket.off('voice:signal', onSignal);
            socket.off('voice:peer-left', onPeerLeft);
            socket.emit('voice:leave');
            Object.keys(peers).forEach(closePeer);
            stream.getTracks().forEach((t) => t.stop()); // release the microphone
            localStreamRef.current = null;
        };
    }, [joined, socketRef, roomId]);

    const join = async () => {
        if (joined || starting) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            toast.error('The microphone needs a secure page: open the site with https:// (or localhost).');
            return;
        }
        setStarting(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            localStreamRef.current = stream;
            setMuted(false);
            setJoined(true);
        } catch (err) {
            toast.error(err && err.name === 'NotAllowedError'
                ? 'Microphone blocked. Allow it in the browser address bar and try again.'
                : 'Could not access a microphone.');
        } finally {
            setStarting(false);
        }
    };

    const leave = () => { setJoined(false); setMuted(false); };

    const toggleMute = () => {
        const next = !muted;
        if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
        setMuted(next);
    };

    const myId = socketRef.current && socketRef.current.id;
    const nameOf = (id) => {
        if (id === myId) return 'You';
        const c = (clients || []).find((cl) => cl.socketId === id);
        return c ? c.username : 'Someone';
    };

    const btn = (bg, color = '#fff') => ({
        background: bg, color, border: 'none', borderRadius: 6, padding: '6px 10px',
        fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: 1,
    });

    return (
        <div style={{ display: collapsed ? 'none' : 'block', marginTop: 18, paddingTop: 12, borderTop: '1px solid #2a2a2a' }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: '#ddd' }}>
                Voice {voiceIds.length > 0 && <span style={{ color: '#3fb950', fontWeight: 600 }}>· {voiceIds.length} talking</span>}
            </div>

            {!joined ? (
                <button onClick={join} disabled={!socketReady || starting} style={{ ...btn('#3fb950', '#0D1117'), width: '100%', opacity: (!socketReady || starting) ? 0.6 : 1 }}>
                    {starting ? 'Starting…' : '🎤 Join voice'}
                </button>
            ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={toggleMute} style={btn(muted ? '#d29922' : '#4d67c3')}>
                        {muted ? '🔇 Unmute' : '🎙 Mute'}
                    </button>
                    <button onClick={leave} style={btn('rgb(231 11 56 / 78%)')}>Leave</button>
                </div>
            )}

            {voiceIds.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', fontSize: 12.5, color: '#bbb' }}>
                    {voiceIds.map((id) => (
                        <li key={id} style={{ padding: '2px 0' }}>
                            <span style={{ color: '#3fb950' }}>●</span> {nameOf(id)}
                        </li>
                    ))}
                </ul>
            )}
            <div style={{ fontSize: 11, color: '#777', marginTop: 8 }}>Use headphones to avoid echo.</div>

            {/* remote audio elements are added here */}
            <div ref={audioBoxRef} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} />
        </div>
    );
};

export default VoiceChat;