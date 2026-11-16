const sb = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);

let currentUser = null;
let postsData = [];
let commentsData = [];
let isSignUpMode = false;

const dbStatus = document.getElementById('db-status');
const btnOpenAuth = document.getElementById('btn-open-auth');
const btnLogout = document.getElementById('btn-logout');
const authModal = document.getElementById('auth-modal');
const btnCloseAuth = document.getElementById('btn-close-auth');
const authForm = document.getElementById('auth-form');
const authModalTitle = document.getElementById('auth-modal-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const toggleAuthMode = document.getElementById('toggle-auth-mode');
const authError = document.getElementById('auth-error');

const editModal = document.getElementById('edit-modal');
const btnCloseEdit = document.getElementById('btn-close-edit');
const editPostForm = document.getElementById('edit-post-form');

document.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    await loadData();
});

async function checkSession() {
    try {
        const { data: { session }, error } = await sb.auth.getSession();
        if (error) throw error;
        
        currentUser = session?.user || null;
        updateAuthUI();
        dbStatus.textContent = 'متصل بالمجتمع';
        dbStatus.className = 'badge badge-success';
    } catch (err) {
        dbStatus.textContent = 'خطأ بالاتصال';
        dbStatus.className = 'badge badge-danger';
    }
}

function updateAuthUI() {
    if (currentUser) {
        btnOpenAuth.textContent = `👤 ${currentUser.email.split('@')[0]}`;
        btnLogout.classList.remove('hidden');
    } else {
        btnOpenAuth.textContent = 'حساب جديد / دخول';
        btnLogout.classList.add('hidden');
    }
}

// Modal Handlers
btnOpenAuth.addEventListener('click', () => {
    if (currentUser) return;
    authModal.classList.remove('hidden');
});
btnCloseAuth.addEventListener('click', () => authModal.classList.add('hidden'));
btnCloseEdit.addEventListener('click', () => editModal.classList.add('hidden'));

// Switch Login <-> Register
toggleAuthMode.addEventListener('click', () => {
    isSignUpMode = !isSignUpMode;
    if (isSignUpMode) {
        authModalTitle.textContent = 'إنشاء حساب جديد في المجتمع';
        authSubmitBtn.textContent = 'إتمام التسجيل';
        document.getElementById('auth-switch-text').innerHTML = 'لديك حساب بالفعل؟ <span id="toggle-auth-toggle">تسجيل الدخول</span>';
    } else {
        authModalTitle.textContent = 'تسجيل الدخول';
        authSubmitBtn.textContent = 'تسجيل الدخول';
        document.getElementById('auth-switch-text').innerHTML = 'ليس لديك حساب؟ <span id="toggle-auth-toggle">انضم إلينا بإنشاء حساب جديد</span>';
    }
});

// Auth Submit (Login / Register)
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.classList.add('hidden');
    
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    let res;
    if (isSignUpMode) {
        res = await sb.auth.signUp({ email, password });
    } else {
        res = await sb.auth.signInWithPassword({ email, password });
    }

    if (res.error) {
        authError.textContent = `خطأ: ${res.error.message}`;
        authError.classList.remove('hidden');
        return;
    }

    authModal.classList.add('hidden');
    authForm.reset();
    await checkSession();
    await loadData();
    alert(isSignUpMode ? 'تم إنشاء الحساب بنجاح! أهلاً بك في مجتمعنا.' : 'مرحباً بك مجدداً!');
});

btnLogout.addEventListener('click', async () => {
    await sb.auth.signOut();
    currentUser = null;
    updateAuthUI();
    await loadData();
});

// Data Loading
async function loadData() {
    const [postsRes, commentsRes] = await Promise.all([
        sb.from('posts').select('*').order('created_at', { ascending: false }),
        sb.from('comments').select('*')
    ]);

    postsData = postsRes.data || [];
    commentsData = commentsRes.data || [];
    
    document.getElementById('stat-posts-count').textContent = postsData.length;
    renderFeed();
}

function renderFeed() {
    const feed = document.getElementById('posts-feed');
    if (!feed) return;

    if (!postsData.length) {
        feed.innerHTML = '<div class="muted-text" style="text-align:center; padding:30px;">لا توجد منشورات حالياً. كن اول من يبدأ النقاش!</div>';
        return;
    }

    feed.innerHTML = postsData.map(post => {
        const pComments = commentsData.filter(c => c.post_id === post.id);
        const canManage = currentUser !== null; // يتيح للأعضاء المسجلين والأدمن التحكم بالمنشورات

        return `
            <div class="post-card">
                <div class="post-header">
                    <div>
                        <h4 style="font-weight: 700; color: var(--text-main);">${escapeHtml(post.author_name)}</h4>
                        <span class="muted-text">${escapeHtml(post.author_handle)}</span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <span class="badge badge-warning">${escapeHtml(post.category)}</span>
                        ${canManage ? `
                            <button class="btn btn-sm btn-secondary" title="تعديل" onclick="openEditPost('${post.id}', \`${escapeHtml(post.content)}\`)">✏️</button>
                            <button class="btn btn-sm btn-danger" title="حذف" onclick="deletePost('${post.id}')">🗑️</button>
                        ` : ''}
                    </div>
                </div>
                <div class="post-body">${escapeHtml(post.content)}</div>
                <div class="post-actions">
                    <button class="action-btn" onclick="likePost('${post.id}', ${post.likes_count})">❤️ إعجاب (${post.likes_count})</button>
                    <span class="muted-text" style="display:flex; align-items:center; font-size:0.85rem;">💬 تعليقات (${pComments.length})</span>
                </div>
                <div class="comments-box">
                    ${pComments.map(c => `
                        <div class="comment-item">
                            <span><strong>${escapeHtml(c.commenter_name)}:</strong> ${escapeHtml(c.comment_text)}</span>
                            ${canManage ? `<button class="btn btn-sm btn-danger" onclick="deleteComment('${c.id}')" style="padding:2px 6px; font-size:0.7rem;">حذف</button>` : ''}
                        </div>
                    `).join('')}
                    <form class="comment-form" onsubmit="addComment(event, '${post.id}')">
                        <input type="text" name="cname" placeholder="اسمك" required style="max-width: 120px;">
                        <input type="text" name="ctext" placeholder="اكتب رداً أو تعليقاً..." required>
                        <button type="submit" class="btn btn-sm btn-primary">إرسال</button>
                    </form>
                </div>
            </div>
        `;
    }).join('');
}

// Post Actions
const newPostForm = document.getElementById('new-post-form');
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

window.openEditPost = (id, content) => {
    document.getElementById('edit-post-id').value = id;
    document.getElementById('edit-post-content').value = content;
    editModal.classList.remove('hidden');
};

editPostForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-post-id').value;
    const content = document.getElementById('edit-post-content').value.trim();
    
    await sb.from('posts').update({ content }).eq('id', id);
    editModal.classList.add('hidden');
    await loadData();
});

window.deletePost = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا المنشور نهائياً؟')) return;
    await sb.from('posts').delete().eq('id', id);
    await loadData();
};

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

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
