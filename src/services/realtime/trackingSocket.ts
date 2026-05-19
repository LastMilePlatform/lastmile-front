import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import type { ShipmentLocationPoint } from '@/services/api/trackingApi';

type TrackingAuth = {
  token?: string;
  userId?: number;
  role?: string;
};

type TrackingConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

type TrackingStatusHandler = (status: TrackingConnectionStatus) => void;
type TrackingLocationHandler = (payload: ShipmentLocationPoint) => void;
type TrackingAckHandler = (payload: ShipmentLocationPoint) => void;
type TrackingErrorHandler = (message: string) => void;

type TrackingHandlers = {
  onStatus?: TrackingStatusHandler;
  onLocation?: TrackingLocationHandler;
  onAck?: TrackingAckHandler;
  onError?: TrackingErrorHandler;
  onVolunteerLocation?: (payload: TrackingLocationUpdatePayload & { volunteerId?: number }) => void;
  onVolunteerSnapshot?: (payload: Array<TrackingLocationUpdatePayload & { volunteerId?: number }>) => void;
};

type TrackingLocationUpdatePayload = {
  shipmentId: number;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  recordedAt?: string;
};

type KnownEnvKey =
  | 'EXPO_PUBLIC_API_URL'
  | 'EXPO_PUBLIC_WS_URL'
  | 'EXPO_PUBLIC_WS_NAMESPACE'
  | 'EXPO_PUBLIC_WS_PATH'
  | 'EXPO_PUBLIC_WS_TRANSPORTS'
  | 'EXPO_PUBLIC_WS_DEBUG';

const DEFAULT_API_BASE_URL = 'http://localhost:3000/api/v1';
const DEFAULT_WS_NAMESPACE = '/ws';
const DEFAULT_WS_PATH = '/socket.io';
const MAX_QUEUE_SIZE = 50;

const KNOWN_EXPO_ENV: Record<KnownEnvKey, string | undefined> = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_WS_URL: process.env.EXPO_PUBLIC_WS_URL,
  EXPO_PUBLIC_WS_NAMESPACE: process.env.EXPO_PUBLIC_WS_NAMESPACE,
  EXPO_PUBLIC_WS_PATH: process.env.EXPO_PUBLIC_WS_PATH,
  EXPO_PUBLIC_WS_TRANSPORTS: process.env.EXPO_PUBLIC_WS_TRANSPORTS,
  EXPO_PUBLIC_WS_DEBUG: process.env.EXPO_PUBLIC_WS_DEBUG,
};

let socket: Socket | null = null;
let activeShipmentId: number | null = null;
let handlers: TrackingHandlers = {};
const pendingUpdates: TrackingLocationUpdatePayload[] = [];

function getEnvValue(key: KnownEnvKey) {
  return KNOWN_EXPO_ENV[key];
}

function isTruthyEnv(value: string | undefined) {
  if (!value) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function isTrackingDebugEnabled() {
  return isTruthyEnv(getEnvValue('EXPO_PUBLIC_WS_DEBUG'));
}

function logTrackingDebug(message: string, payload?: unknown) {
  if (!isTrackingDebugEnabled()) {
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[tracking] ${message}`, payload ?? '');
}

function getExpoHostIp() {
  const hostUri =
    (Constants as { expoConfig?: { hostUri?: string } }).expoConfig?.hostUri ??
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost;

  if (!hostUri) {
    return null;
  }

  return hostUri.split(':')[0] ?? null;
}

function getBrowserHost() {
  const location = (globalThis as { location?: { hostname?: string } }).location;
  return location?.hostname ?? null;
}

function getApiBaseUrl() {
  return getEnvValue('EXPO_PUBLIC_API_URL') ?? DEFAULT_API_BASE_URL;
}

function resolveWsBaseUrl() {
  const envWsUrl = getEnvValue('EXPO_PUBLIC_WS_URL');

  if (envWsUrl) {
    try {
      const parsed = new URL(envWsUrl);
      parsed.pathname = '';

      const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

      if (isLocalhost) {
        if (Platform.OS === 'web') {
          const browserHost = getBrowserHost();

          if (browserHost && browserHost !== 'localhost' && browserHost !== '127.0.0.1') {
            parsed.hostname = browserHost;
          }
        } else {
          const expoHostIp = getExpoHostIp();

          if (expoHostIp) {
            parsed.hostname = expoHostIp;
          } else if (Platform.OS === 'android') {
            parsed.hostname = '10.0.2.2';
          }
        }
      }

      return parsed.toString().replace(/\/$/, '');
    } catch {
      return envWsUrl;
    }
  }

  const apiUrl = getApiBaseUrl();

  try {
    const parsed = new URL(apiUrl);
    parsed.pathname = '';

    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

    if (isLocalhost) {
      const expoHostIp = getExpoHostIp();

      if (expoHostIp) {
        parsed.hostname = expoHostIp;
      } else if (Platform.OS === 'android') {
        parsed.hostname = '10.0.2.2';
      }
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return apiUrl;
  }
}

function resolveWsNamespace() {
  const configured = getEnvValue('EXPO_PUBLIC_WS_NAMESPACE')?.trim();

  if (!configured) {
    return DEFAULT_WS_NAMESPACE;
  }

  if (!configured.startsWith('/')) {
    return `/${configured}`;
  }

  return configured;
}

function resolveWsPath() {
  const configured = getEnvValue('EXPO_PUBLIC_WS_PATH')?.trim();

  if (!configured) {
    return DEFAULT_WS_PATH;
  }

  if (configured.endsWith('/socket.io')) {
    return DEFAULT_WS_PATH;
  }

  if (!configured.startsWith('/')) {
    return `/${configured}`;
  }

  return configured;
}

function resolveWsTransports() {
  const configured = getEnvValue('EXPO_PUBLIC_WS_TRANSPORTS')?.trim();

  if (configured) {
    const normalized = configured
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item): item is 'polling' | 'websocket' => item === 'polling' || item === 'websocket');

    if (normalized.length > 0) {
      return normalized;
    }
  }

  return Platform.OS === 'web' ? ['websocket', 'polling'] : ['polling', 'websocket'];
}

function setStatus(status: TrackingConnectionStatus) {
  handlers.onStatus?.(status);
}

function normalizeTrackingPoint(payload: Record<string, unknown>) {
  const lat = payload.lat ?? payload.latitude;
  const lng = payload.lng ?? payload.longitude;
  const shipmentId = payload.shipmentId ?? payload.shipment_id;

  if (typeof shipmentId !== 'number' || typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  return {
    shipmentId,
    lat,
    lng,
    speed: typeof payload.speed === 'number' ? payload.speed : undefined,
    heading: typeof payload.heading === 'number' ? payload.heading : undefined,
    recordedAt:
      typeof payload.recordedAt === 'string'
        ? payload.recordedAt
        : typeof payload.recorded_at === 'string'
          ? payload.recorded_at
          : new Date().toISOString(),
  } satisfies ShipmentLocationPoint;
}

function normalizeVolunteerPoint(payload: Record<string, unknown>) {
  const lat = payload.lat ?? payload.latitude;
  const lng = payload.lng ?? payload.longitude;
  const shipmentId = payload.shipmentId ?? payload.shipment_id;
  const volunteerId = payload.volunteerId ?? payload.volunteer_id ?? payload.updatedBy ?? payload.updated_by;

  if ((typeof lat !== 'number') || (typeof lng !== 'number')) {
    return null;
  }

  return {
    shipmentId: typeof shipmentId === 'number' ? shipmentId : undefined,
    volunteerId: typeof volunteerId === 'number' ? volunteerId : undefined,
    lat,
    lng,
    speed: typeof payload.speed === 'number' ? payload.speed : undefined,
    heading: typeof payload.heading === 'number' ? payload.heading : undefined,
    recordedAt:
      typeof payload.recordedAt === 'string'
        ? payload.recordedAt
        : typeof payload.recorded_at === 'string'
          ? payload.recorded_at
          : new Date().toISOString(),
  };
}

function flushPendingUpdates() {
  if (!socket?.connected || pendingUpdates.length === 0) {
    return;
  }

  while (pendingUpdates.length > 0) {
    const next = pendingUpdates.shift();

    if (!next) {
      break;
    }

    socket.emit('shipment.location.update', next);
  }
}

function subscribeActiveShipment() {
  if (!socket?.connected || !activeShipmentId) {
    return;
  }

  socket.emit('shipment.subscribe', { shipmentId: activeShipmentId });
  logTrackingDebug('subscribe', { shipmentId: activeShipmentId });
}

export function connectTrackingSocket(auth: TrackingAuth = {}, nextHandlers: TrackingHandlers = {}) {
  handlers = { ...handlers, ...nextHandlers };

  if (socket?.connected) {
    setStatus('connected');
    return socket;
  }

  if (socket && !socket.connected) {
    if ((socket as Socket & { active?: boolean }).active) {
      setStatus('connecting');
      return socket;
    }

    socket.connect();
    setStatus('connecting');
    return socket;
  }

  const baseUrl = resolveWsBaseUrl();
  const namespace = resolveWsNamespace();
  const path = resolveWsPath();
  const transports = resolveWsTransports();

  logTrackingDebug('connecting', {
    platform: Platform.OS,
    baseUrl,
    namespace,
    path,
    transports,
  });

  socket = io(`${baseUrl}${namespace}`, {
    autoConnect: true,
    timeout: 20000,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    transports,
    tryAllTransports: true,
    path,
    auth: {
      token: auth.token,
      userId: auth.userId,
      role: auth.role,
    },
  });

  setStatus('connecting');

  socket.on('connect', () => {
    logTrackingDebug('connected', { id: socket?.id });
    setStatus('connected');
    subscribeActiveShipment();
    flushPendingUpdates();
  });

  socket.on('disconnect', (reason: unknown) => {
    logTrackingDebug('disconnected', reason);
    setStatus('disconnected');
  });

  socket.on('connect_error', (error: unknown) => {
    logTrackingDebug('connect_error', error);
    setStatus('error');
    handlers.onError?.('No fue posible conectar al seguimiento en tiempo real.');
  });

  socket.on('system.joined', (payload: unknown) => {
    logTrackingDebug('system.joined', payload);
  });

  socket.on('system.error', (payload: unknown) => {
    const message =
      typeof payload === 'object' && payload && 'message' in payload
        ? String((payload as { message?: string }).message ?? 'Error de websocket')
        : 'Error de websocket';

    handlers.onError?.(message);
  });

  socket.on('shipment.location.snapshot', (payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const point = normalizeTrackingPoint(payload as Record<string, unknown>);

    if (point) {
      handlers.onLocation?.(point);
    }
  });

  socket.on('shipment.location.changed', (payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const point = normalizeTrackingPoint(payload as Record<string, unknown>);

    if (point) {
      handlers.onLocation?.(point);
    }
  });

  socket.on('shipment.location.ack', (payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const point = normalizeTrackingPoint(payload as Record<string, unknown>);

    if (point) {
      handlers.onAck?.(point);
    }
  });

  // Campaign-level volunteer tracking
  socket.on('campaign.volunteers.snapshot', (payload: unknown) => {
    if (!payload || !Array.isArray(payload)) {
      return;
    }

    const points: Array<TrackingLocationUpdatePayload & { volunteerId?: number }> = [];

    for (const item of payload as unknown[] as Record<string, unknown>[]) {
      const p = normalizeVolunteerPoint(item);

      if (p) {
        points.push(p as TrackingLocationUpdatePayload & { volunteerId?: number });
      }
    }

    if (points.length > 0) {
      handlers.onVolunteerSnapshot?.(points);
    }
  });

  socket.on('volunteer.location.changed', (payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const p = normalizeVolunteerPoint(payload as Record<string, unknown>);

    if (p) {
      handlers.onVolunteerLocation?.(p as TrackingLocationUpdatePayload & { volunteerId?: number });
    }
  });

  socket.io.on('reconnect_attempt', (attempt) => {
    logTrackingDebug('reconnect_attempt', attempt);
  });

  socket.io.on('reconnect', (attempt) => {
    logTrackingDebug('reconnect', attempt);
  });

  return socket;
}

export function setTrackingSocketHandlers(nextHandlers: TrackingHandlers) {
  handlers = { ...handlers, ...nextHandlers };
}

export function subscribeShipmentTracking(shipmentId: number) {
  activeShipmentId = shipmentId;
  subscribeActiveShipment();
}

export function subscribeCampaignTracking(campaignId: number) {
  if (!socket) {
    return;
  }

  const room = `campaign:${campaignId}:volunteers:tracking`;
  socket.emit('system.join_room', { room });
  logTrackingDebug('join campaign tracking', { campaignId, room });
}

export function unsubscribeCampaignTracking(campaignId: number) {
  if (!socket) {
    return;
  }

  const room = `campaign:${campaignId}:volunteers:tracking`;
  socket.emit('system.leave_room', { room });
  logTrackingDebug('leave campaign tracking', { campaignId, room });
}

export function sendShipmentLocationUpdate(payload: TrackingLocationUpdatePayload) {
  if (!socket?.connected) {
    pendingUpdates.push(payload);

    if (pendingUpdates.length > MAX_QUEUE_SIZE) {
      pendingUpdates.shift();
    }

    return;
  }

  socket.emit('shipment.location.update', payload);
}

export function disconnectTrackingSocket() {
  if (!socket) {
    return;
  }

  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  activeShipmentId = null;
  pendingUpdates.length = 0;
  handlers = {};
  setStatus('idle');
}
