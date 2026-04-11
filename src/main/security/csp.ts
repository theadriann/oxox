export function getContentSecurityPolicy(isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    isDev ? "connect-src 'self' ws://localhost:3105 http://localhost:3105" : "connect-src 'self'",
    isDev ? "worker-src 'self' blob:" : "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ]
  return directives.join('; ')
}
