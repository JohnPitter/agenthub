import type { Request, Response, NextFunction } from "express";

/**
 * Sets security-related HTTP headers on every response.
 * CSP is only applied in production to avoid breaking HMR / dev tooling.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Required for WebContainer API (SharedArrayBuffer)
  // Using "credentialless" instead of "require-corp" to allow cross-origin fonts/images
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' blob:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        "connect-src 'self' wss: https: wss://*.webcontainer.io wss://*.webcontainer-api.io https://openrouter.ai https://api.github.com https://*.webcontainer.io https://*.webcontainer-api.io https://*.stackblitz.com https://stackblitz.com https://w-corp-staticblitz.com",
        "frame-src 'self' https://*.webcontainer.io https://*.webcontainer-api.io https://*.local-corp.webcontainer-api.io https://*.stackblitz.com https://stackblitz.com blob:",
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
      ].join("; "),
    );
  }

  next();
}
