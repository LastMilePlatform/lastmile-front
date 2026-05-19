import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { buildSignatureHeaders, signingEnabled } from '@/utils/requestSigning';

const DEFAULT_API_BASE_URL = 'http://localhost:3001';
const EXPO_PUBLIC_API_URL = process.env.EXPO_PUBLIC_API_URL;
const EXPO_PUBLIC_NETWORK_DEBUG = process.env.EXPO_PUBLIC_NETWORK_DEBUG;
const BACKEND_CONNECTION_ERROR_MESSAGE =
  'No fue posible conectar con el backend. Intenta de nuevo más tarde.';

let hasLoggedApiBaseUrl = false;

function isNetworkDebugEnabled() {
  if (!EXPO_PUBLIC_NETWORK_DEBUG) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(EXPO_PUBLIC_NETWORK_DEBUG.trim().toLowerCase());
}

function logNetworkDebug(message: string, payload?: unknown) {
  if (!isNetworkDebugEnabled()) {
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[network] ${message}`, payload ?? '');
}

function isHtmlPayload(payload: string) {
  const normalized = payload.trim().toLowerCase();
  return normalized.startsWith('<!doctype html') || normalized.startsWith('<html');
}

function isGatewayLikeMessage(payload: string) {
  const normalized = payload.trim().toLowerCase();
  return (
    normalized === 'bad gateway' ||
    normalized === 'gateway timeout' ||
    normalized === 'service unavailable'
  );
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

function resolveApiBaseUrl() {
  // En web: usar la URL configurada para producción cuando exista.
  if (Platform.OS === 'web') {
    return EXPO_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL;
  }

  // En nativo: usar la variable de entorno (ngrok) o el default
  const configuredUrl = EXPO_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL;

  try {
    const parsed = new URL(configuredUrl);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

    if (!isLocalhost) {
      return configuredUrl;
    }

    // En nativo: resolver localhost a la IP del Expo host
    const expoHostIp = getExpoHostIp();

    if (expoHostIp) {
      parsed.hostname = expoHostIp;
      return parsed.toString().replace(/\/$/, '');
    }

    if (Platform.OS === 'android') {
      parsed.hostname = '10.0.2.2';
      return parsed.toString().replace(/\/$/, '');
    }

    return configuredUrl;
  } catch {
    return configuredUrl;
  }
}

const API_BASE_URL =
  resolveApiBaseUrl();

if (!hasLoggedApiBaseUrl) {
  hasLoggedApiBaseUrl = true;
  logNetworkDebug('api base url resolved', {
    platform: Platform.OS,
    configured: EXPO_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL,
    resolved: API_BASE_URL,
  });
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

type RequestOptions = {
  method?: HttpMethod;
  token?: string;
  body?: unknown;
};

export async function httpClient<T>(
  path: string,
  { method = 'GET', token, body }: RequestOptions = {}
): Promise<T> {
  const requestUrl = `${API_BASE_URL}${path}`;
  let response: Response;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    // En nativo, agregar header para ngrok
    if (Platform.OS !== 'web' && Platform.OS !== 'android' && Platform.OS !== 'ios') {
      headers['ngrok-skip-browser-warning'] = '69420';
    }

    if (signingEnabled) {
      const sigHeaders = await buildSignatureHeaders(method, path, body ?? null);
      headers['X-Signature'] = sigHeaders['X-Signature'];
      headers['X-Timestamp'] = sigHeaders['X-Timestamp'];
    }

    response = await fetch(requestUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(BACKEND_CONNECTION_ERROR_MESSAGE);
  }

  if (!response.ok) {
    const message = (await response.text()).trim();

    if (!message) {
      throw new Error(`Unexpected API error (${response.status}) -> ${requestUrl}`);
    }

    if (isHtmlPayload(message) || (response.status >= 500 && isGatewayLikeMessage(message))) {
      throw new Error(BACKEND_CONNECTION_ERROR_MESSAGE);
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}