require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const ACTIONS = require('../src/Actions');
const cors = require('cors');
const { execSync } = require('child_process');
const { c, cpp, node, python, java } = require('compile-run');
const mongoose = require('mongoose');

let mongoReady = false;
if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => { mongoReady = true; console.log('✅ Connected to MongoDB Atlas'); })
        .catch((err) => console.error('❌ MongoDB connection error:', err.message));
} else {
    console.warn('⚠️  MONGO_URI not set — chat history will not be saved (in-memory for this session only).');
}

const messageSchema = new mongoose.Schema({
    roomId: { type: String, required: true, index: true },
    name: String,
    message: String,
    createdAt: { type: Date, default: Date.now },
});
const Message = mongoose.model('Message', messageSchema);

const CHAT_HISTORY_LIMIT = 50;
async function loadRecentMessages(roomId) {
    if (!mongoReady) return [];
    try {
        const docs = await Message.find({ roomId }).sort({ createdAt: -1 }).limit(CHAT_HISTORY_LIMIT).lean();
        return docs.reverse().map((d) => ({ name: d.name, message: d.message, createdAt: d.createdAt }));
    } catch (err) {
        console.error('❌ Failed to load chat history:', err.message);
        return [];
    }
}
async function saveMessage(roomId, name, message) {
    if (!mongoReady) return;
    try {
        await Message.create({ roomId, name, message });
    } catch (err) {
        console.error('❌ Failed to save chat message:', err.message);
    }
}

// compile-run can emit low-level spawn errors ...
process.on('uncaughtException', (err) => {
    console.error('⚠️  Caught an error that would have crashed the server:', err.message);
});
process.on('unhandledRejection', (err) => {
    console.error('⚠️  Caught an unhandled rejection that would have crashed the server:', err);
});

// Quick check so we can return a clean error instead of ever calling a
// missing compiler and risking a spawn error in the first place.
function isCommandAvailable(cmd) {
    try {
        execSync(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}
const COMPILER_FOR = { c: 'gcc', cpp: 'g++', java: 'javac', python: 'python', node: 'node' };
const compilerAvailability = {};
function ensureCompilerAvailable(runtime) {
    if (compilerAvailability[runtime] === undefined) {
        compilerAvailability[runtime] = isCommandAvailable(COMPILER_FOR[runtime]);
    }
    return compilerAvailability[runtime];
}

// Program input (stdin) typed by the user in the Input box. Makes programs that
// read from cin / scanf / input() / Scanner / readline work with real values.
function getStdin(req) {
    const raw = typeof req.body.stdin === 'string' ? req.body.stdin : '';
    if (!raw) return '';
    return raw.endsWith('\n') ? raw : raw + '\n';
}

// compile-run's Java runner only works when the main class is declared
// `public class X`; a plain `class Main` crashes it. Students often write the
// plain form, so quietly make the class that holds main() public.
function ensurePublicMainClass(src) {
    if (typeof src !== 'string') return src;
    if (/\bpublic\s+(?:final\s+|abstract\s+)?class\s+\w+/.test(src)) return src;
    const mainIdx = src.search(/static\s+void\s+main\s*\(/);
    if (mainIdx === -1) return src;
    const re = /\bclass\s+\w+/g;
    const before = src.slice(0, mainIdx);
    let last = null, m;
    while ((m = re.exec(before)) !== null) last = m;
    if (!last) return src;
    return src.slice(0, last.index) + 'public ' + src.slice(last.index);
}

// Students often write browser-style JavaScript (prompt / alert), but the run
// button executes plain Node, where those don't exist. Append tiny versions to
// the END of the program: function declarations are hoisted, so they work from
// line 1 without shifting any line numbers. prompt() reads one line per call
// from the INPUT box. Skipped when the program defines its own prompt/alert.
function addBrowserShims(src) {
    if (typeof src !== 'string') return src;
    const declares = (name) => new RegExp('\\b(?:const|let|var|function|class)\\s+' + name + '\\b').test(src);
    let extra = '';
    if (/\bprompt\s*\(/.test(src) && !declares('prompt')) {
        extra += `
var __cc_lines, __cc_pos;
function prompt(message) {
  if (!__cc_lines) {
    try { __cc_lines = require('fs').readFileSync(0, 'utf8').split(/\\r?\\n/); } catch (e) { __cc_lines = []; }
    __cc_pos = 0;
  }
  var answer = __cc_pos < __cc_lines.length ? __cc_lines[__cc_pos++] : null;
  if (message !== undefined) process.stdout.write(String(message) + ' ' + (answer === null ? '' : answer) + '\\n');
  return answer;
}
`;
    }
    if (/\balert\s*\(/.test(src) && !declares('alert')) {
        extra += `
function alert(message) { console.log(message === undefined ? '' : String(message)); }
`;
    }
    return extra ? src + '\n' + extra : src;
}

function describeFailure(result) {
    if (result.errorType === 'run-timeout') {
        return `Your program timed out after ${10}s without finishing. This usually means it is waiting for input (cin/scanf/input()) — type your values in the Input box above the terminal and run again — or it has an infinite loop.`;
    }
    if (result.errorType === 'compile-timeout') {
        return `Compilation took too long and was stopped. Try again — this can happen on a slow first run.`;
    }
    return result.stderr || result.stdout || (result.code ? `Runner error: ${result.code}` : 'Unknown error');
}

const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json())

//Compiling code for all languages
app.post("/python", (req, res) => {
    const resultPromise = python.runSource(req.body.runcode, { timeout: 10000, stdin: getStdin(req) });
    resultPromise
        .then(result => {
            console.log('[python]', result);
            if (result.exitCode == 0) {
                res.json(result.stdout)
            }
            else {
                res.json({ error: true, stderr: describeFailure(result), exitCode: result.exitCode })
            }
        })
        .catch(err => {
            console.log(err);
            res.json({ error: true, stderr: String(err) })
        });
})
app.post("/node", (req, res) => {
    const resultPromise = node.runSource(addBrowserShims(req.body.runcode), { timeout: 10000, stdin: getStdin(req) });
    resultPromise
        .then(result => {
            console.log('[node]', result);
            if (result.exitCode == 0) {
                res.json(result.stdout)
            }
            else {
                res.json({ error: true, stderr: describeFailure(result), exitCode: result.exitCode })
            }
        })
        .catch(err => {
            console.log(err);
            res.json({ error: true, stderr: String(err) })
        });
})
app.post("/java", (req, res) => {
    if (!ensureCompilerAvailable('java')) {
        return res.json({ error: true, stderr: `'javac' was not found on this server's PATH. Install a JDK (e.g. Adoptium Temurin) to run Java here, or use "evaluate" for an AI-predicted result.` });
    }
    const resultPromise = java.runSource(ensurePublicMainClass(req.body.runcode), { timeout: 10000, compileTimeout: 15000, stdin: getStdin(req) });
    resultPromise
        .then(result => {
            console.log('[java]', result);
            if (result.exitCode == 0) {
                res.json(result.stdout)
            }
            else {
                res.json({ error: true, stderr: describeFailure(result), exitCode: result.exitCode })
            }
        })
        .catch(err => {
            console.log(err);
            res.json({ error: true, stderr: String(err) })
        });
})
app.post("/c", (req, res) => {
    if (!ensureCompilerAvailable('c')) {
        return res.json({ error: true, stderr: `'gcc' was not found on this server's PATH. Install MSYS2/MinGW-w64 (Windows) to run C here, or use "evaluate" for an AI-predicted result.` });
    }
    const resultPromise = c.runSource(req.body.runcode, { timeout: 10000, compileTimeout: 15000, stdin: getStdin(req) });
    resultPromise
        .then(result => {
            console.log('[c]', result);
            if (result.exitCode == 0) {
                res.json(result.stdout)
            }
            else {
                res.json({ error: true, stderr: describeFailure(result), exitCode: result.exitCode })
            }
        })
        .catch(err => {
            console.log(err);
            res.json({ error: true, stderr: String(err) })
        });
})
app.post("/cpp", (req, res) => {
    if (!ensureCompilerAvailable('cpp')) {
        return res.json({ error: true, stderr: `'g++' was not found on this server's PATH. Install MSYS2/MinGW-w64 (Windows) to run C++ here, or use "evaluate" for an AI-predicted result.` });
    }
    const resultPromise = cpp.runSource(req.body.runcode, { timeout: 10000, compileTimeout: 15000, stdin: getStdin(req) });
    resultPromise
        .then(result => {
            console.log('[cpp]', result);
            if (result.exitCode == 0) {
                res.json(result.stdout)
            }
            else {
                res.json({ error: true, stderr: describeFailure(result), exitCode: result.exitCode })
            }
        })
        .catch(err => {
            console.log(err);
            res.json({ error: true, stderr: String(err) })
        });
})

const userSocketMap = {};
// Keep latest editor state per room so new joiners get full state immediately
const roomStates = {}; // { [roomId]: { files, activeFileId, ... } }

function getAllConnectedClients(roomId) {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId) => {
        return {
            socketId,
            username: userSocketMap[socketId],
        }
    });
}

// ---- Voice chat signaling (WebRTC) ----
// The audio itself flows directly between browsers (peer-to-peer). The server
// only relays the small connection-handshake messages and tracks who is in voice.
const voiceRooms = {}; // roomId -> Set of socket ids currently in voice

function leaveVoice(socket) {
    const roomId = socket.data.voiceRoom;
    if (!roomId) return;
    socket.data.voiceRoom = null;
    const members = voiceRooms[roomId];
    if (!members) return;
    members.delete(socket.id);
    socket.to(roomId).emit('voice:peer-left', { socketId: socket.id });
    io.to(roomId).emit('voice:users', [...members]);
    if (members.size === 0) delete voiceRooms[roomId];
}

//Socket io connection
io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        console.log(`[JOIN] user=${username} socket=${socket.id} room=${roomId}`);
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        console.log(`[JOIN] clients in room ${roomId}:`, clients);
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            })
        })

        // Send the latest room editor state to the newly joined client, if available
        const state = roomStates[roomId];
        if (state) {
            console.log(`[JOIN] sending cached state to ${socket.id}: files=${state.files ? Object.keys(state.files).length : 0}, activeFileId=${state.activeFileId}`);
            io.to(socket.id).emit(ACTIONS.CODE_CHANGE, state);
        }

        // Send chat history for this room (from MongoDB if connected, otherwise empty)
        loadRecentMessages(roomId).then((history) => {
            io.to(socket.id).emit('chat:history', history);
        });
    });

    //For code change - store latest state and forward to room
    socket.on(ACTIONS.CODE_CHANGE, (payload) => {
        const { roomId } = payload || {};
        if (roomId) {
            const count = payload.files ? Object.keys(payload.files).length : 0;
            console.log(`[CODE_CHANGE] room=${roomId} from=${socket.id} files=${count} activeFileId=${payload.activeFileId}`);
            roomStates[roomId] = payload; // persist latest state
            socket.in(roomId).emit(ACTIONS.CODE_CHANGE, payload);
        }
    });

    //For syncing code - also update room state if roomId provided, then send to specific socket
    socket.on(ACTIONS.SYNC_CODE, (payload) => {
        const { socketId, roomId } = payload || {};
        if (roomId) {
            const count = payload.files ? Object.keys(payload.files).length : 0;
            console.log(`[SYNC_CODE] room=${roomId} from=${socket.id} -> to=${socketId} files=${count} activeFileId=${payload.activeFileId}`);
            roomStates[roomId] = payload;
        }
        if (socketId) {
            io.to(socketId).emit(ACTIONS.CODE_CHANGE, payload);
        }
    });

    // Share terminal run output with everyone else in the room
    socket.on('terminal:output', ({ roomId, username, fileName, lines }) => {
        if (!roomId || !Array.isArray(lines)) return;
        socket.to(roomId).emit('terminal:output', { username, fileName, lines: lines.slice(0, 500) });
    });

    // Voice chat: who is currently in voice for this room
    socket.on('voice:who', ({ roomId }) => {
        if (!roomId || !socket.rooms.has(roomId)) return;
        socket.emit('voice:users', [...(voiceRooms[roomId] || [])]);
    });

    // Voice chat: join. The joiner receives the people already in voice and
    // sends each of them an offer, so two people never offer at the same time.
    socket.on('voice:join', ({ roomId }) => {
        if (!roomId || !socket.rooms.has(roomId)) return; // must be in the room first
        leaveVoice(socket);
        const members = (voiceRooms[roomId] = voiceRooms[roomId] || new Set());
        const existing = [...members];
        members.add(socket.id);
        socket.data.voiceRoom = roomId;
        socket.emit('voice:peers', existing);
        io.to(roomId).emit('voice:users', [...members]);
    });

    // Voice chat: relay a handshake message (offer / answer / ICE candidate) to one peer
    socket.on('voice:signal', ({ to, data }) => {
        const roomId = socket.data.voiceRoom;
        if (!to || !data || !roomId) return;
        if (!voiceRooms[roomId] || !voiceRooms[roomId].has(to)) return; // same voice room only
        io.to(to).emit('voice:signal', { from: socket.id, data });
    });

    socket.on('voice:leave', () => leaveVoice(socket));

    //For chat message — scoped to the sender's room only, and persisted if MongoDB is connected
    socket.on('message', ({ roomId, name, message }) => {
        if (!roomId || !message) return;
        io.to(roomId).emit('message', { name, message });
        saveMessage(roomId, name, message);
    })

    //For disconnection
    socket.on('disconnecting', () => {
        leaveVoice(socket);
        const rooms = [...socket.rooms]
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            })
        })
        delete userSocketMap[socket.id];
        socket.leave();
    })
})


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));