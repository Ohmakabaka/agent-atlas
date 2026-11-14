import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createClient} from '@libsql/client';

test('editorial migration preserves existing articles and adds unique revisions and leases',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-upgrade-'));const client=createClient({url:`file:${join(dir,'db.sqlite')}`});
 try{
  await client.executeMultiple(await readFile('prisma/migrations/20261114000000_init/migration.sql','utf8'));
  await client.execute({sql:'INSERT INTO Article (id,slug,title,originalTitle,url,canonicalUrl,updatedAt) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)',args:['a','existing','保留编辑','Original','https://example.org/a','https://example.org/a']});
  await client.executeMultiple(await readFile('prisma/migrations/20261114010000_editorial_release/migration.sql','utf8'));
  const r=await client.execute('SELECT title,version FROM Article WHERE id=\'a\'');assert.equal(r.rows[0].title,'保留编辑');assert.equal(r.rows[0].version,1);
  await client.execute({sql:'INSERT INTO ArticleRevision (id,articleId,version,snapshot) VALUES (?,?,?,?)',args:['rev','a',1,'{"title":"保留编辑"}']});
  await assert.rejects(client.execute({sql:'INSERT INTO ArticleRevision (id,articleId,version,snapshot) VALUES (?,?,?,?)',args:['rev2','a',1,'{}']}));
  await client.execute({sql:'INSERT INTO SyncLease (key,owner,expiresAt) VALUES (?,?,CURRENT_TIMESTAMP)',args:['sync','worker-a']});
  await assert.rejects(client.execute({sql:'INSERT INTO SyncLease (key,owner,expiresAt) VALUES (?,?,CURRENT_TIMESTAMP)',args:['sync','worker-b']}));
 }finally{client.close();await rm(dir,{recursive:true,force:true})}
});
