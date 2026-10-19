import { analyze } from './core.mjs';
const $=id=>document.getElementById(id);let current=null,filename='',urls=[];
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
async function load(file){
 current=null;$('result').hidden=true;urls.forEach(URL.revokeObjectURL);urls=[];$('cards').replaceChildren();$('texts').replaceChildren();$('texts').hidden=true;
 if(!file)return;status('正在检查文档…');
 try{
  if(!/\.doc$/i.test(file.name))throw new Error('请选择旧版 .doc 文件；暂不支持 .docx、PDF 或图片');
  if(file.size>32*1024*1024)throw new Error('文件超过 32 MB，请先减小文件大小');
  const buffer=await file.arrayBuffer();const analysis=analyze(buffer);filename=file.name;
  const shapes=analysis.shapes.filter(s=>!s.hidden);
  $('filename').textContent=filename;$('counts').textContent=`${(file.size/1024).toFixed(0)} KB · ${shapes.length} 个图片对象 · ${analysis.texts.length} 段匹配的品牌文字`;
  for(const s of shapes){const card=document.createElement('label');card.className='card';const check=document.createElement('input');check.type='checkbox';check.name='shape';check.value=s.key;check.checked=s.known;const title=document.createElement('strong');title.textContent=s.name;card.append(check,title);
   if(s.image){const img=document.createElement('img');img.alt='图片对象预览';const url=URL.createObjectURL(new Blob([s.image.bytes],{type:s.image.mime}));urls.push(url);img.src=url;img.addEventListener('error',()=>{const placeholder=document.createElement('div');placeholder.className='thumb';placeholder.textContent='此图片格式暂无法预览';img.replaceWith(placeholder);},{once:true});card.append(img);}
   else{const placeholder=document.createElement('div');placeholder.className='thumb';placeholder.textContent='此图片格式暂无法预览';card.append(placeholder);}
   const hint=document.createElement('small');hint.textContent=s.known?'已识别水印名称，默认选中':'请根据预览判断是否需要隐藏';card.append(hint);$('cards').append(card);
  }
  for(const t of analysis.texts){const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.name='text';check.value=t.key;check.checked=true;label.append(check,document.createTextNode('清空品牌文字：'+t.text));$('texts').append(label);}
  $('texts').hidden=!analysis.texts.length;current=analysis;$('result').hidden=false;$('download').disabled=!shapes.length&&!analysis.texts.length;
  status(shapes.length||analysis.texts.length?'请选择要隐藏的对象。名称不明确的图片不会自动选中。':'未检测到可处理的可见图片对象或内置品牌文字。');
 }catch(error){status(error.message||'文档检查失败',true);}
}
$('file').addEventListener('change',e=>load(e.target.files[0]));
for(const event of ['dragenter','dragover'])$('drop').addEventListener(event,e=>{e.preventDefault();$('drop').classList.add('drag');});
for(const event of ['dragleave','drop'])$('drop').addEventListener(event,e=>{e.preventDefault();$('drop').classList.remove('drag');});
$('drop').addEventListener('drop',e=>{if(e.dataTransfer.files.length!==1){status('请一次选择一个 .doc 文件',true);return;}load(e.dataTransfer.files[0]);});
$('download').addEventListener('click',()=>{if(!current)return;try{
 const selected=name=>[...document.querySelectorAll(`input[name="${name}"]:checked`)].map(x=>Number(x.value));
 const result=current.apply(selected('shape'),selected('text'));const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/msword'})),link=document.createElement('a');link.href=url;link.download=filename.replace(/\.doc$/i,'')+'（已处理）.doc';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 status(`副本已生成：隐藏 ${result.shapeCount} 个图片对象，清空 ${result.textCount} 段品牌文字。原文件未改动。`);
 }catch(error){status(error.message||'处理失败',true);}});
