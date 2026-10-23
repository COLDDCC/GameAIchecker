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
 rounded(69,263,612,115,17,'#fee2e2');
 rounded(69,263,8,115,4,'#db3039');
 text('!',107,341,62,'#bd1e28','800');text('大量玩家反馈使用了AI',157,336,34,'#b91c1c','800');
 text('GAME REPORT  /  STEAM 5345260',69,449,20,'#7791a8','700');
 text('明天照常营业',69,563,73,'#142a43','800');
 line(69,615,680,615);
 text('玩家公开质疑 · 来源可追溯',69,688,27,'#364d65','600');
 text('相关指控与生成式 AI 使用尚未独立证实',69,738,21,'#65758b','500');
 rounded(69,796,612,94,16,'#167cea');text('gameaichecker.com',375,855,36,'#ffffff','800','center');
 text('查看原始来源、证据链和核查状态',375,937,20,'#6e7f91','500','center');
}
draw();
const note=document.getElementById('gameShareNote');
const filename='game-ai-checker-5345260.png';
document.getElementById('gameShareDownload')?.addEventListener('click',()=>{try{const a=document.createElement('a');a.download=filename;a.href=canvas.toDataURL('image/png');a.click();note.textContent='PNG 已生成，可分享到小红书。'}catch(e){note.textContent='图片下载失败，请尝试长按预览图保存。'}});
document.getElementById('gameShareCopy')?.addEventListener('click',async()=>{try{if(!window.ClipboardItem||!navigator.clipboard?.write)throw Error('unsupported');const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('blob');await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);note.textContent='已复制图片，可以粘贴到支持图片粘贴的应用。'}catch(e){note.textContent='当前浏览器不支持复制 PNG，请使用「下载 PNG」。'}});
})();