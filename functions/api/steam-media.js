// Public Steam Store metadata proxy for game artwork; no credentials needed.
// Only returns URLs hosted on Steam's image CDN and metadata for the requested app.
const allowed = /^(?:https:\/\/)(?:shared\.(?:fastly\.)?steamstatic\.com|cdn\.(?:cloudflare\.)?steamstatic\.com|steamcdn-a\.akamaihd\.net|(?:shared|cdn)\.steamstatic\.com)\//i;
export async function onRequestGet({request}) {
  const u=new URL(request.url), id=u.searchParams.get('id');
  if(!/^\d{1,10}$/.test(id||''))return Response.json({error:'Invalid Steam App ID'},{status:400});
  try{
    const r=await fetch('https://store.steampowered.com/api/appdetails?appids='+id+'&l=english&cc=us',{headers:{'accept':'application/json','user-agent':'GameAIChecker/1.0 (gameaichecker.com)'},signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw new Error('Steam API HTTP '+r.status);
    const raw=await r.json(), entry=raw[id], d=entry?.success?entry.data:null;
    if(!d)return Response.json({id,available:false,screenshots:[]},{headers:{'cache-control':'public,max-age=600'}});
    const safe=url=>typeof url==='string'&&allowed.test(url)?url:null;
    const screenshots=(d.screenshots||[]).map(s=>({thumbnail:safe(s.path_thumbnail),full:safe(s.path_full)})).filter(s=>s.full||s.thumbnail).slice(0,100);
    const body={id,available:true,name:d.name,header:safe(d.header_image),background:safe(d.background_raw)||safe(d.background),screenshots,steamUrl:'https://store.steampowered.com/app/'+id+'/'};
    return Response.json(body,{headers:{'cache-control':'public,max-age=21600,stale-while-revalidate=86400','access-control-allow-origin':'*'}});
  }catch(e){return Response.json({id,available:false,screenshots:[],error:'Steam media temporarily unavailable'},{status:502,headers:{'cache-control':'public,max-age=120'}})}
}
