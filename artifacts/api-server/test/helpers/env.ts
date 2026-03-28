export function requireTestEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set to run API integration tests`);
  }
  return value;
}

export function ensureApiTestEnv(): void {
  requireTestEnv("DATABASE_URL");
  requireTestEnv("JWT_SECRET");
}
