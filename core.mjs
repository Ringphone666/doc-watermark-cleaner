// Conservative, in-place Microsoft Compound File / Word 97–2003 editor.
const fail = message => { throw new Error(message); };
const u16 = (a,p) => { if(p<0||p+2>a.length)fail('文件结构不完整');return a[p]|a[p+1]<<8; };
const u32 = (a,p) => { if(p<0||p+4>a.length)fail('文件结构不完整');return (a[p]|a[p+1]<<8|a[p+2]<<16|a[p+3]<<24)>>>0; };
const put32=(a,p,v)=>{for(let i=0;i<4;i++)a[p+i]=(v>>>(i*8))&255;};
const utf16=a=>new TextDecoder('utf-16le').decode(a);
const FREE=0xffffffff,END=0xfffffffe;
export class CompoundFile {
 constructor(input){
  this.bytes=new Uint8Array(input).slice();const a=this.bytes;
  if(a.length<512||![208,207,17,224,161,177,26,225].every((v,i)=>a[i]===v))fail('请选择 Word 97–2003 的 .doc 文件；暂不支持 .docx、PDF 或图片');
  this.major=u16(a,26);const shift=u16(a,30);
  if(u16(a,28)!==0xfffe||!((this.major===3&&shift===9)||(this.major===4&&shift===12))||u16(a,32)!==6)fail('不支持的复合文档版本');
  this.size=2**shift;this.count=Math.floor(a.length/this.size)-1;
  if(a.length%this.size!==0||this.count<1)fail('文件大小异常');
  this.cutoff=u32(a,56);if(this.cutoff!==4096)fail('不支持的迷你流设置');
  const fatIds=[];const add=id=>{if(id!==FREE){this.sector(id);fatIds.push(id);}};
  for(let p=76;p<512;p+=4)add(u32(a,p));
  let next=u32(a,68),seen=new Set();const difCount=u32(a,72);
  if(difCount>this.count)fail('DIFAT 数量异常');
  for(let i=0;i<difCount;i++){
   if(seen.has(next))fail('DIFAT 链循环');seen.add(next);const sec=this.sector(next);
   for(let p=0;p<this.size-4;p+=4)add(u32(sec,p));next=u32(sec,this.size-4);
  }
  if(fatIds.length!==u32(a,44)||new Set(fatIds).size!==fatIds.length)fail('FAT 索引异常');
  this.fat=[];for(const id of fatIds){const sec=this.sector(id);for(let p=0;p<sec.length;p+=4)this.fat.push(u32(sec,p));}
  const directory=this.readChain(u32(a,48));this.entries=[];
  for(let p=0;p+128<=directory.length;p+=128){const len=u16(directory,p+64),type=directory[p+66];if(!type)continue;
   if(len<2||len>64||len%2||![1,2,5].includes(type)||u32(directory,p+124)!==0)fail('目录项异常或文件过大');
   this.entries.push({name:utf16(directory.slice(p,p+len-2)),type,start:u32(directory,p+116),size:u32(directory,p+120)});
  }
  const roots=this.entries.filter(e=>e.type===5);if(roots.length!==1)fail('根目录异常');this.root=roots[0];
  const miniCount=u32(a,64);this.miniFat=[];
  if(miniCount){const mini=this.readChain(u32(a,60),miniCount*this.size);for(let p=0;p<mini.length;p+=4)this.miniFat.push(u32(mini,p));}
  this.rootChain=this.chain(this.root.start,this.fat,Math.ceil(this.root.size/this.size));
 }
 sector(id){if(!Number.isInteger(id)||id<0||id>=this.count)fail('扇区索引越界');return this.bytes.subarray((id+1)*this.size,(id+2)*this.size);}
 chain(start,fat,expected){let ids=[],seen=new Set(),id=start;
  while(id!==END){if(id>=fat.length||id>=0xfffffffa||seen.has(id)||ids.length>=this.count*this.size/64)fail('文档链损坏或循环');seen.add(id);ids.push(id);id=fat[id];}
  if(expected!==undefined&&ids.length!==expected)fail('文档链长度异常');return ids;
 }
 readChain(start,size){const ids=this.chain(start,this.fat,size===undefined?undefined:Math.ceil(size/this.size));const out=new Uint8Array(size??ids.length*this.size);
  ids.forEach((id,i)=>out.set(this.sector(id).subarray(0,Math.min(this.size,out.length-i*this.size)),i*this.size));return out;
 }
 stream(name){const entries=this.entries.filter(e=>e.type===2&&e.name===name);if(entries.length!==1)fail('找不到唯一文档流：'+name);const e=entries[0],small=e.size<this.cutoff;
  const ids=this.chain(e.start,small?this.miniFat:this.fat,Math.ceil(e.size/(small?64:this.size)));let locations=[];
  for(const id of ids){if(small){const off=id*64;if(off+Math.min(64,e.size-locations.length)>this.root.size)fail('迷你流越界');const sec=this.rootChain[Math.floor(off/this.size)];if(sec===undefined)fail('迷你流越界');for(let j=0;j<64&&locations.length<e.size;j++)locations.push((sec+1)*this.size+off%this.size+j);}
   else {this.sector(id);for(let j=0;j<this.size&&locations.length<e.size;j++)locations.push((id+1)*this.size+j);}}
  const data=Uint8Array.from(locations,p=>this.bytes[p]);return {data,locations,write:updated=>{if(updated.length!==data.length)fail('禁止改变流长度');for(let i=0;i<updated.length;i++)this.bytes[locations[i]]=updated[i];}};
 }
}
function records(a,start,end,depth=0){if(depth>20)fail('图形嵌套过深');const result=[];let p=start;
 while(p<end){if(p+8>end)fail('图形记录不完整');const v=u16(a,p),type=u16(a,p+2),len=u32(a,p+4),stop=p+8+len;if(stop>end||stop<=p)fail('图形记录越界');const r={p,v,type,start:p+8,end:stop,children:[]};if((v&15)===15)r.children=records(a,r.start,r.end,depth+1);result.push(r);p=stop;}return result;}
function props(a,r){let list=[],count=r.v>>>4,complex=r.start+count*6;if(complex>r.end)fail('图形属性越界');
 for(let i=0;i<count;i++){const p=r.start+i*6,id=u16(a,p),value=u32(a,p+2);let text='';if(id&0x8000){if(complex+value>r.end)fail('图形名称越界');text=utf16(a.slice(complex,complex+value)).replace(/\0/g,'');complex+=value;}list.push({id,value,text,offset:p+2});}return list;}
function flatten(rs){return rs.flatMap(r=>[r,...flatten(r.children)]);}
function bitmap(a,r){for(let p=r.start;p<r.end-8;p++){
 if(a[p]===255&&a[p+1]===216&&a[p+2]===255)return {mime:'image/jpeg',bytes:a.slice(p,r.end)};
 if(a[p]===137&&a[p+1]===80&&a[p+2]===78&&a[p+3]===71)return {mime:'image/png',bytes:a.slice(p,r.end)};
 }return null;}
export function analyze(input){
 const cfb=new CompoundFile(input),word=cfb.stream('WordDocument');if(u16(word.data,0)!==0xa5ec)fail('不是支持的 Word 二进制文档');
 const flags=u16(word.data,10);if(flags&0x8100)fail('暂不支持加密文档，请在 Word 中另存未加密副本');
 const table=cfb.stream(flags&0x200?'1Table':'0Table');
 // FIB variable-length sections: locate fcDggInfo/lcbDggInfo pair 50.
 let p=32;const csw=u16(word.data,p);p+=2+csw*2;const cslw=u16(word.data,p);p+=2+cslw*4;const pairs=u16(word.data,p);p+=2;
 if(pairs<=50)fail('文档版本不包含支持的图形索引');const offset=u32(word.data,p+50*8),length=u32(word.data,p+50*8+4);
 if(offset+length>table.data.length)fail('图形索引越界');
 let roots=[];if(length){let cursor=offset,end=offset+length;const firstEnd=cursor+8+u32(table.data,cursor+4);if(firstEnd>end)fail('图形记录越界');roots.push(...records(table.data,cursor,firstEnd));cursor=firstEnd;while(cursor<end){const label=table.data[cursor++];if(label>1)fail('不支持的图形分组');const stop=cursor+8+u32(table.data,cursor+4);if(stop>end)fail('图形分组越界');roots.push(...records(table.data,cursor,stop));cursor=stop;}}const all=flatten(roots);
 const blips=all.filter(r=>r.type===0xf007),shapes=[];const preview=bse=>{if(!bse)return null;const delay=u32(table.data,bse.start+28);if(delay!==FREE&&delay+8<word.data.length){const end=delay+8+u32(word.data,delay+4);if(end<=word.data.length)return bitmap(word.data,{start:delay+8,end});}return bitmap(table.data,bse);};
 for(const r of all.filter(r=>r.type===0xf004)){
  const sp=r.children.find(r=>r.type===0xf00a),opt=r.children.find(r=>r.type===0xf00b);if(!sp||!opt||sp.end-sp.start!==8)continue;
  const properties=props(table.data,opt),picture=properties.find(p=>p.id===0x4104),visibility=properties.find(p=>p.id===0x3bf);
  if(!picture||!visibility)continue;
  const names=properties.filter(p=>[0x8380,0x8381,0xc105].includes(p.id)).map(p=>p.text).filter(Boolean);
  const id=u32(table.data,sp.start),name=names.join(' · ')||'图片对象 '+id,known=/WordPictureWatermark|PowerPlusWaterMark|学科网|ZXXK/i.test(name);
  const hidden=!!(visibility.value&0x20000)&&!!(visibility.value&2);
  shapes.push({id,key:r.p,name,known,hidden,offset:visibility.offset,value:visibility.value,image:preview(blips[picture.value-1])});
 }
 const texts=[];const original=utf16(word.data);
 for(const text of ['原创原创精品资源学科网独家享有版权，侵权必究！','原创精品资源学科网独家享有版权，侵权必究！']){
  let from=0,index;while((index=original.indexOf(text,from))!==-1){if(!texts.some(t=>index*2>=t.offset&&index*2<(t.offset+t.text.length*2)))texts.push({key:index*2,offset:index*2,text});from=index+text.length;}
 }
 return {shapes,texts,apply(shapeKeys,textKeys){const selected=shapes.filter(s=>shapeKeys.includes(s.key)&&!s.hidden),selectedText=texts.filter(t=>textKeys.includes(t.key));if(!selected.length&&!selectedText.length)fail('请至少选择一个需要处理的对象');
  const output=new CompoundFile(input),target=output.stream(flags&0x200?'1Table':'0Table');for(const s of selected)put32(target.data,s.offset,s.value|0x20002);target.write(target.data);
  if(selectedText.length){const w=output.stream('WordDocument');for(const t of selectedText)for(let i=0;i<t.text.length;i++){w.data[t.offset+i*2]=0;w.data[t.offset+i*2+1]=0x30;}w.write(w.data);}
  const allowed=new Set();for(const s of selected)for(let i=0;i<4;i++)allowed.add(target.locations[s.offset+i]);if(selectedText.length){const w=output.stream('WordDocument');for(const t of selectedText)for(let i=0;i<t.text.length*2;i++)allowed.add(w.locations[t.offset+i]);}
  const before=new Uint8Array(input);for(let i=0;i<before.length;i++)if(before[i]!==output.bytes[i]&&!allowed.has(i))fail('校验失败：检测到预期范围外的更改');
  return {bytes:output.bytes,shapeCount:selected.length,textCount:selectedText.length};
 }};
}
