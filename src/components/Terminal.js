import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import axios from 'axios';
import { SERVER_URL } from '../config';
import { getGroqKey, evaluateCodeWithGroq } from '../groqClient';

const LANG_LABELS = {
    node: 'JavaScript (Node.js)',
    python: 'Python',
    java: 'Java',
    c: 'C (gcc)',
    cpp: 'C++ (g++)',
};

const TerminalComponent = ({ socketRef, roomId, editorFiles, activeFileId }) => {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(null);
    const [isTerminalActive, setIsTerminalActive] = useState(true);
    const filesRef = useRef(editorFiles);
    const activeFileIdRef = useRef(activeFileId);

    useEffect(() => { filesRef.current = editorFiles; }, [editorFiles]);
    useEffect(() => { activeFileIdRef.current = activeFileId; }, [activeFileId]);

    useEffect(() => {
        if (!terminalRef.current) return;
        const xterm = new Terminal({
            cursorBlink: true,
            convertEol: true,
            scrollback: 5000,
            theme: {
                background: '#0D1117',
                foreground: '#C9D1D9',
                cursor: '#7C3AED',
                selectionBackground: '#264f78',
                black: '#000000', red: '#ff7b72', green: '#3fb950',
                yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff',
                cyan: '#39c5cf', white: '#b1bac4',
                brightBlack: '#6e7681', brightRed: '#ffa198',
                brightGreen: '#56d364', brightYellow: '#e3b341',
                brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
                brightCyan: '#56d4dd', brightWhite: '#ffffff',
            },
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
            fontWeight: '400',
            lineHeight: 1.4,
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();
        xterm.loadAddon(fitAddon);
        xterm.loadAddon(webLinksAddon);
        xterm.open(terminalRef.current);
        setTimeout(() => fitAddon.fit(), 50);

        xtermRef.current = xterm;
        fitAddonRef.current = fitAddon;

        xterm.writeln('\x1b[1;35m╔══════════════════════════════════════╗\x1b[0m');
        xterm.writeln('\x1b[1;35m║       Welcome to CodeCollab Terminal  ║\x1b[0m');
        xterm.writeln('\x1b[1;35m╚══════════════════════════════════════╝\x1b[0m');
        xterm.writeln('\x1b[90mType \x1b[33mhelp\x1b[90m to see available commands.\x1b[0m');
        xterm.writeln('');

        let currentLine = '';
        let commandHistory = [];
        let historyIndex = -1;

        const prompt = () => xterm.write('\x1b[1;32m❯\x1b[0m ');

        xterm.onData((data) => {
            const code = data.charCodeAt(0);
            if (code === 13) {
                xterm.writeln('');
                if (currentLine.trim()) {
                    commandHistory.push(currentLine.trim());
                    historyIndex = commandHistory.length;
                    executeCommand(currentLine.trim());
                } else {
                    prompt();
                }
                currentLine = '';
            } else if (code === 127) {
                if (currentLine.length > 0) {
                    currentLine = currentLine.slice(0, -1);
                    xterm.write('\b \b');
                }
            } else if (code === 27 && data.length > 2 && data.charCodeAt(1) === 91) {
                const k = data.charCodeAt(2);
                if (k === 65 && historyIndex > 0) {
                    historyIndex--;
                    xterm.write('\r\x1b[2K');
                    prompt();
                    currentLine = commandHistory[historyIndex] || '';
                    xterm.write(currentLine);
                } else if (k === 66 && historyIndex < commandHistory.length - 1) {
                    historyIndex++;
                    xterm.write('\r\x1b[2K');
                    prompt();
                    currentLine = commandHistory[historyIndex] || '';
                    xterm.write(currentLine);
                }
            } else if (code >= 32) {
                currentLine += data;
                xterm.write(data);
            }
        });

        prompt();

        const handleResize = () => fitAddonRef.current?.fit();
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            xterm.dispose();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const t = setTimeout(() => fitAddonRef.current?.fit(), 350);
        return () => clearTimeout(t);
    }, [isTerminalActive]);

    const getActiveFile = () => {
        const files = filesRef.current;
        const id = activeFileIdRef.current;
        if (!files || !id) return null;
        return files[id] || null;
    };

    const writeInfo  = (t, msg) => t.writeln(`\x1b[36m  ${msg}\x1b[0m`);
    const writeOk    = (t, msg) => t.writeln(`\x1b[32m✔ ${msg}\x1b[0m`);
    const writeErr   = (t, msg) => t.writeln(`\x1b[31m✖ ${msg}\x1b[0m`);
    const writeWarn  = (t, msg) => t.writeln(`\x1b[33m⚠ ${msg}\x1b[0m`);
    const prompt     = () => xtermRef.current?.write('\x1b[1;32m❯\x1b[0m ');

    const executeCommand = async (command) => {
        const xterm = xtermRef.current;
        if (!xterm) return;
        const args = command.split(' ').filter(Boolean);
        const cmd = args[0].toLowerCase();

        try {
            switch (cmd) {
                case 'help':
                    xterm.writeln('\x1b[1;36m  CodeCollab Terminal Commands\x1b[0m');
                    xterm.writeln('\x1b[90m  ────────────────────────────────────\x1b[0m');
                    const helps = [
                        ['help', 'Show this message'],
                        ['clear', 'Clear terminal'],
                        ['ls', 'List workspace files'],
                        ['cat <file>', 'Print file content'],
                        ['run [file]', 'Run active or named file'],
                        ['node [file]', 'Run JS file'],
                        ['python [file]', 'Run Python file'],
                        ['javac <file>', 'Compile Java file'],
                        ['gcc <file>', 'Compile & run C file'],
                        ['g++ <file>', 'Compile & run C++ file'],
                        ['evaluate [file]', 'AI code review (Groq)'],
                        ['pwd', 'Show directory'],
                        ['date', 'Show date/time'],
                    ];
                    helps.forEach(([c, d]) => xterm.writeln(`  \x1b[33m${c.padEnd(20)}\x1b[0m\x1b[90m${d}\x1b[0m`));
                    xterm.writeln('');
                    prompt(); break;

                case 'clear':
                    xterm.clear();
                    xterm.writeln('\x1b[90mTerminal cleared.\x1b[0m\n');
                    prompt(); break;

                case 'ls': {
                    const files = filesRef.current || {};
                    const activeId = activeFileIdRef.current;
                    if (Object.keys(files).length === 0) {
                        writeWarn(xterm, 'No files in workspace');
                    } else {
                        xterm.writeln('\x1b[1;36m  Workspace files:\x1b[0m');
                        Object.values(files).forEach(f => {
                            const lang = LANG_LABELS[f.runtime] || f.runtime || '';
                            const active = f.id === activeId ? ' \x1b[32m← active\x1b[0m' : '';
                            xterm.writeln(`  \x1b[33m${f.name.padEnd(22)}\x1b[90m${lang}\x1b[0m${active}`);
                        });
                    }
                    xterm.writeln('');
                    prompt(); break;
                }

                case 'cat': {
                    if (!args[1]) { writeErr(xterm, 'Usage: cat <filename>'); xterm.writeln(''); prompt(); break; }
                    const f = Object.values(filesRef.current || {}).find(f => f.name === args[1]);
                    if (f) {
                        xterm.writeln(`\x1b[90m── ${f.name} ──\x1b[0m`);
                        f.content.split('\n').forEach((line, i) =>
                            xterm.writeln(`\x1b[90m${String(i + 1).padStart(3)}  \x1b[0m${line}`)
                        );
                        xterm.writeln(`\x1b[90m── end ──\x1b[0m`);
                    } else { writeErr(xterm, `File not found: ${args[1]}`); }
                    xterm.writeln(''); prompt(); break;
                }

                case 'run':
                case 'node':
                case 'python':
                case 'javac':
                case 'java':
                case 'gcc':
                case 'g++': {
                    let target = null;
                    if (args[1]) {
                        target = Object.values(filesRef.current || {}).find(f => f.name === args[1]);
                        if (!target) { writeErr(xterm, `File not found: ${args[1]}`); xterm.writeln(''); prompt(); break; }
                    } else {
                        target = getActiveFile();
                        if (!target) { writeErr(xterm, 'No active file. Open a file first.'); xterm.writeln(''); prompt(); break; }
                    }

                    // Validate language for specific commands
                    const langMap = { node: 'js', python: 'py', javac: 'java', java: 'java', gcc: 'c', 'g++': 'cpp' };
                    const expectedExt = langMap[cmd];
                    if (expectedExt && target.extension !== expectedExt) {
                        writeErr(xterm, `"${target.name}" is not a .${expectedExt} file`);
                        writeWarn(xterm, `Use: run ${target.name} (auto-detects language)`);
                        xterm.writeln(''); prompt(); break;
                    }

                    writeInfo(xterm, `Running \x1b[33m${target.name}\x1b[36m as ${LANG_LABELS[target.runtime] || target.runtime}...`);
                    await runFileInBackend(target, xterm);
                    prompt(); break;
                }

                case 'evaluate': {
                    let target = args[1]
                        ? Object.values(filesRef.current || {}).find(f => f.name === args[1])
                        : getActiveFile();
                    if (!target) { writeErr(xterm, 'No file to evaluate.'); xterm.writeln(''); prompt(); break; }
                    await evaluateFileWithAI(target, xterm);
                    prompt(); break;
                }

                case 'pwd':
                    writeInfo(xterm, '/workspace/code-collab');
                    xterm.writeln(''); prompt(); break;

                case 'date':
                    writeInfo(xterm, new Date().toString());
                    xterm.writeln(''); prompt(); break;

                default:
                    writeErr(xterm, `Command not found: \x1b[33m${cmd}\x1b[31m. Type \x1b[33mhelp\x1b[31m to see commands.`);
                    xterm.writeln(''); prompt(); break;
            }
        } catch (err) {
            writeErr(xterm, err.message);
            xterm.writeln(''); prompt();
        }
    };

    const runFileInBackend = async (file, xterm) => {
        try {
            const response = await axios.post(`${SERVER_URL}/${file.runtime}`, { runcode: file.content });
            const data = response.data;
            if (data && typeof data === 'object' && data.error) {
                writeErr(xterm, 'Execution failed:');
                xterm.writeln('');
                String(data.stderr || 'Unknown error').split('\n').forEach(line => xterm.writeln(`  ${line}`));
                writeWarn(xterm, `Tip: run "evaluate ${file.name}" for AI diagnosis`);
            } else if (data === 'SyntaxError') {
                writeErr(xterm, 'Syntax Error in file');
                writeWarn(xterm, `Tip: run "evaluate ${file.name}" for AI diagnosis`);
            } else {
                writeOk(xterm, 'Execution successful:');
                xterm.writeln('');
                String(data).split('\n').forEach(line => xterm.writeln(`  ${line}`));
            }
        } catch (err) {
            writeErr(xterm, `Execution failed: ${err.message}`);
            writeWarn(xterm, `The ${file.runtime} runtime may not be installed on the server, or your project folder path has spaces/special characters (e.g. "Downloads\\My Project (1)") which can break compilation on Windows.`);
            writeWarn(xterm, `Try: evaluate ${file.name}  ← AI will predict the output`);
        }
        xterm.writeln('');
    };

    const evaluateFileWithAI = async (file, xterm) => {
        if (!getGroqKey()) {
            writeErr(xterm, 'No Groq API key set.');
            writeWarn(xterm, 'Open the AI Assistant tab → paste your key from console.groq.com');
            xterm.writeln(''); return;
        }
        writeInfo(xterm, `🤖 Asking AI to review \x1b[33m${file.name}\x1b[36m...`);
        try {
            const result = await evaluateCodeWithGroq({ code: file.content, language: file.runtime, fileName: file.name });
            xterm.writeln('');
            result.split('\n').forEach(line => xterm.writeln(`  ${line}`));
        } catch (err) {
            writeErr(xterm, `AI evaluation failed: ${err.message}`);
        }
        xterm.writeln('');
    };

    const runActiveFile = () => {
        const file = getActiveFile();
        const xterm = xtermRef.current;
        if (!xterm) return;
        if (!file) { xterm.writeln('\x1b[31m✖ No active file\x1b[0m\n'); xterm.write('\x1b[1;32m❯\x1b[0m '); return; }
        xterm.writeln(`\x1b[36m❯ run ${file.name}\x1b[0m`);
        runFileInBackend(file, xterm).then(() => xterm.write('\x1b[1;32m❯\x1b[0m '));
    };

    const runAIEvaluate = () => {
        const file = getActiveFile();
        const xterm = xtermRef.current;
        if (!xterm) return;
        if (!file) { xtermRef.current.writeln('\x1b[31m✖ No active file\x1b[0m\n'); xtermRef.current.write('\x1b[1;32m❯\x1b[0m '); return; }
        evaluateFileWithAI(file, xterm).then(() => xtermRef.current?.write('\x1b[1;32m❯\x1b[0m '));
    };

    const clearTerminal = () => {
        if (xtermRef.current) {
            xtermRef.current.clear();
            xtermRef.current.writeln('\x1b[90mTerminal cleared.\x1b[0m\n');
            xtermRef.current.write('\x1b[1;32m❯\x1b[0m ');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0D1117' }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 12px', background: '#161B22', borderBottom: '1px solid #21262D',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8B949E', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>
                    <span style={{ color: '#3fb950', fontSize: 10 }}>●</span>
                    Terminal
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={runActiveFile} style={btnStyle('#3fb950', '#0D1117')}>▶ Run</button>
                    <button onClick={runAIEvaluate} style={btnStyle('#22D3EE', '#0D1117')}>🤖 AI Evaluate</button>
                    <button onClick={clearTerminal} style={btnStyle('#30363D', '#C9D1D9')}>Clear</button>
                    <button onClick={() => setIsTerminalActive(p => !p)} style={btnStyle('#30363D', '#C9D1D9')}>
                        {isTerminalActive ? 'Collapse ↓' : 'Expand ↑'}
                    </button>
                </div>
            </div>
            <div
                ref={terminalRef}
                style={{
                    flex: 1,
                    minHeight: 0,
                    padding: '4px',
                    background: '#0D1117',
                    display: isTerminalActive ? 'block' : 'none',
                    overflow: 'auto',
                }}
            />
            {!isTerminalActive && (
                <div style={{ padding: '12px 16px', color: '#484F58', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>
                    Terminal collapsed — click Expand ↑
                </div>
            )}
        </div>
    );
};

const btnStyle = (bg, color) => ({
    padding: '4px 12px',
    background: bg,
    border: 'none',
    borderRadius: 6,
    color,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
});

export default TerminalComponent;
