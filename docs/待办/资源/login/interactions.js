// 预览只切换本地布局与表单状态，不发送请求，也不保存任何账号输入。
const el = id => document.getElementById(id);
let mode = 'landing', layoutChoice = 'auto', timer;
const splitQuery = matchMedia('(min-width: 1536px), (min-width: 1120px) and (max-height: 640px)');
function updateLayout() {
  el('login-shell').dataset.layout = layoutChoice === 'auto' ? splitQuery.matches ? 'split' : 'centered' : layoutChoice;
}
function setMode(next) {
  mode = next; const register = next === 'register';
  el('landing').hidden = next !== 'landing'; el('account').hidden = next === 'landing';
  for (const id of ['name-field', 'confirm-field', 'password-hint']) el(id).hidden = !register;
  el('account-form').elements.displayName.required = register;
  el('confirm-password').required = register; el('password').minLength = register ? 12 : 1;
  el('password').autocomplete = register ? 'new-password' : 'current-password';
  el('password').value = ''; el('confirm-password').value = '';
  el('form-title').textContent = register ? '创建 Illusion Realm 账号' : '登录 Illusion Realm';
  el('submit').textContent = register ? '创建账号' : '登录'; el('forgot').hidden = register;
  el('mode-prompt').textContent = register ? '已有账号？' : '还没有账号？';
  el('switch-mode').textContent = register ? '登录' : '创建账号';
  el('form-status').textContent = '布局预览：提交仅作本地校验，不发送账号信息。';
  el('recovery').hidden = true; el('auth-scroll').scrollTop = 0;
}
function notice(message) {
  el('notice').textContent = message; el('notice').hidden = false; clearTimeout(timer);
  timer = setTimeout(() => { el('notice').hidden = true; }, 3500);
}
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.mode) setMode(button.dataset.mode);
  if (button.dataset.provider) notice(button.dataset.provider + ' 登录尚未接入，请先使用游客入口。');
  if (button.dataset.password) {
    const field = el(button.dataset.password); field.type = field.type === 'password' ? 'text' : 'password';
    button.textContent = field.type === 'password' ? '显示' : '隐藏'; button.setAttribute('aria-label', field.type === 'password' ? '显示密码' : '隐藏密码');
  }
});
el('back').onclick = () => setMode('landing');
el('switch-mode').onclick = () => setMode(mode === 'register' ? 'login' : 'register');
el('forgot').onclick = () => { el('recovery').hidden = !el('recovery').hidden; };
el('guest').onclick = () => { el('guest-status').hidden = false; };
el('account-form').onsubmit = event => {
  event.preventDefault();
  el('form-status').textContent = mode === 'register' && el('password').value !== el('confirm-password').value ? '两次输入的密码不一致。' : '本地校验完成。当前为布局预览，未发送账号信息。';
};
el('theme-toggle').onclick = () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  el('theme-toggle').setAttribute('aria-label', dark ? '切换浅色主题' : '切换深色主题');
};
function onSignal(event) {
  if (event.data?.source !== 'ir-login-preview' || event.source !== parent) return;
  if (['auto', 'split', 'centered'].includes(event.data.layout)) layoutChoice = event.data.layout;
  if (typeof event.data.expired === 'boolean') el('expired').hidden = !event.data.expired;
  if (['landing', 'login', 'register'].includes(event.data.mode)) setMode(event.data.mode);
  updateLayout();
}
addEventListener('message', onSignal);
splitQuery.addEventListener('change', updateLayout);
addEventListener('resize', updateLayout); document.addEventListener('visibilitychange', updateLayout);
const params = new URLSearchParams(location.search);
if (params.get('expired') === '0') el('expired').hidden = true;
if (['split','centered'].includes(params.get('layout'))) layoutChoice = params.get('layout');
if (['login','register'].includes(params.get('mode'))) setMode(params.get('mode'));
updateLayout();
