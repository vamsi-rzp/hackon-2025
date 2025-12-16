import { useState } from 'react';
import { Plug, Loader2, Server, ArrowRight } from 'lucide-react';
import './ConnectionPanel.css';

interface ConnectionPanelProps {
  onConnect: (url: string) => void;
  isConnecting: boolean;
}

const EXAMPLE_URLS = [
  { label: 'Local Dev Server', url: 'http://localhost:8080/sse' },
  { label: 'AWS MCP Server', url: 'https://your-mcp-server.amazonaws.com/sse' },
];

export function ConnectionPanel({ onConnect, isConnecting }: ConnectionPanelProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim() && !isConnecting) {
      onConnect(url.trim());
    }
  };

  return (
    <div className="connection-panel">
      <div className="connection-card">
        <div className="connection-icon">
          <Server size={48} />
        </div>
        
        <h2 className="connection-title">Connect to MCP Server</h2>
        <p className="connection-description">
          Enter the SSE endpoint URL of your MCP server to establish a connection
          and discover available tools.
        </p>

        <form onSubmit={handleSubmit} className="connection-form">
          <div className="input-group">
            <Plug size={20} className="input-icon" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-mcp-server.com/sse"
              disabled={isConnecting}
              className="connection-input"
              autoFocus
            />
          </div>
          
          <button 
            type="submit" 
            className="connect-button"
            disabled={!url.trim() || isConnecting}
          >
            {isConnecting ? (
              <>
                <Loader2 size={20} className="spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <span>Connect</span>
                <ArrowRight size={20} />
              </>
            )}
          </button>
        </form>

        <div className="example-urls">
          <span className="example-label">Quick connect:</span>
          <div className="example-buttons">
            {EXAMPLE_URLS.map((example) => (
              <button
                key={example.url}
                type="button"
                onClick={() => setUrl(example.url)}
                className="example-button"
                disabled={isConnecting}
              >
                {example.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="connection-features">
        <div className="feature">
          <div className="feature-icon">🔌</div>
          <div className="feature-text">
            <strong>SSE Transport</strong>
            <span>Real-time server communication</span>
          </div>
        </div>
        <div className="feature">
          <div className="feature-icon">🔧</div>
          <div className="feature-text">
            <strong>Tool Discovery</strong>
            <span>Auto-detect available tools</span>
          </div>
        </div>
        <div className="feature">
          <div className="feature-icon">⚡</div>
          <div className="feature-text">
            <strong>Execute & Inspect</strong>
            <span>Run tools, view results</span>
          </div>
        </div>
      </div>
    </div>
  );
}

