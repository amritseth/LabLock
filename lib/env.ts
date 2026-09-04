import "server-only";

/**
 * Typed environment access for server-side code.
 *
 * Rule: anything used here is SERVER-ONLY. Anything that must reach the
 * browser gets the NEXT_PUBLIC_ prefix and is copied into a client constant
 * explicitly — never imported into a client component from this module.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isAuthConfigured(): boolean {
  return isSupabaseConfigured();
}
