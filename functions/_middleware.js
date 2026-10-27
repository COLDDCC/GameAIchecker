// Allow crawlers to fetch assets and read noindex; do not block them in robots.txt.
export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    return Response.redirect(url.href, 301);
  }
  if (['/images', '/images/steam', '/images/steam/apps', '/data'].includes(url.pathname.replace(/\/$/, ''))) {
    return new Response('Directory listing unavailable.', {status: 410, headers: {'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex'}});
  }
  if (/^\/game(?:\/|$)/.test(url.pathname)) {
    return new Response('This legacy game page has been retired. Search at /browse/.', {status: 410, headers: {'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex, follow'}});
  }
  if (url.pathname.startsWith('/games/en/')) {
    url.pathname = url.pathname.replace('/games/en/', '/games/');
    return Response.redirect(url.href, 301);
  }
  const response = await next();
  if (/^\/(images|data)\//.test(url.pathname)) {
    const tagged = new Response(response.body, response);
    tagged.headers.set('X-Robots-Tag', 'noindex');
    return tagged;
  }
  return response;
}
