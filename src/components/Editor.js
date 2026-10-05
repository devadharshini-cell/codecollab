import React, { useEffect, useRef, useState, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import ACTIONS from '../Actions';
import Button from 'react-bootstrap/esm/Button';
import Dropdown from 'react-bootstrap/Dropdown';
import { v4 as uuidv4 } from 'uuid';

const EXT_CONFIG = {
    js: { monaco: 'javascript', runtime: 'node', template: "console.log('Hello from JS')\n" },
    py: { monaco: 'python', runtime: 'python', template: "print('Hello from Python')\n" },
    c: { monaco: 'c', runtime: 'c', template: "#include <stdio.h>\nint main(){ printf(\"Hello C\\n\"); return 0;}\n" },
    cpp: { monaco: 'cpp', runtime: 'cpp', template: "#include <iostream>\nint main(){ std::cout << \"Hello C++\\n\"; return 0;}\n" },
    java: { monaco: 'java', runtime: 'java', template: "public class Main { public static void main(String[] args){ System.out.println(\"Hello Java\"); } }\n" },
};

function getExtFromName(name) {
    const parts = name.split('.')
    return parts.length > 1 ? parts.pop() : 'js';
}

function makeFile(name) {
    const ext = getExtFromName(name);
    const cfg = EXT_CONFIG[ext] || EXT_CONFIG.js;
    return {
        id: uuidv4(),
        name,
        extension: ext,
        monacoLanguage: cfg.monaco,
        runtime: cfg.runtime,
        content: cfg.template,
    };
}

const CodeEditor = ({ socketRef, roomId, onCodeChange, initialLanguage }) => {
    const editorRef = useRef(null);
    const isApplyingRemoteUpdate = useRef(false);
    const filesRef = useRef({});
    const activeFileIdRef = useRef(null);

    // Create one initial file so both states share the same id.
    // Uses whichever language was picked on the homepage's "Create Room" screen,
    // falling back to JS if none was passed (e.g. joined an existing room).
    const initialExt = (initialLanguage && EXT_CONFIG[initialLanguage]) ? initialLanguage : 'js';
    const initialFile = useMemo(() => makeFile(`main.${initialExt}`), [initialExt]);
    const [files, setFiles] = useState(() => ({ [initialFile.id]: initialFile }));
    const [activeFileId, setActiveFileId] = useState(() => initialFile.id);
    const activeFile = useMemo(() => files[activeFileId], [files, activeFileId]);

    // keep refs up to date
    useEffect(() => { filesRef.current = files; }, [files]);
    useEffect(() => { activeFileIdRef.current = activeFileId; }, [activeFileId]);

    // Keep parent informed for SYNC_CODE from Editorpage
    useEffect(() => {
        if (typeof onCodeChange === 'function') {
            onCodeChange({ files, activeFileId });
        }
    }, [files, activeFileId, onCodeChange]);

    // One-time initial sync to server so room state exists before any edits
    const didInitialSync = useRef(false);
    useEffect(() => {
        if (didInitialSync.current) return;
        if (socketRef.current && roomId) {
            didInitialSync.current = true;
            socketRef.current.emit(ACTIONS.CODE_CHANGE, { roomId, files, activeFileId });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socketRef, roomId]);

    const handleEditorDidMount = (editor) => {
        editorRef.current = editor;
    };

    const handleEditorChange = (value) => {
        if (!activeFile) return;
        setFiles(prev => ({
            ...prev,
            [activeFile.id]: { ...activeFile, content: value ?? '' },
        }));
        if (isApplyingRemoteUpdate.current) return;
        if (socketRef.current) {
            const nextFiles = {
                ...filesRef.current,
                [activeFile.id]: { ...activeFile, content: value ?? '' },
            };
            const nextActiveId = activeFileIdRef.current;
            socketRef.current.emit(ACTIONS.CODE_CHANGE, {
                roomId,
                files: nextFiles,
                activeFileId: nextActiveId,
            });
        }
    };

    // Receive remote updates
    useEffect(() => {
        if (!socketRef.current) return;
        const handler = (payload) => {
            // Support legacy single-code payload
            if (payload && typeof payload === 'object') {
                if (payload.files) {
                    console.log('[CLIENT] CODE_CHANGE received', {
                        filesCount: Object.keys(payload.files || {}).length,
                        activeFileId: payload.activeFileId,
                    });
                    isApplyingRemoteUpdate.current = true;
                    try {
                        setFiles(payload.files);
                        if (payload.activeFileId) setActiveFileId(payload.activeFileId);
                    } finally {
                        // Delay a bit so Monaco onChange from value update doesn't echo
                        setTimeout(() => { isApplyingRemoteUpdate.current = false; }, 50);
                    }
                    return;
                }
                if (payload.code && editorRef.current) {
                    // Legacy mode: overwrite active file content
                    const newValue = payload.code;
                    editorRef.current.setValue(newValue);
                }
            }
        };
        socketRef.current.on(ACTIONS.CODE_CHANGE, handler);
        return () => {
            socketRef.current && socketRef.current.off(ACTIONS.CODE_CHANGE, handler);
        };
    }, [socketRef]);

    // File tab operations
    const addFile = (ext = 'js') => {
        const base = `file${Object.keys(files).length + 1}.${ext}`;
        const name = window.prompt('New file name', base) || base;
        const f = makeFile(name);
        setFiles(prev => ({ ...prev, [f.id]: f }));
        setActiveFileId(f.id);
        // broadcast
        socketRef.current?.emit(ACTIONS.CODE_CHANGE, { roomId, files: { ...filesRef.current, [f.id]: f }, activeFileId: f.id });
    };

    const closeFile = (id) => {
        const currentFiles = filesRef.current;
        const currentActive = activeFileIdRef.current;
        if (Object.keys(currentFiles).length === 1) return;
        const { [id]: _removed, ...rest } = currentFiles;
        let nextActive = currentActive;
        if (id === currentActive) {
            const ids = Object.keys(rest);
            nextActive = ids[0];
        }
        setFiles(rest);
        setActiveFileId(nextActive);
        socketRef.current?.emit(ACTIONS.CODE_CHANGE, { roomId, files: rest, activeFileId: nextActive });
    };

    const renameFile = (id) => {
        const current = files[id];
        const nextName = window.prompt('Rename file', current.name);
        if (!nextName) return;
        const ext = getExtFromName(nextName);
        const cfg = EXT_CONFIG[ext] || EXT_CONFIG.js;
        const updated = { ...current, name: nextName, extension: ext, monacoLanguage: cfg.monaco, runtime: cfg.runtime };
        const next = { ...filesRef.current, [id]: updated };
        setFiles(next);
        if (id === activeFileId) {
            // update language for active file
        }
        socketRef.current?.emit(ACTIONS.CODE_CHANGE, { roomId, files: next, activeFileId });
    };

    const switchFile = (id) => {
        setActiveFileId(id);
        // Broadcast active tab change so all clients stay in sync
        socketRef.current?.emit(ACTIONS.CODE_CHANGE, { roomId, files: filesRef.current, activeFileId: id });
    };

    const addMenu = (
        <Dropdown>
            <Dropdown.Toggle className='all-btn' style={{ backgroundColor: '#4d67c3', border: 'none', borderRadius: '7px' }} id="add-file">
                New File
            </Dropdown.Toggle>
            <Dropdown.Menu>
                <Dropdown.Item onClick={() => addFile('js')}>JavaScript (.js)</Dropdown.Item>
                <Dropdown.Item onClick={() => addFile('py')}>Python (.py)</Dropdown.Item>
                <Dropdown.Item onClick={() => addFile('c')}>C (.c)</Dropdown.Item>
                <Dropdown.Item onClick={() => addFile('cpp')}>C++ (.cpp)</Dropdown.Item>
                <Dropdown.Item onClick={() => addFile('java')}>Java (.java)</Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    );

    const downloadActiveFile = () => {
        if (!activeFile) return;
        const element = document.createElement('a');
        const file = new Blob([`${activeFile.content}`], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = activeFile.name;
        document.body.appendChild(element);
        element.click();
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: '#1e1e1e', borderBottom: '1px solid #333', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', flex: 1 }}>
                    {Object.values(files).map((f) => (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', background: f.id === activeFileId ? '#2a2a2a' : 'transparent', color: 'white', border: f.id === activeFileId ? '1px solid #444' : '1px solid transparent' }} onClick={() => switchFile(f.id)} onDoubleClick={() => renameFile(f.id)}>
                            <span>{f.name}</span>
                            <Button size='sm' style={{ background: 'transparent', border: 'none', padding: 0, color: '#bbb' }} onClick={(e) => { e.stopPropagation(); closeFile(f.id); }}>x</Button>
                        </div>
                    ))}
                </div>
                {addMenu}
            </div>

            {/* Editor - fills all remaining space, scrolls internally, resizes with the panel */}
            <div style={{ flex: 1, minHeight: 0, border: '1px solid #333', borderTop: 'none' }}>
                <Editor
                    height="100%"
                    language={activeFile?.monacoLanguage || 'javascript'}
                    theme="vs-dark"
                    value={activeFile?.content || ''}
                    onChange={handleEditorChange}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        wordWrap: 'on',
                        automaticLayout: true,
                        scrollBeyondLastLine: false,
                        lineNumbers: 'on',
                        roundedSelection: false,
                        readOnly: false,
                        cursorStyle: 'line',
                        folding: true,
                        foldingStrategy: 'indentation',
                        showFoldingControls: 'always',
                        disableLayerHinting: true,
                        renderLineHighlight: 'all',
                        selectOnLineNumbers: true,
                        glyphMargin: true,
                        useTabStops: false,
                        tabSize: 2,
                        insertSpaces: true
                    }}
                />
            </div>

            {/* Controls */}
            <div className='editor-buttons' style={{ flexShrink: 0 }}>
                <Button className='all-btn' style={{ marginRight: '1rem', backgroundColor: 'rgb(77, 103, 195)', border: 'none' }} onClick={downloadActiveFile}>Save</Button>
                <span style={{ color: 'white', fontFamily: '\'Baloo Bhaijaan 2\' , cursive', marginLeft: '1rem', fontSize: '14px' }}>
                    Use terminal below to run files
                </span>
            </div>
        </div>
    )
};

export default CodeEditor;