import React, { useState, useRef, useEffect } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import { askGroq } from '../groqClient';
import './AIAssistant.css';

const AIAssistant = ({ activeFile }) => {
    const [messages, setMessages] = useState([
        { role: 'assistant', text: 'Ask me to explain, debug, or improve your code.' }
    ]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, isThinking]);

    const ask = async (question) => {
        setIsThinking(true);
        try {
            const codeContext = activeFile
                ? `\n\nCurrent file (${activeFile.name}):\n\`\`\`${activeFile.extension}\n${activeFile.content}\n\`\`\``
                : '';

            const text = await askGroq([
                {
                    role: 'system',
                    content: 'You are a concise, practical pair-programming assistant embedded in a live collaborative code editor called Code-Collab. Keep answers short and actionable.'
                },
                { role: 'user', content: `${question}${codeContext}` }
            ], { temperature: 0.4, maxTokens: 700 });

            setMessages((prev) => [...prev, { role: 'assistant', text }]);
        } catch (err) {
            setMessages((prev) => [...prev, { role: 'assistant', text: `⚠️ ${err.message}` }]);
        } finally {
            setIsThinking(false);
        }
    };

    const handleSend = (e) => {
        e.preventDefault();
        const trimmed = input.trim();
        if (!trimmed || isThinking) return;
        setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
        setInput('');
        ask(trimmed);
    };

    return (
        <div className="ai-panel">
            <div className="ai-header">
                <span className="ai-dot" />
                <span className="ai-title">Groq Assistant</span>
            </div>

            <div className="ai-messages" ref={scrollRef}>
                {messages.map((m, i) => (
                    <div key={i} className={m.role === 'user' ? 'ai-msg-user' : 'ai-msg-bot'}>
                        {m.text}
                    </div>
                ))}
                {isThinking && <div className="ai-msg-bot ai-typing">thinking…</div>}
            </div>

            <Form className="ai-input-row" onSubmit={handleSend}>
                <InputGroup>
                    <Form.Control
                        placeholder="Ask about your code…"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={isThinking}
                    />
                    <Button type="submit" disabled={isThinking || !input.trim()} className="ai-send-btn">
                        →
                    </Button>
                </InputGroup>
            </Form>
        </div>
    );
};

export default AIAssistant;