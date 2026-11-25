import {test} from 'node:test';import assert from 'node:assert/strict';import app from './worker.mjs';
const id='12345678-1234-4234-8234-123456789abc';
const req=(token)=>new Request('https://example.test/api/v1/results',{headers:token?{Authorization:'Bearer '+token}:{}});
const db=(row)=>({DB:{prepare:()=>({bind:(v)=>({first:async()=>v===id?row:null})})}});
test('missing and malformed credentials never query storage',async()=>{for(const t of [undefined,'invalid'])assert.equal((await app.fetch(req(t),{})).status,401)});
test('unknown capability cannot read other results',async()=>{assert.equal((await app.fetch(req('12345678-1234-4234-8234-123456789abd'),db({}))).status,404)});
test('pending result omits answers',async()=>{const r=await app.fetch(req(id),db({participant:'Test',installment:'unwritten-rulebook',title:null,answers:'secret'}));assert.deepEqual(await r.json(),{status:'pending',participant:'Test',installment:'unwritten-rulebook'})});
test('ready result returns only dossier',async()=>{const r=await app.fetch(req(id),db({participant:'Test',installment:'unwritten-rulebook',title:'Example',revision:1,content_json:'{"title":"Example"}',answers:'secret'}));assert.deepEqual(await r.json(),{status:'ready',participant:'Test',installment:'unwritten-rulebook',revision:1,dossier:{title:'Example'}});assert.equal(r.headers.get('Cache-Control'),'no-store')});

test('results shell has classified reveal, qualitative signature and print expansion',async()=>{const r=await app.fetch(new Request('https://example.test/results'),{});const html=await r.text();for(const marker of ['CHARACTER SIGNATURE','CLASSIFIED INTELLIGENCE','DEEP DISSECTION','PERSONAL DEVELOPMENT','beforeprint','afterprint','Fictional game traits'])assert.ok(html.includes(marker),marker);assert.ok(!html.includes('90/100'));assert.equal(r.headers.get('Cache-Control'),'no-store')});
