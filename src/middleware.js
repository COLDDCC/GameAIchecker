import { defineMiddleware } from 'astro:middleware';
import { languageFromPath, localizePage } from './lib/i18n.js';
// Transform static HTML during prerendering and dev. All languages share the current templates.
export const onRequest = defineMiddleware(async (context, next) => {
  const route = languageFromPath(context.url.pathname);
  const response = await next();
  if (!route || response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(localizePage(await response.text(), route), { status: response.status, headers });
});
