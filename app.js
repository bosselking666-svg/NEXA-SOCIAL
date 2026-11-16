const sb = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);

let currentAdmin = null;
let postsData = [];
let commentsData = [];

const dbStatus = document.getElementById('db-status');
const adminPanel = document.getElementById('admin-panel');
const btnOpenLogin = document.getElementById('btn-open-admin-login');
const btnLogout = document.getElementById('btn-admin-logout');
const loginModal = document.getElementById('admin-login-modal');
const btnCloseLogin = document.getElementById('btn-close-login');
const loginForm = document.getElementById('admin-login-form');
const loginErrorMsg = document.getElementById('login-error-msg');

document.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    await loadData();
});

async function checkSession() {
    try {
        const { data: { session }, error } = await sb.auth.getSession();
        if (error) throw error;
        
        if (session && session.user) {
            setAdminState(session.user);
        } else {
            clearAdminState();
        }
        dbStatus.textContent = 'متصل بقاعدة البيانات';
        dbStatus.className = 'badge badge-success';
    } catch (err) {
        dbStatus.textContent = 'خطأ في الاتصال';
        dbStatus.className = 'badge badge-danger';
    }
}

function setAdminState(user) {
    currentAdmin = user;
    if (btnOpenLogin) btnOpenLogin.classList.add('hidden');
    if (btnLogout) logoutBtn.classList.remove('hidden');
    if (adminPanel) adminPanel.classList.remove('hidden');
    const userInfo = document.getElementById('admin-user-info');
    if (userInfo) userInfo.textContent = `المسؤول: ${user.email}`;
    loadPasswords();
}

function clearAdminState() {
    currentAdmin = null;
    if (btnOpenLogin) btnOpenLogin.classList.remove('hidden');
    if (btnLogout) logoutBtn.classList.add('hidden');
    if (adminPanel) adminPanel.classList.add('hidden');
}

if (btnOpenLogin) btnOpenLogin.addEventListener('click', () => loginModal.classList.remove('hidden'));
if (btnCloseLogin) btnCloseLogin.addEventListener('click', () => loginModal.classList.add('hidden'));

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginErrorMsg.classList.add('hidden');
        
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        
        if (error) {
            loginErrorMsg.textContent = `فشل الدخول: تأكد من الإيميل وباسورد الـ Auth.`;
            loginErrorMsg.classList.remove('hidden');
            return;
        }

        loginModal.classList.add('hidden');
        loginForm.reset();
        setAdminState(data.user);
        loadData();
    });
}

if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        await sb.auth.signOut();
        clearAdminState();
        loadData();
    });
}

async function loadData() {
    const [postsRes, commentsRes] = await Promise.all([
        sb.from('posts').select('*').order('created_at', { ascending: false }),
        sb.from('comments').select('*')
    ]);

    postsData = postsRes.data || [];
    commentsData = commentsRes.data || [];
    
    const statPosts = document.getElementById('stat-posts');
    if (statPosts) statPosts.textContent = postsData.length;
    
    renderFeed();
}

function renderFeed() {
    const feed = document.getElementById('posts-feed');
    if (!feed) return;

    if (!postsData.length) {
        feed.innerHTML = '<div class="muted-text">لا توجد منشورات حالياً.</div>';
        return;
    }

    feed.innerHTML = postsData.map(post => {
        const pComments = commentsData.filter(c => c.post_id === post.id);
        return `
            <div class="post-card" style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:10px; padding:16px; margin-bottom:14px;">
                <div class="post-header" style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <div>
                        <h4 style="color:#fff;">${escapeHtml(post.author_name)}</h4>
                        <span class="muted-text">${escapeHtml(post.author_handle)}</span>
                    </div>
                    <span class="badge badge-warning">${escapeHtml(post.category)}</span>
                </div>
                <p style="margin: 10px 0; color:#f8fafc;">${escapeHtml(post.content)}</p>
                <div class="post-actions" style="display:flex; gap:10px; border-top:1px solid var(--border-color); padding-top:10px;">
                    <button class="action-btn" onclick="likePost('${post.id}', ${post.likes_count})" style="background:transparent; border:1px solid var(--border-color); color:#fff; padding:5px 10px; border-radius:6px; cursor:pointer;">❤️ إعجاب (${post.likes_count})</button>
                    <span style="color:var(--text-secondary);">💬 تعليقات (${pComments.length})</span>
                </div>
                <div class="comments-box" style="margin-top:10px; border-top:1px dashed var(--border-color); padding-top:10px;">
                    ${pComments.map(c => `
                        <div class="comment-item" style="background:var(--bg-body); padding:6px 10px; border-radius:6px; margin-bottom:6px; display:flex; justify-content:space-between;">
                            <span><strong>${escapeHtml(c.commenter_name)}:</strong> ${escapeHtml(c.comment_text)}</span>
                            ${currentAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteComment('${c.id}')">حذف</button>` : ''}
                        </div>
                    `).join('')}
                    <form class="comment-form" onsubmit="addComment(event, '${post.id}')" style="display:flex; gap:6px; margin-top:8px;">
                        <input type="text" name="cname" placeholder="اسمك" required style="max-width:120px;">
                        <input type="text" name="ctext" placeholder="اكتب تعليقاً..." required>
                        <button type="submit" class="btn btn-sm btn-primary">إرسال</button>
                    </form>
                </div>
            </div>
        `;
    }).join('');
}

const newPostForm = document.getElementById('new-post-form');
if (newPostForm) {
    newPostForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            author_name: document.getElementById('post-author').value.trim(),
            author_handle: document.getElementById('post-handle').value.trim(),
            category: document.getElementById('post-category').value,
            content: document.getElementById('post-content').value.trim()
        };
        await sb.from('posts').insert([payload]);
        newPostForm.reset();
        await loadData();
    });
}

window.likePost = async (id, currentLikes) => {
    await sb.from('posts').update({ likes_count: currentLikes + 1 }).eq('id', id);
    await loadData();
};

window.addComment = async (e, postId) => {
    e.preventDefault();
    const f = e.target;
    await sb.from('comments').insert([{
        post_id: postId,
        commenter_name: f.cname.value.trim(),
        comment_text: f.ctext.value.trim()
    }]);
    f.reset();
    await loadData();
};

window.deleteComment = async (id) => {
    await sb.from('comments').delete().eq('id', id);
    await loadData();
};

async function loadPasswords() {
    if (!currentAdmin) return;
    const { data } = await sb.from('admin_passwords').select('*').order('created_at', { ascending: false });
    const passwordsData = data || [];
    const statPass = document.getElementById('stat-passwords');
    if (statPass) statPass.textContent = passwordsData.length;
    
    const tbody = document.getElementById('passwords-table-body');
    if (!tbody) return;
    
    if (!passwordsData.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted-text">لا توجد كلمات مرورية محفوظة.</td></tr>';
        return;
    }

    tbody.innerHTML = passwordsData.map(item => `
        <tr>
            <td><strong>${escapeHtml(item.service_name)}</strong></td>
            <td>${escapeHtml(item.account_identifier || '-')}</td>
            <td><code class="secret-code">${escapeHtml(item.secret_password)}</code></td>
            <td>${escapeHtml(item.access_level)}</td>
            <td>${escapeHtml(item.notes || '-')}</td>
            <td><button class="btn btn-sm btn-danger" onclick="deletePassword('${item.id}')">حذف</button></td>
        </tr>
    `).join('');
}

const passwordForm = document.getElementById('password-form');
if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            service_name: document.getElementById('pass-service').value.trim(),
            account_identifier: document.getElementById('pass-identifier').value.trim(),
            secret_password: document.getElementById('pass-secret').value,
            access_level: document.getElementById('pass-level').value,
            notes: document.getElementById('pass-notes').value.trim()
        };
        await sb.from('admin_passwords').insert([payload]);
        passwordForm.reset();
        await loadPasswords();
    });
}

window.deletePassword = async (id) => {
    await sb.from('admin_passwords').delete().eq('id', id);
    await loadPasswords();
};

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
