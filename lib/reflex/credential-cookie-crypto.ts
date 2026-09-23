export type SavedCredentials = {
  openRouterApiKey?: string;
  typesafeApiKey?: string;
};

export function credentialsWithSourcePriority(
  saved: SavedCredentials,
  shared: SavedCredentials,
): SavedCredentials {
  return saved.openRouterApiKey || saved.typesafeApiKey ? saved : shared;
}

type CredentialPayload = SavedCredentials & { v: 1; exp: number };

const MAX_KEY_LENGTH = 1500;
const AAD = new TextEncoder().encode('reflex-credentials:v1');

function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey(secret: string) {
  if (secret.length < 32)
    throw new Error(
      'Credential encryption secret must be at least 32 characters',
    );
  const material = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptCredentialValue(
  credentials: SavedCredentials,
  secret: string,
  expiresAt: number,
) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(
    JSON.stringify({ v: 1, exp: expiresAt, ...credentials }),
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: AAD },
    await encryptionKey(secret),
    plaintext,
  );
  const packed = new Uint8Array(nonce.length + ciphertext.byteLength);
  packed.set(nonce);
  packed.set(new Uint8Array(ciphertext), nonce.length);
  return base64UrlEncode(packed);
}

export async function decryptCredentialValue(
  value: string,
  secret: string,
  now = Date.now(),
): Promise<SavedCredentials> {
  if (value.length > 4096 || secret.length < 32) return {};
  try {
    const packed = base64UrlDecode(value);
    if (packed.length <= 12 + 16) return {};
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: packed.slice(0, 12),
        additionalData: AAD,
      },
      await encryptionKey(secret),
      packed.slice(12),
    );
    const payload = JSON.parse(
      new TextDecoder().decode(plaintext),
    ) as Partial<CredentialPayload>;
    if (
      payload.v !== 1 ||
      !Number.isSafeInteger(payload.exp) ||
      (payload.exp as number) <= now ||
      (payload.openRouterApiKey !== undefined &&
        (typeof payload.openRouterApiKey !== 'string' ||
          payload.openRouterApiKey.length > MAX_KEY_LENGTH)) ||
      (payload.typesafeApiKey !== undefined &&
        (typeof payload.typesafeApiKey !== 'string' ||
          payload.typesafeApiKey.length > MAX_KEY_LENGTH)) ||
      (!payload.openRouterApiKey && !payload.typesafeApiKey)
    )
      return {};
    return {
      openRouterApiKey: payload.openRouterApiKey,
      typesafeApiKey: payload.typesafeApiKey,
    };
  } catch {
    return {};
  }
}

export function sameOriginRequest(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return false;
  } catch {
    return false;
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none';
}

export function buildCredentialCookie(
  value: string,
  maxAge: number,
  secure: boolean,
) {
  const cookie = `reflex_credentials=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  if (cookie.length > 4096)
    throw new Error(
      'Credentials do not fit within the browser cookie size limit.',
    );
  return cookie;
}
