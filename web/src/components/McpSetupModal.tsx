import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useToast } from './Toasts';
import { ModalShell } from './Modals';

const DEFAULT_PATH = '/path/to/agentic-kanban/mcp/dist/index.js';

function defaultApiUrl(): string {
  // In dev the web app runs on the Vite server (:5173) and proxies /api to :3001.
  // In production the API serves the web app itself, so the origin is the API origin.
  return window.location.origin === 'http://localhost:5173'
    ? 'http://localhost:3001/api'
    : `${window.location.origin}/api`;
}

function claudeConfig(apiUrl: string, token: string, path: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        kanban: {
          command: 'node',
          args: [path],
          env: {
            KANBAN_API_URL: apiUrl,
            KANBAN_AUTHOR: 'agent:claude',
            KANBAN_AUTH_TOKEN: token,
          },
        },
      },
    },
    null,
    2,
  );
}

function opencodeConfig(apiUrl: string, token: string, path: string): string {
  return JSON.stringify(
    {
      mcp: {
        kanban: {
          type: 'local',
          command: ['node', path],
          environment: {
            KANBAN_API_URL: apiUrl,
            KANBAN_AUTHOR: 'agent:opencode',
            KANBAN_AUTH_TOKEN: token,
          },
        },
      },
    },
    null,
    2,
  );
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

function ConfigBlock({
  label,
  filename,
  value,
  onCopy,
}: {
  label: string;
  filename: string;
  value: string;
  onCopy: (value: string) => void;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        <button
          type="button"
          className="btn-secondary px-3 py-1.5 text-xs"
          onClick={() => onCopy(value)}
        >
          Copy
        </button>
      </div>
      <p className="mt-0.5 font-mono text-[11px] text-ink-soft">{filename}</p>
      <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink">
        {value}
      </pre>
    </div>
  );
}

export default function McpSetupModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [path, setPath] = useState(DEFAULT_PATH);

  const tokenValue = token ?? '<YOUR_API_TOKEN>';

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const created = await api.createToken(name.trim());
      setToken(created.token);
      setName('');
      toast(`Token “${created.name}” created`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create the token.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    await copyText(value);
    toast('Config copied');
  };

  return (
    <ModalShell onClose={onClose} label="Connect MCP" wide>
      <div className="p-6">
        <h2 className="font-display text-lg font-semibold">Connect your agents (MCP)</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Create an API token, then paste the config below into your MCP client so agents can read
          and manage your boards.
        </p>

        {token ? (
          <div className="mt-4 rounded-xl border border-accent/30 bg-accent-soft p-4">
            <p className="text-sm font-semibold">Token ready — copy the config below</p>
            <p className="mt-1 text-xs text-ink-soft">
              This is the only time the full token is shown. Create another if you lose it.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-panel px-3 py-2 font-mono text-[11px]">
                {token}
              </code>
              <button type="button" className="btn-secondary shrink-0" onClick={() => copy(token)}>
                Copy
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={create} className="mt-4 flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="mcp-token-name" className="label">
                New token name
              </label>
              <input
                id="mcp-token-name"
                className="input"
                placeholder="e.g. claude-desktop"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create token'}
            </button>
          </form>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="mcp-api-url" className="label">
              API URL
            </label>
            <input
              id="mcp-api-url"
              className="input font-mono text-xs"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div>
            <label htmlFor="mcp-path" className="label">
              MCP server path
            </label>
            <input
              id="mcp-path"
              className="input font-mono text-xs"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              spellCheck={false}
            />
            <p className="mt-1.5 text-xs text-ink-soft">
              Absolute path to <code className="font-mono text-[11px]">mcp/dist/index.js</code> on
              the machine running the agent.
            </p>
          </div>
        </div>

        <ConfigBlock
          label="Claude Desktop"
          filename="claude_desktop_config.json"
          value={claudeConfig(apiUrl, tokenValue, path)}
          onCopy={copy}
        />
        <ConfigBlock
          label="opencode"
          filename="opencode.json"
          value={opencodeConfig(apiUrl, tokenValue, path)}
          onCopy={copy}
        />

        <div className="mt-6 flex justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}


