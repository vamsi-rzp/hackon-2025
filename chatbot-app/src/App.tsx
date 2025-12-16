import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Loader2, Plug, Sparkles, X, Zap, Brain, Cpu } from 'lucide-react';
import type { Message, Session, Tool } from './types';
import { api, type ChatMessage as ApiChatMessage } from './api';
import { matchTool, generateBotResponse, getSuggestions } from './toolMatcher';
import './App.css';

const BOT_NAME = 'Atlas';

type ChatMode = 'llm' | 'local';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<ApiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [serverUrl, setServerUrl] = useState('http://localhost:8080/sse');
  const [showConnect, setShowConnect] = useState(true);
  const [chatMode, setChatMode] = useState<ChatMode>('llm');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleConnect = async () => {
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
      setShowConnect(false);
      
      const modeDescription = chatMode === 'llm' 
        ? "I'm powered by **AWS Bedrock** and can understand natural language!" 
        : "I'm using local pattern matching to detect your intent.";
      
      addMessage({
        role: 'bot',
        content: `Hi! I'm ${BOT_NAME}, your AI assistant. 🤖\n\n${modeDescription}\n\nI'm connected to an MCP server with **${response.tools.length} tools**:\n\n${response.tools.map(t => `• **${t.name}**: ${t.description || 'No description'}`).join('\n')}\n\nJust ask me anything naturally!`,
      });
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
      setSession(null);
      setMessages([]);
      setChatHistory([]);
      setShowConnect(true);
    }
  };

  const handleSendLLM = async (userInput: string) => {
    if (!session) return;

    const botMsgId = addMessage({
      role: 'bot',
      content: 'Thinking...',
      isLoading: true,
    });

    try {
      const response = await api.chat(session.sessionId, userInput, chatHistory);
      
      // Update chat history
      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: userInput },
        { role: 'assistant', content: response.reply },
      ]);

      // Format tool usage info
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
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      // If Bedrock fails, fall back to local mode
      if (errorMsg.includes('Bedrock') || errorMsg.includes('credentials')) {
        updateMessage(botMsgId, {
          content: `⚠️ AWS Bedrock is not configured. Falling back to local mode.\n\n*To enable LLM mode, set your AWS credentials and region.*`,
          isLoading: false,
        });
        setChatMode('local');
      } else {
        updateMessage(botMsgId, {
          content: `Sorry, I encountered an error: ${errorMsg}`,
          isLoading: false,
        });
      }
    }
  };

  const handleSendLocal = async (userInput: string) => {
    if (!session) return;

    const match = matchTool(userInput, session.tools);
    
    if (match) {
      const botMsgId = addMessage({
        role: 'bot',
        content: `Using **${match.tool.name}**...`,
        isLoading: true,
      });
      
      try {
        const result = await api.execute(session.sessionId, match.tool.name, match.args);
        const response = generateBotResponse(match.tool.name, result.result);
        
        updateMessage(botMsgId, {
          content: response,
          toolName: match.tool.name,
          toolArgs: match.args,
          executionTime: result.executionTime,
          isLoading: false,
        });
      } catch (error) {
        updateMessage(botMsgId, {
          content: `Sorry, I couldn't execute that tool. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          isLoading: false,
        });
      }
    } else {
      addMessage({
        role: 'bot',
        content: getHelpfulResponse(userInput, session.tools),
      });
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !session || isProcessing) return;
    
    const userInput = input.trim();
    setInput('');
    
    addMessage({ role: 'user', content: userInput });
    setIsProcessing(true);
    
    if (chatMode === 'llm') {
      await handleSendLLM(userInput);
    } else {
      await handleSendLocal(userInput);
    }
    
    setIsProcessing(false);
    inputRef.current?.focus();
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  };

  const toggleMode = () => {
    const newMode = chatMode === 'llm' ? 'local' : 'llm';
    setChatMode(newMode);
    addMessage({
      role: 'system',
      content: newMode === 'llm' 
        ? '🧠 Switched to **LLM mode** (AWS Bedrock)' 
        : '⚡ Switched to **Local mode** (Pattern matching)',
    });
  };

  const suggestions = session ? getSuggestions(session.tools) : [];

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
            <span className={`status ${session ? 'online' : 'offline'}`}>
              {session ? `Connected • ${session.tools.length} tools` : 'Offline'}
            </span>
          </div>
        </div>
        <div className="header-actions">
          {session && (
            <>
              <button 
                className={`mode-toggle ${chatMode}`}
                onClick={toggleMode}
                title={chatMode === 'llm' ? 'Using AWS Bedrock LLM' : 'Using local pattern matching'}
              >
                {chatMode === 'llm' ? <Brain size={18} /> : <Cpu size={18} />}
                {chatMode === 'llm' ? 'LLM' : 'Local'}
              </button>
              <button className="disconnect-btn" onClick={handleDisconnect}>
                <X size={18} />
                Disconnect
              </button>
            </>
          )}
        </div>
      </header>

      {/* Connection Modal */}
      {showConnect && (
        <div className="connect-overlay">
          <div className="connect-modal animate-fade-in">
            <div className="connect-icon">
              <Plug size={32} />
            </div>
            <h2>Connect to MCP Server</h2>
            <p>Enter the SSE endpoint of your MCP server to start chatting</p>
            
            <div className="connect-form">
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://localhost:8080/sse"
                disabled={isConnecting}
              />
              
              <div className="mode-selector">
                <button 
                  className={`mode-btn ${chatMode === 'llm' ? 'active' : ''}`}
                  onClick={() => setChatMode('llm')}
                  disabled={isConnecting}
                >
                  <Brain size={18} />
                  LLM Mode
                  <span>AWS Bedrock</span>
                </button>
                <button 
                  className={`mode-btn ${chatMode === 'local' ? 'active' : ''}`}
                  onClick={() => setChatMode('local')}
                  disabled={isConnecting}
                >
                  <Cpu size={18} />
                  Local Mode
                  <span>Pattern Match</span>
                </button>
              </div>

              <button 
                className="connect-btn"
                onClick={handleConnect}
                disabled={isConnecting || !serverUrl.trim()}
              >
                {isConnecting ? (
                  <>
                    <Loader2 size={18} className="spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    Connect
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Area */}
      <main className="chat-area">
        {messages.length === 0 && session && (
          <div className="empty-state animate-fade-in">
            <Sparkles size={48} />
            <h3>Start a conversation</h3>
            <p>Try one of these suggestions:</p>
            <div className="suggestion-chips">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => handleSuggestionClick(s)}>
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
      {session && (
        <footer className="input-area">
          {suggestions.length > 0 && messages.length > 0 && (
            <div className="quick-suggestions">
              {suggestions.slice(0, 3).map((s, i) => (
                <button key={i} onClick={() => handleSuggestionClick(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="input-container">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={chatMode === 'llm' ? "Ask me anything..." : "Try: What's the weather in Paris?"}
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
      )}
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

function getHelpfulResponse(input: string, tools: Tool[]): string {
  const greetings = ['hi', 'hello', 'hey', 'howdy'];
  if (greetings.some(g => input.toLowerCase().startsWith(g))) {
    return `Hello! 👋 How can I help you today?\n\nI can assist with: ${tools.map(t => `**${t.name}**`).join(', ')}`;
  }
  
  if (input.toLowerCase().includes('help') || input.toLowerCase().includes('what can you do')) {
    return `I'm here to help! Here's what I can do:\n\n${tools.map(t => `• **${t.name}**: ${t.description || 'No description'}`).join('\n')}\n\nJust ask naturally, like "What's the weather in Paris?" or "Calculate 15 * 7"`;
  }
  
  return `I'm not sure how to help with that. 🤔\n\nTry asking me to:\n${tools.slice(0, 4).map(t => `• ${t.description || t.name}`).join('\n')}`;
}

export default App;
