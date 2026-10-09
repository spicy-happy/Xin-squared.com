import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
const root=new URL('../',import.meta.url),html=readFileSync(new URL('index.html',root),'utf8');
const version=Number(html.match(/const GAME_VERSION = (\d+)/)[1]);
const map=JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)[1]).imports;
function modules(path='releases/v43/src'){return readdirSync(new URL(path+'/',root),{withFileTypes:true}).flatMap(f=>f.isDirectory()?modules(path+'/'+f.name):f.name.endsWith('.js')?[path+'/'+f.name]:[]);}
test('every src module maps to the exact GAME_VERSION; CSS and entry point pinned',()=>{
  const all=modules();assert.equal(Object.keys(map).length,all.length);
  for(const p of all)assert.equal(map['./'+p],'./'+p+'?v='+version);
  assert.match(html,new RegExp(`src="releases/v43/src/ui/main.js\\?v=${version}"`));assert.match(html,new RegExp(`href="styles.css\\?v=${version}"`));
});
test('all module imports resolve to versioned keys, JSON no-cache, debug-only hooks, unlisted prototype page',()=>{
  for(const p of modules()){
    const source=readFileSync(new URL(p,root),'utf8');
    for(const m of source.matchAll(/from ['"]([^'"]+)['"]/g)){
      const target=new URL(m[1],new URL(p,root)).href;const key='./'+target.slice(root.href.length);assert.ok(map[key],`${p}: ${key}`);
    }
  }
  const source=readFileSync(new URL('releases/v43/src/ui/main.js',root),'utf8');assert.match(source,/cache:'no-cache'/);assert.match(source,/if\(debug\).*window\.__battleDebug/s);assert.match(source,/if\(debug\)window\.__battleReady=true/);
  assert.match(html,/name="robots" content="noindex"/);
  const publicCollection=JSON.parse(readFileSync(new URL('data/creatures-v2.json',root)));assert.equal(publicCollection.creatures.filter(c=>!c.prototype).length,3);
  for(const c of publicCollection.creatures){if(c.prototype)assert.match(c.name,/^Test /);for(const path of [c.image.src,c.trainer.portrait])assert.ok(readFileSync(new URL(path,root)).length>0);}
  assert.doesNotMatch(html,/confirm-setting|Two taps/);
});

test('legacy roster stays compatible while the new format has a separate version',async()=>{
 const legacyRules=JSON.parse(readFileSync(new URL('data/rules-v1.json',root)));
 const legacy=JSON.parse(readFileSync(new URL('data/creatures.json',root)));
 for(const c of legacy.creatures){
  assert.equal(c.rulesVersion,legacyRules.version);
  for(const slot of ['regular','special','defense'])assert.ok(legacyRules.moves[slot][c.moves[slot].id]);
 }
 const {loadRules}=await import('../releases/v43/src/rules.js');
 const {loadCollection}=await import('../releases/v43/src/collection.js');
 assert.equal(loadCollection(legacy,loadRules(legacyRules)).length,legacy.creatures.length);
 const currentRules=JSON.parse(readFileSync(new URL('data/rules-v2.json',root)));
 assert.equal(currentRules.version,2);
 const current=JSON.parse(readFileSync(new URL('data/creatures-v2.json',root)));
 assert.ok(current.creatures.every(c=>c.rulesVersion===currentRules.version));
});


test('v37 module paths remain byte-for-byte immutable for partial caches',async()=>{
 const {createHash}=await import('node:crypto');
 const hashes=JSON.parse(readFileSync(new URL('tests/fixtures/legacy-v37-hashes.json',root)));
 for(const [path,hash] of Object.entries(hashes))assert.equal(createHash('sha256').update(readFileSync(new URL(path,root))).digest('hex'),hash,path);
});
