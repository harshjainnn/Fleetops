import { useState, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Send, Bot, User, Loader2, Cpu } from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

export default function AIAssistantPage() {
  const { searchQuery = '' } = useOutletContext() || {};
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      content: 'Hello! I am your AI Logistics Assistant. I have access to the MCP tools to track drivers, check delayed orders, and summarize fleet operations. How can I help you today?',
      toolUsed: null
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [applyingRecommendationFor, setApplyingRecommendationFor] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!searchQuery || query.trim()) return;
    setQuery(searchQuery);
  }, [searchQuery, query]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userMessage = { role: 'user', content: query, toolUsed: null };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setLoading(true);

    try {
      const res = await axios.post(`${API_URL}/ai/query`, { query: userMessage.content });
      console.log('API RESPONSE', res.data);
      const normalized = {
        success: Boolean(res.data?.success ?? true),
        response: res.data?.response || res.data?.answer || 'No response received from assistant.',
        toolUsed: res.data?.toolUsed || null,
        applyRecommendation: res.data?.applyRecommendation || null
      };
      console.log('NORMALIZED DATA', normalized);
      setMessages(prev => [...prev, {
        role: 'ai',
        content: normalized.response,
        toolUsed: normalized.toolUsed,
        applyRecommendation: normalized.applyRecommendation,
        recommendationApplied: false
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'ai',
        content: 'Sorry, I encountered an error while processing your request.',
        toolUsed: null,
        isError: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyRecommendation = async (messageIndex) => {
    const targetMessage = messages[messageIndex];
    const payload = targetMessage?.applyRecommendation;
    if (!payload || applyingRecommendationFor !== null) return;

    setApplyingRecommendationFor(messageIndex);
    try {
      const res = await axios.post(`${API_URL}/ai/apply-optimization`, payload);
      const responseText = res.data?.response || 'Optimization was applied.';
      setMessages((prev) => {
        const next = [...prev];
        if (next[messageIndex]) {
          next[messageIndex] = { ...next[messageIndex], recommendationApplied: true };
        }
        next.push({
          role: 'ai',
          content: responseText,
          toolUsed: 'apply_optimization'
        });
        return next;
      });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content: 'Optimization approval was received, but execution failed. Please retry.',
          toolUsed: 'apply_optimization',
          isError: true
        }
      ]);
    } finally {
      setApplyingRecommendationFor(null);
    }
  };

  const suggestions = [
    "Which driver is closest to Order ORD001?",
    "Which orders are delayed?",
    "Suggest a better route for driver DRV001",
    "Show me the fleet summary"
  ];

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">AI Logistics Assistant</h1>
        <p className="text-gray-400 mt-1">Powered by MCP and Gemini</p>
      </div>

      <div className="flex-1 glass-panel rounded-2xl overflow-hidden flex flex-col shadow-2xl border border-gray-700">
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                
                <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                  msg.role === 'user' ? 'bg-blue-600 ml-4' : 'bg-gradient-to-br from-purple-500 to-indigo-600 mr-4'
                }`}>
                  {msg.role === 'user' ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5 text-white" />}
                </div>

                <div className="flex flex-col">
                  <div className={`px-5 py-4 rounded-2xl ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : msg.isError 
                        ? 'bg-red-900/50 border border-red-500 text-white rounded-tl-none'
                        : 'bg-gray-800 border border-gray-700 text-gray-100 rounded-tl-none shadow-md'
                  }`}>
                    {/* Render newlines properly */}
                    <div className="prose prose-invert max-w-none">
                      {msg.content.split('\n').map((line, i) => (
                        <p key={i} className="my-1">{line}</p>
                      ))}
                    </div>
                  </div>
                  
                  {msg.toolUsed && (
                    <div className="mt-2 flex items-center text-xs text-gray-400 bg-gray-900/50 self-start px-3 py-1.5 rounded-full border border-gray-800">
                      <Cpu className="h-3 w-3 mr-1.5 text-purple-400" />
                      Executed MCP Tool: <span className="text-purple-400 font-mono ml-1">{msg.toolUsed}</span>
                    </div>
                  )}
                  {msg.role === 'ai' && msg.applyRecommendation && !msg.recommendationApplied && (
                    <button
                      onClick={() => handleApplyRecommendation(idx)}
                      disabled={applyingRecommendationFor !== null}
                      className="mt-3 self-start text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg border border-blue-500 transition-colors"
                    >
                      {applyingRecommendationFor === idx ? 'Applying Recommendation...' : 'Apply Recommendation'}
                    </button>
                  )}
                  {msg.role === 'ai' && msg.recommendationApplied && (
                    <div className="mt-3 self-start text-xs bg-green-900/40 border border-green-700 text-green-300 px-3 py-1.5 rounded-lg">
                      Recommendation Applied
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {loading && (
            <div className="flex justify-start">
              <div className="flex flex-row">
                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 mr-4 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div className="bg-gray-800 border border-gray-700 px-5 py-4 rounded-2xl rounded-tl-none flex items-center">
                  <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                  <span className="ml-3 text-gray-400 text-sm">Querying logistics tools...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-gray-900/80 border-t border-gray-800">
          <div className="flex flex-wrap gap-2 mb-4">
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => setQuery(suggestion)}
                className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
              >
                {suggestion}
              </button>
            ))}
          </div>
          
          <form onSubmit={handleSubmit} className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask anything about the fleet, orders, or drivers..."
              className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-4 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-100 placeholder-gray-500"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!query.trim() || loading}
              className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
