// Groq API client for AI evaluation
// Model: llama-3.1-8b-instant (free, fast, always available on Groq)

const GROQ_KEY_STORAGE = 'groq_api_key';
export const GROQ_MODEL = 'openai/gpt-oss-120b';

export const getGroqKey = () =>
    localStorage.getItem(GROQ_KEY_STORAGE) || process.env.REACT_APP_GROQ_API_KEY || '';
export const setGroqKey = (key) => localStorage.setItem(GROQ_KEY_STORAGE, key);
export const clearGroqKey = () => localStorage.removeItem(GROQ_KEY_STORAGE);

export const evaluateCodeWithGroq = async ({ code, language, fileName }) => {
    const key = getGroqKey();
    if (!key) throw new Error('No Groq API key. Set one in the AI Assistant tab.');

    const prompt = `You are a code review expert. Analyze this ${language || 'code'} file named "${fileName}".

Code:
\`\`\`${language}
${code}
\`\`\`

Respond in exactly this format (no extra text):
VERDICT: [Correct / Has Issues / Syntax Error]
PREDICTED OUTPUT: [what the code would print/return, or "N/A"]
ISSUES: [brief list of issues, or "None found"]
FIX: [short fix suggestion, or "N/A"]`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }],
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Groq API error ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || 'No response from AI.';
};

export const chatWithGroq = async (messages, systemPrompt) => {
    const key = getGroqKey();
    if (!key) throw new Error('No Groq API key. Set one in the AI Assistant tab.');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            max_tokens: 1024,
            messages: [
                { role: 'system', content: systemPrompt || 'You are a helpful coding assistant.' },
                ...messages,
            ],
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Groq API error ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || 'No response from AI.';
};

// Compatibility wrapper: AIAssistant.js calls askGroq(messagesArray, { temperature, maxTokens }).
// messagesArray here already includes its own system message as the first entry.
export const askGroq = async (messages, { maxTokens = 1024 } = {}) => {
    const key = getGroqKey();
    if (!key) throw new Error('No Groq API key. Set one in the AI Assistant tab.');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            max_tokens: maxTokens,
            messages,
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Groq API error ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || 'No response from AI.';
};