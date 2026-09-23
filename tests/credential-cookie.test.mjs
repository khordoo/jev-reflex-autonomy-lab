import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCredentialCookie,
  credentialsWithSourcePriority,
  decryptCredentialValue,
  encryptCredentialValue,
  sameOriginRequest,
} from '../lib/reflex/credential-cookie-crypto.ts';

const secret = 'a-private-test-secret-with-at-least-32-characters';

test('encrypted cookie value round trips without exposing either key', async () => {
  const credentials = {
    openRouterApiKey: 'or-private-example',
    typesafeApiKey: 'ts-private-example',
  };
  const value = await encryptCredentialValue(
    credentials,
    secret,
    Date.now() + 60_000,
  );

  assert.equal(value.includes(credentials.openRouterApiKey), false);
  assert.equal(value.includes(credentials.typesafeApiKey), false);
  assert.deepEqual(await decryptCredentialValue(value, secret), credentials);

  const header = buildCredentialCookie(value, 3600, true);
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=Strict/);
  assert.match(header, /Max-Age=3600/);
  assert.ok(header.length <= 4096);
});

test('tampered cookie values are rejected', async () => {
  const value = await encryptCredentialValue(
    { openRouterApiKey: 'or-private-example' },
    secret,
    Date.now() + 60_000,
  );
  const final = value.at(-1);
  const tampered = `${value.slice(0, -1)}${final === 'A' ? 'B' : 'A'}`;
  assert.deepEqual(await decryptCredentialValue(tampered, secret), {});
});

test('credential expiry is checked inside the authenticated payload', async () => {
  const value = await encryptCredentialValue(
    { typesafeApiKey: 'ts-private-example' },
    secret,
    1_700_000_000_000,
  );
  assert.deepEqual(
    await decryptCredentialValue(value, secret, 1_700_000_000_000),
    {},
  );
});

test('credential mutations require a matching request origin', () => {
  assert.equal(
    sameOriginRequest(
      new Request('https://lab.example/api/providers', {
        method: 'POST',
        headers: { origin: 'https://lab.example' },
      }),
    ),
    true,
  );
  assert.equal(
    sameOriginRequest(
      new Request('https://lab.example/api/providers', {
        method: 'POST',
        headers: { origin: 'https://attacker.example' },
      }),
    ),
    false,
  );
  assert.equal(
    sameOriginRequest(
      new Request('https://lab.example/api/providers', { method: 'POST' }),
    ),
    false,
  );
  assert.equal(
    sameOriginRequest(
      new Request('https://lab.example/api/providers', {
        method: 'POST',
        headers: {
          origin: 'https://lab.example',
          'sec-fetch-site': 'cross-site',
        },
      }),
    ),
    false,
  );
});

test('cookie builder rejects a header above the browser size limit', () => {
  assert.throws(
    () => buildCredentialCookie('x'.repeat(4100), 3600, true),
    /browser cookie size limit/,
  );
});

test('personal credentials never mix with deployment shared keys', () => {
  const shared = {
    openRouterApiKey: 'shared-openrouter',
    typesafeApiKey: 'shared-typesafe',
  };
  assert.deepEqual(
    credentialsWithSourcePriority(
      { openRouterApiKey: 'visitor-openrouter' },
      shared,
    ),
    { openRouterApiKey: 'visitor-openrouter' },
  );
  assert.deepEqual(credentialsWithSourcePriority({}, shared), shared);
});
