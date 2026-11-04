import test from 'node:test';
import assert from 'node:assert/strict';
import { requestVision } from './vision-request.ts';
const noWait={sleep:async()=>{}};
test('retries transient capacity failures',async()=>{
 let calls=0;
 const result=await requestVision(async()=>++calls===1?new Response('',{status:503}):Response.json({ok:true}),noWait);
 assert.equal(calls,2);assert.deepEqual(result,{ok:true});
});
test('retries network errors with bounded attempts',async()=>{
 let calls=0;
 await assert.rejects(requestVision(async()=>{calls++;throw new TypeError('network')},noWait),{code:'VISION_NETWORK'});
 assert.equal(calls,3);
});
test('does not retry configuration failures',async()=>{
 let calls=0;
 await assert.rejects(requestVision(async()=>{calls++;return new Response('',{status:403})},noWait),{code:'VISION_CONFIG_ERROR'});
 assert.equal(calls,1);
});
test('respects Retry-After and avoids waiting beyond deadline',async()=>{
 let calls=0;
 await assert.rejects(requestVision(async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'120'}})},noWait),{code:'VISION_RATE_LIMITED'});
 assert.equal(calls,1);
 let delay;
 await requestVision(async()=>++calls===2?new Response('',{status:429,headers:{'Retry-After':'2'}}):Response.json({}),{sleep:async ms=>{delay=ms}});
 assert.equal(delay,2000);
});
test('reports malformed upstream JSON',async()=>{
 await assert.rejects(requestVision(async()=>new Response('<html>gateway</html>'),noWait),{code:'VISION_INVALID_RESPONSE'});
});
test('aborts on deadline without another provider request',async()=>{
 let calls=0;
 await assert.rejects(requestVision(signal=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))},{timeoutMs:10}),{code:'VISION_TIMEOUT'});
 assert.equal(calls,1);
});

test('preserves provider error status without exposing raw messages',async()=>{
 for(const [status,code,providerStatus] of [[500,'VISION_PROVIDER_ERROR','INTERNAL'],[503,'VISION_BUSY','UNAVAILABLE'],[504,'VISION_PROVIDER_TIMEOUT','DEADLINE_EXCEEDED']]){
  await assert.rejects(requestVision(async()=>Response.json({error:{status:providerStatus,message:'PRIVATE PROVIDER TEXT'}},{status}),noWait),error=>{
   assert.equal(error.code,code);assert.equal(error.upstreamStatus,status);assert.equal(error.providerStatus,providerStatus);assert.ok(!error.message.includes('PRIVATE'));return true;
  });
 }
});
test('does not surface arbitrary provider error tokens',async()=>{
 await assert.rejects(requestVision(async()=>Response.json({error:{status:'private-secret'}},{status:400}),noWait),error=>{
  assert.equal(error.providerStatus,undefined);assert.equal(error.upstreamStatus,400);assert.ok(!error.message.includes('private-secret'));return true;
 });
});
