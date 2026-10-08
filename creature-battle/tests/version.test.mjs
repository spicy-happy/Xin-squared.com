import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
const root=new URL('../',import.meta.url),html=readFileSync(new URL('index.html',root),'utf8');
const version=Number(html.match(/const GAME_VERSION = (\d+)/)[1]);
const map=JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)[1]).imports;
function modules(path='src'){return readdirSync(new URL(path+'/',root),{withFileTypes:true}).flatMap(f=>f.isDirectory()?modules(path+'/'+f.name):f.name.endsWith('.js')?[path+'/'+f.name]:[]);}
test('every src module maps to the exact GAME_VERSION; CSS and entry point pinned',()=>{
  const all=modules();assert.equal(Object.keys(map).length,all.length);
  for(const p of all)assert.equal(map['./'+p],'./'+p+'?v='+version);
  assert.match(html,new RegExp(`src="src/ui/main.js\\?v=${version}"`));assert.match(html,new RegExp(`href="styles.css\\?v=${version}"`));
});
test('all module imports resolve to versioned keys, JSON no-cache, debug-only hooks, discoverable production page',()=>{
  for(const p of modules()){
    const source=readFileSync(new URL(p,root),'utf8');
    for(const m of source.matchAll(/from ['"]([^'"]+)['"]/g)){
      const target=new URL(m[1],new URL(p,root)).href;const key='./'+target.slice(root.href.length);assert.ok(map[key],`${p}: ${key}`);
    }
  }
  const source=readFileSync(new URL('src/ui/main.js',root),'utf8');assert.match(source,/cache:'no-cache'/);assert.match(source,/if\(debug\).*window\.__battleDebug/s);assert.match(source,/if\(debug\)window\.__battleReady=true/);
  assert.doesNotMatch(html,/name="robots" content="noindex"/);
  assert.deepEqual(JSON.parse(readFileSync(new URL('data/creatures.json',root))),{schema:1,creatures:[]});
});
