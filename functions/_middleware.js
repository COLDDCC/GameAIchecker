// Keep obsolete directory endpoints out of Search without blocking real images.
export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    return Response.redirect(url.href, 301);
  }
  if (['/images', '/images/steam', '/images/steam/apps'].includes(url.pathname.replace(/\/$/, ''))) {
    return new Response('Directory listing unavailable.', {status: 410, headers: {'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex'}});
  }
  // /game/?id=... remains a noindex compatibility resolver for historical links.
  if (url.pathname === '/game/' && !url.search) return Response.redirect(new URL('/browse/', url).href, 301);
  return next();
}
