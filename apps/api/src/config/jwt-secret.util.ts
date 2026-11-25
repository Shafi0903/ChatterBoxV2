export function getJwtAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (secret && secret.length >= 32) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_ACCESS_SECRET must be set (min 32 chars) in production');
  }
  return 'dev-access-secret-min-32-chars-long';
}

export function parseDurationMs(expr: string | undefined, fallbackMs: number): number {
  if (!expr) return fallbackMs;
  const trimmed = expr.trim();
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(trimmed);
  if (!match) {
    const asNumber = Number(trimmed);
    return Number.isFinite(asNumber) && asNumber > 0 ? asNumber * 1000 : fallbackMs;
  }
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] ?? 1000);
}
