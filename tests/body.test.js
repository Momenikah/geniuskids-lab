import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readBody} from '../server/security.js';
test('large journal bodies preserve Unicode split across network chunks and enforce byte limits',async()=>{
  const source={data:'Penemuan 🔬 dengan warna 🌈 '+ 'é'.repeat(10000)};
  const bytes=Buffer.from(JSON.stringify(source));
  const req=Readable.from(Array.from(bytes,byte=>Buffer.from([byte])));req.headers={'content-type':'application/json'};
  assert.deepEqual(await readBody(req,50000),source);
  const oversized=Readable.from([bytes]);oversized.headers=req.headers;
  await assert.rejects(readBody(oversized,16384),error=>error.status===413);
});
