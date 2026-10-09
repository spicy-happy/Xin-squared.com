import {readFileSync} from 'node:fs';
import {loadRules} from '../releases/v46/src/rules.js';
import {loadCollection, creatureWarnings} from '../releases/v46/src/collection.js';
const root=new URL('../',import.meta.url);
try{
 const rules=loadRules(JSON.parse(readFileSync(new URL('data/rules-v2.json',root))));
 const source=process.argv[2]??new URL('data/creatures-v2.json',root);
 const collection=loadCollection(JSON.parse(readFileSync(source)),rules);
 for(const c of collection)for(const warning of creatureWarnings(c,rules))console.warn(`${c.name}: ${warning}`);
 console.log(`Collection valid: ${collection.length} creatures; creature and trainer names checked.`);
}catch(error){console.error(error.message);process.exitCode=1;}
