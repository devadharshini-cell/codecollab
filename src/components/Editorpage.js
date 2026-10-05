import React, { useEffect, useState, useRef } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import logo from '../images/output-onlinepngtools.png';
import Client from './Client';
import CodeEditor from './Editor';
import TerminalComponent from './Terminal';
import TiltCard from './TiltCard';
import AIAssistant from './AIAssistant';
import { initSocket } from '../socket.js';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import ACTIONS from '../Actions';
import { useNavigate, useParams } from 'react-router-dom';
import Chat from './Chat';

const Editorpage = () => {
  const socketRef = useRef(null);
  const codeRef = useRef(null);
  const location = useLocation();

  const { roomId } = useParams();
  const reactNavigator = useNavigate();

  // Anyone opening a shared invite link directly (no username in router
  // state) used to get bounced back to "/". Now we just ask for a name
  // here instead, so every link works for everyone.
  const storedName = (() => {
    try { return JSON.parse(localStorage.getItem('name')) || ''; } catch { return ''; }
  })();
  const [username, setUsername] = useState(location.state?.username || storedName || '');
  const [nameDraft, setNameDraft] = useState('');
  const hasName = Boolean(username);

  const [clients, setClients] = useState([]);
  const [socketReady, setSocketReady] = useState(false);
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
  const [editorState, setEditorState] = useState({ files: {}, activeFileId: null });
  const [rightTab, setRightTab] = useState('chat');

  // --- Resizable terminal panel ---
  // Terminal height as % of the editor+terminal column, draggable via the handle below.
  const [terminalPct, setTerminalPct] = useState(35);
  const middleTabRef = useRef(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const onMove = (e) => {
      if (!isDraggingRef.current || !middleTabRef.current) return;
      const rect = middleTabRef.current.getBoundingClientRect();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const pctFromBottom = ((rect.bottom - clientY) / rect.height) * 100;
      const clamped = Math.min(80, Math.max(12, pctFromBottom));
      setTerminalPct(clamped);
    };
    const onUp = () => { isDraggingRef.current = false; document.body.style.cursor = ''; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  const startDrag = () => {
    isDraggingRef.current = true;
    document.body.style.cursor = 'row-resize';
  };

  function handleErrors(e) {
    console.log('socket error', e);
    toast.error('Socket Connection failed, try again later.');
    reactNavigator('/');
  }

  useEffect(() => {
    if (!hasName) return; // wait until we actually have a username to join with

    let cancelled = false;

    const init = async () => {
      socketRef.current = await initSocket();
      if (cancelled) return;

      socketRef.current.on('connect_error', (err) => handleErrors(err));
      socketRef.current.on('connect_failed', (err) => handleErrors(err));

      socketRef.current.emit(ACTIONS.JOIN, {
        roomId,
        username,
      });
      setSocketReady(true);

      socketRef.current.on(ACTIONS.JOINED, ({ clients, username: joinedUsername, socketId }) => {
        if (joinedUsername !== username) {
          toast.success(`${joinedUsername} joined the room.`);
        }
        setClients(clients);
        if (socketId !== socketRef.current.id) {
          const currentState = codeRef.current;
          if (currentState && typeof currentState === 'object') {
            socketRef.current.emit(ACTIONS.SYNC_CODE, {
              roomId,
              ...currentState,
              socketId,
            });
          }
        }
      });

      socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username: leftUsername }) => {
        toast.success(`${leftUsername} left the room.`);
        setClients((prev) => prev.filter((client) => client.socketId !== socketId));
      });
    };
    init();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current?.off(ACTIONS.JOINED);
      socketRef.current?.off(ACTIONS.DISCONNECTED);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasName, roomId]);

  // No username yet (e.g. someone opened a shared room link directly) —
  // ask for one instead of kicking them back to the homepage.
  if (!hasName) {
    const submitName = (e) => {
      e.preventDefault();
      const trimmed = nameDraft.trim();
      if (!trimmed) {
        toast.error('Enter a name to join the room');
        return;
      }
      localStorage.setItem('name', JSON.stringify(trimmed));
      setUsername(trimmed);
    };
    return (
      <div className="join-gate">
        <TiltCard className="join-gate-card">
          <img className="logoImage" style={{ height: '44px', width: '44px' }} src={logo} alt="logo" />
          <h3 className="join-gate-title">Join Code-Collab room</h3>
          <p className="join-gate-sub">Room <code>{roomId}</code></p>
          <Form onSubmit={submitName}>
            <Form.Control
              autoFocus
              className="join-gate-input"
              placeholder="Your name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
            />
            <Button type="submit" className="join-gate-btn">Join</Button>
          </Form>
        </TiltCard>
      </div>
    );
  }

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success('Room Id has been copied to clipboard');
    } catch (err) {
      toast.error('Could not copy Room Id');
    }
  };
  const leaveRoom = () => reactNavigator('/');
  const toggleLeftSidebar = () => setIsLeftSidebarCollapsed(!isLeftSidebarCollapsed);
  const toggleRightSidebar = () => setIsRightSidebarCollapsed(!isRightSidebarCollapsed);
  const activeFile = editorState.files?.[editorState.activeFileId] || null;

  return (
    <div className="minWrap">
      {/* Left Sidebar */}
      <div
        className="aside"
        style={{
          width: isLeftSidebarCollapsed ? '60px' : '250px',
          transition: 'width 0.3s ease',
          overflow: 'hidden'
        }}
      >
        <div className="asideInner" style={{ opacity: isLeftSidebarCollapsed ? 0 : 1, transition: 'opacity 0.3s ease' }}>
          <div className="logo">
            <img className='logoImage' style={{ height: '40px', width: '40px' }} src={logo} alt="logo" />
            <h3 style={{
              color: 'rgb(231 11 56 / 78%)',
              paddingTop: '8px',
              paddingLeft: '10px',
              fontWeight: '800',
              display: isLeftSidebarCollapsed ? 'none' : 'block'
            }}>Code-Collab</h3>
          </div>
          <h5 style={{
            paddingTop: '1.5rem',
            paddingBottom: '0.8rem',
            display: isLeftSidebarCollapsed ? 'none' : 'block'
          }}>Connected</h5>
          <div className='clientsList' style={{ display: isLeftSidebarCollapsed ? 'none' : 'block' }}>
            {clients.map((client) => (
              <TiltCard key={client.socketId} className="client-tilt" maxTilt={10}>
                <Client username={client.username} />
              </TiltCard>
            ))}
          </div>
        </div>

        <Button
          className='btn-toggle-sidebar'
          style={{
            backgroundColor: '#4d67c3',
            border: 'none',
            outline: 'none',
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '30px',
            height: '30px',
            padding: '0',
            fontSize: '12px',
            borderRadius: '50%'
          }}
          onClick={toggleLeftSidebar}
        >
          {isLeftSidebarCollapsed ? '→' : '←'}
        </Button>

        <Button
          className='btn-copy-btn'
          style={{
            backgroundColor: '#4d67c3',
            border: 'none',
            outline: 'none',
            display: isLeftSidebarCollapsed ? 'none' : 'block'
          }}
          onClick={copyRoomId}
        >
          COPY ROOM ID
        </Button>
        <Button
          className='btn-leave-btn'
          style={{
            backgroundColor: 'rgb(231 11 56 / 78%)',
            border: 'none',
            display: isLeftSidebarCollapsed ? 'none' : 'block'
          }}
          onClick={leaveRoom}
        >
          LEAVE
        </Button>
      </div>

      {/* Main Editor Area */}
      <div className="editorWrap">
        <div className='middleTab' ref={middleTabRef}>
          {socketReady && (
            <>
              <div className="editor-section" style={{ height: `${100 - terminalPct}%` }}>
                <CodeEditor
                  socketRef={socketRef}
                  roomId={roomId}
                  initialLanguage={location.state?.language}
                  onCodeChange={(state) => {
                    codeRef.current = state;
                    setEditorState(state);
                  }}
                />
              </div>
              <div
                className="resize-handle"
                onMouseDown={startDrag}
                onTouchStart={startDrag}
                title="Drag to resize terminal"
              >
                <div className="resize-handle-grip" />
              </div>
              <div className="terminal-section" style={{ height: `${terminalPct}%` }}>
                <TerminalComponent
                  socketRef={socketRef}
                  roomId={roomId}
                  editorFiles={editorState.files}
                  activeFileId={editorState.activeFileId}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right Sidebar - Chat / AI Assistant */}
      <div
        className='rightTab'
        style={{
          width: isRightSidebarCollapsed ? '60px' : '320px',
          transition: 'width 0.3s ease',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <Button
          className='btn-toggle-chat'
          style={{
            backgroundColor: '#4d67c3',
            border: 'none',
            outline: 'none',
            position: 'absolute',
            top: '10px',
            left: '10px',
            width: '30px',
            height: '30px',
            padding: '0',
            fontSize: '12px',
            borderRadius: '50%',
            zIndex: 10
          }}
          onClick={toggleRightSidebar}
        >
          {isRightSidebarCollapsed ? '←' : '→'}
        </Button>

        <div style={{
          opacity: isRightSidebarCollapsed ? 0 : 1,
          transition: 'opacity 0.3s ease',
          marginTop: '40px',
          height: 'calc(100% - 40px)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div className="right-tabs">
            <button
              className={rightTab === 'chat' ? 'right-tab-active' : 'right-tab'}
              onClick={() => setRightTab('chat')}
            >Chat</button>
            <button
              className={rightTab === 'ai' ? 'right-tab-active' : 'right-tab'}
              onClick={() => setRightTab('ai')}
            >AI Assistant</button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {rightTab === 'chat' ? <Chat socketRef={socketRef} roomId={roomId} username={username} /> : <AIAssistant activeFile={activeFile} />}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Editorpage;
