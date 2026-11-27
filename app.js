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
  'treasury.overdraw':'الصرف فوق رصيد الخزينة','settings.manage':'الإعدادات','audit.view':'سجل الأنشطة'
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
  ['dash','الرئيسية','🏠'],['fin','المالية','💰'],['users','المستخدمون','👥'],['audit','السجل','📋'],['more','المزيد','⚙️']
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
  if(!can('dashboard.view')) return shell(`<div class="page-title">لوحة التحكم</div><div class="empty">لا تملك صلاحية عرض لوحة التحكم.</div>`, 'dash');
  shell(`<div class="page-title">لوحة التحكم</div><div class="center"><span class="spin"></span></div>`, 'dash');
  const [today, cash, boxes, parties, low, inv, activity] = await Promise.all([
    sb.from('v_dash_today').select('*').maybeSingle(),
    sb.from('v_dash_cash_today').select('*').maybeSingle(),
    sb.from('v_cashbox_balances').select('*'),
    sb.from('v_party_balances').select('*'),
    sb.from('v_low_stock').select('*').limit(10),
    sb.from('v_dash_inventory_value').select('*').maybeSingle(),
    can('audit.view') ? sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(6) : Promise.resolve({data:[]}),
  ]);
  const t = today.data || {}, c = cash.data || {}, iv = inv.data || {};
  const recv = ((parties.data||[]).find(r=>r.party_type==='customer')||{}).open_balance || 0;
  const payb = ((parties.data||[]).find(r=>r.party_type==='supplier')||{}).open_balance || 0;
  const lowItems = low.data || [];
  const totalCash = (boxes.data||[]).reduce((s,b)=>s+Number(b.balance||0),0);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صباح الخير' : 'مساء الخير';
  const dateStr = new Date().toLocaleDateString('ar-EG', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const card = (k, v, cls='') => `<div class="card"><div class="k">${k}</div><div class="v ${cls}">${v === null ? '—' : v}</div></div>`;
  shell(`
    <div class="page-title">${greet}، ${esc(profile.full_name.split(' ')[0])} 👋</div>
    <div style="color:var(--muted);font-size:.85rem;margin-bottom:1rem">${dateStr}</div>
    <div class="cards">
      ${card('مبيعات اليوم', fmt(t.sales_today) + ' ج.م', 'em')}
      ${card('مشتريات اليوم', fmt(t.purchases_today) + ' ج.م')}
      ${card('مقبوضات اليوم', fmt(c.receipts_today) + ' ج.م', 'em')}
      ${card('مدفوعات اليوم', fmt(c.payments_today) + ' ج.م')}
      ${card('إجمالي أرصدة الخزائن', fmt(totalCash) + ' ج.م', 'em')}
      ${card('مستحقات العملاء', fmt(recv) + ' ج.م')}
      ${card('مستحقات الموردين', fmt(payb) + ' ج.م')}
      ${card('قيمة المخزون', fmt(iv.stock_value) + ' ج.م')}
    </div>
    ${lowItems.length ? `
    <div class="card" style="margin-top:1rem;border-color:#f59e0b">
      <div class="k">⚠️ أصناف تحت حد الطلب (${lowItems.length})</div>
      <div class="tablewrap" style="margin-top:.5rem"><table>
        <thead><tr><th>الصنف</th><th>المخزن</th><th>المتاح</th><th>الحد</th></tr></thead>
        <tbody>${lowItems.map(p=>`<tr><td><b>${esc(p.name)}</b><br><span style="color:var(--muted);font-size:.75rem" dir="ltr">${esc(p.sku)}</span></td><td>${esc(p.warehouse_name)}</td><td>${fmt(p.on_hand)} ${esc(p.unit)}</td><td>${fmt(p.min_stock)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}
    ${(boxes.data||[]).length ? `
    <div class="card" style="margin-top:1rem">
      <div class="k">الخزائن والبنوك</div>
      <div class="tablewrap" style="margin-top:.5rem"><table>
        <thead><tr><th>الخزينة</th><th>النوع</th><th>الرصيد</th></tr></thead>
        <tbody>${(boxes.data||[]).map(b=>`<tr><td>${esc(b.name)}</td><td>${b.kind==='bank'?'بنك':'نقدية'}</td><td class="em">${fmt(b.balance)} ج.م</td></tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}
    ${(activity.data||[]).length ? `
    <div class="card" style="margin-top:1rem">
      <div class="k">آخر الأنشطة</div>
      <div style="margin-top:.5rem">${(activity.data||[]).map(r=>`
        <div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--line);font-size:.85rem">
          <span>${esc(r.action)} · ${esc(r.table_name||'')}</span>
          <span style="color:var(--muted);font-size:.75rem">${new Date(r.created_at).toLocaleString('ar-EG')}</span>
        </div>`).join('')}</div>
    </div>` : ''}`, 'dash');
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
      <div class="card"><div class="k">النسخة</div><div class="v" style="font-size:1rem">مرحلة ٨ — الاستيراد والتصدير</div></div>
      <div class="card"><div class="k">العملة الأساسية</div><div class="v" style="font-size:1rem">جنيه مصري (EGP)</div></div>
    </div>
    <div class="card" style="margin-top:1rem"><div class="k">الأقسام</div>
      <p style="margin-top:.4rem;font-size:.9rem"><a href="#hr" style="color:var(--emerald-d)">🧑‍💼 الموظفون والموارد البشرية والسلف ←</a></p>
      <p style="margin-top:.4rem;font-size:.9rem"><a href="#parties" style="color:var(--emerald-d)">🤝 العملاء والموردون وكشوف الحساب ←</a></p>
      <p style="margin-top:.4rem;font-size:.9rem"><a href="#trade" style="color:var(--emerald-d)">🧾 التوريد والمبيعات والمشتريات ←</a></p>
      <p style="margin-top:.4rem;font-size:.9rem"><a href="#inv" style="color:var(--emerald-d)">📦 المخازن والمخزون ←</a></p>
      <p style="margin-top:.4rem;font-size:.9rem"><a href="#ship" style="color:var(--emerald-d)">🚢 الاستيراد والتصدير والشحنات ←</a></p>
    </div>`, 'more');
}

/* ---------- FINANCE (phase 3) ---------- */
const ACCT_TYPES = { asset:'أصول', liability:'خصوم', equity:'حقوق ملكية', revenue:'إيرادات', expense:'مصروفات' };
const PARTY_TYPES = { customer:'عميل', supplier:'مورد', employee:'موظف', other:'أخرى' };
const money = n => fmt(n) + ' ج.م';

function finHome(){
  if(!can('accounting.view') && !can('treasury.manage'))
    return shell(`<div class="page-title">المالية</div><div class="empty">لا تملك صلاحية الوصول إلى المالية.</div>`, 'fin');
  const items = [
    ['fin/vouchers','سندات القبض والصرف','🧾','treasury.manage','تسجيل المقبوضات والمدفوعات مع قيد محاسبي تلقائي'],
    ['fin/expenses','المصروفات والميزانية','💸','expenses.view','مصروفات مصنّفة بمصدر دفع إلزامي ومقارنة بالميزانية'],
    ['fin/cashboxes','الخزائن والبنوك','🏦','treasury.manage','إدارة الخزائن ومتابعة أرصدتها'],
    ['fin/journals','القيود اليومية','📒','accounting.view','قيود مزدوجة مع اعتماد ومنع تعديل بعد الاعتماد'],
    ['fin/accounts','دليل الحسابات','🗂️','accounting.view','شجرة الحسابات والأرصدة'],
    ['fin/trial','ميزان المراجعة','⚖️','accounting.view','أرصدة كل الحسابات من القيود المعتمدة'],
  ].filter(([, , , p]) => can(p));
  shell(`
    <div class="page-title">الحسابات والخزائن</div>
    <div class="cards">
      ${items.map(([h,t,i,,d]) => `<a href="#${h}" class="card link-card"><div style="font-size:1.6rem">${i}</div><div class="k" style="font-size:1rem;color:var(--text)">${t}</div><div style="font-size:.78rem;color:var(--muted)">${d}</div></a>`).join('')}
    </div>`, 'fin');
}

async function accountsView(){
  if(!can('accounting.view')) return shell(`<div class="page-title">دليل الحسابات</div><div class="empty">لا تملك الصلاحية.</div>`, 'fin');
  shell(`<div class="page-title">دليل الحسابات</div><div class="center"><span class="spin"></span></div>`, 'fin');
  const { data } = await sb.from('v_trial_balance').select('*').order('code');
  const rows = (data||[]).map(a => `
    <tr>
      <td dir="ltr" style="text-align:right"><b>${esc(a.code)}</b></td>
      <td>${a.parent_id ? '&nbsp;&nbsp;└ ' : ''}<b>${esc(a.name)}</b></td>
      <td><span class="badge navy">${ACCT_TYPES[a.type]||a.type}</span></td>
      <td class="${a.balance >= 0 ? '' : 'neg'}">${money(a.balance)}</td>
    </tr>`).join('');
  shell(`
    <div class="page-title">دليل الحسابات</div>
    <div class="toolbar">
      ${can('accounting.manage') ? '<button class="btn" id="addAcct">+ إضافة حساب</button>' : ''}
      <a class="btn ghost" href="#fin">← المالية</a>
    </div>
    <div id="msg"></div>
    <div class="tablewrap"><table>
      <thead><tr><th>الكود</th><th>الحساب</th><th>النوع</th><th>الرصيد</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="empty">لا توجد حسابات</td></tr>'}</tbody>
    </table></div>
    <div id="modal"></div>`, 'fin');
  if(can('accounting.manage')) $('#addAcct').onclick = () => acctForm(data||[]);
}

function acctForm(all){
  $('#modal').innerHTML = `
  <div class="modal-bg"><div class="modal">
    <h3>إضافة حساب</h3><div id="mmsg"></div>
    <div class="field"><label>الكود</label><input id="a_code" dir="ltr" placeholder="مثال: 1110"></div>
    <div class="field"><label>اسم الحساب</label><input id="a_name"></div>
    <div class="field"><label>النوع</label><select id="a_type">${Object.entries(ACCT_TYPES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="field"><label>الحساب الأب (اختياري)</label><select id="a_parent"><option value="">— بدون —</option>
      ${all.map(a=>`<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join('')}</select></div>
    <button class="btn" id="saveAcct">حفظ</button>
    <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button>
  </div></div>`;
  $('#closeModal').onclick = () => $('#modal').innerHTML = '';
  $('#saveAcct').onclick = async () => {
    const { error } = await sb.from('accounts').insert({
      code: $('#a_code').value.trim(), name: $('#a_name').value.trim(),
      type: $('#a_type').value, parent_id: $('#a_parent').value || null, created_by: session.user.id });
    if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
    $('#modal').innerHTML = ''; accountsView();
  };
}

async function cashboxesView(){
  if(!can('treasury.manage') && !can('accounting.view')) return shell(`<div class="page-title">الخزائن</div><div class="empty">لا تملك الصلاحية.</div>`, 'fin');
  shell(`<div class="page-title">الخزائن والبنوك</div><div class="center"><span class="spin"></span></div>`, 'fin');
  const { data } = await sb.from('v_cashbox_balances').select('*').order('name');
  const total = (data||[]).reduce((s,b)=>s+Number(b.balance||0),0);
  shell(`
    <div class="page-title">الخزائن والبنوك</div>
    <div class="toolbar">
      ${can('treasury.manage') ? '<button class="btn" id="addCb">+ إضافة خزينة</button>' : ''}
      <a class="btn ghost" href="#fin">← المالية</a>
    </div>
    <div id="msg"></div>
    <div class="cards">${(data||[]).map(b=>`
      <div class="card"><div class="k">${esc(b.name)} <span class="badge navy">${b.kind==='bank'?'بنك':'نقدية'}</span></div><div class="v em">${money(b.balance)}</div></div>`).join('')}
      <div class="card"><div class="k">الإجمالي</div><div class="v">${money(total)}</div></div>
    </div>
    ${!(data||[]).length ? '<div class="empty">لا توجد خزائن بعد — أضف أول خزينة لتبدأ تسجيل السندات.</div>' : ''}
    <div id="modal"></div>`, 'fin');
  if(can('treasury.manage')) $('#addCb').onclick = () => {
    $('#modal').innerHTML = `
    <div class="modal-bg"><div class="modal">
      <h3>إضافة خزينة</h3><div id="mmsg"></div>
      <div class="field"><label>الاسم</label><input id="c_name" placeholder="مثال: الخزينة الرئيسية"></div>
      <div class="field"><label>النوع</label><select id="c_kind"><option value="cash">نقدية</option><option value="bank">حساب بنكي</option></select></div>
      <p style="font-size:.8rem;color:var(--muted)">سيُنشأ حساب مقابل لها تلقائياً في دليل الحسابات.</p>
      <button class="btn" id="saveCb">حفظ</button>
      <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button>
    </div></div>`;
    $('#closeModal').onclick = () => $('#modal').innerHTML = '';
    $('#saveCb').onclick = async () => {
      const { error } = await sb.from('cashboxes').insert({ name: $('#c_name').value.trim(), kind: $('#c_kind').value, created_by: session.user.id });
      if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
      $('#modal').innerHTML = ''; cashboxesView();
    };
  };
}

async function vouchersView(){
  if(!can('treasury.manage')) return shell(`<div class="page-title">السندات</div><div class="empty">لا تملك صلاحية الخزائن.</div>`, 'fin');
  shell(`<div class="page-title">سندات القبض والصرف</div><div class="center"><span class="spin"></span></div>`, 'fin');
  const [{ data: pays }, { data: boxes }, { data: currs }] = await Promise.all([
    sb.from('payments').select('*, cashboxes(name)').is('deleted_at', null).order('created_at', {ascending:false}).limit(100),
    sb.from('cashboxes').select('*').eq('is_active', true).is('deleted_at', null),
    sb.from('currencies').select('*'),
  ]);
  const rows = (pays||[]).map(p => `
    <tr>
      <td><span class="badge ${p.kind==='receipt'?'green':'red'}">${p.kind==='receipt'?'قبض':'صرف'}</span></td>
      <td dir="ltr" style="text-align:right">${esc(p.ref_no)}</td>
      <td>${new Date(p.date).toLocaleDateString('ar-EG')}</td>
      <td><b>${fmt(p.amount)} ${esc(p.currency)}</b>${p.fx_rate !== 1 ? `<br><span style="font-size:.72rem;color:var(--muted)">صرف ${fmt(p.fx_rate)}</span>` : ''}</td>
      <td>${esc(p.cashboxes?.name||'')}</td>
      <td>${PARTY_TYPES[p.party_type]||'—'}</td>
      <td style="font-size:.78rem;color:var(--muted)">${esc(p.notes||'')}</td>
    </tr>`).join('');
  shell(`
    <div class="page-title">سندات القبض والصرف</div>
    <div class="toolbar">
      <button class="btn" id="addV">+ سند جديد</button>
      <a class="btn ghost" href="#fin">← المالية</a>
    </div>
    <div id="msg"></div>
    <div class="tablewrap"><table>
      <thead><tr><th>النوع</th><th>المرجع</th><th>التاريخ</th><th>المبلغ</th><th>الخزينة</th><th>الطرف</th><th>بيان</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="empty">لا توجد سندات بعد</td></tr>'}</tbody>
    </table></div>
    <div id="modal"></div>`, 'fin');
  $('#addV').onclick = () => voucherForm(boxes||[], currs||[]);
}

function voucherForm(boxes, currs){
  if(!boxes.length){ $('#msg').innerHTML = `<div class="msg err">أضف خزينة أولاً من صفحة الخزائن.</div>`; return; }
  $('#modal').innerHTML = `
  <div class="modal-bg"><div class="modal">
    <h3>سند جديد</h3><div id="mmsg"></div>
    <div class="field"><label>النوع</label><select id="v_kind"><option value="receipt">سند قبض (مقبوضات)</option><option value="payment">سند صرف (مدفوعات)</option></select></div>
    <div class="field"><label>التاريخ</label><input id="v_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="field"><label>المبلغ</label><input id="v_amount" type="number" min="0" step="0.01" dir="ltr"></div>
    <div class="field"><label>العملة</label><select id="v_curr">${(currs.length?currs:[{code:'EGP'}]).map(c=>`<option value="${c.code}" ${c.code==='EGP'?'selected':''}>${c.code}${c.name?' — '+esc(c.name):''}</option>`).join('')}</select></div>
    <div class="field"><label>سعر الصرف (إلى الجنيه)</label><input id="v_fx" type="number" min="0" step="0.0001" value="1" dir="ltr"></div>
    <div class="field"><label>الخزينة</label><select id="v_box">${boxes.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
    <div class="field"><label>الطرف</label><select id="v_ptype">${Object.entries(PARTY_TYPES).map(([k,v])=>`<option value="${k}" ${k==='other'?'selected':''}>${v}</option>`).join('')}</select></div>
    <div class="field"><label>البيان (اسم الطرف والسبب)</label><input id="v_notes" placeholder="مثال: تحصيل من شركة النور عن فاتورة 12"></div>
    <p style="font-size:.8rem;color:var(--muted)">يُنشأ قيد يومية معتمد تلقائياً: ${'{'}مدين/دائن{'}'} حسب نوع السند، ولا يمكن صرف مبلغ أكبر من رصيد الخزينة إلا بصلاحية خاصة.</p>
    <button class="btn" id="saveV">حفظ السند</button>
    <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button>
  </div></div>`;
  $('#closeModal').onclick = () => $('#modal').innerHTML = '';
  $('#v_curr').onchange = async () => {
    const code = $('#v_curr').value;
    if(code === 'EGP'){ $('#v_fx').value = 1; return; }
    const { data } = await sb.from('fx_rates').select('*').eq('currency', code).order('date', {ascending:false}).limit(1);
    if(data && data.length) $('#v_fx').value = data[0].rate;
  };
  $('#saveV').onclick = async () => {
    const amount = Number($('#v_amount').value);
    if(!amount || amount <= 0){ $('#mmsg').innerHTML = `<div class="msg err">أدخل مبلغاً صحيحاً.</div>`; return; }
    const { error } = await sb.from('payments').insert({
      kind: $('#v_kind').value, date: $('#v_date').value, amount,
      currency: $('#v_curr').value, fx_rate: Number($('#v_fx').value) || 1,
      cashbox_id: $('#v_box').value, party_type: $('#v_ptype').value,
      notes: $('#v_notes').value.trim(), created_by: session.user.id });
    if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
    $('#modal').innerHTML = ''; vouchersView();
  };
}

async function journalsView(){
  if(!can('accounting.view')) return shell(`<div class="page-title">القيود</div><div class="empty">لا تملك الصلاحية.</div>`, 'fin');
  shell(`<div class="page-title">القيود اليومية</div><div class="center"><span class="spin"></span></div>`, 'fin');
  const { data: js } = await sb.from('journals').select('*').is('deleted_at', null).order('created_at', {ascending:false}).limit(100);
  const st = s => s==='approved' ? '<span class="badge green">معتمد</span>' : s==='voided' ? '<span class="badge red">ملغي</span>' : '<span class="badge navy">مسودة</span>';
  const rows = (js||[]).map(j => `
    <tr>
      <td dir="ltr" style="text-align:right">${esc(j.ref_no)}</td>
      <td>${new Date(j.date).toLocaleDateString('ar-EG')}</td>
      <td>${esc(j.description)}</td>
      <td>${st(j.status)}</td>
      <td class="row-actions">
        <button data-view="${j.id}">عرض</button>
        ${j.status==='draft' && can('accounting.approve') ? `<button data-approve="${j.id}">اعتماد</button>` : ''}
        ${j.status==='draft' && can('accounting.manage') ? `<button data-del="${j.id}">حذف</button>` : ''}
      </td>
    </tr>`).join('');
  shell(`
    <div class="page-title">القيود اليومية</div>
    <div class="toolbar">
      ${can('accounting.manage') ? '<button class="btn" id="addJ">+ قيد يدوي</button>' : ''}
      <a class="btn ghost" href="#fin">← المالية</a>
    </div>
    <div id="msg"></div>
    <div class="tablewrap"><table>
      <thead><tr><th>المرجع</th><th>التاريخ</th><th>البيان</th><th>الحالة</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="empty">لا توجد قيود بعد</td></tr>'}</tbody>
    </table></div>
    <div id="modal"></div>`, 'fin');
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => journalDetail(b.dataset.view));
  document.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
    const { error } = await sb.from('journals').update({ status:'approved' }).eq('id', b.dataset.approve);
    if(error) $('#msg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`;
    journalsView();
  });
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if(!confirm('حذف هذه المسودة؟')) return;
    await sb.from('journals').update({ deleted_at: new Date().toISOString() }).eq('id', b.dataset.del);
    journalsView();
  });
  if(can('accounting.manage')) $('#addJ').onclick = () => journalForm();
}

async function journalDetail(id){
  const { data: j } = await sb.from('journals').select('*').eq('id', id).single();
  const { data: lines } = await sb.from('journal_lines').select('*, accounts(code,name)').eq('journal_id', id);
  const td = (lines||[]).reduce((s,l)=>s+Number(l.debit),0), tc = (lines||[]).reduce((s,l)=>s+Number(l.credit),0);
  $('#modal').innerHTML = `
  <div class="modal-bg"><div class="modal">
    <h3 dir="ltr" style="text-align:right">${esc(j.ref_no)}</h3>
    <p style="font-size:.85rem;color:var(--muted)">${new Date(j.date).toLocaleDateString('ar-EG')} · ${esc(j.description)}</p>
    <div class="tablewrap"><table>
      <thead><tr><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead>
      <tbody>${(lines||[]).map(l=>`<tr><td><span dir="ltr">${esc(l.accounts?.code||'')}</span> ${esc(l.accounts?.name||'')}</td><td>${l.debit?fmt(l.debit):''}</td><td>${l.credit?fmt(l.credit):''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td><b>الإجمالي</b></td><td><b>${fmt(td)}</b></td><td><b>${fmt(tc)}</b></td></tr></tfoot>
    </table></div>
    <button class="btn ghost" id="closeModal" style="margin-top:.6rem">إغلاق</button>
  </div></div>`;
  $('#closeModal').onclick = () => $('#modal').innerHTML = '';
}

async function journalForm(){
  const { data: accts } = await sb.from('accounts').select('*').eq('is_active', true).is('deleted_at', null).order('code');
  const lineRow = () => `<div class="jline">
    <select class="jl_acct">${(accts||[]).map(a=>`<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join('')}</select>
    <input class="jl_dr" type="number" min="0" step="0.01" placeholder="مدين" dir="ltr">
    <input class="jl_cr" type="number" min="0" step="0.01" placeholder="دائن" dir="ltr">
  </div>`;
  $('#modal').innerHTML = `
  <div class="modal-bg"><div class="modal">
    <h3>قيد يومية يدوي</h3><div id="mmsg"></div>
    <div class="field"><label>التاريخ</label><input id="j_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="field"><label>البيان</label><input id="j_desc"></div>
    <label>السطور (مدين = دائن لاعتماد القيد)</label>
    <div id="jlines">${lineRow()}${lineRow()}</div>
    <button class="btn ghost" id="moreLine" style="margin:.4rem 0">+ سطر</button>
    <button class="btn" id="saveJ">حفظ كمسودة</button>
    <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button>
  </div></div>`;
  $('#closeModal').onclick = () => $('#modal').innerHTML = '';
  $('#moreLine').onclick = () => $('#jlines').insertAdjacentHTML('beforeend', lineRow());
  $('#saveJ').onclick = async () => {
    const { data: j, error } = await sb.from('journals').insert({
      date: $('#j_date').value, description: $('#j_desc').value.trim(), status: 'draft', created_by: session.user.id }).select().single();
    if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
    const lines = [...document.querySelectorAll('.jline')].map(el => ({
      journal_id: j.id, account_id: el.querySelector('.jl_acct').value,
      debit: Number(el.querySelector('.jl_dr').value) || 0, credit: Number(el.querySelector('.jl_cr').value) || 0 }))
      .filter(l => l.debit > 0 || l.credit > 0);
    if(lines.length){ const { error: e2 } = await sb.from('journal_lines').insert(lines);
      if(e2){ $('#mmsg').innerHTML = `<div class="msg err">${esc(e2.message)}</div>`; return; } }
    $('#modal').innerHTML = ''; journalsView();
  };
}

async function trialView(){
  if(!can('accounting.view')) return shell(`<div class="page-title">ميزان المراجعة</div><div class="empty">لا تملك الصلاحية.</div>`, 'fin');
  shell(`<div class="page-title">ميزان المراجعة</div><div class="center"><span class="spin"></span></div>`, 'fin');
  const { data } = await sb.from('v_trial_balance').select('*').order('code');
  const active = (data||[]).filter(a => a.total_debit || a.total_credit);
  const td = active.reduce((s,a)=>s+Number(a.total_debit),0), tc = active.reduce((s,a)=>s+Number(a.total_credit),0);
  shell(`
    <div class="page-title">ميزان المراجعة</div>
    <div class="toolbar"><a class="btn ghost" href="#fin">← المالية</a></div>
    <div class="tablewrap"><table>
      <thead><tr><th>الكود</th><th>الحساب</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
      <tbody>${active.map(a=>`<tr><td dir="ltr" style="text-align:right">${esc(a.code)}</td><td>${esc(a.name)}</td><td>${fmt(a.total_debit)}</td><td>${fmt(a.total_credit)}</td><td class="${a.balance>=0?'':'neg'}">${money(a.balance)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">لا توجد حركات معتمدة بعد</td></tr>'}</tbody>
      ${active.length ? `<tfoot><tr><td colspan="2"><b>الإجمالي</b></td><td><b>${fmt(td)}</b></td><td><b>${fmt(tc)}</b></td><td class="${Math.abs(td-tc)<0.005?'em':'neg'}"><b>${Math.abs(td-tc)<0.005?'متوازن ✓':'غير متوازن!'}</b></td></tr></tfoot>` : ''}
    </table></div>`, 'fin');
}

const EXP_CATS = ['إيجارات','رواتب','نقل ومواصلات','شحن','جمارك','مشتريات تشغيلية','صيانة','اتصالات وإنترنت','مصروفات إدارية','مصروفات تسويقية','مصروفات أخرى'];

async function expensesView(){
  if(!can('expenses.view') && !can('expenses.manage')) return shell(`<div class="page-title">المصروفات</div><div class="empty">لا تملك الصلاحية.</div>`, 'fin');
  shell(`<div class="page-title">المصروفات</div><div class="center"><span class="spin"></span></div>`, 'fin');
  const month = new Date().toISOString().slice(0,7);
  const [{ data: exps }, { data: boxes }, { data: cmp }] = await Promise.all([
    sb.from('expenses').select('*, cashboxes(name)').is('deleted_at', null).order('created_at', {ascending:false}).limit(100),
    sb.from('cashboxes').select('*').eq('is_active', true).is('deleted_at', null),
    sb.from('v_budget_compare').select('*').eq('month', month),
  ]);
  const rows = (exps||[]).map(e => `
    <tr><td dir="ltr" style="text-align:right">${esc(e.ref_no)}</td><td>${new Date(e.date).toLocaleDateString('ar-EG')}</td>
    <td>${esc(e.category)}</td><td><b>${fmt(e.amount)} ${esc(e.currency)}</b></td>
    <td>${esc(e.cashboxes?.name||'—')}</td><td>${esc(e.responsible||'')}</td>
    <td style="font-size:.78rem;color:var(--muted)">${esc(e.notes||'')}</td></tr>`).join('');
  const cmpRows = (cmp||[]).map(b => {
    const pct = b.budget > 0 ? Math.round(b.actual / b.budget * 100) : 0;
    return `<tr><td>${esc(b.category)}</td><td>${money(b.budget)}</td><td>${money(b.actual)}</td>
      <td class="${pct > 100 ? 'neg' : pct > 80 ? '' : 'em'}">${pct}٪</td></tr>`;
  }).join('');
  shell(`
    <div class="page-title">المصروفات</div>
    <div class="toolbar">
      ${can('expenses.manage') ? '<button class="btn" id="addE">+ مصروف جديد</button> <button class="btn ghost" id="setB">ميزانية شهرية</button>' : ''}
      <a class="btn ghost" href="#fin">← المالية</a>
    </div>
    <div id="msg"></div>
    ${cmpRows ? `<div class="card" style="margin-bottom:1rem"><div class="k">ميزانية هذا الشهر مقابل الفعلي</div>
      <div class="tablewrap" style="margin-top:.5rem"><table><thead><tr><th>التصنيف</th><th>الميزانية</th><th>الفعلي</th><th>النسبة</th></tr></thead><tbody>${cmpRows}</tbody></table></div></div>` : ''}
    <div class="tablewrap"><table>
      <thead><tr><th>المرجع</th><th>التاريخ</th><th>التصنيف</th><th>المبلغ</th><th>مصدر الدفع</th><th>المسؤول</th><th>ملاحظات</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="empty">لا توجد مصروفات بعد</td></tr>'}</tbody>
    </table></div>
    <div id="modal"></div>`, 'fin');
  if(can('expenses.manage')){
    $('#addE').onclick = () => expenseForm(boxes||[]);
    $('#setB').onclick = () => budgetForm(month);
  }
}

function expenseForm(boxes){
  if(!boxes.length){ $('#msg').innerHTML = `<div class="msg err">أضف خزينة أولاً — لا يُسجَّل مصروف دون مصدر دفع.</div>`; return; }
  $('#modal').innerHTML = `
  <div class="modal-bg"><div class="modal">
    <h3>مصروف جديد</h3><div id="mmsg"></div>
    <div class="field"><label>التصنيف</label><select id="e_cat">${EXP_CATS.map(c=>`<option>${c}</option>`).join('')}</select></div>
    <div class="field"><label>التاريخ</label><input id="e_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="field"><label>المبلغ</label><input id="e_amount" type="number" min="0" step="0.01" dir="ltr"></div>
    <div class="field"><label>مصدر الدفع (الخزينة) — إلزامي</label><select id="e_box">${boxes.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
    <div class="field"><label>طريقة الدفع</label><select id="e_method"><option>نقدي</option><option>تحويل بنكي</option><option>شيك</option><option>بطاقة</option></select></div>
    <div class="field"><label>المسؤول</label><input id="e_resp" value="${esc(profile.full_name)}"></div>
    <div class="field"><label>ملاحظات</label><input id="e_notes"></div>
    <p style="font-size:.8rem;color:var(--muted)">يُنشأ قيد تلقائي: حساب المصروف مدين والخزينة دائن، مع منع الصرف فوق الرصيد.</p>
    <button class="btn" id="saveE">حفظ</button>
    <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button>
  </div></div>`;
  $('#closeModal').onclick = () => $('#modal').innerHTML = '';
  $('#saveE').onclick = async () => {
    const amount = Number($('#e_amount').value);
    if(!amount || amount <= 0){ $('#mmsg').innerHTML = `<div class="msg err">أدخل مبلغاً صحيحاً.</div>`; return; }
    const { error } = await sb.from('expenses').insert({
      category: $('#e_cat').value, date: $('#e_date').value, amount,
      payment_method: $('#e_method').value, cashbox_id: $('#e_box').value,
      responsible: $('#e_resp').value.trim(), notes: $('#e_notes').value.trim(), created_by: session.user.id });
    if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
    $('#modal').innerHTML = ''; expensesView();
  };
}

function budgetForm(month){
  $('#modal').innerHTML = `
  <div class="modal-bg"><div class="modal">
    <h3>ميزانية شهر ${month}</h3><div id="mmsg"></div>
    <div class="field"><label>التصنيف</label><select id="b_cat">${EXP_CATS.map(c=>`<option>${c}</option>`).join('')}</select></div>
    <div class="field"><label>المبلغ المخطط</label><input id="b_amount" type="number" min="0" step="0.01" dir="ltr"></div>
    <button class="btn" id="saveB">حفظ الميزانية</button>
    <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button>
  </div></div>`;
  $('#closeModal').onclick = () => $('#modal').innerHTML = '';
  $('#saveB').onclick = async () => {
    const { error } = await sb.from('budgets').upsert({
      month, category: $('#b_cat').value, amount: Number($('#b_amount').value) || 0, created_by: session.user.id }, { onConflict: 'month,category,branch_id' });
    if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
    $('#modal').innerHTML = ''; expensesView();
  };
}

/* ---------- HR (phase 4) ---------- */
function hrHome(){
  if(!can('hr.view') && !can('hr.manage') && !can('advances.manage'))
    return shell(`<div class="page-title">الموظفون</div><div class="empty">لا تملك صلاحية الوصول إلى الموارد البشرية.</div>`, 'more');
  const items = [
    ['hr/employees','الموظفون','🧑‍💼','hr.view','البيانات والرواتب وحالة التوظيف'],
    ['hr/attendance','الحضور والانصراف','🕐','hr.view','تسجيل حضور اليوم'],
    ['hr/leaves','الإجازات','🌴','hr.view','طلبات الإجازة والموافقات'],
    ['hr/advances','السلف والقروض','🤝','hr.view','طلب → اعتماد → صرف → أقساط'],
  ].filter(([, , , p]) => can(p) || can('hr.manage'));
  shell(`
    <div class="page-title">الموظفون والموارد البشرية</div>
    <div class="cards">
      ${items.map(([h,t,i,,d]) => `<a href="#${h}" class="card link-card"><div style="font-size:1.6rem">${i}</div><div class="k" style="font-size:1rem;color:var(--text)">${t}</div><div style="font-size:.78rem;color:var(--muted)">${d}</div></a>`).join('')}
    </div>`, 'more');
}

async function employeesView(){
  if(!can('hr.view') && !can('hr.manage')) return shell(`<div class="page-title">الموظفون</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  shell(`<div class="page-title">الموظفون</div><div class="center"><span class="spin"></span></div>`, 'more');
  const { data } = await sb.from('employees').select('*').is('deleted_at', null).order('created_at', {ascending:false});
  const rows = (data||[]).map(e => `
    <tr><td><b>${esc(e.name)}</b><br><span style="color:var(--muted);font-size:.78rem" dir="ltr">${esc(e.code)}</span></td>
    <td>${esc(e.job_title||'—')}<br><span style="color:var(--muted);font-size:.78rem">${esc(e.department||'')}</span></td>
    <td>${money(e.base_salary)}</td>
    <td>${e.is_active ? '<span class="badge green">نشط</span>' : '<span class="badge red">منتهي</span>'}</td>
    <td class="row-actions">${can('hr.manage') ? `<button data-edit="${e.id}">تعديل</button>` : ''}</td></tr>`).join('');
  shell(`
    <div class="page-title">الموظفون</div>
    <div class="toolbar">
      ${can('hr.manage') ? '<button class="btn" id="addEmp">+ إضافة موظف</button>' : ''}
      <a class="btn ghost" href="#hr">← الموظفون</a>
    </div>
    <div id="msg"></div>
    <div class="tablewrap"><table>
      <thead><tr><th>الموظف</th><th>الوظيفة</th><th>الراتب الأساسي</th><th>الحالة</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="empty">لا يوجد موظفون بعد</td></tr>'}</tbody>
    </table></div>
    <div id="modal"></div>`, 'more');
  if(can('hr.manage')){
    $('#addEmp').onclick = () => empForm(null);
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => empForm((data||[]).find(e=>e.id===b.dataset.edit)));
  }
}

function empForm(e){
  $('#modal').innerHTML = `
  <div class="modal-bg"><div class="modal">
    <h3>${e ? 'تعديل موظف' : 'إضافة موظف'}</h3><div id="mmsg"></div>
    <div class="field"><label>الاسم</label><input id="em_name" value="${esc(e?.name||'')}"></div>
    <div class="field"><label>الهاتف</label><input id="em_phone" dir="ltr" value="${esc(e?.phone||'')}"></div>
    <div class="field"><label>البريد</label><input id="em_email" dir="ltr" value="${esc(e?.email||'')}"></div>
    <div class="field"><label>الوظيفة</label><input id="em_job" value="${esc(e?.job_title||'')}"></div>
    <div class="field"><label>القسم</label><input id="em_dept" value="${esc(e?.department||'')}"></div>
    <div class="field"><label>تاريخ التعيين</label><input id="em_hire" type="date" value="${e?.hire_date||new Date().toISOString().slice(0,10)}"></div>
    <div class="field"><label>الراتب الأساسي</label><input id="em_sal" type="number" min="0" step="0.01" dir="ltr" value="${e?.base_salary||0}"></div>
    ${e ? `<div class="field"><label>الحالة</label><select id="em_active"><option value="1" ${e.is_active?'selected':''}>نشط</option><option value="0" ${!e.is_active?'selected':''}>منتهي</option></select></div>` : ''}
    <button class="btn" id="saveEmp">حفظ</button>
    <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button>
  </div></div>`;
  $('#closeModal').onclick = () => $('#modal').innerHTML = '';
  $('#saveEmp').onclick = async () => {
    const body = { name: $('#em_name').value.trim(), phone: $('#em_phone').value.trim(), email: $('#em_email').value.trim(),
      job_title: $('#em_job').value.trim(), department: $('#em_dept').value.trim(), hire_date: $('#em_hire').value,
      base_salary: Number($('#em_sal').value) || 0 };
    let error;
    if(e){ ({ error } = await sb.from('employees').update({...body, is_active: $('#em_active').value==='1'}).eq('id', e.id)); }
    else { ({ error } = await sb.from('employees').insert({...body, created_by: session.user.id})); }
    if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
    $('#modal').innerHTML = ''; employeesView();
  };
}

async function attendanceView(){
  if(!can('hr.view') && !can('hr.manage')) return shell(`<div class="page-title">الحضور</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  shell(`<div class="page-title">الحضور والانصراف</div><div class="center"><span class="spin"></span></div>`, 'more');
  const today = new Date().toISOString().slice(0,10);
  const [{ data: emps }, { data: att }] = await Promise.all([
    sb.from('employees').select('*').eq('is_active', true).is('deleted_at', null),
    sb.from('attendance').select('*').eq('date', today),
  ]);
  const byEmp = Object.fromEntries((att||[]).map(a=>[a.employee_id, a]));
  const ATT_ST = { present:'حاضر', absent:'غائب', leave:'إجازة', late:'متأخر' };
  shell(`
    <div class="page-title">حضور اليوم — ${new Date().toLocaleDateString('ar-EG')}</div>
    <div class="toolbar"><a class="btn ghost" href="#hr">← الموظفون</a></div>
    <div id="msg"></div>
    <div class="tablewrap"><table>
      <thead><tr><th>الموظف</th><th>الحالة</th><th>حضور</th><th>انصراف</th>${can('hr.manage')?'<th></th>':''}</tr></thead>
      <tbody>${(emps||[]).map(e => { const a = byEmp[e.id]; return `
        <tr><td><b>${esc(e.name)}</b></td>
        <td>${a ? `<span class="badge ${a.status==='present'?'green':a.status==='absent'?'red':'navy'}">${ATT_ST[a.status]}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
        <td>${a?.check_in ? new Date(a.check_in).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
        <td>${a?.check_out ? new Date(a.check_out).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
        ${can('hr.manage') ? `<td class="row-actions">
          <button data-in="${e.id}">تسجيل حضور</button>
          ${a && !a.check_out ? `<button data-out="${a.id}">انصراف</button>` : ''}
          <button data-absent="${e.id}">غائب</button></td>` : ''}</tr>`; }).join('') || '<tr><td colspan="5" class="empty">أضف موظفين أولاً</td></tr>'}</tbody>
    </table></div>`, 'more');
  if(can('hr.manage')){
    document.querySelectorAll('[data-in]').forEach(b => b.onclick = async () => {
      const { error } = await sb.from('attendance').upsert({ employee_id: b.dataset.in, date: today, check_in: new Date().toISOString(), status: 'present', created_by: session.user.id }, { onConflict: 'employee_id,date' });
      if(error) $('#msg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; else attendanceView();
    });
    document.querySelectorAll('[data-out]').forEach(b => b.onclick = async () => {
      await sb.from('attendance').update({ check_out: new Date().toISOString() }).eq('id', b.dataset.out); attendanceView();
    });
    document.querySelectorAll('[data-absent]').forEach(b => b.onclick = async () => {
      await sb.from('attendance').upsert({ employee_id: b.dataset.absent, date: today, status: 'absent', created_by: session.user.id }, { onConflict: 'employee_id,date' }); attendanceView();
    });
  }
}

async function leavesView(){
  if(!can('hr.view') && !can('hr.manage')) return shell(`<div class="page-title">الإجازات</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  shell(`<div class="page-title">الإجازات</div><div class="center"><span class="spin"></span></div>`, 'more');
  const [{ data: lv }, { data: emps }] = await Promise.all([
    sb.from('leaves').select('*, employees(name)').is('deleted_at', null).order('created_at', {ascending:false}).limit(50),
    sb.from('employees').select('*').eq('is_active', true).is('deleted_at', null),
  ]);
  const st = s => s==='approved' ? '<span class="badge green">مقبولة</span>' : s==='rejected' ? '<span class="badge red">مرفوضة</span>' : '<span class="badge navy">قيد الانتظار</span>';
  shell(`
    <div class="page-title">الإجازات</div>
    <div class="toolbar">
      ${can('hr.manage') ? '<button class="btn" id="addL">+ طلب إجازة</button>' : ''}
      <a class="btn ghost" href="#hr">← الموظفون</a>
    </div>
    <div id="msg"></div>
    <div class="tablewrap"><table>
      <thead><tr><th>الموظف</th><th>النوع</th><th>من</th><th>إلى</th><th>الحالة</th><th></th></tr></thead>
      <tbody>${(lv||[]).map(l => `<tr><td><b>${esc(l.employees?.name||'')}</b></td><td>${esc(l.kind)}</td>
        <td>${new Date(l.from_date).toLocaleDateString('ar-EG')}</td><td>${new Date(l.to_date).toLocaleDateString('ar-EG')}</td><td>${st(l.status)}</td>
        <td class="row-actions">${l.status==='pending' && can('hr.manage') ? `<button data-ok="${l.id}">قبول</button><button data-no="${l.id}">رفض</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">لا توجد طلبات</td></tr>'}</tbody>
    </table></div>
    <div id="modal"></div>`, 'more');
  if(can('hr.manage')){
    $('#addL').onclick = () => {
      $('#modal').innerHTML = `
      <div class="modal-bg"><div class="modal"><h3>طلب إجازة</h3><div id="mmsg"></div>
        <div class="field"><label>الموظف</label><select id="l_emp">${(emps||[]).map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></div>
        <div class="field"><label>النوع</label><select id="l_kind"><option value="annual">سنوية</option><option value="sick">مرضية</option><option value="unpaid">بدون أجر</option><option value="emergency">طارئة</option></select></div>
        <div class="field"><label>من</label><input id="l_from" type="date"></div>
        <div class="field"><label>إلى</label><input id="l_to" type="date"></div>
        <button class="btn" id="saveL">حفظ</button>
        <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button></div></div>`;
      $('#closeModal').onclick = () => $('#modal').innerHTML = '';
      $('#saveL').onclick = async () => {
        const { error } = await sb.from('leaves').insert({ employee_id: $('#l_emp').value, kind: $('#l_kind').value, from_date: $('#l_from').value, to_date: $('#l_to').value, created_by: session.user.id });
        if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
        $('#modal').innerHTML = ''; leavesView();
      };
    };
    document.querySelectorAll('[data-ok]').forEach(b => b.onclick = async () => { await sb.from('leaves').update({ status:'approved', approved_by: session.user.id }).eq('id', b.dataset.ok); leavesView(); });
    document.querySelectorAll('[data-no]').forEach(b => b.onclick = async () => { await sb.from('leaves').update({ status:'rejected', approved_by: session.user.id }).eq('id', b.dataset.no); leavesView(); });
  }
}

async function advancesView(){
  if(!can('hr.view') && !can('hr.manage') && !can('advances.manage')) return shell(`<div class="page-title">السلف</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  shell(`<div class="page-title">السلف والقروض</div><div class="center"><span class="spin"></span></div>`, 'more');
  const [{ data: advs }, { data: emps }, { data: boxes }] = await Promise.all([
    sb.from('v_advance_book').select('*').order('request_date', {ascending:false}),
    sb.from('employees').select('*').eq('is_active', true).is('deleted_at', null),
    sb.from('cashboxes').select('*').eq('is_active', true).is('deleted_at', null),
  ]);
  const ST = { pending:['قيد الانتظار','navy'], approved:['معتمدة','navy'], rejected:['مرفوضة','red'], disbursed:['مصروفة','green'], settled:['مسددة','green'] };
  shell(`
    <div class="page-title">السلف والقروض</div>
    <div class="toolbar">
      ${can('advances.manage') || can('hr.manage') ? '<button class="btn" id="addA">+ طلب سلفة</button>' : ''}
      <a class="btn ghost" href="#hr">← الموظفون</a>
    </div>
    <div id="msg"></div>
    <div class="tablewrap"><table>
      <thead><tr><th>المرجع</th><th>الموظف</th><th>المبلغ</th><th>المتبقي</th><th>الأقساط</th><th>الحالة</th><th></th></tr></thead>
      <tbody>${(advs||[]).map(a => { const s = ST[a.status]||[a.status,'navy']; return `
        <tr><td dir="ltr" style="text-align:right">${esc(a.ref_no)}</td><td><b>${esc(a.employee_name)}</b><br><span style="font-size:.75rem;color:var(--muted)">${esc(a.reason||'')}</span></td>
        <td>${money(a.amount)}</td><td>${money(a.remaining)}</td>
        <td>${a.total_installments ? a.paid_installments + '/' + a.total_installments : '—'}</td>
        <td><span class="badge ${s[1]}">${s[0]}</span></td>
        <td class="row-actions">
          ${a.status==='pending' && can('advances.approve') ? `<button data-approve="${a.id}">اعتماد</button><button data-reject="${a.id}">رفض</button>` : ''}
          ${a.status==='approved' && (can('advances.manage')||can('advances.approve')) ? `<button data-disburse="${a.id}">صرف</button>` : ''}
          ${a.status==='disbursed' ? `<button data-insts="${a.id}">الأقساط</button>` : ''}
        </td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">لا توجد سلف بعد</td></tr>'}</tbody>
    </table></div>
    <div id="modal"></div>`, 'more');
  const canReq = can('advances.manage') || can('hr.manage');
  if(canReq) $('#addA').onclick = () => {
    $('#modal').innerHTML = `
    <div class="modal-bg"><div class="modal"><h3>طلب سلفة</h3><div id="mmsg"></div>
      <div class="field"><label>الموظف</label><select id="a_emp">${(emps||[]).map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></div>
      <div class="field"><label>المبلغ</label><input id="a_amount" type="number" min="0" step="0.01" dir="ltr"></div>
      <div class="field"><label>السبب</label><input id="a_reason"></div>
      <div class="field"><label>قسط السداد الشهري</label><input id="a_inst" type="number" min="0" step="0.01" dir="ltr"></div>
      <div class="field"><label>طريقة السداد</label><select id="a_method"><option value="salary_deduction">خصم من الراتب</option><option value="cash">نقدي</option></select></div>
      <button class="btn" id="saveA">إرسال الطلب</button>
      <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button></div></div>`;
    $('#closeModal').onclick = () => $('#modal').innerHTML = '';
    $('#saveA').onclick = async () => {
      const { error } = await sb.from('advances').insert({ employee_id: $('#a_emp').value, amount: Number($('#a_amount').value)||0,
        reason: $('#a_reason').value.trim(), installment_amount: Number($('#a_inst').value)||0,
        repayment_method: $('#a_method').value, created_by: session.user.id });
      if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
      $('#modal').innerHTML = ''; advancesView();
    };
  };
  document.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
    const { error } = await sb.from('advances').update({ status:'approved' }).eq('id', b.dataset.approve);
    if(error) $('#msg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; else advancesView();
  });
  document.querySelectorAll('[data-reject]').forEach(b => b.onclick = async () => {
    await sb.from('advances').update({ status:'rejected' }).eq('id', b.dataset.reject); advancesView();
  });
  document.querySelectorAll('[data-disburse]').forEach(b => b.onclick = () => {
    $('#modal').innerHTML = `
    <div class="modal-bg"><div class="modal"><h3>صرف السلفة</h3><div id="mmsg"></div>
      <div class="field"><label>خزينة الصرف</label><select id="d_box">${(boxes||[]).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
      <p style="font-size:.8rem;color:var(--muted)">قيد تلقائي: سلف الموظفين (مدين) / الخزينة (دائن)، ويُنشأ جدول الأقساط.</p>
      <button class="btn" id="doD">تأكيد الصرف</button>
      <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button></div></div>`;
    $('#closeModal').onclick = () => $('#modal').innerHTML = '';
    $('#doD').onclick = async () => {
      const { error } = await sb.from('advances').update({ status:'disbursed', cashbox_id: $('#d_box').value }).eq('id', b.dataset.disburse);
      if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
      $('#modal').innerHTML = ''; advancesView();
    };
  });
  document.querySelectorAll('[data-insts]').forEach(b => b.onclick = async () => {
    const { data: insts } = await sb.from('advance_installments').select('*').eq('advance_id', b.dataset.insts).order('due_date');
    $('#modal').innerHTML = `
    <div class="modal-bg"><div class="modal"><h3>جدول الأقساط</h3>
      <div class="tablewrap"><table><thead><tr><th>الاستحقاق</th><th>القسط</th><th>السداد</th><th></th></tr></thead>
      <tbody>${(insts||[]).map(i=>`<tr><td>${new Date(i.due_date).toLocaleDateString('ar-EG')}</td><td>${money(i.amount)}</td>
        <td>${i.paid_date ? new Date(i.paid_date).toLocaleDateString('ar-EG') : '—'}</td>
        <td>${!i.paid_date && (can('advances.manage')||can('hr.manage')) ? `<button data-pay="${i.id}">تسجيل سداد</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <button class="btn ghost" id="closeModal" style="margin-top:.6rem">إغلاق</button></div></div>`;
    $('#closeModal').onclick = () => $('#modal').innerHTML = '';
    document.querySelectorAll('[data-pay]').forEach(p => p.onclick = async () => {
      await sb.from('advance_installments').update({ paid_date: new Date().toISOString().slice(0,10) }).eq('id', p.dataset.pay);
      $('#modal').innerHTML = ''; advancesView();
    });
  });
}

/* ---------- PARTIES (phase 5) ---------- */
function partiesHome(){
  if(!can('parties.view') && !can('parties.manage'))
    return shell(`<div class="page-title">العملاء والموردون</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  const items = [
    ['parties/customers','العملاء','🤝','ملفات العملاء وأرصدتهم وكشوف الحساب'],
    ['parties/suppliers','الموردون','🏭','ملفات الموردين المحليين والأجانب وكشوف الحساب'],
  ];
  shell(`
    <div class="page-title">العملاء والموردون</div>
    <div class="cards">
      ${items.map(([h,t,i,d]) => `<a href="#${h}" class="card link-card"><div style="font-size:1.6rem">${i}</div><div class="k" style="font-size:1rem;color:var(--text)">${t}</div><div style="font-size:.78rem;color:var(--muted)">${d}</div></a>`).join('')}
    </div>`, 'more');
}

async function partyView(type){
  if(!can('parties.view') && !can('parties.manage')) return shell(`<div class="page-title">—</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  const isCust = type === 'customers';
  const title = isCust ? 'العملاء' : 'الموردون';
  shell(`<div class="page-title">${title}</div><div class="center"><span class="spin"></span></div>`, 'more');
  const [{ data: parties }, { data: sums }] = await Promise.all([
    sb.from(type).select('*').is('deleted_at', null).order('created_at', {ascending:false}),
    sb.from('v_party_summary').select('*').eq('party_type', isCust ? 'customer' : 'supplier'),
  ]);
  const byId = Object.fromEntries((sums||[]).map(s=>[s.party_id, s]));
  const rows = (parties||[]).map(p => { const s = byId[p.id] || {}; return `
    <tr><td><b>${esc(p.name)}</b><br><span style="color:var(--muted);font-size:.78rem" dir="ltr">${esc(p.code)}</span></td>
    <td>${esc(p.contact_person||'—')}<br><span style="color:var(--muted);font-size:.78rem" dir="ltr">${esc(p.phone||'')}</span></td>
    <td>${esc(p.country||'')}</td>
    <td class="${Number(s.balance||0) > 0 ? (isCust?'neg':'') : ''}">${money(s.balance||0)}</td>
    <td class="row-actions">
      <a href="#parties/statement/${isCust?'customer':'supplier'}/${p.id}"><button>كشف حساب</button></a>
      ${can('parties.manage') ? `<button data-edit="${p.id}">تعديل</button>` : ''}
    </td></tr>`; }).join('');
  shell(`
    <div class="page-title">${title}</div>
    <div class="toolbar">
      ${can('parties.manage') ? `<button class="btn" id="addP">+ ${isCust?'عميل':'مورد'} جديد</button>` : ''}
      <a class="btn ghost" href="#parties">← العملاء والموردون</a>
    </div>
    <div id="msg"></div>
    <div class="tablewrap"><table>
      <thead><tr><th>الاسم</th><th>المسؤول / الهاتف</th><th>الدولة</th><th>${isCust?'المستحق عليه':'المستحق له'}</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" class="empty">لا يوجد ${title} بعد</td></tr>`}</tbody>
    </table></div>
    <div id="modal"></div>`, 'more');
  if(can('parties.manage')){
    $('#addP').onclick = () => partyForm(type, null);
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => partyForm(type, (parties||[]).find(p=>p.id===b.dataset.edit)));
  }
}

function partyForm(type, p){
  const isCust = type === 'customers';
  $('#modal').innerHTML = `
  <div class="modal-bg"><div class="modal">
    <h3>${p ? 'تعديل' : 'إضافة'} ${isCust?'عميل':'مورد'}</h3><div id="mmsg"></div>
    <div class="field"><label>الاسم التجاري</label><input id="p_name" value="${esc(p?.name||'')}"></div>
    <div class="field"><label>الشخص المسؤول</label><input id="p_contact" value="${esc(p?.contact_person||'')}"></div>
    <div class="field"><label>الهاتف</label><input id="p_phone" dir="ltr" value="${esc(p?.phone||'')}"></div>
    <div class="field"><label>البريد الإلكتروني</label><input id="p_email" dir="ltr" value="${esc(p?.email||'')}"></div>
    <div class="field"><label>العنوان</label><input id="p_addr" value="${esc(p?.address||'')}"></div>
    <div class="field"><label>الرقم الضريبي</label><input id="p_tax" dir="ltr" value="${esc(p?.tax_number||'')}"></div>
    <div class="field"><label>الدولة</label><input id="p_country" value="${esc(p?.country||'EG')}"></div>
    ${!p ? `<div class="field"><label>رصيد افتتاحي (${isCust?'مستحق عليه':'مستحق له'})</label><input id="p_open" type="number" min="0" step="0.01" dir="ltr" value="0"></div>` : ''}
    <div class="field"><label>ملاحظات داخلية</label><input id="p_notes" value="${esc(p?.notes||'')}"></div>
    <button class="btn" id="saveP">حفظ</button>
    <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button>
  </div></div>`;
  $('#closeModal').onclick = () => $('#modal').innerHTML = '';
  $('#saveP').onclick = async () => {
    const body = { name: $('#p_name').value.trim(), contact_person: $('#p_contact').value.trim(),
      phone: $('#p_phone').value.trim(), email: $('#p_email').value.trim(), address: $('#p_addr').value.trim(),
      tax_number: $('#p_tax').value.trim(), country: $('#p_country').value.trim() || 'EG', notes: $('#p_notes').value.trim() };
    if(!body.name){ $('#mmsg').innerHTML = `<div class="msg err">أدخل الاسم.</div>`; return; }
    let error;
    if(p){ ({ error } = await sb.from(type).update(body).eq('id', p.id)); }
    else { ({ error } = await sb.from(type).insert({...body, opening_balance: Number($('#p_open').value)||0, created_by: session.user.id})); }
    if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
    $('#modal').innerHTML = ''; partyView(type);
  };
}

async function statementView(ptype, pid){
  if(!can('parties.view') && !can('parties.manage') && !can('accounting.view'))
    return shell(`<div class="page-title">كشف حساب</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  const isCust = ptype === 'customer';
  const table = isCust ? 'customers' : 'suppliers';
  shell(`<div class="page-title">كشف حساب</div><div class="center"><span class="spin"></span></div>`, 'more');
  const [{ data: p }, { data: lines }] = await Promise.all([
    sb.from(table).select('*').eq('id', pid).single(),
    sb.from('v_party_statement').select('*').eq('party_type', ptype).eq('party_id', pid).order('date'),
  ]);
  if(!p) return shell(`<div class="page-title">كشف حساب</div><div class="empty">الطرف غير موجود.</div>`, 'more');
  let run = 0;
  const DOC = { opening:'رصيد افتتاحي', sale:'فاتورة بيع', purchase:'فاتورة شراء', sale_return:'مرتجع بيع', purchase_return:'مرتجع شراء', receipt:'سند قبض', payment:'سند صرف' };
  const rows = (lines||[]).map(l => {
    run += Number(l.debit||0) - Number(l.credit||0);
    return `<tr><td>${new Date(l.date).toLocaleDateString('ar-EG')}</td><td>${DOC[l.doc_type]||l.doc_type}</td>
      <td dir="ltr" style="text-align:right">${esc(l.ref_no||'')}</td>
      <td>${l.debit ? fmt(l.debit) : ''}</td><td>${l.credit ? fmt(l.credit) : ''}</td>
      <td><b>${fmt(run)}</b></td></tr>`;
  }).join('');
  shell(`
    <div class="page-title">كشف حساب — ${esc(p.name)}</div>
    <div style="color:var(--muted);font-size:.85rem;margin-bottom:.8rem">${isCust?'عميل':'مورد'} · <span dir="ltr">${esc(p.code)}</span>${p.phone ? ' · <span dir="ltr">'+esc(p.phone)+'</span>' : ''}${p.country ? ' · '+esc(p.country) : ''}</div>
    <div class="cards" style="margin-bottom:1rem">
      <div class="card"><div class="k">إجمالي مدين</div><div class="v">${money((lines||[]).reduce((s,l)=>s+Number(l.debit||0),0))}</div></div>
      <div class="card"><div class="k">إجمالي دائن</div><div class="v">${money((lines||[]).reduce((s,l)=>s+Number(l.credit||0),0))}</div></div>
      <div class="card"><div class="k">الرصيد</div><div class="v ${run ? (isCust?'':'em') : 'em'}">${money(run)}</div></div>
    </div>
    <div class="toolbar"><a class="btn ghost" href="#parties/${table}">← ${isCust?'العملاء':'الموردون'}</a></div>
    <div class="tablewrap"><table>
      <thead><tr><th>التاريخ</th><th>المستند</th><th>المرجع</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">لا توجد حركات بعد — ستظهر الفواتير والسندات هنا تلقائياً</td></tr>'}</tbody>
    </table></div>`, 'more');
}

/* ---------- TRADE (phase 6) ---------- */
const INV_STATUS = { new:'جديد', under_review:'قيد المراجعة', approved:'معتمد', in_progress:'قيد التنفيذ', shipped:'تم الشحن', delivered:'تم التسليم', completed:'مكتمل', cancelled:'ملغي' };
const INV_NEXT = { new:'under_review', under_review:'approved', approved:'in_progress', in_progress:'shipped', shipped:'delivered', delivered:'completed' };

function tradeHome(){
  if(!can('sales.manage') && !can('purchases.manage'))
    return shell(`<div class="page-title">المبيعات والمشتريات</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  const items = [
    ['trade/sales','فواتير المبيعات','🧾','sales.manage','فواتير وأوامر بيع بهامش ربح'],
    ['trade/purchases','فواتير المشتريات','🛒','purchases.manage','فواتير وأوامر شراء'],
    ['trade/quotes','عروض الأسعار','📄','sales.manage','عروض أسعار للعملاء'],
    ['trade/supply','طلبات التوريد','📦','sales.manage','متابعة طلبات التوريد وحالاتها'],
  ].filter(([, , , p]) => can(p));
  shell(`
    <div class="page-title">التوريد والمبيعات والمشتريات</div>
    <div class="cards">
      ${items.map(([h,t,i,,d]) => `<a href="#${h}" class="card link-card"><div style="font-size:1.6rem">${i}</div><div class="k" style="font-size:1rem;color:var(--text)">${t}</div><div style="font-size:.78rem;color:var(--muted)">${d}</div></a>`).join('')}
    </div>`, 'more');
}

async function invoicesView(kind){
  const perm = (kind === 'purchase' || kind === 'purchase_return') ? 'purchases.manage' : 'sales.manage';
  if(!can(perm)) return shell(`<div class="page-title">الفواتير</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  const titles = { sale:'فواتير المبيعات', purchase:'فواتير المشتريات', quote:'عروض الأسعار' };
  const ptype = kind === 'purchase' ? 'supplier' : 'customer';
  shell(`<div class="page-title">${titles[kind]}</div><div class="center"><span class="spin"></span></div>`, 'more');
  const [{ data: invs }, { data: parties }] = await Promise.all([
    sb.from('invoices').select('*').eq('kind', kind).is('deleted_at', null).order('created_at', {ascending:false}).limit(100),
    sb.from(kind === 'purchase' ? 'suppliers' : 'customers').select('id,name').is('deleted_at', null),
  ]);
  const byId = Object.fromEntries((parties||[]).map(p=>[p.id, p.name]));
  const stBadge = s => `<span class="badge ${s==='completed'||s==='approved'?'green':s==='cancelled'?'red':'navy'}">${INV_STATUS[s]||s}</span>`;
  const rows = (invs||[]).map(i => `
    <tr><td dir="ltr" style="text-align:right"><a href="#trade/invoice/${i.id}" style="color:var(--emerald-d)">${esc(i.ref_no)}</a></td>
    <td>${new Date(i.date).toLocaleDateString('ar-EG')}</td>
    <td><b>${esc(byId[i.party_id]||'—')}</b></td>
    <td><b>${fmt(i.total)} ${esc(i.currency)}</b></td>
    <td>${fmt(i.paid||0)}</td>
    <td>${stBadge(i.status)}</td></tr>`).join('');
  shell(`
    <div class="page-title">${titles[kind]}</div>
    <div class="toolbar">
      <button class="btn" id="addI">+ ${titles[kind].replace('فواتير ','').replace('عروض ','عرض ')} جديد</button>
      <a class="btn ghost" href="#trade">← التوريد</a>
    </div>
    <div id="msg"></div>
    <div class="tablewrap"><table>
      <thead><tr><th>المرجع</th><th>التاريخ</th><th>${kind==='purchase'?'المورد':'العميل'}</th><th>الإجمالي</th><th>المدفوع</th><th>الحالة</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">لا توجد مستندات بعد</td></tr>'}</tbody>
    </table></div>`, 'more');
  $('#addI').onclick = () => invoiceForm(kind, ptype, parties||[]);
}

function invoiceForm(kind, ptype, parties){
  if(!parties.length){ $('#msg').innerHTML = `<div class="msg err">أضف ${kind==='purchase'?'مورداً':'عميلاً'} أولاً من قسم العملاء والموردين.</div>`; return; }
  const lineRow = () => `<div class="jline iline">
    <input class="il_desc" placeholder="الصنف / البيان" style="grid-column: span 1">
    <input class="il_qty" type="number" min="0" step="0.01" placeholder="الكمية" dir="ltr">
    <input class="il_price" type="number" min="0" step="0.01" placeholder="السعر" dir="ltr">
  </div>`;
  $('#msg').insertAdjacentHTML('afterend', `
  <div class="modal-bg" id="invModal"><div class="modal">
    <h3>${kind==='quote'?'عرض سعر':kind==='sale'?'فاتورة بيع':'فاتورة شراء'} جديد</h3><div id="mmsg"></div>
    <div class="field"><label>${kind==='purchase'?'المورد':'العميل'}</label><select id="i_party">${parties.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
    <div class="field"><label>التاريخ</label><input id="i_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="field"><label>العملة</label><select id="i_curr"><option>EGP</option><option>USD</option><option>EUR</option><option>SAR</option></select></div>
    <div class="field"><label>سعر الصرف</label><input id="i_fx" type="number" min="0" step="0.0001" value="1" dir="ltr"></div>
    <label>البنود</label>
    <div id="ilines">${lineRow()}${lineRow()}</div>
    <button class="btn ghost" id="moreIL" style="margin:.4rem 0">+ بند</button>
    <div class="field"><label>خصم على الإجمالي</label><input id="i_disc" type="number" min="0" step="0.01" value="0" dir="ltr"></div>
    <div class="field"><label>مصاريف شحن/نقل</label><input id="i_ship" type="number" min="0" step="0.01" value="0" dir="ltr"></div>
    <div class="field"><label>ملاحظات</label><input id="i_notes"></div>
    <button class="btn" id="saveI">حفظ</button>
    <button class="btn ghost" id="closeIM" style="margin-top:.4rem">إلغاء</button>
  </div></div>`);
  $('#closeIM').onclick = () => $('#invModal').remove();
  $('#moreIL').onclick = () => $('#ilines').insertAdjacentHTML('beforeend', lineRow());
  $('#i_curr').onchange = async () => {
    const code = $('#i_curr').value;
    if(code==='EGP'){ $('#i_fx').value = 1; return; }
    const { data } = await sb.from('fx_rates').select('*').eq('currency', code).order('date', {ascending:false}).limit(1);
    if(data && data.length) $('#i_fx').value = data[0].rate;
  };
  $('#saveI').onclick = async () => {
    const { data: inv, error } = await sb.from('invoices').insert({
      kind, party_type: ptype, party_id: $('#i_party').value, date: $('#i_date').value,
      currency: $('#i_curr').value, fx_rate: Number($('#i_fx').value) || 1,
      discount: Number($('#i_disc').value) || 0, shipping_cost: Number($('#i_ship').value) || 0,
      notes: $('#i_notes').value.trim(), status: 'new', created_by: session.user.id }).select().single();
    if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
    const lines = [...document.querySelectorAll('.iline')].map(el => ({
      invoice_id: inv.id, description: el.querySelector('.il_desc').value.trim(),
      qty: Number(el.querySelector('.il_qty').value) || 0, unit_price: Number(el.querySelector('.il_price').value) || 0 }))
      .filter(l => l.qty > 0);
    if(lines.length){ const { error: e2 } = await sb.from('invoice_lines').insert(lines);
      if(e2){ $('#mmsg').innerHTML = `<div class="msg err">${esc(e2.message)}</div>`; return; } }
    $('#invModal').remove(); invoicesView(kind);
  };
}

async function invoiceDetail(id){
  shell(`<div class="page-title">فاتورة</div><div class="center"><span class="spin"></span></div>`, 'more');
  const [{ data: inv }, { data: lines }, { data: pays }, { data: margin }] = await Promise.all([
    sb.from('invoices').select('*').eq('id', id).single(),
    sb.from('invoice_lines').select('*').eq('invoice_id', id),
    sb.from('payments').select('*, cashboxes(name)').eq('invoice_id', id).is('deleted_at', null),
    sb.from('v_sales_margin').select('*').eq('invoice_id', id).maybeSingle(),
  ]);
  if(!inv) return shell(`<div class="page-title">فاتورة</div><div class="empty">غير موجودة.</div>`, 'more');
  const { data: party } = await sb.from(inv.party_type === 'supplier' ? 'suppliers' : 'customers').select('name,phone,address,tax_number').eq('id', inv.party_id).single();
  const perm = inv.party_type === 'supplier' ? 'purchases.manage' : 'sales.manage';
  const next = INV_NEXT[inv.status];
  const remain = Number(inv.total) - Number(inv.paid||0);
  const kindTitle = { sale:'فاتورة بيع', purchase:'فاتورة شراء', quote:'عرض سعر', sale_return:'مرتجع بيع', purchase_return:'مرتجع شراء' }[inv.kind];
  shell(`
    <div class="page-title">${kindTitle} <span dir="ltr">${esc(inv.ref_no)}</span></div>
    <div style="color:var(--muted);font-size:.85rem;margin-bottom:.8rem">${esc(party?.name||'')} · ${new Date(inv.date).toLocaleDateString('ar-EG')} · <span class="badge ${inv.status==='cancelled'?'red':'navy'}">${INV_STATUS[inv.status]}</span></div>
    <div class="toolbar">
      ${next && can(perm) ? `<button class="btn" id="nextSt">→ ${INV_STATUS[next]}</button>` : ''}
      ${inv.status!=='cancelled' && inv.status!=='completed' && can(perm) ? '<button class="btn ghost" id="cancelI">إلغاء المستند</button>' : ''}
      ${(inv.kind==='sale'||inv.kind==='purchase') && remain > 0 && can('treasury.manage') ? '<button class="btn" id="payI">تسجيل دفعة</button>' : ''}
      <button class="btn ghost" onclick="window.print()">🖨️ طباعة / PDF</button>
      <a class="btn ghost" href="#trade/${inv.kind==='quote'?'quotes':inv.kind==='sale'?'sales':'purchases'}">← رجوع</a>
    </div>
    <div id="msg"></div>
    <div class="card">
      <div class="tablewrap"><table>
        <thead><tr><th>البيان</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>${(lines||[]).map(l=>`<tr><td>${esc(l.description||'')}</td><td>${fmt(l.qty)}</td><td>${fmt(l.unit_price)}</td><td>${fmt(l.total)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div style="margin-top:.6rem;font-size:.9rem">
        الإجمالي الفرعي: <b>${fmt(inv.subtotal)}</b> · ضريبة: ${fmt(inv.tax)} · خصم: ${fmt(inv.discount)} · شحن: ${fmt(inv.shipping_cost)}
        <br>الإجمالي: <b style="color:var(--emerald-d)">${fmt(inv.total)} ${esc(inv.currency)}</b> · المدفوع: ${fmt(inv.paid||0)} · المتبقي: <b>${fmt(remain)}</b>
        ${margin && margin.cost > 0 ? `<br>هامش الربح: <b class="em">${money(margin.margin)}</b>` : ''}
      </div>
    </div>
    ${(pays||[]).length ? `<div class="card" style="margin-top:1rem"><div class="k">الدفعات</div>
      <div class="tablewrap" style="margin-top:.5rem"><table><thead><tr><th>المرجع</th><th>التاريخ</th><th>المبلغ</th><th>الخزينة</th></tr></thead>
      <tbody>${pays.map(p=>`<tr><td dir="ltr" style="text-align:right">${esc(p.ref_no)}</td><td>${new Date(p.date).toLocaleDateString('ar-EG')}</td><td>${fmt(p.amount)}</td><td>${esc(p.cashboxes?.name||'')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div id="modal"></div>`, 'more');
  if(next && can(perm)) $('#nextSt').onclick = async () => {
    const { error } = await sb.from('invoices').update({ status: next }).eq('id', id);
    if(error) $('#msg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; else invoiceDetail(id);
  };
  const cBtn = $('#cancelI'); if(cBtn) cBtn.onclick = async () => {
    await sb.from('invoices').update({ status: 'cancelled' }).eq('id', id); invoiceDetail(id);
  };
  const pBtn = $('#payI'); if(pBtn) pBtn.onclick = async () => {
    const { data: boxes } = await sb.from('cashboxes').select('*').eq('is_active', true).is('deleted_at', null);
    if(!boxes || !boxes.length){ $('#msg').innerHTML = `<div class="msg err">أضف خزينة أولاً.</div>`; return; }
    $('#modal').innerHTML = `
    <div class="modal-bg"><div class="modal"><h3>تسجيل دفعة — المتبقي ${fmt(remain)}</h3><div id="mmsg"></div>
      <div class="field"><label>المبلغ (${esc(inv.currency)})</label><input id="p_amount" type="number" min="0" step="0.01" dir="ltr" value="${remain}"></div>
      <div class="field"><label>الخزينة</label><select id="p_box">${boxes.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
      <button class="btn" id="doPay">حفظ الدفعة</button>
      <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button></div></div>`;
    $('#closeModal').onclick = () => $('#modal').innerHTML = '';
    $('#doPay').onclick = async () => {
      const { error } = await sb.from('payments').insert({
        kind: inv.kind==='sale' ? 'receipt' : 'payment', amount: Number($('#p_amount').value)||0,
        currency: inv.currency, fx_rate: inv.fx_rate, cashbox_id: $('#p_box').value,
        party_type: inv.party_type, party_id: inv.party_id, invoice_id: inv.id,
        notes: 'دفعة ' + inv.ref_no, created_by: session.user.id });
      if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
      $('#modal').innerHTML = ''; invoiceDetail(id);
    };
  };
}

async function supplyView(){
  if(!can('sales.manage') && !can('purchases.manage')) return shell(`<div class="page-title">التوريد</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  shell(`<div class="page-title">طلبات التوريد</div><div class="center"><span class="spin"></span></div>`, 'more');
  const [{ data: srs }, { data: custs }, { data: sups }] = await Promise.all([
    sb.from('supply_requests').select('*').is('deleted_at', null).order('created_at', {ascending:false}).limit(100),
    sb.from('customers').select('id,name').is('deleted_at', null),
    sb.from('suppliers').select('id,name').is('deleted_at', null),
  ]);
  const names = { customer: Object.fromEntries((custs||[]).map(p=>[p.id,p.name])), supplier: Object.fromEntries((sups||[]).map(p=>[p.id,p.name])) };
  shell(`
    <div class="page-title">طلبات التوريد</div>
    <div class="toolbar"><button class="btn" id="addS">+ طلب توريد</button><a class="btn ghost" href="#trade">← التوريد</a></div>
    <div id="msg"></div>
    <div class="tablewrap"><table>
      <thead><tr><th>المرجع</th><th>العنوان</th><th>الطرف</th><th>التسليم المتوقع</th><th>الحالة</th><th></th></tr></thead>
      <tbody>${(srs||[]).map(s => `<tr><td dir="ltr" style="text-align:right">${esc(s.ref_no)}</td><td><b>${esc(s.title)}</b></td>
        <td>${esc((names[s.party_type]||{})[s.party_id]||'—')}</td>
        <td>${s.expected_date ? new Date(s.expected_date).toLocaleDateString('ar-EG') : '—'}</td>
        <td><span class="badge navy">${INV_STATUS[s.status]||s.status}</span></td>
        <td class="row-actions">${INV_NEXT[s.status] ? `<button data-next="${s.id}" data-to="${INV_NEXT[s.status]}">→ ${INV_STATUS[INV_NEXT[s.status]]}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">لا توجد طلبات توريد</td></tr>'}</tbody>
    </table></div>
    <div id="modal"></div>`, 'more');
  $('#addS').onclick = () => {
    $('#modal').innerHTML = `
    <div class="modal-bg"><div class="modal"><h3>طلب توريد جديد</h3><div id="mmsg"></div>
      <div class="field"><label>العنوان</label><input id="s_title"></div>
      <div class="field"><label>الطرف</label><select id="s_ptype"><option value="customer">عميل</option><option value="supplier">مورد</option></select></div>
      <div class="field"><label>الاسم</label><select id="s_pid"></select></div>
      <div class="field"><label>تاريخ التسليم المتوقع</label><input id="s_date" type="date"></div>
      <div class="field"><label>ملاحظات</label><input id="s_notes"></div>
      <button class="btn" id="saveS">حفظ</button>
      <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button></div></div>`;
    const fillPid = () => { const t = $('#s_ptype').value; $('#s_pid').innerHTML = (t==='customer'?custs||[]:sups||[]).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join(''); };
    fillPid(); $('#s_ptype').onchange = fillPid;
    $('#closeModal').onclick = () => $('#modal').innerHTML = '';
    $('#saveS').onclick = async () => {
      const { error } = await sb.from('supply_requests').insert({ title: $('#s_title').value.trim(), party_type: $('#s_ptype').value,
        party_id: $('#s_pid').value || null, expected_date: $('#s_date').value || null, notes: $('#s_notes').value.trim(), created_by: session.user.id });
      if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
      $('#modal').innerHTML = ''; supplyView();
    };
  };
  document.querySelectorAll('[data-next]').forEach(b => b.onclick = async () => {
    const upd = { status: b.dataset.to };
    if(b.dataset.to === 'approved'){ upd.approved_by = session.user.id; upd.approved_at = new Date().toISOString(); }
    await sb.from('supply_requests').update(upd).eq('id', b.dataset.next); supplyView();
  });
}

/* ---------- INVENTORY (phase 7) ---------- */
function invHome(){
  if(!can('inventory.view') && !can('inventory.manage'))
    return shell(`<div class="page-title">المخازن</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  const items = [
    ['inv/stock','المخزون الحالي','📊','inventory.view','الأرصدة والقيمة لكل مخزن'],
    ['inv/products','الأصناف','📦','inventory.view','المنتجات والباركود والأسعار'],
    ['inv/moves','حركات المخزون','🔄','inventory.view','دخول وخروج وتحويل وجرد وتالف'],
    ['inv/warehouses','المخازن','🏬','inventory.view','إدارة المخازن'],
  ].filter(([, , , p]) => can(p) || can('inventory.manage'));
  shell(`
    <div class="page-title">المخازن والمخزون</div>
    <div class="cards">
      ${items.map(([h,t,i,,d]) => `<a href="#${h}" class="card link-card"><div style="font-size:1.6rem">${i}</div><div class="k" style="font-size:1rem;color:var(--text)">${t}</div><div style="font-size:.78rem;color:var(--muted)">${d}</div></a>`).join('')}
    </div>`, 'more');
}

async function warehousesView(){
  if(!can('inventory.view') && !can('inventory.manage')) return shell(`<div class="page-title">المخازن</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  shell(`<div class="page-title">المخازن</div><div class="center"><span class="spin"></span></div>`, 'more');
  const [{ data: whs }, { data: vals }] = await Promise.all([
    sb.from('warehouses').select('*').is('deleted_at', null).order('name'),
    sb.from('v_stock_value').select('*'),
  ]);
  const byId = Object.fromEntries((vals||[]).map(v=>[v.warehouse_id, v]));
  shell(`
    <div class="page-title">المخازن</div>
    <div class="toolbar">
      ${can('inventory.manage') ? '<button class="btn" id="addW">+ مخزن جديد</button>' : ''}
      <a class="btn ghost" href="#inv">← المخازن والمخزون</a>
    </div>
    <div id="msg"></div>
    <div class="cards">${(whs||[]).map(w=>{ const v = byId[w.id]||{}; return `
      <div class="card"><div class="k">${esc(w.name)}</div>
      <div style="font-size:.85rem;color:var(--muted)">أصناف: ${fmt(v.total_qty||0)} · القيمة: <b class="em">${money(v.value||0)}</b></div></div>`; }).join('') || ''}</div>
    ${!(whs||[]).length ? '<div class="empty">لا توجد مخازن بعد</div>' : ''}
    <div id="modal"></div>`, 'more');
  if(can('inventory.manage')) $('#addW').onclick = () => {
    $('#modal').innerHTML = `
    <div class="modal-bg"><div class="modal"><h3>مخزن جديد</h3><div id="mmsg"></div>
      <div class="field"><label>الاسم</label><input id="w_name" placeholder="مثال: المخزن الرئيسي"></div>
      <button class="btn" id="saveW">حفظ</button>
      <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button></div></div>`;
    $('#closeModal').onclick = () => $('#modal').innerHTML = '';
    $('#saveW').onclick = async () => {
      const { error } = await sb.from('warehouses').insert({ name: $('#w_name').value.trim(), created_by: session.user.id });
      if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
      $('#modal').innerHTML = ''; warehousesView();
    };
  };
}

async function productsView(){
  if(!can('inventory.view') && !can('inventory.manage')) return shell(`<div class="page-title">الأصناف</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  shell(`<div class="page-title">الأصناف</div><div class="center"><span class="spin"></span></div>`, 'more');
  const { data: prods } = await sb.from('products').select('*').is('deleted_at', null).order('created_at', {ascending:false});
  const { data: inv } = await sb.from('v_inventory').select('*');
  const onHand = {};
  (inv||[]).forEach(r => { onHand[r.product_id] = (onHand[r.product_id]||0) + Number(r.on_hand||0); });
  const rows = (prods||[]).map(p => {
    const qty = onHand[p.id]||0;
    const low = p.min_stock > 0 && qty <= p.min_stock;
    return `<tr><td><b>${esc(p.name)}</b><br><span style="color:var(--muted);font-size:.78rem" dir="ltr">${esc(p.sku)}${p.barcode?' · '+esc(p.barcode):''}</span></td>
    <td>${esc(p.category||'—')}</td>
    <td class="${low?'neg':''}">${fmt(qty)} ${esc(p.unit)}${low?' ⚠️':''}</td>
    <td>${fmt(p.purchase_cost)}</td><td>${fmt(p.sale_price)}</td>
    <td class="row-actions">${can('inventory.manage')?`<button data-edit="${p.id}">تعديل</button>`:''}</td></tr>`;
  }).join('');
  shell(`
    <div class="page-title">الأصناف</div>
    <div class="toolbar">
      ${can('inventory.manage') ? '<button class="btn" id="addPr">+ صنف جديد</button>' : ''}
      <a class="btn ghost" href="#inv">← المخازن والمخزون</a>
    </div>
    <div id="msg"></div>
    <div class="tablewrap"><table>
      <thead><tr><th>الصنف</th><th>الفئة</th><th>المتاح</th><th>تكلفة الشراء</th><th>سعر البيع</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">لا توجد أصناف بعد</td></tr>'}</tbody>
    </table></div>
    <div id="modal"></div>`, 'more');
  if(can('inventory.manage')){
    $('#addPr').onclick = () => prodForm(null);
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => prodForm((prods||[]).find(p=>p.id===b.dataset.edit)));
  }
}

function prodForm(p){
  $('#modal').innerHTML = `
  <div class="modal-bg"><div class="modal"><h3>${p?'تعديل صنف':'صنف جديد'}</h3><div id="mmsg"></div>
    <div class="field"><label>الاسم</label><input id="pr_name" value="${esc(p?.name||'')}"></div>
    <div class="field"><label>SKU</label><input id="pr_sku" dir="ltr" value="${esc(p?.sku||'')}" placeholder="يُنشأ تلقائياً إذا تُرك فارغاً"></div>
    <div class="field"><label>الباركود</label><input id="pr_bar" dir="ltr" value="${esc(p?.barcode||'')}"></div>
    <div class="field"><label>الفئة</label><input id="pr_cat" value="${esc(p?.category||'')}"></div>
    <div class="field"><label>وحدة القياس</label><input id="pr_unit" value="${esc(p?.unit||'قطعة')}"></div>
    <div class="field"><label>الحد الأدنى (تنبيه)</label><input id="pr_min" type="number" min="0" step="0.01" dir="ltr" value="${p?.min_stock||0}"></div>
    <div class="field"><label>تكلفة الشراء</label><input id="pr_cost" type="number" min="0" step="0.01" dir="ltr" value="${p?.purchase_cost||0}"></div>
    <div class="field"><label>سعر البيع</label><input id="pr_price" type="number" min="0" step="0.01" dir="ltr" value="${p?.sale_price||0}"></div>
    <button class="btn" id="savePr">حفظ</button>
    <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button></div></div>`;
  $('#closeModal').onclick = () => $('#modal').innerHTML = '';
  $('#savePr').onclick = async () => {
    const body = { name: $('#pr_name').value.trim(), barcode: $('#pr_bar').value.trim() || null,
      category: $('#pr_cat').value.trim() || null, unit: $('#pr_unit').value.trim() || 'قطعة',
      min_stock: Number($('#pr_min').value)||0, purchase_cost: Number($('#pr_cost').value)||0, sale_price: Number($('#pr_price').value)||0 };
    let error;
    if(p){ ({ error } = await sb.from('products').update(body).eq('id', p.id)); }
    else {
      body.sku = $('#pr_sku').value.trim() || ('SKU-' + Date.now().toString(36).toUpperCase());
      ({ error } = await sb.from('products').insert({...body, created_by: session.user.id}));
    }
    if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
    $('#modal').innerHTML = ''; productsView();
  };
}

async function stockView(){
  if(!can('inventory.view') && !can('inventory.manage')) return shell(`<div class="page-title">المخزون</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  shell(`<div class="page-title">المخزون الحالي</div><div class="center"><span class="spin"></span></div>`, 'more');
  const { data } = await sb.from('v_inventory').select('*').order('name');
  const rows = (data||[]).filter(r=>Number(r.on_hand)!==0).map(r => {
    const low = r.min_stock > 0 && Number(r.on_hand) <= Number(r.min_stock);
    return `<tr><td><b>${esc(r.name)}</b><br><span style="color:var(--muted);font-size:.75rem" dir="ltr">${esc(r.sku)}</span></td>
    <td>${esc(r.warehouse_name)}</td>
    <td class="${low?'neg':''}">${fmt(r.on_hand)} ${esc(r.unit)}${low?' ⚠️':''}</td>
    <td>${money(Number(r.on_hand)*Number(r.purchase_cost))}</td></tr>`;
  }).join('');
  const totalVal = (data||[]).reduce((s,r)=>s+Number(r.on_hand)*Number(r.purchase_cost),0);
  shell(`
    <div class="page-title">المخزون الحالي</div>
    <div class="toolbar"><a class="btn ghost" href="#inv">← المخازن والمخزون</a></div>
    <div class="cards" style="margin-bottom:1rem"><div class="card"><div class="k">إجمالي قيمة المخزون (بالتكلفة)</div><div class="v em">${money(totalVal)}</div></div></div>
    <div class="tablewrap"><table>
      <thead><tr><th>الصنف</th><th>المخزن</th><th>الرصيد</th><th>القيمة</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="empty">لا يوجد مخزون بعد — تُسجَّل الأرصدة تلقائياً من فواتير الشراء والبيع وحركات المخزون</td></tr>'}</tbody>
    </table></div>`, 'more');
}

async function movesView(){
  if(!can('inventory.manage')) return shell(`<div class="page-title">حركات المخزون</div><div class="empty">لا تملك صلاحية إدارة المخازن.</div>`, 'more');
  shell(`<div class="page-title">حركات المخزون</div><div class="center"><span class="spin"></span></div>`, 'more');
  const [{ data: moves }, { data: prods }, { data: whs }] = await Promise.all([
    sb.from('stock_moves').select('*, products(name,sku,unit), warehouses(name)').is('deleted_at', null).order('created_at', {ascending:false}).limit(100),
    sb.from('products').select('id,name,unit').is('deleted_at', null),
    sb.from('warehouses').select('*').is('deleted_at', null),
  ]);
  const KINDS = { in:['دخول','green'], out:['خروج','red'], transfer_out:['تحويل خارج','navy'], transfer_in:['تحويل داخل','navy'], adjust:['تسوية جرد','navy'], waste:['تالف','red'], return_in:['مرتجع داخل','green'], return_out:['مرتجع خارج','red'] };
  const rows = (moves||[]).map(m => { const k = KINDS[m.kind]||[m.kind,'navy']; return `
    <tr><td>${new Date(m.date).toLocaleDateString('ar-EG')}</td>
    <td><span class="badge ${k[1]}">${k[0]}</span></td>
    <td><b>${esc(m.products?.name||'')}</b></td>
    <td>${esc(m.warehouses?.name||'')}</td>
    <td>${fmt(Math.abs(m.qty))} ${esc(m.products?.unit||'')}</td>
    <td style="font-size:.78rem;color:var(--muted)">${esc(m.notes||'')}</td></tr>`; }).join('');
  shell(`
    <div class="page-title">حركات المخزون</div>
    <div class="toolbar">
      <button class="btn" id="addM">+ حركة يدوية</button>
      ${(whs||[]).length > 1 ? '<button class="btn ghost" id="addT">تحويل بين المخازن</button>' : ''}
      <a class="btn ghost" href="#inv">← المخازن والمخزون</a>
    </div>
    <div id="msg"></div>
    <div class="tablewrap"><table>
      <thead><tr><th>التاريخ</th><th>النوع</th><th>الصنف</th><th>المخزن</th><th>الكمية</th><th>ملاحظات</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">لا توجد حركات بعد</td></tr>'}</tbody>
    </table></div>
    <div id="modal"></div>`, 'more');
  const guard = () => {
    if(!(prods||[]).length){ $('#msg').innerHTML = `<div class="msg err">أضف أصنافاً أولاً.</div>`; return false; }
    if(!(whs||[]).length){ $('#msg').innerHTML = `<div class="msg err">أضف مخزناً أولاً.</div>`; return false; }
    return true;
  };
  $('#addM').onclick = () => {
    if(!guard()) return;
    $('#modal').innerHTML = `
    <div class="modal-bg"><div class="modal"><h3>حركة مخزون يدوية</h3><div id="mmsg"></div>
      <div class="field"><label>النوع</label><select id="m_kind"><option value="in">دخول</option><option value="out">خروج</option><option value="adjust">تسوية جرد (+/-)</option><option value="waste">تالف</option></select></div>
      <div class="field"><label>الصنف</label><select id="m_prod">${prods.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>المخزن</label><select id="m_wh">${whs.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div>
      <div class="field"><label>الكمية</label><input id="m_qty" type="number" step="0.01" dir="ltr"></div>
      <div class="field"><label>تكلفة الوحدة (للدخول)</label><input id="m_cost" type="number" min="0" step="0.01" dir="ltr" value="0"></div>
      <div class="field"><label>ملاحظات</label><input id="m_notes"></div>
      <button class="btn" id="saveM">حفظ</button>
      <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button></div></div>`;
    $('#closeModal').onclick = () => $('#modal').innerHTML = '';
    $('#saveM').onclick = async () => {
      const { error } = await sb.from('stock_moves').insert({
        kind: $('#m_kind').value, product_id: $('#m_prod').value, warehouse_id: $('#m_wh').value,
        qty: Number($('#m_qty').value)||0, unit_cost: Number($('#m_cost').value)||0,
        notes: $('#m_notes').value.trim(), created_by: session.user.id });
      if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
      $('#modal').innerHTML = ''; movesView();
    };
  };
  const tBtn = $('#addT'); if(tBtn) tBtn.onclick = () => {
    if(!guard()) return;
    const tid = crypto.randomUUID();
    $('#modal').innerHTML = `
    <div class="modal-bg"><div class="modal"><h3>تحويل بين المخازن</h3><div id="mmsg"></div>
      <div class="field"><label>الصنف</label><select id="t_prod">${prods.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>من مخزن</label><select id="t_from">${whs.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div>
      <div class="field"><label>إلى مخزن</label><select id="t_to">${whs.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div>
      <div class="field"><label>الكمية</label><input id="t_qty" type="number" min="0" step="0.01" dir="ltr"></div>
      <button class="btn" id="saveT">تنفيذ التحويل</button>
      <button class="btn ghost" id="closeModal" style="margin-top:.4rem">إلغاء</button></div></div>`;
    $('#closeModal').onclick = () => $('#modal').innerHTML = '';
    $('#saveT').onclick = async () => {
      if($('#t_from').value === $('#t_to').value){ $('#mmsg').innerHTML = `<div class="msg err">اختر مخزنين مختلفين.</div>`; return; }
      const qty = Number($('#t_qty').value)||0;
      const { error } = await sb.from('stock_moves').insert([
        { kind:'transfer_out', product_id: $('#t_prod').value, warehouse_id: $('#t_from').value, qty, transfer_id: tid, notes:'تحويل', created_by: session.user.id },
        { kind:'transfer_in', product_id: $('#t_prod').value, warehouse_id: $('#t_to').value, qty, transfer_id: tid, notes:'تحويل', created_by: session.user.id },
      ]);
      if(error){ $('#mmsg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
      $('#modal').innerHTML = ''; movesView();
    };
  };
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

/* ---------- IMPORT / EXPORT (phase 8) ---------- */
const SHIP_STATUS = { new:'جديدة', in_transit:'قيد الشحن', customs:'في الجمارك', arrived:'وصلت', cleared:'تم التخليص', completed:'مكتملة', cancelled:'ملغاة' };
const SHIP_FLOW = ['new','in_transit','customs','arrived','cleared'];
const INCOTERMS = ['EXW','FOB','CFR','CIF','DAP','DDP','FAS','FCA','CPT','CIP','DPU'];

function shipHome(){
  if(!can('trade.view') && !can('trade.manage'))
    return shell(`<div class="page-title">الاستيراد والتصدير</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  shell(`<div class="page-title">الاستيراد والتصدير</div><div class="center"><span class="spin"></span></div>`, 'more');
  sb.from('v_shipments_delayed').select('*').then(({ data: delayed }) => {
    shell(`
      <div class="page-title">الاستيراد والتصدير</div>
      ${(delayed||[]).length ? `<div class="msg err">⚠️ ${(delayed||[]).length} شحنة متأخرة عن موعد الوصول المتوقع</div>` : ''}
      <div class="cards">
        <a href="#ship/list" class="card link-card"><div style="font-size:1.6rem">🚢</div><div class="k" style="font-size:1rem;color:var(--text)">الشحنات</div><div style="font-size:.78rem;color:var(--muted)">تسجيل ومتابعة الشحنات الدولية</div></a>
        <a href="#ship/new" class="card link-card"><div style="font-size:1.6rem">➕</div><div class="k" style="font-size:1rem;color:var(--text)">شحنة جديدة</div><div style="font-size:.78rem;color:var(--muted)">استيراد أو تصدير</div></a>
      </div>
      <div class="toolbar"><a class="btn ghost" href="#more">← المزيد</a></div>`, 'more');
  });
}

async function shipmentsView(){
  if(!can('trade.view') && !can('trade.manage'))
    return shell(`<div class="page-title">الشحنات</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  shell(`<div class="page-title">الشحنات</div><div class="center"><span class="spin"></span></div>`, 'more');
  const { data: sh } = await sb.from('v_shipment_summary').select('*').order('created_at', {ascending:false});
  shell(`
    <div class="page-title">الشحنات</div>
    <div class="toolbar">
      ${can('trade.manage') ? '<a class="btn" href="#ship/new">+ شحنة جديدة</a>' : ''}
      <a class="btn ghost" href="#ship">← الاستيراد والتصدير</a>
    </div>
    <div class="cards">${(sh||[]).map(s => `
      <a href="#ship/id/${s.id}" class="card link-card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <b>${esc(s.ref_no)}</b>
          <span class="badge ${s.status==='completed'?'emerald':'navy'}">${esc(SHIP_STATUS[s.status]||s.status)}</span>
        </div>
        <div style="font-size:.82rem;color:var(--muted);margin-top:.3rem">
          ${s.kind==='import'?'استيراد 📥':'تصدير 📤'} · ${esc(s.origin_country||'')} → ${esc(s.dest_country||'')}
          ${s.is_delayed ? ' · <b class="neg">متأخرة ⚠️</b>' : ''}
        </div>
        <div style="font-size:.82rem;margin-top:.2rem">
          ${esc(s.foreign_party||'')} ${s.container_no?('· <span dir="ltr">'+esc(s.container_no)+'</span>'):''}
        </div>
        <div style="font-size:.85rem;margin-top:.3rem">الإجمالي: <b class="em">${fmt(s.grand_total)} ${esc(s.currency)}</b> <span style="color:var(--muted)">(${money(s.grand_total_base)})</span></div>
        ${s.eta ? `<div style="font-size:.75rem;color:var(--muted)">الوصول المتوقع: ${esc(s.eta)}</div>` : ''}
      </a>`).join('') || '<div class="empty">لا توجد شحنات بعد</div>'}
    </div>`, 'more');
}

async function shipForm(s){
  if(!can('trade.manage')) return shell(`<div class="page-title">شحنة</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  const { data: sups } = await sb.from('suppliers').select('id,name').is('deleted_at', null).order('name');
  shell(`
    <div class="page-title">${s ? 'تعديل شحنة ' + esc(s.ref_no) : 'شحنة جديدة'}</div>
    <div id="msg"></div>
    <div class="card">
      <div class="field"><label>النوع</label><select id="sh_kind">
        <option value="import" ${s?.kind==='import'?'selected':''}>استيراد</option>
        <option value="export" ${s?.kind==='export'?'selected':''}>تصدير</option></select></div>
      <div class="field"><label>بلد المنشأ</label><input id="sh_origin" value="${esc(s?.origin_country||'')}"></div>
      <div class="field"><label>بلد الوصول</label><input id="sh_dest" value="${esc(s?.dest_country||'')}"></div>
      <div class="field"><label>المورد الأجنبي / العميل المستورد</label><input id="sh_party" value="${esc(s?.foreign_party||'')}"></div>
      <div class="field"><label>ربط بمورد مسجل (اختياري)</label><select id="sh_sup"><option value="">—</option>
        ${(sups||[]).map(p=>`<option value="${p.id}" ${s?.supplier_id===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>رقم الحاوية / الشحنة</label><input id="sh_cont" dir="ltr" value="${esc(s?.container_no||'')}"></div>
      <div class="field"><label>شركة الشحن</label><input id="sh_co" value="${esc(s?.shipping_company||'')}"></div>
      <div class="field"><label>تاريخ الشحن</label><input id="sh_date" type="date" dir="ltr" value="${esc(s?.ship_date||'')}"></div>
      <div class="field"><label>الوصول المتوقع (ETA)</label><input id="sh_eta" type="date" dir="ltr" value="${esc(s?.eta||'')}"></div>
      <div class="field"><label>تاريخ الوصول الفعلي</label><input id="sh_arr" type="date" dir="ltr" value="${esc(s?.arrived_at ? String(s.arrived_at).slice(0,10) : '')}"></div>
      <div class="field"><label>شرط التسليم (Incoterms)</label><select id="sh_inc">
        ${INCOTERMS.map(i=>`<option ${s?.incoterm===i?'selected':''}>${i}</option>`).join('')}</select></div>
      <div class="field"><label>العملة</label><select id="sh_cur">
        ${['USD','EUR','SAR','EGP'].map(c=>`<option ${s?.currency===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>سعر الصرف (للجنيه)</label><input id="sh_fx" type="number" min="0" step="0.0001" dir="ltr" value="${s?.fx_rate||''}" placeholder="مثال: 50"></div>
      <div class="field"><label>الجمارك والرسوم (بعملة الشحنة)</label><input id="sh_customs" type="number" min="0" step="0.01" dir="ltr" value="${s?.customs||0}"></div>
      <div class="field"><label>التأمين</label><input id="sh_ins" type="number" min="0" step="0.01" dir="ltr" value="${s?.insurance||0}"></div>
      <div class="field"><label>مصاريف الموانئ</label><input id="sh_port" type="number" min="0" step="0.01" dir="ltr" value="${s?.port_fees||0}"></div>
      <div class="field"><label>تكلفة الشحن</label><input id="sh_freight" type="number" min="0" step="0.01" dir="ltr" value="${s?.freight_cost||0}"></div>
      <div class="field"><label>مصاريف أخرى</label><input id="sh_other" type="number" min="0" step="0.01" dir="ltr" value="${s?.other_costs||0}"></div>
      <div class="field"><label>ملاحظات</label><textarea id="sh_notes" rows="2">${esc(s?.notes||'')}</textarea></div>
      <button class="btn" id="saveSh">حفظ</button>
      <a class="btn ghost" href="${s ? '#ship/id/'+s.id : '#ship/list'}" style="margin-top:.4rem;display:inline-block">إلغاء</a>
    </div>`, 'more');
  $('#saveSh').onclick = async () => {
    const fx = Number($('#sh_fx').value) || ( $('#sh_cur').value === 'EGP' ? 1 : 0 );
    if(!fx) { $('#msg').innerHTML = '<div class="msg err">أدخل سعر الصرف</div>'; return; }
    const row = {
      kind: $('#sh_kind').value, origin_country: $('#sh_origin').value.trim() || null,
      dest_country: $('#sh_dest').value.trim() || null, foreign_party: $('#sh_party').value.trim() || null,
      supplier_id: $('#sh_sup').value || null, container_no: $('#sh_cont').value.trim() || null,
      shipping_company: $('#sh_co').value.trim() || null, ship_date: $('#sh_date').value || null,
      eta: $('#sh_eta').value || null, arrived_at: $('#sh_arr').value || null,
      incoterm: $('#sh_inc').value, currency: $('#sh_cur').value, fx_rate: fx,
      customs: Number($('#sh_customs').value)||0, insurance: Number($('#sh_ins').value)||0,
      port_fees: Number($('#sh_port').value)||0, freight_cost: Number($('#sh_freight').value)||0,
      other_costs: Number($('#sh_other').value)||0, notes: $('#sh_notes').value.trim() || null,
    };
    let q;
    if(s) q = sb.from('shipments').update(row).eq('id', s.id);
    else { row.created_by = session.user.id; q = sb.from('shipments').insert(row).select().single(); }
    const { data, error } = await q;
    if(error){ $('#msg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
    location.hash = '#ship/id/' + (s ? s.id : data.id);
  };
}

async function shipDetail(id){
  if(!can('trade.view') && !can('trade.manage'))
    return shell(`<div class="page-title">شحنة</div><div class="empty">لا تملك الصلاحية.</div>`, 'more');
  shell(`<div class="page-title">شحنة</div><div class="center"><span class="spin"></span></div>`, 'more');
  const { data: s } = await sb.from('v_shipment_summary').select('*').eq('id', id).single();
  if(!s) return shell(`<div class="page-title">شحنة</div><div class="empty">الشحنة غير موجودة.</div>`, 'more');
  const [{ data: items }, { data: landed }, { data: prods }, { data: whs }, { data: boxes }] = await Promise.all([
    sb.from('shipment_items').select('*').eq('shipment_id', id),
    sb.from('v_shipment_landed').select('*').eq('shipment_id', id),
    sb.from('products').select('id,name,sku,unit').is('deleted_at', null).order('name'),
    sb.from('warehouses').select('id,name').is('deleted_at', null).order('name'),
    sb.from('cashboxes').select('id,name').is('deleted_at', null).eq('is_active', true).order('name'),
  ]);
  const prodById = Object.fromEntries((prods||[]).map(p=>[p.id,p]));
  const landedByItem = Object.fromEntries((landed||[]).map(l=>[l.id,l]));
  const canEdit = can('trade.manage') && !s.received_at && s.status !== 'cancelled';
  const nextStatus = SHIP_FLOW[SHIP_FLOW.indexOf(s.status)+1];
  shell(`
    <div class="page-title">شحنة ${esc(s.ref_no)} ${s.is_delayed?'<span class="badge" style="background:#7f1d1d;color:#fff">متأخرة ⚠️</span>':''}</div>
    <div class="toolbar">
      ${canEdit ? `<a class="btn ghost" href="#ship/edit/${s.id}">تعديل البيانات</a>` : ''}
      <a class="btn ghost" href="#ship/list">← الشحنات</a>
    </div>
    <div id="msg"></div>
    <div class="card">
      <div class="k">${s.kind==='import'?'استيراد 📥':'تصدير 📤'} · <span class="badge ${s.status==='completed'?'emerald':'navy'}">${esc(SHIP_STATUS[s.status]||s.status)}</span></div>
      <div style="font-size:.85rem;margin-top:.4rem;line-height:1.9">
        ${esc(s.origin_country||'—')} → ${esc(s.dest_country||'—')} · ${esc(s.incoterm||'')}
        <br>الطرف الأجنبي: ${esc(s.foreign_party||'—')}
        ${s.container_no?`<br>الحاوية: <span dir="ltr">${esc(s.container_no)}</span>`:''}
        ${s.shipping_company?` · ${esc(s.shipping_company)}`:''}
        <br>الشحن: ${esc(s.ship_date||'—')} · الوصول المتوقع: ${esc(s.eta||'—')} · الوصول الفعلي: ${s.arrived_at?esc(String(s.arrived_at).slice(0,10)):'—'}
        <br>العملة: ${esc(s.currency)} × ${fmt(s.fx_rate)}
      </div>
      ${canEdit && nextStatus ? `<button class="btn" id="nextSt" style="margin-top:.5rem">نقل إلى: ${esc(SHIP_STATUS[nextStatus])}</button>` : ''}
      ${canEdit && s.status !== 'new' ? '<button class="btn ghost" id="cancelSh" style="margin-top:.4rem">إلغاء الشحنة</button>' : ''}
    </div>
    <div class="card">
      <div class="k">أصناف الشحنة (${s.items_count})</div>
      <div class="tablewrap"><table>
        <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>التكلفة النهائية/وحدة</th></tr></thead>
        <tbody>${(items||[]).map(it => { const p = prodById[it.product_id]||{}; const l = landedByItem[it.id];
          return `<tr><td><b>${esc(p.name||'')}</b><br><span style="color:var(--muted);font-size:.75rem" dir="ltr">${esc(p.sku||'')}</span></td>
          <td>${fmt(it.qty)} ${esc(p.unit||'')}</td><td>${fmt(it.unit_cost)} ${esc(s.currency)}</td>
          <td class="em">${l ? money(l.landed_total_base / it.qty) : '—'}</td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">لا توجد أصناف</td></tr>'}</tbody>
      </table></div>
      ${canEdit ? `
      <div style="display:flex;gap:.4rem;margin-top:.5rem;flex-wrap:wrap">
        <select id="it_prod" style="flex:1;min-width:140px">${(prods||[]).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
        <input id="it_qty" type="number" min="0" step="0.01" placeholder="الكمية" style="width:90px" dir="ltr">
        <input id="it_cost" type="number" min="0" step="0.01" placeholder="سعر الوحدة" style="width:100px" dir="ltr">
        <button class="btn" id="addIt">+ إضافة</button>
      </div>` : ''}
    </div>
    <div class="card">
      <div class="k">التكاليف (بعملة الشحنة)</div>
      <div class="tablewrap"><table><tbody>
        <tr><td>قيمة البضاعة</td><td>${fmt(s.goods_value)}</td></tr>
        <tr><td>الجمارك والرسوم</td><td>${fmt(s.customs)}</td></tr>
        <tr><td>التأمين</td><td>${fmt(s.insurance)}</td></tr>
        <tr><td>مصاريف الموانئ</td><td>${fmt(s.port_fees)}</td></tr>
        <tr><td>تكلفة الشحن</td><td>${fmt(s.freight_cost)}</td></tr>
        <tr><td>أخرى</td><td>${fmt(s.other_costs)}</td></tr>
        <tr><td><b>الإجمالي</b></td><td><b class="em">${fmt(s.grand_total)} ${esc(s.currency)}</b></td></tr>
        <tr><td>بالجنيه المصري</td><td><b class="em">${money(s.grand_total_base)}</b></td></tr>
      </tbody></table></div>
    </div>
    ${s.kind==='import' && can('trade.manage') && !s.received_at && s.status !== 'cancelled' ? `
    <div class="card">
      <div class="k">استلام الشحنة في المخزن</div>
      <div style="font-size:.8rem;color:var(--muted);margin:.3rem 0">يدخل الأصناف بالتكلفة النهائية (landed cost) ويسجل قيد: مخزون / موردون + مصاريف.</div>
      <div class="field"><label>المخزن</label><select id="rc_wh">${(whs||[]).map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div>
      <div class="field"><label>سداد المصاريف من خزينة (اختياري — وإلا تسجل مستحقة)</label><select id="rc_cb"><option value="">مستحقة (بدون سداد)</option>${(boxes||[]).map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
      <button class="btn" id="doReceive">استلام وإدخال المخزن</button>
    </div>` : ''}
    ${s.journal_id ? `<div class="card"><div class="k">القيد المحاسبي</div><a href="#fin/journals" style="color:var(--emerald-d);font-size:.85rem">تم الترحيل — راجع دفتر اليومية ←</a></div>` : ''}
    ${s.notes ? `<div class="card"><div class="k">ملاحظات</div><div style="font-size:.85rem">${esc(s.notes)}</div></div>` : ''}
    <div id="modal"></div>`, 'more');

  const rerender = () => shipDetail(id);
  if($('#nextSt')) $('#nextSt').onclick = async () => {
    const upd = { status: nextStatus };
    if(nextStatus === 'arrived') upd.arrived_at = new Date().toISOString();
    const { error } = await sb.from('shipments').update(upd).eq('id', id);
    if(error){ $('#msg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
    rerender();
  };
  if($('#cancelSh')) $('#cancelSh').onclick = async () => {
    if(!confirm('إلغاء الشحنة؟')) return;
    await sb.from('shipments').update({ status: 'cancelled' }).eq('id', id);
    rerender();
  };
  if($('#addIt')) $('#addIt').onclick = async () => {
    const qty = Number($('#it_qty').value), cost = Number($('#it_cost').value);
    if(!qty || qty <= 0) { $('#msg').innerHTML = '<div class="msg err">أدخل كمية صحيحة</div>'; return; }
    const { error } = await sb.from('shipment_items').insert({ shipment_id: id, product_id: $('#it_prod').value, qty, unit_cost: cost||0 });
    if(error){ $('#msg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
    rerender();
  };
  if($('#doReceive')) $('#doReceive').onclick = async () => {
    $('#msg').innerHTML = '<div class="center"><span class="spin"></span></div>';
    const { error } = await sb.rpc('receive_shipment', { p_shipment: id, p_warehouse: $('#rc_wh').value, p_cashbox: $('#rc_cb').value || null });
    if(error){ $('#msg').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
    $('#msg').innerHTML = '<div class="msg ok">تم الاستلام وترحيل القيد ✓</div>';
    setTimeout(rerender, 700);
  };
}

async function render(){
  if(!session){ loginView(); return; }
  if(!profile){ await loadProfile(); }
  if(!profile){ loginView(); return; }
  const h = (location.hash || '#dash').slice(1);
  const [root, sub] = h.split('/');
  if(root === 'users') return usersView();
  if(root === 'audit') return auditView();
  if(root === 'more') return moreView();
  if(root === 'fin'){
    if(sub === 'accounts') return accountsView();
    if(sub === 'cashboxes') return cashboxesView();
    if(sub === 'vouchers') return vouchersView();
    if(sub === 'journals') return journalsView();
    if(sub === 'trial') return trialView();
    if(sub === 'expenses') return expensesView();
    return finHome();
  }
  if(root === 'hr'){
    if(sub === 'employees') return employeesView();
    if(sub === 'attendance') return attendanceView();
    if(sub === 'leaves') return leavesView();
    if(sub === 'advances') return advancesView();
    return hrHome();
  }
  if(root === 'parties'){
    const parts = h.split('/');
    if(sub === 'customers' || sub === 'suppliers') return partyView(sub);
    if(sub === 'statement') return statementView(parts[2], parts[3]);
    return partiesHome();
  }
  if(root === 'trade'){
    const parts = h.split('/');
    if(sub === 'sales') return invoicesView('sale');
    if(sub === 'purchases') return invoicesView('purchase');
    if(sub === 'quotes') return invoicesView('quote');
    if(sub === 'supply') return supplyView();
    if(sub === 'invoice') return invoiceDetail(parts[2]);
    return tradeHome();
  }
  if(root === 'ship'){
    const parts = h.split('/');
    if(sub === 'list') return shipmentsView();
    if(sub === 'new') return shipForm(null);
    if(sub === 'edit'){ const { data } = await sb.from('shipments').select('*').eq('id', parts[2]).single(); return shipForm(data); }
    if(sub === 'id') return shipDetail(parts[2]);
    return shipHome();
  }
  if(root === 'inv'){
    if(sub === 'warehouses') return warehousesView();
    if(sub === 'products') return productsView();
    if(sub === 'moves') return movesView();
    if(sub === 'stock') return stockView();
    return invHome();
  }
  return dashView();
}
window.addEventListener('hashchange', render);
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
boot();
