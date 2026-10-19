import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyze,CompoundFile} from './core.mjs';
const put16=(a,p,v)=>new DataView(a.buffer,a.byteOffset,a.byteLength).setUint16(p,v,true),put32=(a,p,v)=>new DataView(a.buffer,a.byteOffset,a.byteLength).setUint32(p,v,true);
function fixture(mini=false){
 const bytes=new Uint8Array(512*22);bytes.set([208,207,17,224,161,177,26,225]);put16(bytes,26,3);put16(bytes,28,0xfffe);put16(bytes,30,9);put16(bytes,32,6);put32(bytes,44,1);put32(bytes,48,1);put32(bytes,56,4096);put32(bytes,60,mini?19:0xfffffffe);put32(bytes,64,mini?1:0);put32(bytes,68,0xfffffffe);
 for(let p=76;p<512;p+=4)put32(bytes,p,0xffffffff);put32(bytes,76,0);
 for(let p=512;p<1024;p+=4)put32(bytes,p,0xffffffff);put32(bytes,512,0xfffffffd);put32(bytes,516,0xfffffffe);
 for(let i=2;i<=9;i++)put32(bytes,512+i*4,i===9?0xfffffffe:i+1);
 for(let i=10;i<=17;i++)put32(bytes,512+i*4,i===17?0xfffffffe:i+1);
 if(mini){put32(bytes,512+18*4,0xfffffffe);put32(bytes,512+19*4,0xfffffffe);for(let p=20*512;p<21*512;p+=4)put32(bytes,p,0xffffffff);put32(bytes,20*512,0xfffffffe);}
 const entry=(index,name,type,start,size)=>{const p=1024+index*128;[...name+'\0'].forEach((c,i)=>put16(bytes,p+i*2,c.charCodeAt(0)));put16(bytes,p+64,(name.length+1)*2);bytes[p+66]=type;put32(bytes,p+116,start);put32(bytes,p+120,size);};
 entry(0,'Root Entry',5,mini?18:0xfffffffe,mini?64:0);entry(1,'WordDocument',2,2,4096);entry(2,'1Table',2,mini?0:10,mini?64:4096);
 const w=bytes.subarray(3*512,11*512);put16(w,0,0xa5ec);put16(w,10,0x200);put16(w,32,14);put16(w,62,22);put16(w,152,51);put32(w,154+50*8,0);put32(w,154+50*8+4,8);
 const table=bytes.subarray((mini?19:11)*512);put16(table,0,15);put16(table,2,0xf000);put32(table,4,0);
 return bytes;
}
test('rejects unsupported, truncated and encrypted documents',()=>{
 for(const a of [new Uint8Array(0),new TextEncoder().encode('PK docx')])assert.throws(()=>analyze(a));
 const a=fixture();put16(a,3*512+10,0x300);assert.throws(()=>analyze(a),/加密/);
 assert.throws(()=>analyze(fixture().subarray(0,800)),/大小/);
});
test('parses normal and mini streams without modifying input',()=>{
 for(const mini of [false,true]){const a=fixture(mini),copy=a.slice(),cfb=new CompoundFile(a);assert.equal(cfb.stream('WordDocument').data.length,4096);assert.equal(cfb.stream('1Table').data.length,mini?64:4096);const result=analyze(a);assert.equal(result.shapes.length,0);assert.throws(()=>result.apply([],[]),/选择/);assert.deepEqual(a,copy);
  const stream=cfb.stream('1Table');stream.data[9]=117;stream.write(stream.data);assert.equal(cfb.stream('1Table').data[9],117);assert.deepEqual(a,copy);}
});
test('rejects FAT cycles and malformed OfficeArt',()=>{
 const a=fixture();put32(a,512+2*4,2);assert.throws(()=>analyze(a),/循环/);
 const b=fixture();put32(b,11*512+4,1000);assert.throws(()=>analyze(b),/越界/);
});
test('real fixture matches verified output; arbitrary IDs are not hardcoded',{skip:!process.env.DOC_FIXTURE},()=>{
 const a=readFileSync(process.env.DOC_FIXTURE),original=Buffer.from(a),analysis=analyze(a);assert.equal(analysis.shapes.length,8);assert.equal(analysis.texts.length,1);
 const selected=analysis.shapes.filter(s=>s.known||['页眉3','图片 4'].includes(s.name)).map(s=>s.key);
 const out=analysis.apply(selected,analysis.texts.map(t=>t.key));assert.equal(out.shapeCount,7);assert.equal(out.textCount,1);assert.deepEqual(a,original);assert.equal(out.bytes.length,a.length);
 const cleaned=analyze(out.bytes);assert.equal(cleaned.shapes.filter(s=>s.hidden).length,7);assert.equal(cleaned.texts.length,0);assert.equal(cleaned.shapes.filter(s=>!s.hidden).length,1);
 assert.deepEqual(analysis.apply(selected,analysis.texts.map(t=>t.key)).bytes,out.bytes);
 if(process.env.EXPECTED_DOC)assert.equal(Buffer.compare(out.bytes,readFileSync(process.env.EXPECTED_DOC)),0);
});
