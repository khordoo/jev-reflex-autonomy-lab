import {
  clearCredentialCookie,
  createCredentialCookie,
  providerConfiguration,
  readSavedCredentials,
  sameOriginRequest,
  validCredentialInput,
} from '@/lib/reflex/credential-cookie';

export async function GET(request: Request) {
  const saved = await readSavedCredentials(request);
  return Response.json(providerConfiguration(saved), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return Response.json(
      { error: 'Cross-origin requests are not supported' },
      { status: 403 },
    );

  try {
    const text = await request.text();
    if (text.length > 10000)
      return Response.json(
        { error: 'Credential request too large' },
        { status: 413 },
      );
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (!body || Array.isArray(body) || typeof body !== 'object')
      return Response.json(
        { error: 'Invalid credential request' },
        { status: 400 },
      );

    const saved = await readSavedCredentials(request);
    const openRouterApiKey =
      body.openRouterApiKey === undefined
        ? saved.openRouterApiKey
        : validCredentialInput(body.openRouterApiKey)
          ? body.openRouterApiKey.trim()
          : undefined;
    const typesafeApiKey =
      body.typesafeApiKey === undefined
        ? saved.typesafeApiKey
        : validCredentialInput(body.typesafeApiKey)
          ? body.typesafeApiKey.trim()
          : undefined;

    if (
      (body.openRouterApiKey !== undefined &&
        !validCredentialInput(body.openRouterApiKey)) ||
      (body.typesafeApiKey !== undefined &&
        !validCredentialInput(body.typesafeApiKey)) ||
      (body.removeOpenRouter !== undefined &&
        typeof body.removeOpenRouter !== 'boolean') ||
      (body.removeTypeSafe !== undefined &&
        typeof body.removeTypeSafe !== 'boolean') ||
      (body.rememberForSevenDays !== undefined &&
        typeof body.rememberForSevenDays !== 'boolean')
    )
      return Response.json(
        { error: 'Invalid credential fields' },
        { status: 400 },
      );

    const next = {
      openRouterApiKey: body.removeOpenRouter ? undefined : openRouterApiKey,
      typesafeApiKey: body.removeTypeSafe ? undefined : typesafeApiKey,
    };
    if (!next.openRouterApiKey && !next.typesafeApiKey)
      return Response.json(
        { error: 'Add at least one key, or remove all saved credentials.' },
        { status: 400 },
      );

    const cookie = await createCredentialCookie(
      next,
      body.rememberForSevenDays === true,
      request,
    );
    return Response.json(providerConfiguration(next), {
      headers: {
        'Cache-Control': 'no-store',
        'Set-Cookie': cookie,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return Response.json(
      {
        error:
          message.startsWith('Credential storage is not configured') ||
          message.startsWith('Credentials do not fit')
            ? message
            : 'Could not save credentials securely. Check the server configuration and try again.',
      },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!sameOriginRequest(request))
    return Response.json(
      { error: 'Cross-origin requests are not supported' },
      { status: 403 },
    );
  return Response.json(
    { removed: true },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Set-Cookie': clearCredentialCookie(request),
      },
    },
  );
}
