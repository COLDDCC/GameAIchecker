(()=>{'use strict';
const canvas=document.getElementById('gameShareCanvas');
if(!canvas)return;
const ctx=canvas.getContext('2d');
const W=750,H=1000,scale=1;
canvas.width=W*scale;canvas.height=H*scale;
const font='"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif';
function rounded(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();if(typeof ctx.roundRect==='function')ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);ctx.fill()}
function text(t,x,y,size,color,weight='600',align='left'){ctx.fillStyle=color;ctx.font=weight+' '+size+'px '+font;ctx.textAlign=align;ctx.fillText(t,x,y);ctx.textAlign='left'}
function line(x1,y1,x2,y2,color='#e6ebf1',width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()}
function draw(){
 ctx.setTransform(scale,0,0,scale,0,0);ctx.fillStyle='#eaf3fc';ctx.fillRect(0,0,W,H);
 rounded(34,32,682,935,28,'#ffffff');
 ctx.fillStyle='#1789ef';ctx.beginPath();ctx.moveTo(85,93);ctx.lineTo(121,114);ctx.lineTo(85,135);ctx.closePath();ctx.fill();
 text('Game AI Checker',146,124,34,'#122e4a','800');text('游戏 AI 使用证据档案',69,187,22,'#6b7d90','500');
 line(69,216,680,216);
 // Draw an actual game cover above the status label; never use AI-generated artwork.
 rounded(69,245,612,270,14,'#e7eef5');
 if(coverReady){ctx.save();ctx.beginPath();if(typeof ctx.roundRect==='function')ctx.roundRect(69,245,612,270,14);else ctx.rect(69,245,612,270);ctx.clip();const ratio=Math.max(612/cover.naturalWidth,270/cover.naturalHeight);const dw=cover.naturalWidth*ratio,dh=cover.naturalHeight*ratio;ctx.drawImage(cover,69+(612-dw)/2,245+(270-dh)/2,dw,dh);ctx.restore();}
 else {text('游戏封面加载失败',375,370,24,'#64748b','600','center');}
 rounded(69,545,612,105,17,'#fee2e2');rounded(69,545,8,105,4,'#db3039');
 text('!',105,615,55,'#bd1e28','800');text('大量玩家反馈使用了AI',152,610,33,'#b91c1c','800');
 text('明天照常营业',69,746,69,'#142a43','800');
 text('玩家反馈 · 尚未独立证实',69,803,23,'#65758b','500');
 rounded(69,837,612,80,16,'#167cea');text('gameaichecker.com',375,888,34,'#ffffff','800','center');
 text('查看证据链与来源',375,944,19,'#6e7f91','500','center');
}
const note=document.getElementById('gameShareNote');
const openBtn=document.getElementById('gameShareOpen');
const dialog=document.getElementById('gameShareDialog');
const filename='game-ai-checker-5345260.png';
let coverReady=false,coverFailed=false;
const cover=new Image();
function status(message){if(note)note.textContent=message}
function ready(){draw();return canvas.width>0 && canvas.height>0}
function asBlob(){return new Promise((resolve,reject)=>{try{ready();canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG encoding returned empty data')),'image/png')}catch(e){reject(e)}})}
function openImage(blob){
 const url=URL.createObjectURL(blob);
 const tab=window.open(url,'_blank');
 if(!tab){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';document.body.appendChild(a);a.click();a.remove()}
 status('图片已打开。如在手机上，请长按图片并选择“存储到照片”。');
 // Keep the object URL alive for mobile viewers; clear it when the page unloads.
 window.addEventListener('pagehide',()=>URL.revokeObjectURL(url),{once:true});
}
cover.onload=()=>{coverReady=true;draw();status('分享图片已准备好')};
cover.onerror=()=>{coverFailed=true;draw();status('官方封面暂时不可用，仍可导出文字卡片。')};
cover.src='/api/share-cover?id=5345260';
draw(); // Always render immediately; never export a blank canvas while waiting for the cover.
openBtn?.addEventListener('click',()=>{try{if(dialog&&typeof dialog.showModal==='function')dialog.showModal();else if(dialog)dialog.hidden=false;ready()}catch(e){status('预览打开失败：'+e.message)}});
document.getElementById('gameShareClose')?.addEventListener('click',()=>{if(dialog&&typeof dialog.close==='function')dialog.close();else if(dialog)dialog.hidden=true});
dialog?.addEventListener('click',e=>{if(e.target===dialog&&typeof dialog.close==='function')dialog.close()});
document.getElementById('gameShareDownload')?.addEventListener('click',()=>{
 try{
  // Keep generation and anchor activation synchronous within the user gesture.
  // Asynchronous toBlob/File/navigator.share loses gesture on several mobile browsers.
  ready();
  const data=canvas.toDataURL('image/png');
  if(!data.startsWith('data:image/png'))throw new Error('PNG 编码失败');
  const anchor=document.createElement('a');
  anchor.href=data;anchor.download=filename;anchor.style.display='none';
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  status('已生成 PNG。如果手机未自动保存，请使用「打开图片 / 长按保存」。');
 }catch(e){status('导出失败：'+(e?.message||e)+'；请尝试「打开图片 / 长按保存」。')}
});
document.getElementById('gameShareView')?.addEventListener('click',async()=>{
 try{ready();const data=canvas.toDataURL('image/png');const win=window.open('','_blank');if(win){win.document.title='明天照常营业 · 分享图片';win.document.body.style='margin:0;background:#eaf3fc;text-align:center';const img=win.document.createElement('img');img.src=data;img.alt='分享卡片';img.style='display:block;max-width:100%;height:auto;margin:auto';win.document.body.appendChild(img);status('图片已打开，可长按保存。')}else{const blob=await asBlob();openImage(blob)}}catch(e){status('打开图片失败：'+(e?.message||e))}
});
document.getElementById('gameShareCopy')?.addEventListener('click',async()=>{
 try{
  if(!window.ClipboardItem||!navigator.clipboard?.write)throw new Error('此浏览器不支持复制 PNG');
  const blob=await asBlob();
  await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
  status('图片已复制，可粘贴到支持图片的应用。');
 }catch(e){status((e?.message||'复制失败')+'；可改用“打开图片 / 长按保存”。')}
});
})();