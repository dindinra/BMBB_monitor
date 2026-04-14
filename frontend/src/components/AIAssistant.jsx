import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './AIAssistant.css';

const API_BASE = window.location.origin;

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      type: 'assistant',
      text: '🥳 Halo euy! Sim Mank Jajank, asisten bijak & kocak pikeun BMBB! Naon anu bisa kumaha bantu anjeun? (Tanya naon sih tentang inventory, sales, atau pricing! 📊)',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!input.trim()) return;

    // Add user message to chat
    const userMessage = {
      id: `msg-${Date.now()}`,
      type: 'user',
      text: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      // Get the current page context for better AI responses
      let context = '';
      const currentPath = window.location.pathname;
      if (currentPath.includes('purchase')) {
        context = 'User sedang lihat Purchase Dashboard - tanya tentang inventory, purchasing patterns, vendor performance';
      } else if (currentPath.includes('sales')) {
        context = 'User sedang lihat Sales Dashboard - tanya tentang penjualan, trends, top items';
      } else if (currentPath.includes('price-comparison')) {
        context = 'User sedang lihat Price Comparison - tanya tentang harga per outlet, price differences';
      } else if (currentPath.includes('last-cost')) {
        context = 'User sedang lihat Last Cost - tanya tentang last purchase price per item';
      } else if (currentPath.includes('inventory')) {
        context = 'User sedang lihat Inventory - tanya tentang stock, buffer, inventory status';
      }

      const response = await axios.post(
        `${API_BASE}/ai/chat`,
        {
          message: input,
          context: context
        },
        {
          params: { user_id: 'bmbb_user' },
          timeout: 30000
        }
      );

      const assistantMessage = {
        id: response.data.id,
        type: 'assistant',
        text: response.data.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      const errorText = err.response?.data?.detail || err.message || 'Connection error';
      setError(errorText);
      
      const errorMessage = {
        id: `error-${Date.now()}`,
        type: 'error',
        text: `❌ Teu bisa jangkauan Mank Jajank: ${errorText}`,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    const confirmed = window.confirm('Hapus chat history? Mank Jajank masih inget tapi database cleared.');
    if (confirmed) {
      setMessages([
        {
          id: 'welcome',
          type: 'assistant',
          text: '🥳 Chat history terhapus! Sim si Mank Jajank siap dari awal lagi euy! Naon yang bisa kumaha bantu?',
          timestamp: new Date()
        }
      ]);
    }
  };

  return (
    <div className="ai-assistant">
      {/* Floating Button */}
      <button
        className="ai-assistant-button"
        onClick={() => setIsOpen(!isOpen)}
        title="Chat dengan Mank Jajank"
      >
        {isOpen ? '✕' : '🤖'}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="ai-assistant-window">
          <div className="ai-assistant-header">
            <div className="ai-assistant-title">
              <span className="ai-title-emoji">🥳</span>
              <span>Mank Jajank</span>
            </div>
            <span className="ai-subtitle">BMBB's Wise & Funny AI</span>
            <button
              className="ai-clear-btn"
              onClick={clearHistory}
              title="Clear chat history"
            >
              🗑️
            </button>
          </div>

          <div className="ai-messages">
            {messages.map(msg => (
              <div key={msg.id} className={`ai-message ai-message-${msg.type}`}>
                <div className="ai-message-avatar">
                  {msg.type === 'user' ? '👤' : msg.type === 'error' ? '⚠️' : '🤖'}
                </div>
                <div className="ai-message-content">
                  <p>{msg.text}</p>
                  <span className="ai-message-time">
                    {msg.timestamp.toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="ai-message ai-message-assistant">
                <div className="ai-message-avatar">🤖</div>
                <div className="ai-message-content">
                  <div className="ai-typing">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="ai-input-form">
            <input
              ref={inputRef}
              type="text"
              placeholder="Tanya naon sih ke Mank Jajank... 💭"
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
              className="ai-input"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="ai-send-btn"
            >
              {loading ? '⏳' : '➤'}
            </button>
          </form>

          {error && (
            <div className="ai-error">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
