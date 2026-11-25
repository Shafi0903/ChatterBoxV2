export function getAllowedCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN || 'http://localhost:3000';
  const configured = raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (process.env.NODE_ENV !== 'production') {
    const devDefaults = ['http://localhost:3000', 'http://127.0.0.1:3000'];
    for (const origin of devDefaults) {
      if (!configured.includes(origin)) {
        configured.push(origin);
      }
    }
  }

  return configured;
}

export function corsOriginCallback(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) {
  // Allow non-browser / same-origin / server-to-server requests without Origin header
  if (!origin) {
    return callback(null, true);
  }

  const normalized = origin.replace(/\/+$/, '');
  const allowed = getAllowedCorsOrigins();
  if (allowed.includes('*') || allowed.includes(normalized)) {
    return callback(null, true);
  }

  return callback(new Error('Origin not allowed by CORS'), false);
}
