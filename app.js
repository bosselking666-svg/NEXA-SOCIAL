// =========================================================================
// NEXA SOCIAL - REALTIME APP & ADMIN PASSWORD VAULT
// =========================================================================

const sb = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);

// State
let currentAdmin = null;
let postsData = [];
let commentsData = [];
let passwordsData = [];
let activeCategory = 'all';
let searchQuery = '';

// DOM Elements
const dbStatus = document.getElementById('db-status');
const adminPanel = document.getElementById('admin-panel');
const btnOpenLogin = document.getElementById('btn-open-admin-login');
const btnLogout = document.getElementById('btn-admin-logout');
const loginModal = document.getElementById('admin-login-modal');
const btnCloseLogin = document.getElementById('btn-close-login');
const loginForm = document.getElementById('admin-login-form');
const loginErrorMsg = document.getElementById('login-error-msg');

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    await verifyConnectionAndSession();
    await loadAllSocialData();
    initRealtime();
});

// 1. التحقق من الاتصال وجلسة الأدمن
async function verifyConnectionAndSession() {
    try {
        const { data: { session }, error } = await sb.auth.getSession();
        if (error) throw error;

        dbStatus.textContent = 'متصل بـ Supabase';
        dbStatus.className = 'badge badge-success';

        if (session && session.user) {
            activateAdminUI(session.user);
        } else {
            deactivateAdminUI();
        }
    } catch (err) {
        dbStatus.textContent = 'خطأ في إعداد config.js';
        dbStatus.className = 'badge badge-danger';
    }
}

function activateAdminUI(user) {
    currentAdmin = user;
    btnOpenLogin.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    adminPanel.classList.remove('hidden');
    document.getElementById('admin-user-info').textContent = `مسجل الدخول بصلاحيات أدمن: ${user.email}`;
    loadPasswordsVault();
    loadAccessCodes();
    renderAdminPostsTable();
}

function deactivateAdminUI() {
    currentAdmin = null;
    btnOpenLogin.classList.remove('hidden');
    btnLogout.classList.add('hidden');
    adminPanel.classList.add('hidden');
}

// 2. تسجيل دخول وخروج الأدمن
btnOpenLogin.addEventListener('click', () => loginModal.classList.remove('hidden'));
btnCloseLogin.addEventListener('click', () => loginModal.classList.add('hidden'));

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorMsg.classList.add('hidden');

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
        loginErrorMsg.textContent = 'فشل الدخول: تأكد من البريد وكلمة المرور في Supabase Auth.';
        loginErrorMsg.classList.remove('hidden');
        return;
    }

    loginModal.classList.add('hidden');
    loginForm.reset();
    activateAdminUI(data.user);
});

btnLogout.addEventListener('click', async () => {
    await sb.auth.signOut();
    deactivateAdminUI();
    renderPostsFeed();
});

// 3. التنقل بين تبويبات لوحة الأدمن
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

// =========================================================================
// 4. خزنة الباسوردات الخاصة بالأدمن (Admin Password Vault)
// =========================================================================
async function loadPasswordsVault() {
    if (!currentAdmin) return;
    const { data, error } = await sb
        .from('admin_passwords')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return;
    passwordsData = data;
    document.getElementById('stat-passwords').textContent = data.length;
    renderPasswordsTable(data);
}

function renderPasswordsTable(list) {
    const tbody = document.getElementById('passwords-table-body');
    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted-text">لا توجد باسوردات محفوظة بعد.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(item => `
        <tr>
            <td><strong>${esc(item.service_name)}</strong></td>
            <td>${esc(item.account_identifier || '-')}</td>
            <td>
                <span class="secret-code" id="sec-${item.id}" data-val="${esc(item.secret_password)}" data-show="false">••••••••••</span>
                <button class="btn btn-sm btn-secondary" onclick="toggleSecret('${item.id}')">👁️</button>
                <button class="btn btn-sm btn-outline" onclick="copyValue('${esc(item.secret_password)}')">نسخ</button>
            </td>
            <td><span class="cat-tag">${esc(item.access_level)}</span></td>
            <td>${esc(item.notes || '-')}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="editPassword('${item.id}')">تعديل</button>
                <button class="btn btn-sm btn-danger" onclick="deletePassword('${item.id}')">حذف</button>
            </td>
        </tr>
    `).join('');
}

// توليد باسورد عشوائي قوي
document.getElementById('btn-generate-pass').addEventListener('click', () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 16; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('pass-secret').value = pass;
});

// حفظ أو تعديل باسورد
document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('pass-id').value;
    const payload = {
        service_name: document.getElementById('pass-service').value.trim(),
        account_identifier: document.getElementById('pass-identifier').value.trim(),
        secret_password: document.getElementById('pass-secret').value,
        access_level: document.getElementById('pass-level').value,
        notes: document.getElementById('pass-notes').value.trim(),
        last_updated: new Date().toISOString()
    };

    if (id) {
        await sb.from('admin_passwords').update(payload).eq('id', id);
    } else {
        await sb.from('admin_passwords').insert([payload]);
    }

    resetPasswordForm();
    await loadPasswordsVault();
});

window.editPassword = (id) => {
    const item = passwordsData.find(p => p.id === id);
    if (!item) return;

    document.getElementById('pass-id').value = item.id;
    document.getElementById('pass-service').value = item.service_name;
    document.getElementById('pass-identifier').value = item.account_identifier || '';
    document.getElementById('pass-secret').value = item.secret_password;
    document.getElementById('pass-level').value = item.access_level;
    document.getElementById('pass-notes').value = item.notes || '';

    document.getElementById('pass-form-heading').textContent = 'تعديل بيانات الباسورد';
    document.getElementById('btn-save-pass').textContent = 'تحديث البيانات';
    document.getElementById('btn-cancel-pass').classList.remove('hidden');
};

document.getElementById('btn-cancel-pass').addEventListener('click', resetPasswordForm);

function resetPasswordForm() {
    document.getElementById('password-form').reset();
    document.getElementById('pass-id').value = '';
    document.getElementById('pass-form-heading').textContent = 'إضافة باسورد / بيانات سرية جديدة';
    document.getElementById('btn-save-pass').textContent = 'حفظ في الخزنة';
    document.getElementById('btn-cancel-pass').classList.add('hidden');
}

window.deletePassword = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا الباسورد نهائياً؟')) return;
    await sb.from('admin_passwords').delete().eq('id', id);
    await loadPasswordsVault();
};

window.toggleSecret = (id) => {
    const el = document.getElementById(`sec-${id}`);
    const shown = el.dataset.show === 'true';
    el.textContent = shown ? '••••••••••' : el.dataset.val;
    el.dataset.show = shown ? 'false' : 'true';
};

document.getElementById('search-passwords').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = passwordsData.filter(p =>
        p.service_name.toLowerCase().includes(q) ||
        (p.account_identifier && p.account_identifier.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q))
    );
    renderPasswordsTable(filtered);
});

// =========================================================================
// 5. أكواد الدخول والوصول (Access Codes)
// =========================================================================
async function loadAccessCodes() {
    if (!currentAdmin) return;
    const { data, error } = await sb.from('access_codes').select('*').order('created_at', { ascending: false });
    if (error) return;

    const tbody = document.getElementById('access-codes-table-body');
    tbody.innerHTML = data.map(c => `
        <tr>
            <td>${esc(c.code_label)}</td>
            <td><code class="secret-code">${esc(c.code_value)}</code></td>
            <td>${c.is_active ? '🟢 مفعل' : '🔴 معطل'}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="toggleCodeStatus('${c.id}', ${!c.is_active})">${c.is_active ? 'تعطيل' : 'تفعيل'}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteAccessCode('${c.id}')">حذف</button>
            </td>
        </tr>
    `).join('');
}

document.getElementById('access-code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        code_label: document.getElementById('code-label').value.trim(),
        code_value: document.getElementById('code-value').value.trim(),
        is_active: true
    };
    await sb.from('access_codes').insert([payload]);
    e.target.reset();
    await loadAccessCodes();
});

window.toggleCodeStatus = async (id, state) => {
    await sb.from('access_codes').update({ is_active: state }).eq('id', id);
    await loadAccessCodes();
};

window.deleteAccessCode = async (id) => {
    if (!confirm('حذف الكود؟')) return;
    await sb.from('access_codes').delete().eq('id', id);
    await loadAccessCodes();
};

// =========================================================================
// 6. المنصة التفاعلية: المنشورات، التعليقات، الإعجابات، وتعديل الأدمن
// =========================================================================
async function loadAllSocialData() {
    const [postsRes, commentsRes] = await Promise.all([
        sb.from('posts').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
        sb.from('comments').select('*').order('created_at', { ascending: true })
    ]);

    if (!postsRes.error) {
        postsData = postsRes.data;
        document.getElementById('stat-posts').textContent = postsData.length;
    }
    if (!commentsRes.error) {
        commentsData = commentsRes.data;
    }

    renderPostsFeed();
    if (currentAdmin) renderAdminPostsTable();
}

function renderPostsFeed() {
    const feed = document.getElementById('posts-feed');
    let filtered = postsData.filter(p => p.is_approved);

    if (activeCategory !== 'all') {
        filtered = filtered.filter(p => p.category === activeCategory);
    }

    if (searchQuery) {
        filtered = filtered.filter(p =>
            p.content.toLowerCase().includes(searchQuery) ||
            p.author_name.toLowerCase().includes(searchQuery)
        );
    }

    if (!filtered.length) {
        feed.innerHTML = '<div class="loading-box muted-text">لا توجد منشورات مطابقة حالياً.</div>';
        return;
    }

    feed.innerHTML = filtered.map(post => {
        const postComments = commentsData.filter(c => c.post_id === post.id);
        return `
            <article class="post-card ${post.is_pinned ? 'pinned' : ''}">
                <div class="post-header">
                    <div class="author-info">
                        <h4>${esc(post.author_name)}</h4>
                        <span>${esc(post.author_handle)} • ${formatTime(post.created_at)}</span>
                    </div>
                    <div class="post-badges">
                        ${post.is_pinned ? '<span class="pin-tag">📌 مثبت</span>' : ''}
                        <span class="cat-tag">${esc(post.category)}</span>
                    </div>
                </div>
                <div class="post-body">${esc(post.content)}</div>
                <div class="post-actions">
                    <button class="action-btn" onclick="likePost('${post.id}', ${post.likes_count})">❤️ إعجاب (${post.likes_count})</button>
                    <span class="action-btn">💬 التعليقات (${postComments.length})</span>
                </div>

                <!-- قسم التعليقات -->
                <div class="comments-box">
                    ${postComments.map(c => `
                        <div class="comment-item">
                            <div><strong>${esc(c.commenter_name)}:</strong> ${esc(c.comment_text)}</div>
                            ${currentAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteComment('${c.id}')">حذف</button>` : ''}
                        </div>
                    `).join('')}
                    <form class="comment-form" onsubmit="submitComment(event, '${post.id}')">
                        <input type="text" name="cname" placeholder="اسمك" required>
                        <input type="text" name="ctext" placeholder="اكتب تعليقاً..." required>
                        <button type="submit" class="btn btn-sm btn-primary">تعليق</button>
                    </form>
                </div>
            </article>
        `;
    }).join('');
}

// نشر منشور جديد
document.getElementById('new-post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let handle = document.getElementById('post-handle').value.trim();
    if (!handle.startsWith('@')) handle = '@' + handle;

    const payload = {
        author_name: document.getElementById('post-author').value.trim(),
        author_handle: handle,
        category: document.getElementById('post-category').value,
        content: document.getElementById('post-content').value.trim()
    };

    await sb.from('posts').insert([payload]);
    e.target.reset();
    await loadAllSocialData();
});

// الإعجاب بمنشور
window.likePost = async (id, currentLikes) => {
    await sb.from('posts').update({ likes_count: currentLikes + 1 }).eq('id', id);
    await loadAllSocialData();
};

// إضافة تعليق
window.submitComment = async (e, postId) => {
    e.preventDefault();
    const form = e.target;
    const payload = {
        post_id: postId,
        commenter_name: form.cname.value.trim(),
        comment_text: form.ctext.value.trim()
    };
    await sb.from('comments').insert([payload]);
    form.reset();
    await loadAllSocialData();
};

window.deleteComment = async (id) => {
    await sb.from('comments').delete().eq('id', id);
    await loadAllSocialData();
};

// إدارة المنشورات في جدول الأدمن
function renderAdminPostsTable() {
    const tbody = document.getElementById('admin-posts-table-body');
    tbody.innerHTML = postsData.map(p => `
        <tr>
            <td><strong>${esc(p.author_name)}</strong><br><span class="muted-text">${esc(p.author_handle)}</span></td>
            <td>${esc(p.content.substring(0, 60))}${p.content.length > 60 ? '...' : ''}</td>
            <td>${esc(p.category)}</td>
            <td>${p.is_approved ? '✅ منشور' : '⏳ مخفي'} ${p.is_pinned ? '📌' : ''}</td>
            <td>${p.likes_count}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="openEditPost('${p.id}')">تعديل</button>
                <button class="btn btn-sm btn-danger" onclick="deletePost('${p.id}')">حذف</button>
            </td>
        </tr>
    `).join('');
}

window.openEditPost = (id) => {
    const p = postsData.find(item => item.id === id);
    if (!p) return;
    document.getElementById('edit-post-id').value = p.id;
    document.getElementById('edit-post-author').value = p.author_name;
    document.getElementById('edit-post-handle').value = p.author_handle;
    document.getElementById('edit-post-category').value = p.category;
    document.getElementById('edit-post-content').value = p.content;
    document.getElementById('edit-post-pinned').checked = p.is_pinned;
    document.getElementById('edit-post-approved').checked = p.is_approved;
    document.getElementById('admin-edit-post-form').classList.remove('hidden');
};

document.getElementById('btn-cancel-post-edit').addEventListener('click', () => {
    document.getElementById('admin-edit-post-form').classList.add('hidden');
});

document.getElementById('admin-edit-post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-post-id').value;
    const payload = {
        author_name: document.getElementById('edit-post-author').value.trim(),
        author_handle: document.getElementById('edit-post-handle').value.trim(),
        category: document.getElementById('edit-post-category').value,
        content: document.getElementById('edit-post-content').value.trim(),
        is_pinned: document.getElementById('edit-post-pinned').checked,
        is_approved: document.getElementById('edit-post-approved').checked,
        updated_at: new Date().toISOString()
    };
    await sb.from('posts').update(payload).eq('id', id);
    document.getElementById('admin-edit-post-form').classList.add('hidden');
    await loadAllSocialData();
});

window.deletePost = async (id) => {
    if (!confirm('حذف هذا المنشور وجميع تعليقاته نهائياً؟')) return;
    await sb.from('posts').delete().eq('id', id);
    await loadAllSocialData();
};

// الفلترة والبحث
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.category;
        renderPostsFeed();
    });
});

document.getElementById('feed-search').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderPostsFeed();
});

// 7. التحديث اللحظي (Supabase Realtime)
function initRealtime() {
    sb.channel('nexa-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, loadAllSocialData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, loadAllSocialData)
        .subscribe();
}

// Helpers
function esc(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
}

function formatTime(iso) {
    return new Date(iso).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

window.copyValue = (txt) => {
    navigator.clipboard.writeText(txt);
    alert('تم النسخ إلى الحافظة!');
};
