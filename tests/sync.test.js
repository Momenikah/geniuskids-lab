import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FamilySync } from '../sync.js';
import { validateFamily, snapshot } from '../family-data.js';
const initial = () => ({version:1,active:'first',profiles:[{id:'first',name:'Anak',age:8,entries:{}}]});
function fixture() {
  let cloud={data:null,revision:0,updatedAt:null}, offline=false, delayResolve;
  const items=new Map(), storage={getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value)};
  async function transport(url,options) {
    if(offline)throw Error('offline');
    if(delayResolve)await new Promise(resolve=>{delayResolve=resolve});
    if(options.method==='GET')return Response.json(cloud);
    const body=JSON.parse(options.body);
    if(body.revision!==cloud.revision)return Response.json({...cloud,conflict:true},{status:409});
    cloud={data:body.data,revision:cloud.revision+1,updatedAt:new Date().toISOString()};return Response.json({...cloud,conflict:false});
  }
  const create=options=>new FamilySync({userId:'owner',initial:initial(),storage,transport,delay:100000,...options});
  return {create,storage,get cloud(){return cloud},set cloud(v){cloud=v},set offline(v){offline=v},block(){delayResolve=true},release(){const release=delayResolve;delayResolve=null;release()}};
}
test('first sync, autosaved outbox after reload, and offline recovery',async()=>{
  const f=fixture(),sync=f.create();await sync.refresh();assert.equal(f.cloud.revision,1);
  f.offline=true;const changed=initial();changed.profiles[0].entries[1]={observation:'Offline journal'};
  assert.equal(sync.save(changed),true);assert.equal(await sync.flush(),false);sync.dispose();
  const restored=f.create();assert.equal(restored.record.data.profiles[0].entries[1].observation,'Offline journal');assert.equal(restored.record.dirty,true);
  f.offline=false;await restored.refresh();assert.equal(f.cloud.data.profiles[0].entries[1].observation,'Offline journal');assert.equal(restored.record.dirty,false);restored.dispose();
});
test('stale cloud revision pauses writes until explicit choice; local data is retained',async()=>{
  const f=fixture(),sync=f.create();await sync.refresh();
  const local=initial();local.profiles[0].entries[1]={observation:'Local'};sync.save(local);
  const remote=snapshot(initial());remote.profiles[0].entries[2]={observation:'Remote'};f.cloud={data:remote,revision:2,updatedAt:new Date().toISOString()};
  assert.equal(await sync.flush(),false);assert.equal(sync.state,'conflict');assert.equal(sync.record.data.profiles[0].entries[1].observation,'Local');assert.equal(f.cloud.data.profiles[0].entries[2].observation,'Remote');
  assert.equal(await sync.resolve('remote'),true);assert.equal(sync.record.data.profiles[0].entries[2].observation,'Remote');assert.equal(sync.record.dirty,false);sync.dispose();
});
test('choosing local after conflict uses compare-and-swap again',async()=>{
  const f=fixture(),sync=f.create();await sync.refresh();const local=initial();local.profiles[0].name='Local';sync.save(local);
  f.cloud={data:snapshot(initial()),revision:2,updatedAt:null};await sync.flush();
  f.cloud={data:snapshot(initial()),revision:3,updatedAt:null};await sync.resolve('local');assert.equal(sync.state,'conflict');assert.equal(f.cloud.revision,3);
  await sync.resolve('local');assert.equal(sync.state,'synced');assert.equal(f.cloud.data.profiles[0].name,'Local');sync.dispose();
});
test('edits made during upload are not marked synced or discarded',async()=>{
  const f=fixture(),sync=f.create();await sync.refresh();const first=initial();first.profiles[0].name='First';sync.save(first);
  f.block();const upload=sync.flush();await new Promise(resolve=>setImmediate(resolve));
  const second=initial();second.profiles[0].name='Second';sync.save(second);f.release();await upload;
  assert.equal(f.cloud.data.profiles[0].name,'Second');assert.equal(sync.record.dirty,false);sync.dispose();
});
test('another tab cannot silently overwrite a locally changed snapshot',async()=>{
  const f=fixture(),tabA=f.create();await tabA.refresh();const tabB=f.create();
  const one=initial();one.profiles[0].name='Tab A';assert.equal(tabA.save(one),true);
  const two=initial();two.profiles[0].name='Tab B';assert.equal(tabB.save(two),false);assert.equal(tabB.state,'conflict');
  assert.equal(JSON.parse(f.storage.getItem(tabA.key)).data.profiles[0].name,'Tab A');
  await tabB.resolve('local');assert.equal(f.cloud.data.profiles[0].name,'Tab B');tabA.dispose();tabB.dispose();
});
test('pending form edits prevent remote refresh from replacing the view',async()=>{
  const f=fixture();let editing=false;const sync=f.create({canApply:()=>!editing});await sync.refresh();
  const remote=snapshot(initial());remote.profiles[0].name='Remote';f.cloud={data:remote,revision:2,updatedAt:null};editing=true;
  await sync.refresh();assert.equal(sync.record.data.profiles[0].name,'Anak');editing=false;await sync.refresh();assert.equal(sync.record.data.profiles[0].name,'Remote');sync.dispose();
});
test('validation rejects executable image URLs, duplicate IDs, invalid progress and oversized fields',()=>{
  for(const entry of [{photo:'https://evil.example/image.svg'},{photo:'data:image/svg+xml;base64,PHN2Zz4='},{done:'yes'},{observation:'x'.repeat(10001)}]){
    const data=initial();data.profiles[0].entries[1]=entry;assert.throws(()=>validateFamily(data));
  }
  const data=initial();data.profiles.push(structuredClone(data.profiles[0]));assert.throws(()=>validateFamily(data));
  assert.deepEqual(validateFamily(initial()),snapshot(initial()));
});
test('legacy journals over the cloud limit remain editable and can be reduced before upload',async()=>{
  const f=fixture(),legacy=initial();legacy.profiles[0].entries[1]={observation:'x'.repeat(10001)};
  f.storage.setItem('genius-kids-lab-v1:owner',JSON.stringify(legacy));
  const sync=f.create();await sync.refresh();assert.equal(sync.state,'error');assert.equal(f.cloud.data,null);
  const corrected=structuredClone(sync.record.data);corrected.profiles[0].entries[1].observation='Reduced journal';
  assert.equal(sync.save(corrected),true);await sync.flush();assert.equal(sync.state,'synced');assert.equal(f.cloud.data.profiles[0].entries[1].observation,'Reduced journal');sync.dispose();
});
test('older per-account local data migrates without silently replacing an existing cloud family',async()=>{
  const f=fixture(),legacy=initial();legacy.profiles[0].name='Local family';
  f.storage.setItem('genius-kids-lab-v1:owner',JSON.stringify(legacy));
  f.cloud={data:snapshot(initial()),revision:4,updatedAt:null};const sync=f.create();
  await sync.refresh();assert.equal(sync.state,'conflict');assert.equal(sync.record.data.profiles[0].name,'Local family');assert.equal(f.cloud.data.profiles[0].name,'Anak');sync.dispose();
});
