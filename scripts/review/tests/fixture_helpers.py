"""Small truthful offline storefront, community and identity fixtures."""
import html

def store_html(app,name,quote=None,developer='Fixture dev',body='Full game description'):
    disclosure='' if quote is None else '<div id="game_area_content_descriptors"><h2>AI Generated Content Disclosure</h2><p>The developers describe how their game uses AI Generated Content like this:</p><p><i>'+html.escape(quote)+'</i></p></div>'
    return f'<html><a href="/app/{app}/"></a><div id="appHubAppName">{html.escape(name)}</div><div id="developers_list">{html.escape(developer)}</div><div id="game_area_description">{html.escape(body)}</div>{disclosure}<div class="sysreq_contents">Full requirements</div></html>'

def discussion_html(name):
    return '<html><div class="apphub_AppName">'+html.escape(name)+'</div><span id="forum_General_123_pagetotal">0</span><div class="forum_topics_container"></div></html>'

def raw_source(i,root,path,app,kind,quote='',name='Fixture 0',developer='Fixture dev',disclosure=True):
    path.parent.mkdir(parents=True,exist_ok=True)
    if kind=='store': body=store_html(app,name,quote if disclosure else None,developer)
    elif kind=='discussion': body=discussion_html(name)
    elif kind=='identity':
        i.atomic(path,{app:{'success':True,'data':{'steam_appid':int(app),'name':name,'developers':[developer],'type':'game'}}})
        body=None
    else: body='<html><body>'+html.escape(quote)+'</body></html>'
    if body is not None: path.write_text(body)
    r=dict(id=kind,appId=app,sourceType=kind,url=f'https://example.invalid/app/{app}/{kind}',fetchedAt=i.now(),httpStatus=200,language='english',contentHash=i.sha(path),readStatus='complete',quote=quote,locator='full fixture source',cachePath=str(path.relative_to(root)))
    if kind=='store':r['disclosurePresent']=disclosure
    return r


def demand_fixture(i,row):
    path=i.ROOT/'.cache/search-demand'/f"{row['appId']}.json"
    i.atomic(path,dict(appId=row['appId'],query=row['name']+' AI',kind='gsc',metric='impressions',value=1,observedAt=i.now(),sourceUrl='https://search.google.com/search-console/'))
    return {**row,'demand':dict(query=row['name']+' AI',evidencePath=str(path.relative_to(i.ROOT)),contentHash=i.sha(path))}

def english_fixture(i):
    return dict(summary='The fixture developer discloses AI use with a limited stated scope.',reviewNote='This is a fixture developer statement, not an independent audit.',aiAreaNotes={k:'This area is limited to the explicit fixture source statement.' for k in i.AREAS})
