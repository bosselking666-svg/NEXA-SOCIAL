const sb = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);

let currentAdmin = null;
let postsData = [];
let commentsData = [];
let passwordsData = [];
let activeCategory = 'all';
let searchQuery = '';

const dbStatus = document.getElementById('db-status');
const adminPanel = document.getElementById('admin-panel');
const btnOpenLogin = document.getElementById('btn-open-admin-login');
const btnLogout = document.getElementById('btn-admin-logout');
const loginModal = document.getElementById('admin-login-modal');
const btnCloseLogin = document.getElementById('btn-close-login');
const loginForm = document.getElementById('admin-login-form');
const loginErrorMsg = document.getElementById('login-error-msg');

document.addEventListener('DOMContentLoaded', async () => {
    await verifyConnectionAndSession();
    await loadAllSocialData();
    initRealtime();
});

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
        dbStatus.textContent = 'خطأ في الاتصال';
        dbStatus.className = 'badge badge-danger';
    }
}

function activateAdminUI(user) {
    currentAdmin = user;
    btnOpenLogin.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    adminPanel.classList.remove('hidden');
    document.getElementById('admin-user-info').textContent = `أدمن مسجل: ${user.email}`;
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

btnOpenLogin.addEventListener('click', () => loginModal.classList.remove('hidden'));
btnCloseLogin.addEventListener('click', () => loginModal.classList.add('hidden'));

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorMsg.classList.add('hidden');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
        loginErrorMsg.textContent = 'فشل الدخول: تأكد من بيانات Supabase Auth.';
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

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

async function loadPasswordsVault() {
    if (!currentAdmin) return;
    const { data } = await sb.from('admin_passwords').select('*').order('created_at', { ascending: false });
    passwordsData = data || [];
    document.getElementById('stat-passwords').textContent = passwordsData.length;
    renderPasswordsTable(passwordsData);
}

function renderPasswordsTable(list) {
    const tbody = document.getElementById('passwords-table-body');
    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted-text">لا توجد بيانات محفوظة.</td></tr>';
        return;
    }
    tbody.innerHTML = list.map(item => `
        <tr>
            <td><strong>${esc(item.service_name)}</strong></td>
            <td>${esc(item.account_identifier || '-')}</td>
            <td>
                <span class="secret-code" id="sec-${item.id}" data-val="${esc(item.secret_password)}" data-show="false">••••••••</span>
                <button class="btn btn-sm btn-secondary" onclick="toggleSecret('${item.id}')">👁️</button>
                <button class="btn btn-sm btn-outline" onclick="copyValue('${esc(item.secret_password)}')">نسخ</button>
            </td>
            <td><span class="badge badge-warning">${esc(item.access_level)}</span></td>
            <td>${esc(item.notes || '-')}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="editPassword('${item.id}')">تعديل</button>
                <button class="btn btn-sm btn-danger" onclick="deletePassword('${item.id}')">حذف</button>
            </td>
        </tr>
    `).join('');
}

document.getElementById('btn-generate-pass').addEventListener('click', () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 16; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    document.getElementById('pass-secret').value = pass;
});

document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('pass-id').value;
    const payload = {
        service_name: document.getElementById('pass-service').value.trim(),
        account_identifier: document.getElementById('pass-identifier').value.trim(),
        secret_password: document.getElementById('pass-secret').value,
        access_level: document.getElementById('pass-level').value,
        notes: document.getElementById('pass-notes').value.trim()
    };
    if (id) await sb.from('admin_passwords').update(payload).eq('id', id);
    else await sb.from('admin_passwords').insert([payload]);
    e.target.reset();
    document.getElementById('pass-id').value = '';
    await loadPasswordsVault();
});

window.toggleSecret = (id) => {
    const el = document.getElementById(`sec-${id}`);
    const shown = el.dataset.show === 'true';
    el.textContent = shown ? '••••••••' : el.dataset.val;
    el.dataset.show = shown ? 'false' : 'true';
};

window.deletePassword = async (id) => {
    if (!confirm('حذف؟')) return;
    await sb.from('admin_passwords').delete().eq('id', id);
    await loadPasswordsVault();
};

async function loadAllSocialData() {
    const [postsRes, commentsRes] = await Promise.all([
        sb.from('posts').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
        sb.from('comments').select('*').order('created_at', { ascending: true })
    ]);
    postsData = postsRes.data || [];
    commentsData = commentsRes.data || [];
    document.getElementById('stat-posts').textContent = postsData.length;
    renderPostsFeed();
    if (currentAdmin) renderAdminPostsTable();
}

function renderPostsFeed() {
    const feed = document.getElementById('posts-feed');
    let filtered = postsData.filter(p => p.is_approved);
    if (!filtered.length) {
        feed.innerHTML = '<div class="muted-text">لا توجد منشورات حالياً.</div>';
        return;
    }
    feed.innerHTML = filtered.map(post => {
        const postComments = commentsData.filter(c => c.post_id === post.id);
        return `
            <article class="post-card ${post.is_pinned ? 'pinned' : ''}">
                <div class="post-header">
                    <div>
                        <h4>${esc(post.author_name)}</h4>
                        <span class="muted-text">${esc(post.author_handle)}</span>
                    </div>
                    <span>${esc(post.category)}</span>
                </div>
                <p>${esc(post.content)}</p>
                <div class="post-actions">
                    <button class="action-btn" onclick="likePost('${post.id}', ${post.likes_count})">❤️ إعجاب (${post.likes_count})</button>
                    <span>💬 (${postComments.length})</span>
                </div>
                <div class="comments-box">
                    ${postComments.map(c => `
                        <div class="comment-item">
                            <span><strong>${esc(c.commenter_name)}:</strong> ${esc(c.comment_text)}</span>${currentAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteComment('${c.id}')">حذف</button>` : ''}
                        </div>
                    `).join('')}
                    <form class="comment-form" onsubmit="submitComment(event, '${post.id}')">
                        <input type="text" name="cname" placeholder="اسمك" required>
                        <input type="text" name="ctext" placeholder="تعليق..." required>
                        <button type="submit" class="btn btn-sm btn-primary">إرسال</button>
                    </form>
                </div>
            </article>
        `;
    }).join('');
}

document.getElementById('new-post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        author_name: document.getElementById('post-author').value.trim(),
        author_handle: document.getElementById('post-handle').value.trim(),
        category: document.getElementById('post-category').value,
        content: document.getElementById('post-content').value.trim()
    };
    await sb.from('posts').insert([payload]);
    e.target.reset();
    await loadAllSocialData();
});

window.likePost = async (id, likes) => {
    await sb.from('posts').update({ likes_count: likes + 1 }).eq('id', id);
    await loadAllSocialData();
};

window.submitComment = async (e, postId) => {
    e.preventDefault();
    const f = e.target;
    await sb.from('comments').insert([{ post_id: postId, commenter_name: f.cname.value.trim(), comment_text: f.ctext.value.trim() }]);
    f.reset();
    await loadAllSocialData();
};

window.deleteComment = async (id) => {
    await sb.from('comments').delete().eq('id', id);
    await loadAllSocialData();
};

function renderAdminPostsTable() {
    const tbody = document.getElementById('admin-posts-table-body');
    if (!tbody) return;
    tbody.innerHTML = postsData.map(p => `
        <tr>
            <td>${esc(p.author_name)}</td>
            <td>${esc(p.content.substring(0, 40))}...</td>
            <td>${p.likes_count}</td>
            <td><button class="btn btn-sm btn-danger" onclick="deletePost('${p.id}')">حذف</button></td>
        </tr>
    `).join('');
}

window.deletePost = async (id) => {
    if (!confirm('حذف المنشور؟')) return;
    await sb.from('posts').delete().eq('id', id);
    await loadAllSocialData();
};

function initRealtime() {
    sb.channel('live').on('postgres_changes', { event: '*', schema: 'public' }, loadAllSocialData).subscribe();
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

window.copyValue = (t) => { navigator.clipboard.writeText(t); alert('تم النسخ!'); };
async function loadAccessCodes() {}
