// Shared types between client and server

export interface CountByLabel {
  label: string;
  count: number;
}

export interface PulsePayload {
  pulseId: string;
  sessionId: string;
  deviceId: string;
  timestamp: string;
  totalCount: number;
  rowCount: number;
  countsByLabel: CountByLabel[];
}

export interface Session {
  id: number;
  sessionId: string;
  deviceId: string;
  startTime: string;
  endTime: string | null;
  totalItemsCounted: number;
  isActive: boolean;
  metadata: unknown | null;
}

export interface Pulse {
  id: number;
  pulseId: string;
  sessionId: string;
  deviceId: string;
  timestamp: string;
  totalCount: number;
  rowCount: number;
  countsByLabel: CountByLabel[];
  receivedAt: string;
}

export interface SessionsResponse {
  sessions: Session[];
}

export interface SessionDetailResponse {
  session: Session;
  pulses: Pulse[];
}

export interface PulseResponse {
  ok: boolean;
  id?: number;
  duplicate?: boolean;
}

export interface HealthResponse {
  ok: boolean;
  ts: string;
}
