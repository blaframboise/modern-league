import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('official publish screen requires administrator authorization and explicit confirmation',async()=>{
  const server=await createServer({configFile:false,server:{middlewareMode:true,ws:false},optimizeDeps:{noDiscovery:true},esbuild:{jsx:'automatic'}});
  try{
    const app=await server.ssrLoadModule('/src/pages/PublishResultsPage.tsx');
    const markup=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(app.PublishResultsPage)));
    assert.match(markup,/Publish Results/);
    assert.match(markup,/Checking access/);
    assert.doesNotMatch(markup,/Publish these records as official/);
    assert.doesNotMatch(markup,/Sample data — fictional/);
    const admin=await server.ssrLoadModule('/src/pages/AdminPage.tsx');
    const adminHtml=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(admin.AdminPage)));
    assert.doesNotMatch(adminHtml,/Publish official tournament results/); // admin-only nav
    const upload=await server.ssrLoadModule('/src/pages/OfficialImportPage.tsx');
    const uploadHtml=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(upload.OfficialImportPage)));
    assert.match(uploadHtml,/Upload Results/);
  }finally{await server.close();}
});
