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

function describeFailure(result) {
    if (result.errorType === 'run-timeout') {
        return `Your program timed out after ${10}s without finishing. This usually means it's waiting for input (cin/scanf/input()) that never arrives, or it has an infinite loop.`;
    }
    if (result.errorType === 'compile-timeout') {
        return `Compilation took too long and was stopped. Try again — this can happen on a slow first run.`;
    }
    return result.stderr || result.stdout || 'Unknown error';
}

const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json())

//Compiling code for all languages
app.post("/python", (req, res) => {
    const resultPromise = python.runSource(req.body.runcode, { timeout: 10000 });
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
    const resultPromise = node.runSource(req.body.runcode, { timeout: 10000 });
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
    const resultPromise = java.runSource(req.body.runcode, { timeout: 10000, compileTimeout: 15000 });
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
    const resultPromise = c.runSource(req.body.runcode, { timeout: 10000, compileTimeout: 15000 });
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
    const resultPromise = cpp.runSource(req.body.runcode, { timeout: 10000, compileTimeout: 15000 });
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

    //For chat message — scoped to the sender's room only, and persisted if MongoDB is connected
    socket.on('message', ({ roomId, name, message }) => {
        if (!roomId || !message) return;
        io.to(roomId).emit('message', { name, message });
        saveMessage(roomId, name, message);
    })

    //For disconnection
    socket.on('disconnecting', () => {
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