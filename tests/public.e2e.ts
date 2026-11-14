import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
async function main() {
const base=process.env.BASE_URL||'http://127.0.0.1:3000';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 for(const path of ['/','/topics/evaluation','/articles/swe-bench','/explore','/sources','/timeline']) {
  const response=await page.goto(base+path);
  assert.equal(response?.status(),200,path);
  assert(await page.locator('h1').innerText(),path+' heading');
 }
 await page.goto(base+'/explore?q=评测&layer=primary&type=paper');
 assert(await page.locator('.article-card').count()>0,'combined Chinese search returns papers');
 for(const badge of await page.locator('.article-card .layer').allTextContents()) assert.equal(badge,'原始资料');
 await page.goto(base+'/explore?q=no-match-8f63ca');
 assert(await page.getByText('还没有匹配的资料').isVisible());
 await page.goto(base+'/');
 await page.getByRole('button',{name:'切换深色模式'}).click();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.reload();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.getByRole('button',{name:'切换浅色模式'}).click();
 await mkdir('docs/screenshots',{recursive:true});
 await page.screenshot({path:'docs/screenshots/home.png',fullPage:true});
 await page.goto(base+'/topics/evaluation');
 await page.screenshot({path:'docs/screenshots/topic.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 for(const path of ['/','/topics/evaluation','/explore','/sources','/timeline','/articles/swe-bench']) {
  await page.goto(base+path);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path+' mobile overflow');
 }
 await page.goto(base+'/');
 await page.screenshot({path:'docs/screenshots/mobile.png',fullPage:true});
 assert.deepEqual(errors,[],'no browser runtime errors');
 console.log('PASS public routes, combined Chinese search, empty state, persistent theme and six mobile layouts');
}finally{await browser.close()}

}
main().catch(error=>{console.error(error);process.exitCode=1});
