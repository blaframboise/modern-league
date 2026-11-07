import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metadataKeys, rowKeys } from '../src/extraction/index.ts';
import { extractWithOpenAI } from '../src/importInfrastructure/openaiVision.ts';
import { suggestedImportValues } from '../src/importInfrastructure/suggestions.ts';
const id='10000000-0000-4000-8000-000000000001';
const image=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
function fixture() {
  const tournament=Object.fromEntries(metadataKeys.map(key=>[key,null])) as Record<string,unknown>;
  tournament.name='Synthetic event';tournament.year=2027;tournament.date='2027-01-03';tournament.kind='regular';
  const fields=Object.fromEntries(rowKeys.map(key=>[key,null])) as Record<string,unknown>;
  fields.importedName='Unverified name';fields.wins=2;
  return {tournament,results:[fields],warnings:['Synthetic screenshot; human check needed']};
}
test('server vision response is structured, conservative, source-linked and cannot resolve identity',async()=>{
  let calls=0;
  const fake=async (url:any, options:any)=>{
    calls++;
    assert.equal(url,'https://api.openai.com/v1/responses');
    const body=JSON.parse(options.body);
    assert.equal(body.model,'gpt-4.1-mini');
    assert.equal(body.store,false);
    assert.equal(body.text.format.strict,true);
    assert.equal(body.input[0].content[1].detail,'high');
    assert.ok(body.input[0].content[1].image_url.startsWith('data:image/png;base64,'));
    assert.ok(options.headers.authorization.startsWith('Bearer '));
    assert.ok(!options.body.includes('Bearer '));
    return new Response(JSON.stringify({
      status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(fixture())}]}],
      usage:{input_tokens:200,output_tokens:120},
    }),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await extractWithOpenAI({id,mime:'image/png',bytes:image},'test-secret',fake as typeof fetch);
  assert.equal(calls,1);
  assert.equal(result.report.fictional,false);
  assert.equal(result.report.tournament.name.status,'suggested');
  assert.deepEqual(result.report.tournament.name.sources,[id]);
  assert.equal(result.report.tournament.eventId.value,null);
  const values=suggestedImportValues(result.report,id);
  assert.equal(values.results[0].playerId,null);
  assert.equal(values.results[0].wins,2);
  assert.equal(values.results[0].losses,null);
  assert.equal(values.tournament.start,null);
  assert.equal(result.usage.input_tokens,200);
});
test('untrusted model responses and missing usage fail closed',async()=>{
  const bad=async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{}'}]}],usage:{input_tokens:10,output_tokens:20}}),{status:200});
  await assert.rejects(extractWithOpenAI({id,mime:'image/png',bytes:image},'test-secret',bad as typeof fetch));
  const unavailable=async()=>new Response('provider error',{status:429});
  await assert.rejects(extractWithOpenAI({id,mime:'image/png',bytes:image},'test-secret',unavailable as typeof fetch),/OpenAI quota or rate limit reached/);
  await assert.rejects(extractWithOpenAI({id,mime:'image/png',bytes:image},'',bad as typeof fetch),/NOT_CONFIGURED/);
  const fake=async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(fixture())}]}]}),{status:200});
  await assert.rejects(extractWithOpenAI({id,mime:'image/png',bytes:image},'key',fake as typeof fetch),/usage unavailable/);
});
