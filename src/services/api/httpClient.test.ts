type LoadClientOptions = {
  os: 'ios' | 'android' | 'web';
  apiUrl?: string;
  networkDebug?: string;
  hostUri?: string;
  debuggerHost?: string;
  browserHost?: string;
};

function loadHttpClient(options: LoadClientOptions) {
  jest.resetModules();

  if (options.apiUrl === undefined) {
    delete process.env.EXPO_PUBLIC_API_URL;
  } else {
    process.env.EXPO_PUBLIC_API_URL = options.apiUrl;
  }

  if (options.networkDebug === undefined) {
    delete process.env.EXPO_PUBLIC_NETWORK_DEBUG;
  } else {
    process.env.EXPO_PUBLIC_NETWORK_DEBUG = options.networkDebug;
  }

  if (options.browserHost) {
    (globalThis as { location?: { hostname: string } }).location = {
      hostname: options.browserHost,
    };
  } else {
    delete (globalThis as { location?: { hostname: string } }).location;
  }

  jest.doMock('react-native', () => ({
    Platform: { OS: options.os },
  }));

  jest.doMock('expo-constants', () => ({
    __esModule: true,
    default: {
      expoConfig: options.hostUri ? { hostUri: options.hostUri } : undefined,
      expoGoConfig: options.debuggerHost ? { debuggerHost: options.debuggerHost } : undefined,
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module = require('./httpClient') as typeof import('./httpClient');

  return module.httpClient;
}

describe('httpClient', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('uses debuggerHost when hostUri is unavailable', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as never;

    const httpClient = loadHttpClient({
      os: 'ios',
      apiUrl: 'http://localhost:3000/api/v1',
      debuggerHost: '10.0.0.99:19000',
    });

    await httpClient('/health');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://10.0.0.99:3000/api/v1/health',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('replaces localhost with Expo host on iOS', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as never;

    const httpClient = loadHttpClient({
      os: 'ios',
      apiUrl: 'http://localhost:3000/api/v1',
      hostUri: '10.16.115.151:8081',
    });

    await httpClient('/events');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://10.16.115.151:3000/api/v1/events',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('uses Android emulator localhost fallback when Expo host is unavailable', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as never;

    const httpClient = loadHttpClient({
      os: 'android',
      apiUrl: 'http://localhost:3000/api/v1',
    });

    await httpClient('/ping');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://10.0.2.2:3000/api/v1/ping',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('uses browser host for web if configured API points to localhost', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as never;

    const httpClient = loadHttpClient({
      os: 'web',
      apiUrl: 'http://localhost:3000/api/v1',
      browserHost: '192.168.0.11',
    });

    await httpClient('/status', { token: 'abc' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.0.11:3000/api/v1/status',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer abc' }),
      })
    );
  });

  it('throws backend message when response is not ok', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Validation failed',
    });
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as never;

    const httpClient = loadHttpClient({ os: 'ios', apiUrl: 'http://api.example.com/v1' });

    await expect(httpClient('/bad')).rejects.toThrow('Validation failed');
  });

  it('falls back to default backend error when response text is empty', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
    });
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as never;

    const httpClient = loadHttpClient({ os: 'ios', apiUrl: 'http://api.example.com/v1' });

    await expect(httpClient('/unavailable')).rejects.toThrow(
      'Unexpected API error (503) -> http://api.example.com/v1/unavailable'
    );
  });

  it('throws network error with platform and URL when fetch fails', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('offline'));
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as never;

    const httpClient = loadHttpClient({ os: 'web', apiUrl: 'http://api.example.com/v1' });

    await expect(httpClient('/offline')).rejects.toThrow(
      'No fue posible conectar con el backend. Intenta de nuevo más tarde.'
    );
  });

  it('throws friendly backend connection error when server returns html', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => '<!DOCTYPE html><html><body>Bad Gateway</body></html>',
    });
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as never;

    const httpClient = loadHttpClient({ os: 'ios', apiUrl: 'http://api.example.com/v1' });

    await expect(httpClient('/gateway')).rejects.toThrow(
      'No fue posible conectar con el backend. Intenta de nuevo más tarde.'
    );
  });

  it('keeps configured URL when EXPO_PUBLIC_API_URL is not a valid URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as never;

    const httpClient = loadHttpClient({ os: 'web', apiUrl: 'not-a-url' });

    await httpClient('/raw');

    expect(fetchMock).toHaveBeenCalledWith('not-a-url/raw', expect.any(Object));
  });

  it('logs resolved API URL when network debug is enabled', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as never;

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const httpClient = loadHttpClient({
      os: 'web',
      apiUrl: 'http://api.example.com/v1',
      networkDebug: 'true',
    });

    await httpClient('/debug');

    expect(logSpy).toHaveBeenCalled();
    expect(
      logSpy.mock.calls.some((call) => String(call[0]).includes('[network] api base url resolved'))
    ).toBe(true);
  });
});
