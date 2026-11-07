import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestDisplayName } from '../src/importInfrastructure/displayNames.ts';

test('suggest proper casing for plainly entered two-part names',()=>{
  assert.equal(suggestDisplayName('john smith'),'John Smith');
  assert.equal(suggestDisplayName('JANE DOE'),'Jane Doe');
  assert.equal(suggestDisplayName('  john    doe  '),'John Doe');
  assert.equal(suggestDisplayName("anne-marie o'neill"),"Anne-Marie O'Neill");
  assert.equal(suggestDisplayName('alex rivera'),'Alex Rivera');
});
test('preserve deliberate mixed case and uncertain aliases',()=>{
  assert.equal(suggestDisplayName('Sean McDonald'),'Sean McDonald');
  assert.equal(suggestDisplayName('Mary DeVito'),'Mary DeVito');
  assert.equal(suggestDisplayName('J. SMITH'),'J. SMITH');
  assert.equal(suggestDisplayName('streamer123'),'streamer123');
  assert.equal(suggestDisplayName(''),'');
});
