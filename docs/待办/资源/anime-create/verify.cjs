// Headless browser verification and screenshots of the self-contained reference.
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const repo = path.resolve(process.argv[2] || path.join(__dirname, '../../../..'));
const { startBrowser, pause } = require(path.join(repo, 'docs/prototypes/comic-storyboard/edge-driver.cjs'));
const results = [];
function assert(value, name) {
  if (!value) throw Error(name);
  results.push(name);
}
async function capture(browser, name) {
  await pause(250);
  const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(__dirname, name + '.png'), Buffer.from(data, 'base64'));
}
async function viewport(browser, width, height) {
  await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await pause(100);
}
async function main() {
  const browser = await startBrowser();
  try {
    await browser.send('Page.navigate', { url: pathToFileURL(path.join(__dirname, 'index.html')).href });
    await pause(600);
    for (const [width, height] of [[1566,1004],[1440,900],[1280,800],[1024,768],[821,600],[390,844],[320,568]]) {
      await viewport(browser, width, height);
      const status = await browser.evaluate(`(() => ({overflow:document.documentElement.scrollWidth > innerWidth, files:document.querySelectorAll('.file-card').length, broken:[...document.images].filter(i=>i.hasAttribute('src')&&(!i.complete||!i.naturalWidth)).length,button:document.querySelector('#generate').getBoundingClientRect().bottom<=innerHeight}))()`);
      assert(!status.overflow && !status.broken && status.files === 6 && status.button, `${width}×${height}: layout, images and generate action ${JSON.stringify(status)}`);
      if (width === 1566) await capture(browser, 'desktop');
      if (width === 390) await capture(browser, 'mobile-edit');
    }
    const interactions = await browser.evaluate(`(async () => {
      const $=s=>document.querySelector(s), click=s=>$(s).click(), checks=[];
      const check=(v,n)=>{if(!v)throw Error(n);checks.push(n)};
      click('#next-image');check($('[data-gallery="1"]').getAttribute('aria-pressed')==='true','gallery');
      click('#zoom-in');check($('#zoom').value==='1.25','zoom');
      click('[data-collapse="model-content"]');check($('#model-content').hidden,'collapse');click('[data-collapse="model-content"]');
      click('#advanced');check($('#advanced').getAttribute('aria-checked')==='true','switch');
      click('#assemble');document.querySelector('.dialog-choice').click();check($('#prompt').value.length>0,'prompt template');
      $('#prompt').value='a'.repeat(2000);$('#prompt').dispatchEvent(new Event('input'));check($('#prompt-count').textContent==='2000','long prompt counter');
      $('#ratio').value='16:9';$('#ratio').dispatchEvent(new Event('change'));check($('#dimension-label').textContent==='1408 × 792','ratio');
      click('[data-mobile="files"]');check(document.body.dataset.mobileView==='files','mobile tabs');
      click('[data-folder="albion"]');check($('#file-total').textContent.includes('4'),'folder filter');
      $('#file-search').value='not-found';$('#file-search').dispatchEvent(new Event('input'));check(document.querySelectorAll('.file-card').length===0,'empty search');
      $('#file-search').value='';$('#file-search').dispatchEvent(new Event('input'));click('[data-folder="all"]');
      click('#next-page');check($('#page-label').textContent==='2 / 2','pagination');click('#previous-page');
      click('#view-grid');check($('#file-list').dataset.view==='grid','grid view');click('#view-list');
      click('#sort-files');check($('#sort-label').textContent.includes('正序'),'sort');
      click('#new-folder');$('#folder-name').value='<long-folder-name-测试>';$('#folder-name').form.requestSubmit();
      check($('#custom-folders').textContent.includes('<long-folder-name-测试>'),'safe new folder');
      const image = await fetch($('#hero').src).then(r=>r.blob());
      const transfer = new DataTransfer();transfer.items.add(new File([image],'very-long-file-name-'.repeat(12)+'.webp',{type:'image/webp'}));
      $('#file-input').files=transfer.files;$('#file-input').dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,100));
      check($('#count-all').textContent==='13'&&document.querySelectorAll('.file-card').length===1,'local upload');
      click('#file-preview');check($('#app-dialog').open,'file viewer');click('#close-dialog');
      click('#theme-toggle');check(document.documentElement.dataset.theme==='dark','dark theme');
      click('[data-mobile="edit"]');click('#generate');await new Promise(r=>setTimeout(r,1000));
      check(!$('#result-content').hidden&&$('#result-image').naturalWidth>0&&!$('#generate').disabled,'generation simulation');
      return checks;
    })()`);
    results.push(...interactions);
    await capture(browser, 'generation-demo');
    await browser.send('Page.navigate', { url: pathToFileURL(path.join(__dirname, 'index.html')).href });
    await pause(400);
    await viewport(browser, 390, 844);
    await browser.evaluate(`document.documentElement.dataset.theme='light';document.querySelector('[data-mobile="preview"]').click()`);
    await capture(browser, 'mobile-preview');
    await browser.evaluate(`document.querySelector('[data-mobile="files"]').click()`);
    await capture(browser, 'mobile-files');
    await viewport(browser, 1566, 1004);
    await browser.evaluate(`document.documentElement.dataset.theme='dark'`);
    await capture(browser, 'desktop-dark');
    await browser.send('Page.navigate', { url: pathToFileURL(path.join(__dirname, 'index.html')).href });
    await pause(400);
    await viewport(browser, 1024, 768);
    await browser.evaluate(`document.querySelector('[data-mobile="files"]').click()`);
    assert(await browser.evaluate(`document.querySelector('#file-panel').classList.contains('is-open') && !document.querySelector('#library-backdrop').hidden`), 'tablet library overlay');
    await capture(browser, 'tablet');
    await fs.writeFile(path.join(__dirname, 'verification.json'), JSON.stringify({ checks: results, count: results.length }, null, 2));
    console.log(JSON.stringify({ passed: results.length, checks: results }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
