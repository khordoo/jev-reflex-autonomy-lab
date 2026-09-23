import {
  buildCredentialCookie,
  credentialsWithSourcePriority,
  decryptCredentialValue,
  encryptCredentialValue,
  type SavedCredentials,
} from './credential-cookie-crypto';

export const CREDENTIAL_COOKIE = 'reflex_credentials';
const SHORT_TTL_SECONDS = 60 * 60;
const REMEMBER_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_KEY_LENGTH = 1500;
export type { SavedCredentials } from './credential-cookie-crypto';

type RuntimeSettings = {
  CREDENTIALS_ENCRYPTION_KEY?: string;
  TYPESAFE_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  ALLOW_SHARED_API_KEYS?: string;
  ENVIRONMENT?: string;
};

export type ProviderConfiguration = {
  jevConfigured: boolean;
  jevProvider: string;
  plannerConfigured: boolean;
  plannerModel: string;
  savedCredentials: { openRouter: boolean; typeSafe: boolean };
  credentialStorageEnabled: boolean;
  sharedKeysEnabled: boolean;
};

function settings() {
  return process.env as RuntimeSettings;
}

function encryptionSecret() {
  return (
    settings().CREDENTIALS_ENCRYPTION_KEY ||
    process.env.CREDENTIALS_ENCRYPTION_KEY ||
    ''
  );
}

function isProduction() {
  const configuredEnvironment = settings().ENVIRONMENT;
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    configuredEnvironment === 'production'
  );
}

export function sharedKeysAreEnabled() {
  const allowed = settings().ALLOW_SHARED_API_KEYS;
  const development =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'development' ||
    settings().ENVIRONMENT === 'development';
  const explicitlyAllowed = allowed === '1' || allowed === 'true';
  return isProduction() ? explicitlyAllowed : development || explicitlyAllowed;
}

export function getSharedKeys() {
  if (!sharedKeysAreEnabled())
    return { typesafeApiKey: undefined, openRouterApiKey: undefined };
  return {
    typesafeApiKey:
      settings().TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY || undefined,
    openRouterApiKey:
      settings().OPENROUTER_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      undefined,
  };
}

function cookieValue(request: Request) {
  const cookies = request.headers.get('cookie') || '';
  const pair = cookies
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CREDENTIAL_COOKIE}=`));
  return pair?.slice(CREDENTIAL_COOKIE.length + 1);
}

export async function readSavedCredentials(
  request: Request,
): Promise<SavedCredentials> {
  const value = cookieValue(request);
  if (!value || value.length > 4096) return {};
  const secret = encryptionSecret();
  return decryptCredentialValue(value, secret);
}

export async function createCredentialCookie(
  credentials: SavedCredentials,
  rememberForSevenDays: boolean,
  request: Request,
) {
  const secret = encryptionSecret();
  if (secret.length < 32)
    throw new Error('Credential storage is not configured on this deployment.');

  const maxAge = rememberForSevenDays
    ? REMEMBER_TTL_SECONDS
    : SHORT_TTL_SECONDS;
  const value = await encryptCredentialValue(
    credentials,
    secret,
    Date.now() + maxAge * 1000,
  );
  const secure = new URL(request.url).protocol === 'https:' || isProduction();
  try {
    return buildCredentialCookie(value, maxAge, secure);
  } catch {
    throw new Error(
      'Credentials do not fit within the browser cookie size limit.',
    );
  }
}

export function clearCredentialCookie(request: Request) {
  const secure = new URL(request.url).protocol === 'https:' || isProduction();
  return `${CREDENTIAL_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? '; Secure' : ''}`;
}

export { sameOriginRequest } from './credential-cookie-crypto';

export function providerConfiguration(
  savedCredentials: SavedCredentials,
): ProviderConfiguration {
  const effective = credentialsWithSourcePriority(
    savedCredentials,
    getSharedKeys(),
  );
  const typesafeKey = effective.typesafeApiKey;
  const openRouterKey = effective.openRouterApiKey;
  const typesafeConfigured = Boolean(typesafeKey);
  const openRouterConfigured = Boolean(openRouterKey);
  return {
    jevConfigured: typesafeConfigured || openRouterConfigured,
    jevProvider: typesafeConfigured
      ? savedCredentials.typesafeApiKey
        ? 'TypeSafe direct'
        : 'shared TypeSafe key'
      : openRouterConfigured
        ? savedCredentials.openRouterApiKey
          ? 'OpenRouter'
          : 'shared OpenRouter key'
        : 'none',
    plannerConfigured: openRouterConfigured,
    plannerModel:
      settings().OPENROUTER_MODEL ||
      process.env.OPENROUTER_MODEL ||
      'z-ai/glm-5.3',
    savedCredentials: {
      openRouter: Boolean(savedCredentials.openRouterApiKey),
      typeSafe: Boolean(savedCredentials.typesafeApiKey),
    },
    credentialStorageEnabled: encryptionSecret().length >= 32,
    sharedKeysEnabled: sharedKeysAreEnabled(),
  };
}

export function credentialsForRequest(saved: SavedCredentials) {
  return credentialsWithSourcePriority(saved, getSharedKeys());
}

export function validCredentialInput(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_KEY_LENGTH
  );
}
