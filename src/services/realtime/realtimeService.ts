import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';

type RealtimeAuth = {
  token?: string;
  userId?: number;
  role?: string;
};

type RealtimeHandler<T = unknown> = (payload: T) => void;

let socket: Socket | null = null;
let connectErrors = 0;
const joinedRooms = new Set<string>();
let activeAuthToken: string | undefined;

const DEFAULT_API_BASE_URL = 'http://localhost:3001';
const DEFAULT_WS_NAMESPACE = '/ws';
const DEFAULT_WS_PATH = '/socket.io';

type KnownEnvKey =
  | 'EXPO_PUBLIC_API_URL'
  | 'EXPO_PUBLIC_WS_URL'
  | 'EXPO_PUBLIC_WS_NAMESPACE'
  | 'EXPO_PUBLIC_WS_PATH'
  | 'EXPO_PUBLIC_WS_TRANSPORTS'
  | 'EXPO_PUBLIC_WS_ALLOW_ANONYMOUS'
  | 'EXPO_PUBLIC_WS_DEBUG';

const KNOWN_EXPO_ENV: Record<KnownEnvKey, string | undefined> = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_WS_URL: process.env.EXPO_PUBLIC_WS_URL,
  EXPO_PUBLIC_WS_NAMESPACE: process.env.EXPO_PUBLIC_WS_NAMESPACE,
  EXPO_PUBLIC_WS_PATH: process.env.EXPO_PUBLIC_WS_PATH,
  EXPO_PUBLIC_WS_TRANSPORTS: process.env.EXPO_PUBLIC_WS_TRANSPORTS,
  EXPO_PUBLIC_WS_ALLOW_ANONYMOUS: process.env.EXPO_PUBLIC_WS_ALLOW_ANONYMOUS,
  EXPO_PUBLIC_WS_DEBUG: process.env.EXPO_PUBLIC_WS_DEBUG,
};

function getKnownEnvMap() {
  return KNOWN_EXPO_ENV;
}

function getEnvValue(key: KnownEnvKey) {
  const knownEnv = getKnownEnvMap()[key];

  if (knownEnv) {
    return knownEnv;
  }

  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
}

function isTruthyEnv(value: string | undefined) {
  if (!value) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
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

  // En web: preferir la variable de entorno si está presente (por ejemplo ngrok),
  // para permitir conexiones desde el navegador a una URL pública. Si no existe,
  // mantener el fallback localhost para desarrollo local.
  if (Platform.OS === 'web') {
    if (envWsUrl) {
      try {
        const parsed = new URL(envWsUrl);
        // Keep WS origin host-only. Namespace and socket path are configured separately.
        parsed.pathname = '';

        const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

        if (isLocalhost) {
          const browserHost = getBrowserHost();

          if (browserHost) {
            parsed.hostname = browserHost;
          }
        }

        return parsed.toString().replace(/\/$/, '');
      } catch {
        return envWsUrl;
      }
    }

    return 'http://localhost:3001';
  }

  // En nativo: usar variable de entorno (ngrok) o default

  if (envWsUrl) {
    try {
      const parsed = new URL(envWsUrl);
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

  // Convert common misconfigurations like '/ws/socket.io' to the expected Socket.IO path.
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

  // In Expo/React Native, starting with polling is usually more reliable than websocket-first.
  return Platform.OS === 'web' ? ['websocket', 'polling'] : ['polling', 'websocket'];
}

function shouldAllowAnonymousWs() {
  return isTruthyEnv(getEnvValue('EXPO_PUBLIC_WS_ALLOW_ANONYMOUS'));
}

function isRealtimeDebugEnabled() {
  return isTruthyEnv(getEnvValue('EXPO_PUBLIC_WS_DEBUG'));
}

function logRealtimeDebug(message: string, payload?: unknown) {
  if (!isRealtimeDebugEnabled()) {
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[realtime] ${message}`, payload ?? '');
}

function syncJoinedRooms() {
  if (!socket?.connected || joinedRooms.size === 0) {
    return;
  }

  joinedRooms.forEach((room) => {
    socket?.emit('system.join_room', { room });
    logRealtimeDebug('rejoin room', room);
  });
}

export function connectRealtime(auth: RealtimeAuth = {}) {
  const hasToken = Boolean(auth.token && auth.token.trim().length > 0);

  if (socket?.connected) {
    // If a token is now available and does not match the active one, reconnect with updated auth.
    if (hasToken && activeAuthToken !== auth.token) {
      logRealtimeDebug('auth token changed on connected socket, reconnecting');
      socket.disconnect();
      socket = null;
    } else {
      return socket;
    }
  }

  if (socket?.connected) {
    return socket;
  }

  if (socket && !socket.connected) {
    if (hasToken) {
      (socket as Socket & { auth?: Record<string, unknown> }).auth = {
        token: auth.token,
        userId: auth.userId,
        role: auth.role,
      };
      activeAuthToken = auth.token;
    }

    // Avoid forcing repeated connect() calls while Socket.IO is already attempting to reconnect.
    if ((socket as Socket & { active?: boolean }).active) {
      return socket;
    }

    socket.connect();
    return socket;
  }

  const anonymousMode = shouldAllowAnonymousWs() && !hasToken;
  const transports = resolveWsTransports();
  const baseUrl = resolveWsBaseUrl();
  const namespace = resolveWsNamespace();
  const path = resolveWsPath();

  logRealtimeDebug('connecting', {
    platform: Platform.OS,
    baseUrl,
    namespace,
    path,
    transports,
  });

  const socketOptions: Parameters<typeof io>[1] = {
    autoConnect: true,
    timeout: 8000,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    transports,
    tryAllTransports: true,
    path,
    auth: anonymousMode
      ? {}
      : {
          token: auth.token,
          userId: auth.userId,
          role: auth.role,
        },
  };

  // Agregar headers HTTP para CORS en nativo
  if (Platform.OS !== 'web') {
    socketOptions.extraHeaders = {
      'ngrok-skip-browser-warning': '69420',
      'X-Requested-With': 'XMLHttpRequest',
    };
  }

  socket = io(`${baseUrl}${namespace}`, socketOptions);

  activeAuthToken = hasToken ? auth.token : undefined;

  socket.on('connect', () => {
    connectErrors = 0;
    syncJoinedRooms();
    logRealtimeDebug('connected', {
      id: socket?.id,
      baseUrl,
      namespace,
      path,
      transports,
    });
  });

  socket.on('connect_error', (error: unknown) => {
    connectErrors += 1;
    logRealtimeDebug('connect_error', error);
  });

  socket.on('disconnect', (reason: unknown) => {
    logRealtimeDebug('disconnected', reason);
  });

  socket.io.on('reconnect_attempt', (attempt) => {
    logRealtimeDebug('reconnect_attempt', attempt);
  });

  socket.io.on('reconnect', (attempt) => {
    logRealtimeDebug('reconnect', attempt);
  });

  return socket;
}

export function disconnectRealtime() {
  if (!socket) {
    return;
  }

  socket.disconnect();
  socket = null;
  activeAuthToken = undefined;
  connectErrors = 0;
  joinedRooms.clear();
}

export function isRealtimeConnected() {
  return Boolean(socket?.connected);
}

export function joinRealtimeRoom(room: string) {
  joinedRooms.add(room);
  socket?.emit('system.join_room', { room });
  logRealtimeDebug('join room', room);
}

export function leaveRealtimeRoom(room: string) {
  joinedRooms.delete(room);
  socket?.emit('system.leave_room', { room });
  logRealtimeDebug('leave room', room);
}

export function emitRealtime<T>(event: string, payload: T) {
  socket?.emit(event, payload);
  logRealtimeDebug(`emit ${event}`, payload);
}

export function onRealtime<T = unknown>(event: string, handler: RealtimeHandler<T>) {
  // Capture the current socket instance so that cleanup always targets the
  // exact socket the listener was registered on, even if the module-level
  // variable is replaced later (e.g. token change → new connection).
  const registeredSocket = socket;

  if (!registeredSocket) {
    return () => {};
  }

  const wrapped = (payload: T) => {
    logRealtimeDebug(`on ${event}`, payload);
    handler(payload);
  };

  registeredSocket.on(event, wrapped as (...args: unknown[]) => void);

  return () => {
    registeredSocket.off(event, wrapped as (...args: unknown[]) => void);
  };
}

export function emitChatSend(payload: { campaignId: number; message: string }) {
  emitRealtime('chat.send', payload);
}

export function onChatMessageCreated<T = unknown>(handler: RealtimeHandler<T>) {
  return onRealtime<T>('chat.message.created', handler);
}
