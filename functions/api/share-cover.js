// Same-origin cover proxy permits a clean Canvas export without cross-origin tainting.
export async function onRequestGet({request}) {
 const url=new URL(request.url);
 if(url.searchParams.get('id')!=='5345260')return new Response('Invalid game',{status:400});
 try{
  const response=await fetch('https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/5345260/header.jpg',{signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('Steam cover unavailable');
  const type=response.headers.get('content-type')||'';
  if(!type.startsWith('image/'))throw Error('Not an image');
  return new Response(response.body,{headers:{'content-type':type,'cache-control':'public,max-age=86400','x-content-type-options':'nosniff'}});
 }catch{return new Response('Cover unavailable',{status:502})}
}
