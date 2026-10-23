(()=>{'use strict';
const canvas=document.getElementById('gameShareCanvas');
if(!canvas)return;
const ctx=canvas.getContext('2d');
const W=750,H=1000,scale=2;
canvas.width=W*scale;canvas.height=H*scale;
const font='"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif';
function rounded(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
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
 if(coverReady){ctx.save();ctx.beginPath();ctx.roundRect(69,245,612,270,14);ctx.clip();const ratio=Math.max(612/cover.naturalWidth,270/cover.naturalHeight);const dw=cover.naturalWidth*ratio,dh=cover.naturalHeight*ratio;ctx.drawImage(cover,69+(612-dw)/2,245+(270-dh)/2,dw,dh);ctx.restore();}
 else {text('游戏封面加载失败',375,370,24,'#64748b','600','center');}
 rounded(69,545,612,105,17,'#fee2e2');rounded(69,545,8,105,4,'#db3039');
 text('!',105,615,55,'#bd1e28','800');text('大量玩家反馈使用了AI',152,610,33,'#b91c1c','800');
 text('明天照常营业',69,746,69,'#142a43','800');
 text('玩家反馈 · 尚未独立证实',69,803,23,'#65758b','500');
 rounded(69,837,612,80,16,'#167cea');text('gameaichecker.com',375,888,34,'#ffffff','800','center');
 text('查看证据链与来源',375,944,19,'#6e7f91','500','center');
}
const cover=new Image();let coverReady=false;cover.onload=()=>{coverReady=true;draw()};cover.onerror=()=>draw();cover.src='/api/share-cover?id=5345260';
const openBtn=document.getElementById('gameShareOpen');const dialog=document.getElementById('gameShareDialog');
openBtn?.addEventListener('click',()=>{if(dialog?.showModal){dialog.showModal()}else if(dialog){dialog.hidden=false}draw()});
document.getElementById('gameShareClose')?.addEventListener('click',()=>{if(dialog?.close)dialog.close();else dialog.hidden=true});
if(dialog?.addEventListener)dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
const note=document.getElementById('gameShareNote');
const filename='game-ai-checker-5345260.png';
document.getElementById('gameShareDownload')?.addEventListener('click',()=>{try{const a=document.createElement('a');a.download=filename;a.href=canvas.toDataURL('image/png');a.click();note.textContent='PNG 已生成，可分享到小红书。'}catch(e){note.textContent='图片下载失败，请尝试长按预览图保存。'}});
document.getElementById('gameShareCopy')?.addEventListener('click',async()=>{try{if(!window.ClipboardItem||!navigator.clipboard?.write)throw Error('unsupported');const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('blob');await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);note.textContent='已复制图片，可以粘贴到支持图片粘贴的应用。'}catch(e){note.textContent='当前浏览器不支持复制 PNG，请使用「下载 PNG」。'}});
})();