const SIGNING_SECRET = process.env.EXPO_PUBLIC_REQUEST_SIGNING_SECRET ?? '';

async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Builds HMAC-SHA256 signature headers for a request.
 * Signed payload: METHOD\nPATHNAME\nTIMESTAMP\nBODY
 *
 * The timestamp is included so the backend can reject replayed requests
 * older than 5 minutes (anti-replay protection).
 */
export async function buildSignatureHeaders(
  method: string,
  path: string,
  body: unknown,
): Promise<{ 'X-Signature': string; 'X-Timestamp': string }> {
  const timestamp = Date.now().toString();
  const pathname = path.split('?')[0];
  const bodyStr = body != null ? JSON.stringify(body) : '';
  const message = [method.toUpperCase(), pathname, timestamp, bodyStr].join('\n');
  const signature = await hmacSha256(SIGNING_SECRET, message);
  return { 'X-Signature': signature, 'X-Timestamp': timestamp };
}

export const signingEnabled = SIGNING_SECRET.length > 0;
