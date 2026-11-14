import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadEnvConfig} from '@next/env';
loadEnvConfig(process.cwd());
async function main(){
 const base=process.env.BASE_URL||'http://127.0.0.1:3000';
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const {prisma}=await import('../src/lib/db');const slug='reading-private-'+Date.now();
 try{
  await prisma.article.create({data:{slug,title:'阅读API私有数据',originalTitle:'private',url:'https://example.org/'+slug,canonicalUrl:'https://example.org/'+slug,status:'pending_review'}});
  const api=await page.request.get(base+'/api/library?slugs=react,'+slug);assert.equal(api.status(),200);const payload=await api.json();assert.equal(payload.articles.length,1);assert.equal(payload.articles[0].slug,'react');assert(!JSON.stringify(payload).includes('rawMetadata'));
  await page.goto(base+'/articles/react');await page.getByRole('button',{name:'收藏资料',exact:true}).click();await page.goto(base+'/library');await expect(page.getByRole('link',{name:/ReAct/}).first()).toBeVisible();
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'导出阅读库',exact:true}).click();const download=await downloadEvent;const exported=JSON.parse(await readFile((await download.path())!,'utf8'));assert.equal(exported.version,1);assert.equal(exported.entries[0].slug,'react');
  await page.evaluate(()=>localStorage.removeItem('agent-atlas-reading-v1'));await page.reload();await expect(page.getByText('你的阅读库，从一篇好资料开始。')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({name:'reading.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await expect(page.getByText('已合并1条阅读记录')).toBeVisible();await expect(page.getByRole('link',{name:/ReAct/}).first()).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"entries":[{"slug":"../../private"}]}')});await expect(page.getByRole('alert').filter({hasText:'无效'})).toBeVisible();await expect(page.getByRole('link',{name:/ReAct/}).first()).toBeVisible();
  const health=await page.request.get(base+'/api/health');assert.equal(health.status(),200);assert.deepEqual(await health.json(),{status:'ok',database:'ready',schema:'current'});
  const robots=await page.request.get(base+'/robots.txt');assert((await robots.text()).includes('Disallow: /admin'));
  const feed=await page.request.get(base+'/feed.xml');if(feed.status()===200){const text=await feed.text();assert(text.includes('<rss'));assert(!text.includes(slug));const sitemap=await page.request.get(base+'/sitemap.xml');assert((await sitemap.text()).includes('/articles/react'));assert(!(await sitemap.text()).includes(slug));console.log('PASS public RSS/sitemap publish boundary')}else{assert.equal(feed.status(),503);console.log('PASS unset SITE_URL explicitly disables RSS')}
  const home=await page.request.get(base);assert.equal(home.headers()['x-content-type-options'],'nosniff');assert.equal(home.headers()['x-frame-options'],'DENY');assert.deepEqual(errors,[]);
  console.log('PASS reading export/import validation, private metadata boundary, health and response headers');
 }finally{await prisma.article.deleteMany({where:{slug}});await prisma.$disconnect();await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
