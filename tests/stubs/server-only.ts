// Vitest stub for the `server-only` package. In the Next.js bundler the
// package resolves to an empty module for server builds and throws for client
// imports; under Vitest (node) we need it to resolve to a no-op.
export {};
