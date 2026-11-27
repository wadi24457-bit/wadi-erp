import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPA_URL = 'https://bfwsjxrwvagwijlemkuf.supabase.co';
const SUPA_KEY = 'sb_publishable_HQdNANQGqQYgH98nqZhtCQ_D_cvs45V';
export const sb = createClient(SUPA_URL, SUPA_KEY);

const $ = (s, el=document) => el.querySelector(s);
const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => new Intl.NumberFormat('ar-EG', {maximumFractionDigits:2}).format(Number(n||0));

const ROLES = {
  super_admin:'المدير العام (Super Admin)', owner:'المالك', general_manager:'مدير عام',
  accountant:'محاسب', hr_manager:'مسؤول موارد بشرية', sales_manager:'مدير مبيعات',
  purchasing_manager:'مدير مشتريات', warehouse_manager:'مسؤول مخازن', employee:'موظف'
};
const PERMS = {
  'dashboard.view':'لوحة التحكم','accounting.view':'عرض الحسابات','accounting.manage':'إدارة الحسابات',
  'accounting.approve':'اعتماد القيود','treasury.manage':'الخزائن والبنوك','expenses.view':'عرض المصروفات',
  'expenses.manage':'إدارة المصروفات','hr.view':'عرض الموظفين','hr.manage':'إدارة الموظفين',
  'advances.manage':'إدارة السلف','advances.approve':'اعتماد السلف','parties.view':'عرض العملاء والموردين',
  'parties.manage':'إدارة العملاء والموردين','sales.manage':'المبيعات','purchases.manage':'المشتريات',
  'inventory.view':'عرض المخزون','inventory.manage':'إدارة المخازن','trade.view':'عرض الاستيراد والتصدير',
  'trade.manage':'إدارة الاستيراد والتصدير','reports.view':'التقارير','users.manage':'إدارة المستخدمين',
  'settings.manage':'الإعدادات','audit.view':'سجل الأنشطة'
};

let session = null, profile = null, roleDefaults = {};

async function boot(){
  const { data } = await sb.auth.getSession();
  session = data.session;
  sb.auth.onAuthStateChange((_e, s) => { session = s; if(!s){ profile=null; render(); } });
  render();
}

async function loadProfile(){
  if(!session) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  profile = data;
  const { data: rp } = await sb.from('role_permissions').select('*');
  roleDefaults = Object.fromEntries((rp||[]).map(r => [r.role, r.perms]));
  return profile;
}
function can(p){
  if(!profile) return false;
  if(profile.role === 'super_admin') return true;
  if(profile.permissions && profile.permissions[p] !== undefined) return !!profile.permissions[p];
  return !!(roleDefaults[profile.role] && roleDefaults[profile.role][p]);
}

/* ---------- views ---------- */
function loginView(){
  app.innerHTML = `
  <div class="login-wrap"><div class="login-card">
    <div class="brand"><img src="icon.svg" alt="WADI"><b>WADI</b></div>
    <div class="tagline">Smart Business Management — نظام إدارة التجارة والاستيراد والتصدير والتوريدات</div>
    <div id="msg"></div>
    <form id="loginForm">
      <div class="field"><label>البريد الإلكتروني</label><input type="email" id="email" required autocomplete="username" dir="ltr"></div>
      <div class="field"><label>كلمة المرور</label><input type="password" id="password" required autocomplete="current-password" dir="ltr"></div>
      <button class="btn" id="loginBtn">تسجيل الدخول</button>
    </form>
    <button class="btn ghost" id="forgotBtn" style="margin-top:.5rem">نسيت كلمة المرور؟</button>
  </div></div>`;
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = '...جاري الدخول';
    const { data, error } = await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value });
    btn.disabled = false; btn.textContent = 'تسجيل الدخول';
    if(error){ $('#msg').innerHTML = `<div class="msg err">بيانات الدخول غير صحيحة أو الحساب غير موجود.</div>`; return; }
    session = data.session;
    await loadProfile();
    if(!profile || !profile.is_active){
      await sb.auth.signOut(); profile = null;
      $('#msg').innerHTML = `<div class="msg err">هذا الحساب غير مفعّل. راجع المدير.</div>`;
      return;
    }
    render();
  };
  $('#forgotBtn').onclick = async () => {
    const email = $('#email').value.trim();
    if(!email){ $('#msg').innerHTML = `<div class="msg err">اكتب بريدك الإلكتروني أولاً.</div>`; return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    $('#msg').innerHTML = error
      ? `<div class="msg err">تعذر إرسال الرابط. راجع المدير لإعادة تعيين كلمة المرور.</div>`
      : `<div class="msg ok">تم إرسال رابط إعادة التعيين إلى بريدك.</div>`;
  };
}

const NAV = [
  ['dash','الرئيسية','🏠'],['users','المستخدمون','👥'],['audit','السجل','📋'],['more','المزيد','⚙️']
];
function shell(content, active){
  const dark = localStorage.getItem('wadi-theme') === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : '';
  app.innerHTML = `
  <div class="shell">
    <div class="topbar">
      <img src="icon.svg" alt=""><b>WADI</b>
      <span style="font-size:.75rem;color:#94a3b8">${esc(profile.full_name)} · ${esc(ROLES[profile.role]||profile.role)}</span>
      <div class="spacer"></div>
      <button id="themeBtn">${dark ? '☀️' : '🌙'}</button>
      <button id="logoutBtn">خروج</button>
    </div>
    <main>${content}</main>
    <nav class="bottomnav">
      ${NAV.map(([k,t,i]) => `<a href="#${k}" class="${active===k?'active':''}"><span class="ic">${i}</span>${t}</a>`).join('')}
    </nav>
  </div>`;
  $('#logoutBtn').onclick = async () => { await sb.auth.signOut(); location.hash=''; render(); };
  $('#themeBtn').onclick = () => { localStorage.setItem('wadi-theme', dark ? 'light' : 'dark'); render(); };
}

async function dashView(){
  shell(`<div class="page-title">لوحة التحكم</div><div class="center"><span class="spin"></span></div>`, 'dash');
  const [users] = await Promise.all([
    can('users.manage') ? callFn('list_users').catch(()=>null) : null,
  ]);
  shell(`
    <div class="page-title">لوحة التحكم</div>
    <div class="cards">
      <div class="card"><div class="k">المستخدمون النشطون</div><div class="v em">${users ? users.users.filter(u=>u.is_active).length : '—'}</div></div>
      <div class="card"><div class="k">إجمالي المبيعات</div><div class="v">—</div></div>
      <div class="card"><div class="k">إجمالي المصروفات</div><div class="v">—</div></div>
      <div class="card"><div class="k">قيمة المخزون</div><div class="v">—</div></div>
    </div>
    <div class="card" style="margin-top:1rem">
      <div class="k">الحالة</div>
      <p style="margin-top:.4rem; font-size:.9rem; color:var(--muted)">المرحلة الأولى جاهزة: قاعدة البيانات ونظام المستخدمين والصلاحيات وسجل الأنشطة. باقي الوحدات (الحسابات، المخازن، المبيعات...) تُبنى تباعاً وستظهر هنا.</p>
    </div>`, 'dash');
}

async function usersView(){
  if(!can('users.manage')) return shell(`<div class="page-title">المستخدمون</div><div class="empty">لا تملك صلاحية إدارة المستخدمين.</div>`, 'users');
  shell(`<div class="page-title">المستخدمون</div><div class="center"><span class="spin"></span></div>`, 'users');
  let data;
  try { data = await callFn('list_users'); }
  catch(e){ return shell(`<div class="page-title">المستخدمون</div><div class="empty">خطأ: ${esc(e.message)}</div>`, 'users'); }
  const rows = data.users.map(u => `
    <tr>
      <td><b>${esc(u.full_name)}</b><br><span style="color:var(--muted);font-size:.8rem" dir="ltr">${esc(u.email||'')}</span></td>
      <td><span class="badge navy">${esc(ROLES[u.role]||u.role)}</span></td>
      <td>${u.is_active ? '<span class="badge green">نشط</span>' : '<span class="badge red">موقوف</span>'}</td>
      <td class="row-actions">
        <button data-edit="${u.id}">تعديل</button>
        <button data-reset="${u.id}">كلمة المرور</button>
      </td>
    </tr>`).join('');
  shell(`
    <div class="page-title">المستخدمون</div>
    <div class="toolbar"><button class="btn" id="addUser">+ إضافة مستخدم</button></div>
    <div id="msg"></div>
    <div class="tablewrap"><table>
      <thead><tr><th>المستخدم</th><th>الدور</th><th>الحالة</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="empty">لا يوجد مستخدمون</td></tr>'}</tbody>
    </table></div>
    <div id="modal"></div>`, 'users');
  $('#addUser').onclick = () => userForm(null);
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => userForm(data.users.find(u=>u.id===b.dataset.edit)));
  document.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => resetForm(b.dataset.reset));
}

function userForm(u){
  const perms = u ? {...(u.permissions||{})} : {};
  $('#modal').innerHTML = `
  <div class="modal-bg"><div class="modal">
    <h3>${u ? 'تعديل مستخدم' : 'إضافة مستخدم'}</h3>
    <div id="mmsg"></div>
    <div class="field"><label>الاسم الكامل</label><input id="f_name" value="${esc(u?.full_name||'')}"></div>
    ${u ? '' : `<div class="field"><label>البريد الإلكتروني</label><input id="f_email" type="email" dir="ltr"></div>
    <div class="field"><label>كلمة المرور</label><input id="f_pass" type="text" dir="ltr" placeholder="٨ أحرف على الأقل"></div>`}
    <div class="field"><label>الهاتف</label><input id="f_phone" dir="ltr" value="${esc(u?.phone||'')}"></div>
    <div class="field"><label>الدور</label><select id="f_role">
      ${Object.entries(ROLES).filter(([k])=> k!=='super_admin' || profile.role==='super_admin').map(([k,v])=>`<option value="${k}" ${u?.role===k?'selected':''}>${v}</option>`).join('')}
    </select></div>
    <label>صلاحيات مخصصة (تتجاوز صلاحيات الدور عند تحديدها)</label>
    <div class="perm-grid">
      ${Object.entries(PERMS).map(([k,v])=>`<label><input type="checkbox" data-perm="${k}" ${perms[k]===true?'checked':''}> ${v}</label>`).join('')}
    </div>
    ${u ? `<div class="field"><label>الحالة</label><select id="f_active"><option value="1" ${u.is_active?'selected':''}>نشط</option><option value="0" ${!u.is_active?'selected':''}>موقوف</option></select></div>` : ''}
    <button class="btn" id="saveUser">${u ? 'حفظ' : 'إنشاء الحساب'}</button>
    <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button>
  </div></div>`;
  $('#closeModal').onclick = () => $('#modal').innerHTML = '';
  $('#saveUser').onclick = async () => {
    const permissions = {};
    document.querySelectorAll('[data-perm]').forEach(c => { permissions[c.dataset.perm] = c.checked; });
    try {
      if(!u){
        await callFn('create_user', { email: $('#f_email').value.trim(), password: $('#f_pass').value, full_name: $('#f_name').value.trim(), phone: $('#f_phone').value.trim(), role: $('#f_role').value, permissions });
      } else {
        await callFn('update_user', { id: u.id, full_name: $('#f_name').value.trim(), phone: $('#f_phone').value.trim(), role: $('#f_role').value, permissions, is_active: $('#f_active').value === '1' });
      }
      $('#modal').innerHTML = '';
      usersView();
    } catch(e){ $('#mmsg').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
  };
}

function resetForm(id){
  $('#modal').innerHTML = `
  <div class="modal-bg"><div class="modal">
    <h3>إعادة تعيين كلمة المرور</h3>
    <div id="mmsg"></div>
    <div class="field"><label>كلمة المرور الجديدة</label><input id="f_np" type="text" dir="ltr" placeholder="٨ أحرف على الأقل"></div>
    <button class="btn" id="doReset">تعيين</button>
    <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button>
  </div></div>`;
  $('#closeModal').onclick = () => $('#modal').innerHTML = '';
  $('#doReset').onclick = async () => {
    try { await callFn('reset_password', { id, password: $('#f_np').value }); $('#modal').innerHTML=''; usersView(); }
    catch(e){ $('#mmsg').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
  };
}

async function auditView(){
  if(!can('audit.view')) return shell(`<div class="page-title">سجل الأنشطة</div><div class="empty">لا تملك صلاحية عرض السجل.</div>`, 'audit');
  shell(`<div class="page-title">سجل الأنشطة</div><div class="center"><span class="spin"></span></div>`, 'audit');
  const { data } = await sb.from('audit_log').select('*').order('created_at', {ascending:false}).limit(100);
  const rows = (data||[]).map(r => `
    <tr><td style="white-space:nowrap">${new Date(r.created_at).toLocaleString('ar-EG')}</td>
    <td>${esc(r.action)}</td><td>${esc(r.table_name||'')}</td>
    <td style="font-size:.75rem;color:var(--muted)" dir="ltr">${esc((r.record_id||'').slice(0,8))}</td></tr>`).join('');
  shell(`
    <div class="page-title">سجل الأنشطة</div>
    <div class="tablewrap"><table>
      <thead><tr><th>الوقت</th><th>الإجراء</th><th>الجدول</th><th>السجل</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="empty">لا يوجد نشاط بعد</td></tr>'}</tbody>
    </table></div>`, 'audit');
}

function moreView(){
  shell(`
    <div class="page-title">المزيد</div>
    <div class="cards">
      <div class="card"><div class="k">النسخة</div><div class="v" style="font-size:1rem">مرحلة ١ — التأسيس</div></div>
      <div class="card"><div class="k">العملة الأساسية</div><div class="v" style="font-size:1rem">جنيه مصري (EGP)</div></div>
    </div>
    <div class="card" style="margin-top:1rem"><div class="k">قريباً</div>
      <p style="margin-top:.4rem;font-size:.9rem;color:var(--muted)">الحسابات والخزائن · المصروفات والسلف والموظفون · العملاء والموردون · المبيعات والمشتريات · المخازن · الاستيراد والتصدير · التقارير</p>
    </div>`, 'more');
}

async function callFn(action, payload = {}){
  const res = await fetch(`${SUPA_URL}/functions/v1/admin-users`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if(!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function render(){
  if(!session){ loginView(); return; }
  if(!profile){ await loadProfile(); }
  if(!profile){ loginView(); return; }
  const h = (location.hash || '#dash').slice(1);
  if(h === 'users') return usersView();
  if(h === 'audit') return auditView();
  if(h === 'more') return moreView();
  return dashView();
}
window.addEventListener('hashchange', render);
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
boot();
