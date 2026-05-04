import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Session, Pulse, SessionsResponse, SessionDetailResponse, HealthResponse, PulsePayload } from "@shared/types";

// ── API helpers ────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: active ? "var(--green)" : "var(--red)",
        marginRight: 6,
        flexShrink: 0,
      }}
    />
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "1rem 1.25rem",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Card style={{ textAlign: "center", minWidth: 120 }}>
      <div style={{ fontSize: "1.8rem", fontWeight: 700, color: color ?? "var(--accent)" }}>{value}</div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>{label}</div>
    </Card>
  );
}

// ── Session list panel ─────────────────────────────────────────────────────────

function SessionList({
  sessions,
  selected,
  onSelect,
}: {
  sessions: Session[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sessions.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No sessions yet.</p>
      )}
      {sessions.map((s) => (
        <button
          key={s.sessionId}
          onClick={() => onSelect(s.sessionId)}
          style={{
            textAlign: "left",
            background: selected === s.sessionId ? "var(--accent-dim)" : "var(--surface)",
            border: `1px solid ${selected === s.sessionId ? "var(--accent)" : "var(--border)"}`,
            borderRadius: "var(--radius)",
            padding: "0.75rem 1rem",
            color: "var(--text)",
            transition: "background 0.15s",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
            <StatusDot active={s.isActive} />
            <span style={{ fontSize: "0.8rem", fontFamily: "monospace" }}>{s.sessionId}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            <span>Device: {s.deviceId}</span>
            <span>{s.totalItemsCounted} items</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Pulse table ────────────────────────────────────────────────────────────────

function PulseTable({ pulses }: { pulses: Pulse[] }) {
  if (pulses.length === 0) {
    return <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No pulses for this session.</p>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
        <thead>
          <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
            {["Pulse ID", "Total", "Rows", "Timestamp"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pulses.map((p) => (
            <tr key={p.pulseId} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{p.pulseId}</td>
              <td style={{ padding: "6px 8px" }}>{p.totalCount}</td>
              <td style={{ padding: "6px 8px" }}>{p.rowCount}</td>
              <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>
                {new Date(p.timestamp).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Test pulse sender ──────────────────────────────────────────────────────────

function TestPulseSender() {
  const [status, setStatus] = useState<string | null>(null);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: PulsePayload) =>
      apiFetch<{ ok: boolean }>("/api/pulse", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setStatus("✓ Pulse sent successfully");
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (err: Error) => setStatus(`✗ Error: ${err.message}`),
  });

  function sendTestPulse() {
    setStatus(null);
    mutation.mutate({
      pulseId: `test-${Date.now()}`,
      sessionId: "test-session-001",
      deviceId: "dashboard-test",
      timestamp: new Date().toISOString(),
      totalCount: Math.floor(Math.random() * 50) + 1,
      rowCount: Math.floor(Math.random() * 5) + 1,
      countsByLabel: [
        { label: "bottle", count: Math.floor(Math.random() * 20) },
        { label: "cup", count: Math.floor(Math.random() * 10) },
      ],
    });
  }

  return (
    <Card>
      <h3 style={{ marginBottom: "0.75rem", fontSize: "0.95rem" }}>Send Test Pulse</h3>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
        Sends a mock pulse to <code>/api/pulse</code> to simulate Unity app behaviour.
      </p>
      <button
        onClick={sendTestPulse}
        disabled={mutation.isPending}
        style={{
          background: mutation.isPending ? "var(--border)" : "var(--accent)",
          color: "white",
          border: "none",
          borderRadius: "var(--radius)",
          padding: "0.5rem 1.25rem",
          fontSize: "0.85rem",
          fontWeight: 600,
        }}
      >
        {mutation.isPending ? "Sending…" : "Send Test Pulse"}
      </button>
      {status && (
        <p
          style={{
            marginTop: "0.5rem",
            fontSize: "0.8rem",
            color: status.startsWith("✓") ? "var(--green)" : "var(--red)",
          }}
        >
          {status}
        </p>
      )}
    </Card>
  );
}

// ── API Docs ───────────────────────────────────────────────────────────────────

function ApiDocs() {
  const endpoints = [
    { method: "GET", path: "/health", desc: "Server health check" },
    { method: "POST", path: "/api/pulse", desc: "Receive sync pulse from Unity client" },
    { method: "GET", path: "/api/sessions", desc: "List all sessions (latest first)" },
    { method: "GET", path: "/api/sessions/:id", desc: "Get session with its pulses" },
    { method: "PATCH", path: "/api/sessions/:id/end", desc: "Mark session as ended" },
  ];

  const methodColor: Record<string, string> = {
    GET: "var(--green)",
    POST: "var(--accent)",
    PATCH: "var(--yellow)",
  };

  return (
    <Card>
      <h3 style={{ marginBottom: "0.75rem", fontSize: "0.95rem" }}>API Reference</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {endpoints.map((e) => (
          <div
            key={e.path}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: "0.8rem",
              borderBottom: "1px solid var(--border)",
              paddingBottom: 8,
            }}
          >
            <span
              style={{
                color: methodColor[e.method],
                fontWeight: 700,
                minWidth: 48,
                fontSize: "0.7rem",
              }}
            >
              {e.method}
            </span>
            <code style={{ color: "var(--text)", flex: 1 }}>{e.path}</code>
            <span style={{ color: "var(--text-muted)" }}>{e.desc}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/health"),
    refetchInterval: 10_000,
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: () => apiFetch<SessionsResponse>("/api/sessions"),
  });

  const sessionDetail = useQuery({
    queryKey: ["session", selectedSession],
    queryFn: () => apiFetch<SessionDetailResponse>(`/api/sessions/${selectedSession}`),
    enabled: !!selectedSession,
  });

  const sessions = sessionsQuery.data?.sessions ?? [];
  const activeSessions = sessions.filter((s) => s.isActive).length;
  const totalItems = sessions.reduce((sum, s) => sum + s.totalItemsCounted, 0);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem 1rem" }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          borderBottom: "1px solid var(--border)",
          paddingBottom: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            NomadGo SpatialVision
          </h1>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            AR Inventory Sync Dashboard
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem" }}>
          <StatusDot active={health.data?.ok ?? false} />
          <span style={{ color: health.data?.ok ? "var(--green)" : "var(--red)" }}>
            {health.isLoading ? "Checking…" : health.data?.ok ? "Server Online" : "Server Offline"}
          </span>
        </div>
      </header>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <StatBox label="Total Sessions" value={sessions.length} />
        <StatBox label="Active Sessions" value={activeSessions} color="var(--green)" />
        <StatBox label="Items Counted" value={totalItems} color="var(--yellow)" />
      </div>

      {/* Main layout */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
        {/* Left: session list */}
        <div>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Sessions
          </h2>
          {sessionsQuery.isLoading ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading…</p>
          ) : (
            <SessionList
              sessions={sessions}
              selected={selectedSession}
              onSelect={setSelectedSession}
            />
          )}
        </div>

        {/* Right: detail + tools */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {selectedSession ? (
            <Card>
              <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                Pulses — <span style={{ fontFamily: "monospace" }}>{selectedSession}</span>
              </h2>
              {sessionDetail.isLoading ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading pulses…</p>
              ) : sessionDetail.isError ? (
                <p style={{ color: "var(--red)", fontSize: "0.85rem" }}>Failed to load pulses.</p>
              ) : (
                <PulseTable pulses={sessionDetail.data?.pulses ?? []} />
              )}
            </Card>
          ) : (
            <Card style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Select a session from the left to view its pulses.
            </Card>
          )}

          <TestPulseSender />
          <ApiDocs />
        </div>
      </div>
    </div>
  );
}
