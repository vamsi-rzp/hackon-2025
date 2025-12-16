import { Terminal, Wifi, WifiOff, Wrench } from 'lucide-react';
import './Header.css';

interface HeaderProps {
  isConnected: boolean;
  serverUrl: string;
  toolCount: number;
}

export function Header({ isConnected, serverUrl, toolCount }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-brand">
        <div className="header-logo">
          <Terminal size={24} />
        </div>
        <div className="header-title">
          <h1>MCP Terminal</h1>
          <span className="header-subtitle">Universal Gateway Client</span>
        </div>
      </div>

      <div className="header-status">
        {isConnected ? (
          <>
            <div className="status-item status-connected">
              <Wifi size={16} />
              <span>Connected</span>
            </div>
            <div className="status-item">
              <Wrench size={16} />
              <span>{toolCount} tools</span>
            </div>
            <div className="status-url" title={serverUrl}>
              {truncateUrl(serverUrl)}
            </div>
          </>
        ) : (
          <div className="status-item status-disconnected">
            <WifiOff size={16} />
            <span>Disconnected</span>
          </div>
        )}
      </div>
    </header>
  );
}

function truncateUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url.slice(0, 30) + (url.length > 30 ? '...' : '');
  }
}

