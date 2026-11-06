const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH,headless:true,args:['--no-sandbox']});
 try {
 const errors=[];

 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1440,height:1000}]) {
  const page=await browser.newPage({viewport}); page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:5173'}/results-import`);
  assert.equal(await page.getByLabel('Take a photo',{exact:true}).getAttribute('capture'),'environment');
  assert.equal(await page.getByLabel('Choose photos or screenshots',{exact:true}).getAttribute('multiple'),'');
  const fixtureData = await page.evaluate(() => [[120,200,'image/png'],[200,120,'image/png'],[160,120,'image/webp']].map(([w,h,type]) => {
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#eee';ctx.fillRect(0,0,w,h);
   return canvas.toDataURL(type).split(',')[1];
  }));
  const [portrait,landscape,webp]=fixtureData.map(data=>Buffer.from(data,'base64'));
  const choose=page.getByLabel('Choose photos or screenshots',{exact:true});
  await choose.setInputFiles([{name:'portrait.png',mimeType:'image/png',buffer:portrait},{name:'landscape.png',mimeType:'image/png',buffer:landscape}]);
  await page.getByText('2 / 8 images selected').waitFor();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.import-thumbnails img')).every(i=>i.complete && i.naturalWidth>0));
  assert.deepEqual(await page.locator('.import-thumbnails img').evaluateAll(images=>images.map(i=>[i.naturalWidth,i.naturalHeight])),[[120,200],[200,120]]);
  await page.getByRole('checkbox',{name:'Simulate extraction failure'}).check();
  await page.getByRole('button',{name:'Extract fictional sample / retry',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Simulated provider failure'}).waitFor();
  await page.getByRole('checkbox',{name:'Simulate extraction failure'}).uncheck();
  await page.getByRole('button',{name:'Extract fictional sample / retry',exact:true}).click();
  await page.getByRole('heading',{name:'2. Review the draft'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Mark ready for approval',exact:true}).isDisabled(),true);
  assert.equal(await page.getByLabel('Record 2 draws',{exact:true}).inputValue(),'');
  await page.getByRole('textbox',{name:'Correction / confirmation / decision reason',exact:true}).fill('Compared fictional source');
  await page.getByLabel('Record 2 draws',{exact:true}).fill('0');
  await page.getByLabel('Tournament seasonId',{exact:true}).fill('s4');
  await page.getByLabel('Validation',{exact:true}).getByText(/Calendar assigns this start/).waitFor();
  await page.getByLabel('Tournament seasonId',{exact:true}).fill('s1');
  await page.getByLabel('Registry player 1',{exact:true}).selectOption('demo-001');
  await page.getByLabel('Registry player 2',{exact:true}).selectOption('demo-002');
  await page.getByLabel('Record 1 importedName',{exact:true}).fill('Sample Copper corrected');
  while(await page.getByRole('button',{name:/^Confirm /}).count()) await page.getByRole('button',{name:/^Confirm /}).first().click();
  await page.getByRole('button',{name:'Mark ready for approval',exact:true}).click();
  await page.getByRole('button',{name:'Explicitly approve fictional draft',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Approved in memory'}).waitFor();
  assert.equal(await page.getByLabel('Record 1 wins',{exact:true}).isDisabled(),true);
  const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,columns:getComputedStyle(document.querySelector('.import-review-layout')).gridTemplateColumns}));
  assert.ok(dimensions.scroll<=dimensions.width,JSON.stringify(dimensions));
  assert.equal(dimensions.columns.split(' ').length,viewport.width>=1000?2:1);
  if (process.env.BROWSER_SCREENSHOT_DIR) {
   require('node:fs').mkdirSync(process.env.BROWSER_SCREENSHOT_DIR,{recursive:true});
   await page.screenshot({path:`${process.env.BROWSER_SCREENSHOT_DIR}/import-${viewport.width}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:'Remove image 1',exact:true}).click();
  await page.getByText('1 / 8 images selected').waitFor();
  assert.equal(await page.getByRole('heading',{name:'2. Review the draft'}).count(),0);
  await page.getByLabel('Replace image 1',{exact:true}).setInputFiles({name:'replacement.webp',mimeType:'image/webp',buffer:webp});
  await page.getByText('Image 1: replacement.webp',{exact:true}).waitFor();
  await choose.setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
  await page.getByRole('status').filter({hasText:'use JPEG, PNG or WebP'}).waitFor();
  await choose.setInputFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(10*1024*1024+1)});
  await page.getByRole('status').filter({hasText:'at most 10 MiB'}).waitFor();
  await page.reload(); await page.getByText('0 / 8 images selected').waitFor();
  await page.getByRole('button',{name:'Load fictional source image',exact:true}).click();
  await page.getByText('1 / 8 images selected').waitFor();
  assert.ok(await page.locator('.import-thumbnails img').evaluate(i=>i.complete && i.naturalWidth===1200));
  console.log(`PASS ${viewport.width}x${viewport.height}: selection, multiple images, failure/retry, missing field, identity, correction, confirmation, approval, remove/replace, invalid/oversized files, reload, layout`);
  await page.close();
 }
 assert.deepEqual(errors,[]);
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
