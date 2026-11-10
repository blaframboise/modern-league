import test from 'node:test';
import assert from 'node:assert/strict';
import { labelledDrafts, savedEventName } from '../src/importInfrastructure/draftLabels.ts';

test('saved reviews use latest revised event names and dates',()=>{
  const id='06b25b2f-38b4-4774-9984-61234dd09e91';
  const drafts=[{id,created_at:'2026-11-10T02:42:48Z',original:{tournament:{name:'',date:''}}}];
  const corrections=[
    {draft_id:id,revision:2,snapshot:{values:{tournament:{name:'MNM - Eternal Games',date:'2026-11-09'}}}},
    {draft_id:id,revision:1,snapshot:{values:{tournament:{name:'Wrong OCR',date:'2026-11-09'}}}},
  ];
  const result=labelledDrafts(drafts,corrections);
  assert.match(result[id],/MNM - Eternal Games — 2026-11-09/);
  assert.match(result[id],/Nov 9, 9:42 PM/);
  assert.match(result[id],/06b25b2f/);
  assert.doesNotMatch(result[id],/Wrong OCR/);
});
test('missing and malformed saved drafts do not invent an event name',()=>{
  assert.equal(savedEventName({values:{tournament:{name:'',date:'not-date'}}}),null);
  const labels=labelledDrafts([{id:'a',original:null}],[{draft_id:'a',revision:1,snapshot:{values:{tournament:null}}}]);
  assert.match(labels.a,/Unreviewed screenshot/);
});
