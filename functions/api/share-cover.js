// Canvas-safe cover response; source is the official Steam store image.
const sources = [
  "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/5345260/3d7efca6818b46ff48aae6cde12bacf8297b8f71/header.jpg?t=1792566323",
  'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/5345260/3d7efca6818b46ff48aae6cde12bacf8297b8f71/header.jpg',
];
export async function onRequestGet({request}) {
 const url=new URL(request.url);
 if(url.searchParams.get('id')!=='5345260')return new Response('Invalid game',{status:400});
 for(const src of sources){
  try{
   const r=await fetch(src,{signal:AbortSignal.timeout(9000)});
   const mime=r.headers.get('content-type')||'';
   if(!r.ok || !mime.startsWith('image/'))continue;
   const bytes=await r.arrayBuffer();
   if(bytes.byteLength<1000)continue;
   return new Response(bytes,{headers:{'content-type':mime,'cache-control':'public,max-age=86400','access-control-allow-origin':'*','x-content-type-options':'nosniff'}});
  }catch{}
 }
 return new Response('Official Steam cover currently unavailable',{status:502,headers:{'cache-control':'no-store'}});
}
