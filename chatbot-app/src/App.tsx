import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Loader2, Plug, Sparkles, X, Zap, Wrench, Plus } from 'lucide-react';
import type { Message, Session } from './types';
import { api, type ChatMessage as ApiChatMessage, type PresetInfo } from './api';
import './App.css';

const BOT_NAME = 'Atlas';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<ApiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  // Fetch presets and auto-connect to already connected ones
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initializeApp = async () => {
      try {
        const res = await api.getPresets();
        setPresets(res.presets);

        // Find any preset that's already connected
        const connectedPreset = res.presets.find(p => p.status === 'connected' && p.sessionId);
        
        if (connectedPreset && connectedPreset.sessionId) {
          // Auto-use the already connected preset
          const toolsRes = await api.getTools(connectedPreset.sessionId);
          setSession({
            sessionId: connectedPreset.sessionId,
            serverUrl: connectedPreset.url,
            tools: toolsRes.tools,
            connectedAt: new Date(),
          });

          addMessage({
            role: 'bot',
            content: `Hi! I'm **${BOT_NAME}**, your AI assistant. 🤖\n\nI'm powered by **AWS Bedrock** and connected to **${connectedPreset.name}** with **${toolsRes.tools.length} tools**!\n\nAvailable tools: ${toolsRes.tools.map(t => `**${t.name}**`).join(', ')}\n\nJust ask me anything naturally!`,
          });
        } else {
          // No connected preset, show regular welcome
          addMessage({
            role: 'bot',
            content: `Hi! I'm **${BOT_NAME}**, your AI assistant. 🤖\n\nI'm powered by **AWS Bedrock** and ready to chat!\n\n💡 **Tip**: Click the **🔧 Tools** button to connect MCP servers and unlock additional capabilities like weather, calculations, and more.`,
          });
        }
      } catch (err) {
        console.error('Failed to initialize:', err);
        addMessage({
          role: 'bot',
          content: `Hi! I'm **${BOT_NAME}**, your AI assistant. 🤖\n\nI'm powered by **AWS Bedrock** and ready to chat!`,
        });
      }
    };

    initializeApp();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    const newMsg: Message = {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMsg]);
    return newMsg.id;
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  }, []);

  const handleConnectPreset = async (preset: PresetInfo) => {
    setIsConnecting(true);
    try {
      const response = await api.connectPreset(preset.id);
      const toolsRes = await api.getTools(response.sessionId);
      
      setSession({
        sessionId: response.sessionId,
        serverUrl: preset.url,
        tools: toolsRes.tools,
        connectedAt: new Date(response.connectedAt),
      });
      
      // Update preset status locally
      setPresets(prev => prev.map(p => 
        p.id === preset.id ? { ...p, status: 'connected', sessionId: response.sessionId } : p
      ));
      
      addMessage({
        role: 'system',
        content: `✅ Connected to **${preset.name}** with ${response.toolCount} tools!`,
      });
      
      setShowToolsPanel(false);
    } catch (error) {
      addMessage({
        role: 'system',
        content: `❌ Failed to connect to ${preset.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectCustom = async () => {
    if (!serverUrl.trim()) return;
    
    setIsConnecting(true);
    try {
      const response = await api.connect(serverUrl);
      setSession({
        sessionId: response.sessionId,
        serverUrl: response.serverUrl,
        tools: response.tools,
        connectedAt: new Date(response.connectedAt),
      });
      
      addMessage({
        role: 'system',
        content: `✅ Connected to **${serverUrl}** with ${response.tools.length} tools!`,
      });
      
      setShowToolsPanel(false);
      setServerUrl('');
    } catch (error) {
      addMessage({
        role: 'system',
        content: `❌ Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (session) {
      await api.disconnect(session.sessionId);
      
      // Update preset status if it was a preset connection
      setPresets(prev => prev.map(p => 
        p.sessionId === session.sessionId ? { ...p, status: 'disconnected', sessionId: undefined } : p
      ));
      
      addMessage({
        role: 'system',
        content: `🔌 Disconnected from MCP server. You can still chat without tools!`,
      });
      
      setSession(null);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    
    const userInput = input.trim();
    setInput('');
    
    addMessage({ role: 'user', content: userInput });
    setIsProcessing(true);
    
    const botMsgId = addMessage({
      role: 'bot',
      content: 'Thinking...',
      isLoading: true,
    });

    try {
      // If we have a session with tools, use the session chat
      if (session) {
        const response = await api.chat(session.sessionId, userInput, chatHistory);
        
        setChatHistory(prev => [
          ...prev,
          { role: 'user', content: userInput },
          { role: 'assistant', content: response.reply },
        ]);

        let toolInfo = '';
        if (response.toolsUsed && response.toolsUsed.length > 0) {
          toolInfo = response.toolsUsed
            .map(t => `\n\n🔧 *Used ${t.name}* (${t.executionTime}ms)`)
            .join('');
        }

        updateMessage(botMsgId, {
          content: response.reply + toolInfo,
          toolName: response.toolsUsed?.[0]?.name,
          executionTime: response.toolsUsed?.[0]?.executionTime,
          isLoading: false,
        });
      } else {
        // No session - use standalone chat
        const response = await api.chatStandalone(userInput, chatHistory);
        
        setChatHistory(prev => [
          ...prev,
          { role: 'user', content: userInput },
          { role: 'assistant', content: response.reply },
        ]);

        updateMessage(botMsgId, {
          content: response.reply,
          isLoading: false,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMsg.includes('Bedrock') || errorMsg.includes('credentials')) {
        updateMessage(botMsgId, {
          content: `⚠️ AWS Bedrock is not configured.\n\n*Please set your AWS credentials to enable chat.*`,
          isLoading: false,
        });
      } else {
        updateMessage(botMsgId, {
          content: `Sorry, I encountered an error: ${errorMsg}`,
          isLoading: false,
        });
      }
    }
    
    setIsProcessing(false);
    inputRef.current?.focus();
  };

  const suggestions = session 
    ? ['What can you help me with?', 'Calculate 25 * 17', "What's the weather in Tokyo?"]
    : ['Tell me a joke', 'Explain quantum computing', 'Write a haiku about coding'];

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="bot-avatar">
            <Bot size={24} />
          </div>
          <div className="header-info">
            <h1>{BOT_NAME}</h1>
            <span className="status online">
              {session ? `🔧 ${session.tools.length} tools connected` : '💬 Chat mode'}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <button 
            className={`tools-btn ${session ? 'connected' : ''}`}
            onClick={() => setShowToolsPanel(!showToolsPanel)}
          >
            <Wrench size={18} />
            Tools
            {session && <span className="tool-count">{session.tools.length}</span>}
          </button>
          {session && (
            <button className="disconnect-btn" onClick={handleDisconnect}>
              <X size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Tools Panel */}
      {showToolsPanel && (
        <div className="tools-panel animate-fade-in">
          <div className="tools-panel-header">
            <h3><Wrench size={18} /> MCP Tools</h3>
            <button onClick={() => setShowToolsPanel(false)}><X size={18} /></button>
          </div>
          
          {session ? (
            <div className="connected-tools">
              <div className="connected-header">
                <span className="status-dot connected"></span>
                Connected to MCP Server
              </div>
              <div className="tools-list">
                {session.tools.map(tool => (
                  <div key={tool.name} className="tool-item">
                    <Zap size={14} />
                    <span className="tool-name">{tool.name}</span>
                    <span className="tool-desc">{tool.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <p className="tools-panel-desc">Connect to an MCP server to unlock tools like weather, calculations, and more.</p>
              
              {presets.length > 0 && (
                <div className="presets-section">
                  <h4>Quick Connect</h4>
                  {presets.map(preset => (
                    <button
                      key={preset.id}
                      className={`preset-btn ${preset.status}`}
                      onClick={() => handleConnectPreset(preset)}
                      disabled={isConnecting}
                    >
                      <div className="preset-info">
                        <span className="preset-name">{preset.name}</span>
                        <span className="preset-desc">{preset.description}</span>
                      </div>
                      {isConnecting ? (
                        <Loader2 size={16} className="spin" />
                      ) : (
                        <Plug size={16} />
                      )}
                    </button>
                  ))}
                </div>
              )}
              
              <div className="custom-connect">
                <h4>Custom Server</h4>
                <div className="custom-connect-form">
                  <input
                    type="url"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="http://localhost:8080/sse"
                    disabled={isConnecting}
                  />
                  <button 
                    onClick={handleConnectCustom}
                    disabled={isConnecting || !serverUrl.trim()}
                  >
                    {isConnecting ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Chat Area */}
      <main className="chat-area">
        {messages.length === 1 && (
          <div className="empty-state animate-fade-in">
            <Sparkles size={48} />
            <h3>Start a conversation</h3>
            <p>Try one of these suggestions:</p>
            <div className="suggestion-chips">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div className="messages">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="input-area">
        <div className="input-container">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={session ? "Ask me anything or use my tools..." : "Ask me anything..."}
            disabled={isProcessing}
          />
          <button 
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
          >
            {isProcessing ? <Loader2 size={20} className="spin" /> : <Send size={20} />}
          </button>
        </div>
      </footer>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  
  return (
    <div className={`message ${message.role} animate-fade-in`}>
      {!isUser && !isSystem && (
        <div className="message-avatar">
          <Bot size={20} />
        </div>
      )}
      <div className="message-content">
        <div className="bubble">
          {message.isLoading ? (
            <div className="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          ) : (
            <div className="text" dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }} />
          )}
        </div>
        {message.toolName && !message.isLoading && (
          <div className="tool-badge">
            <Zap size={12} />
            {message.toolName}
            {message.executionTime && <span>• {message.executionTime}ms</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function formatMessage(content: string): string {
  return content
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}

export default App;
