import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { sendMessageCancelable, clearCache } from '../services/abdulChat';
import ReactMarkdown from 'react-markdown';
import './AIAssistant.css';

const QUICK_ACTIONS = [
  "Tampilkan sales bulan ini",
  "Item paling mahal di Bandung",
  "Bandingkan Bandung vs Serpong",
  "Margin tertinggi",
  "Vendor terbaik",
  "Rekomendasi pembelian"
];

const API_KEY = process.env.REACT_APP_OPENROUTER_API_KEY || '';
const CURRENT_MODEL = 'openrouter/free';
const STORAGE_KEY = 'bmbb_ai_chat_history';

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load chat history:', e);
    }
    return [{ role: 'assistant', content: "Halo! Gue Mang Bebekyu, mandor data BMBB. Ada yang perlu dicek? 📦📈☕" }];
  });
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Persist messages to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {
      console.warn('Failed to save chat history:', e);
    }
  }, [messages]);

  // Auto-resize textarea based on content
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 96) + 'px';
    }
  }, [input]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async (text = input) => {
    if (!text.trim()) return;
    const userMsg = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    // Prepare abort controller for this request
    const { controller, promise } = sendMessageCancelable(messages, text);
    abortControllerRef.current = controller;
    try {
      const aiText = await promise;
      const assistantMsg = { role: 'assistant', content: aiText };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      if (err.name === 'AbortError') {
        const abortedMsg = { role: 'assistant', content: '🛑 Generasi dibatalkan.' };
        setMessages(prev => [...prev, abortedMsg]);
      } else {
        const errorMsg = { role: 'assistant', content: `⚠️ Error: ${err.message}` };
        setMessages(prev => [...prev, errorMsg]);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  const togglePanel = () => setIsOpen(!isOpen);

  const clearChat = () => {
    const welcome = "Chat dibersihkan. Ada yang bisa gue bantu? 😎";
    setMessages([{ role: 'assistant', content: welcome }]);
  };

  const handleClearCache = () => {
    clearCache();
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const exportChat = () => {
    const content = messages.map(m => {
      const role = m.role === 'user' ? '👤 User' : '🤖 Mang Bebekyu';
      const body = m.content.startsWith('```') ? m.content : `\`\`\`\n${m.content}\n\`\`\``;
      return `## ${role}\n${body}`;
    }).join('\n\n---\n\n');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `abdul-chat-${new Date().toISOString().slice(0,10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyMessage = (text) => {
    navigator.clipboard.writeText(text).catch(console.error);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={togglePanel}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center text-2xl"
        aria-label="Open AI Assistant"
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-7rem)] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
            <div>
              <h2 className="font-semibold">Mang Bebekyu Assistant</h2>
              <p className="text-xs opacity-80">Model: {CURRENT_MODEL}</p>
            </div>
            <div className="flex items-center gap-2">
              {loading && (
                <button onClick={stopGeneration} title="Stop generation" className="text-white hover:text-gray-200 text-lg">
                  🔴
                </button>
              )}
              <button onClick={exportChat} title="Export chat (Markdown)" className="text-white hover:text-gray-200 text-lg">
                📤
              </button>
              <button onClick={handleClearCache} title="Clear cache" className="text-white hover:text-gray-200 text-lg">
                🧹
              </button>
              <button onClick={togglePanel} title="Close" className="text-white hover:text-gray-200 text-xl">&times;</button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`group relative max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="markdown-content">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => copyMessage(msg.content)}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-300"
                      title="Copy"
                    >
                      📋
                    </button>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 animate-pulse">
                  Mang Bebekyu nge-typing...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick actions */}
          <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-x-auto whitespace-nowrap">
            {QUICK_ACTIONS.map((action, i) => (
              <button
                key={i}
                onClick={() => handleSend(action)}
                disabled={loading}
                className="inline-block mr-2 mb-2 px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full transition-colors disabled:opacity-50"
              >
                {action}
              </button>
            ))}
          </div>

          {/* Input area */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Tanyakan data BMBB..."
                rows={1}
                className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none max-h-24 overflow-y-auto"
                style={{ minHeight: '2.5rem' }}
              />
              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
              >
                ➤
              </button>
              <button
                onClick={clearChat}
                disabled={loading}
                className="px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200"
                title="Clear chat"
              >
                🗑️
              </button>
            </div>
            {!API_KEY && (
              <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                ⚠️ OpenRouter API key tidak dikonfigurasi. AI Assistant tidak akan berfungsi.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
