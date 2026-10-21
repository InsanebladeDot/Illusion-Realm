// Check the delivered HTML and live local preview in a private headless browser.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { startBrowser } = require('../../../prototypes/comic-storyboard/edge-driver.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
async function open(width, height, query = '') {
  await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:1, mobile:false });
  await browser.send('Page.navigate', { url:'http://127.0.0.1:4178/login.html' + query });
  for (let i = 0; i < 100; i++) {
    if (await browser.evaluate("document.readyState==='complete'&&!!document.querySelector('#guest')")) return;
    await pause(50);
  }
  throw Error('Preview did not load');
}
async function checkLayout(width, height, expected, name, query = '') {
  await open(width, height, query);
  const values = await browser.evaluate(`(()=>{const c=document.querySelector('.auth-card'),s=document.querySelector('.auth-scroll'),f=document.querySelector('.card-footer'),r=c.getBoundingClientRect(),fr=f.getBoundingClientRect();return{layout:document.querySelector('#login-shell').dataset.layout,width:r.width,left:r.x,top:r.y,bottom:r.bottom,footerTop:fr.top,footerBottom:fr.bottom,viewport:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,rootScroll:document.documentElement.scrollHeight>innerHeight+1,innerScroll:s.scrollHeight>s.clientHeight+1}})()`);
  assert.equal(values.layout, expected); assert.equal(values.overflow, false); assert.equal(values.rootScroll, false);
  assert.ok(values.top >= 0 && values.bottom <= height + 1);
  assert.ok(values.footerBottom <= height + 1 && values.footerTop >= values.top);
  if(expected === 'split') assert.ok(values.width >= 420 && values.width <= 480);
  if(expected === 'centered') assert.ok(values.width <= 420);
  await browser.send('Emulation.setEmulatedMedia', { features:[{name:'prefers-reduced-motion',value:'reduce'}] });
  await pause(120);
  const shot = await browser.send('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync(path.join(__dirname, name), Buffer.from(shot.data, 'base64'));
  console.log('PASS',width,height,JSON.stringify(values));
}
async function checkInteractions() {
  await browser.evaluate("document.querySelector('[data-mode=register]').click()");
  assert.equal(await browser.evaluate("document.querySelector('#name-field').hidden"), false);
  assert.equal(await browser.evaluate("document.querySelector('#account-form').checkValidity()"), false);
  await browser.evaluate("document.querySelector('#account-form').elements.email.value='preview@example.test';document.querySelector('#account-form').elements.displayName.value='Preview';document.querySelector('#password').value='preview-password';document.querySelector('#confirm-password').value='not-the-same';document.querySelector('#account-form').requestSubmit()");
  assert.equal(await browser.evaluate("document.querySelector('#form-status').textContent"), '两次输入的密码不一致。');
  await browser.send('Emulation.setDeviceMetricsOverride', { width:1920,height:1080,deviceScaleFactor:1,mobile:false });
  await pause(100);
  assert.equal(await browser.evaluate("document.querySelector('#account-form').elements.email.value"), 'preview@example.test');
  assert.equal(await browser.evaluate("document.querySelector('#password').value"), 'preview-password');
  await browser.evaluate("document.querySelector('[data-password=password]').click()");
  assert.equal(await browser.evaluate("document.querySelector('#password').type"), 'text');
  await browser.evaluate("document.querySelector('#theme-toggle').click()");
  assert.equal(await browser.evaluate("document.documentElement.dataset.theme"), 'dark');
  await browser.evaluate("document.querySelector('#switch-mode').click();document.querySelector('#forgot').click()");
  assert.equal(await browser.evaluate("document.querySelector('#recovery').hidden"), false);
  await browser.evaluate("document.querySelector('#back').click();document.querySelector('#guest').click();document.querySelector('[data-provider=Google]').click()");
  assert.equal(await browser.evaluate("document.querySelector('#guest-status').hidden"), false);
  assert.ok((await browser.evaluate("document.querySelector('#notice').textContent")).includes('尚未接入'));
  console.log('PASS form validation, resize preserves input, password visibility, theme, recovery, guest and provider feedback');
}
async function checkViewer() {
  await browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await browser.send('Page.navigate',{url:'http://127.0.0.1:4178/'});
  for(let i=0;i<100;i++) {
    if(await browser.evaluate("!!document.querySelector('#preview')?.contentDocument?.querySelector('#guest')")) break;
    await pause(50);
  }
  await browser.evaluate("document.querySelector('#size').value='390,844';document.querySelector('#size').dispatchEvent(new Event('change'));document.querySelector('#register').click()");
  await pause(150);
  assert.equal(await browser.evaluate("document.querySelector('#preview').contentDocument.querySelector('#name-field').hidden"), false);
  await browser.evaluate("document.querySelector('#expired').checked=false;document.querySelector('#expired').dispatchEvent(new Event('change'))");
  await pause(100);
  assert.equal(await browser.evaluate("document.querySelector('#preview').contentDocument.querySelector('#expired').hidden"), true);
  assert.equal(await browser.evaluate("document.documentElement.scrollWidth<=innerWidth"), true);
  console.log('PASS online viewer, device presets, mode controls and expired toggle');
}
(async()=>{
  try {
    browser=await startBrowser();
    await checkLayout(1440,900,'centered','desktop-centered.png');
    await checkLayout(1920,1080,'split','desktop-split.png');
    await checkLayout(1280,540,'split','short-register.png','?mode=register');
    await checkLayout(390,844,'centered','mobile.png');
    await checkLayout(320,500,'centered','small-register.png','?mode=register');
    assert.equal(await browser.evaluate("(()=>{const s=document.querySelector('#auth-scroll'),f=document.querySelector('.card-footer'),before=f.getBoundingClientRect().top;s.scrollTop=s.scrollHeight;const guest=document.querySelector('#guest').getBoundingClientRect();return s.scrollTop>0&&guest.bottom<=s.getBoundingClientRect().bottom+1&&f.getBoundingClientRect().top===before})()"),true);
    await open(1440,900);await checkInteractions();await checkViewer();
    await browser.close();
  }catch(error){console.error(error);if(browser)await browser.close();process.exitCode=1}
})();
