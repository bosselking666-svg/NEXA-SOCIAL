const sb = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);

let currentUser = null;
let currentProfile = null;
let postsData = [];
let commentsData = [];
let userLikes = new Set();
let profilesMap = {};
let selectedImageBase64 = '';

const dbStatus = document.getElementById('db-status');
const guestNav = document.getElementById('guest-nav');
const userNav = document.getElementById('user-nav');
const newPostForm = document.getElementById('new-post-form');
const guestComposerMsg = document.getElementById('guest-composer-msg');
const editModal = document.getElementById('edit-modal');

document.addEventListener('DOMContentLoaded', async () => {
    await initApp();
});

async function initApp() {
    try {
        const { data: { session }, error } = await sb.auth.getSession();
        if (error) throw error;

        dbStatus.textContent = 'متصل بالمجتمع';
        dbStatus.className = 'badge badge-success';

        if (session && session.user) {
            currentUser = session.user;
            await loadUserProfile();
            guestNav.classList.add('hidden');
            userNav.classList.remove('hidden');
            newPostForm.classList.remove('hidden');
            guestComposerMsg.classList.add('hidden');
        } else {
            guestNav.classList.remove('hidden');
            userNav.classList.add('hidden');
            newPostForm.classList.add('hidden');
            guestComposerMsg.classList.remove('hidden');
        }

        await loadAllData();
    } catch (err) {
        console.error(err);
        dbStatus.textContent = 'خطأ في الاتصال';
        dbStatus.className = 'badge badge-danger';
    }
}

async function loadUserProfile() {
    let { data: profile } = await sb.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    
    // إنشاء بروفايل تلقائي إذا لم يكن موجوداً
    if (!profile) {
        const defaultUsername = currentUser.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') + '_' + Math.floor(Math.random()*100);
        const role = (currentUser.email === SUPABASE_CONFIG.ADMIN_EMAIL) ? 'admin' : 'user';
        const { data: newProf } = await sb.from('profiles').insert([{
            id: currentUser.id,
            full_name: currentUser.user_metadata?.full_name || currentUser.email.split('@')[0],
            username: currentUser.user_metadata?.username || defaultUsername,
            role: role
        }]).select().single();
        profile = newProf;
    }

    currentProfile = profile;
    document.getElementById('nav-username').textContent = profile.full_name;
    
    if (profile.role === 'admin' || currentUser.email === SUPABASE_CONFIG.ADMIN_EMAIL) {
        currentProfile.role = 'admin';
        document.getElementById('role-badge').classList.remove('hidden');
    }
}

document.getElementById('btn-logout').addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.reload();
});

// اختيار صورة للمنشور
document.getElementById('post-image-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('selected-file-name').textContent = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
        selectedImageBase64 = ev.target.result;
    };
    reader.readAsDataURL(file);
});

// نشر منشور جديد
newPostForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser || !currentProfile) return;

    const btn = document.getElementById('btn-submit-post');
    btn.disabled = true;
    btn.textContent = 'جاري النشر...';

    const payload = {
        user_id: currentUser.id,
        author_name: currentProfile.full_name,
        author_handle: '@' + currentProfile.username,
        category: document.getElementById('post-category').value,
        content: document.getElementById('post-content').value.trim(),
        image_url: selectedImageBase64
    };

    await sb.from('posts').insert([payload]);
    newPostForm.reset();
    selectedImageBase64 = '';
    document.getElementById('selected-file-name').textContent = '';
    btn.disabled = false;
    btn.textContent = 'نشر الآن';
    await loadAllData();
});

async function loadAllData() {
    const [postsRes, commentsRes, profilesRes] = await Promise.all([
        sb.from('posts').select('*').order('created_at', { ascending: false }),
        sb.from('comments').select('*').order('created_at', { ascending: true }),
        sb.from('profiles').select('*')
    ]);

    postsData = postsRes.data || [];
    commentsData = commentsRes.data || [];
    
    profilesMap = {};
    (profilesRes.data || []).forEach(p => { profilesMap[p.id] = p; });

    // جلب إعجابات المستخدم الحالي لمنع الإعجاب الوهمي المتكرر
    userLikes.clear();
    if (currentUser) {
        const { data: likesData } = await sb.from('post_likes').select('post_id').eq('user_id', currentUser.id);
        (likesData || []).forEach(l => userLikes.add(l.post_id));
    }

    renderFeed();
}

function renderFeed() {
    const feed = document.getElementById('posts-feed');
    if (!feed) return;

    if (!postsData.length) {
        feed.innerHTML = '<div class="muted-text" style="text-align:center; padding:30px;">لا توجد منشورات بعد. كن أول المشاركين!</div>';
        return;
    }

    const isAdmin = currentProfile?.role === 'admin';

    feed.innerHTML = postsData.map(post => {
        const pComments = commentsData.filter(c => c.post_id === post.id);
        const authorProf = profilesMap[post.user_id];
        const avatarUrl = authorProf?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author_name)}&background=e2e8f0&color=1e293b`;
        
        // صلاحيات التعديل والحذف: للأدمن على الكل، أو لصاحب المنشور على منشوره فقط
        const isOwner = currentUser && post.user_id === currentUser.id;
        const canModify = isAdmin || isOwner;
        const isLiked = userLikes.has(post.id);

        return `
            <div class="card">
                <div class="post-header">
                    <div class="post-author-box">
                        <img src="${avatarUrl}" class="avatar" alt="Avatar">
                        <div>
                            <h4 style="font-weight: 800; color: var(--text-main);">${escapeHtml(post.author_name)}</h4>
                            <span class="muted-text">${escapeHtml(post.author_handle)}</span>
                        </div>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <span class="badge badge-warning">${escapeHtml(post.category)}</span>
                        ${canModify ? `
                            <button class="btn btn-sm btn-secondary" title="تعديل" onclick="openEditPost('${post.id}', \`${escapeHtml(post.content)}\`)">✏️</button>
                            <button class="btn btn-sm btn-danger" title="حذف" onclick="deletePost('${post.id}')">🗑️</button>
                        ` : ''}
                    </div>
                </div>

                <div class="post-body">${escapeHtml(post.content)}</div>
                ${post.image_url ? `<img src="${post.image_url}" class="post-image" alt="Post Image">` : ''}

                <div class="post-actions">
                    <button class="action-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${post.id}', ${post.likes_count})">
                        ${isLiked ? '❤️ أعجبني' : '🤍 إعجاب'} (${post.likes_count || 0})
                    </button>
                    <span class="muted-text" style="display:flex; align-items:center;">💬 تعليقات (${pComments.length})</span>
                </div>

                <div class="comments-box">
                    ${pComments.map(c => `
                        <div class="comment-item">
                            <span><strong>${escapeHtml(c.commenter_name)}:</strong> ${escapeHtml(c.comment_text)}</span>
                            ${(isAdmin || (currentProfile && c.commenter_name === currentProfile.full_name)) ? 
                                `<button class="btn btn-sm btn-danger" onclick="deleteComment('${c.id}')" style="padding:2px 6px; font-size:0.7rem;">حذف</button>` : ''}
                        </div>
                    `).join('')}

                    ${currentUser ? `
                        <form class="comment-form" onsubmit="addComment(event, '${post.id}')">
                            <input type="text" name="ctext" placeholder="اكتب تعليقك باسم ${escapeHtml(currentProfile.full_name)}..." required>
                            <button type="submit" class="btn btn-sm btn-primary">تعليق</button>
                        </form>
                    ` : '<p class="muted-text" style="margin-top:8px;">سجل دخولك لإضافة تعليق.</p>'}
                </div>
            </div>
        `;
    }).join('');
}

// نظام الإعجاب الواحد لكل مستخدم مسجل (Like / Unlike)
window.toggleLike = async (postId, currentCount) => {
    if (!currentUser) {
        alert('يرجى تسجيل الدخول أولاً لتتمكن من الإعجاب بالمنشورات.');
        window.location.href = 'login.html';
        return;
    }

    if (userLikes.has(postId)) {
        // إلغاء الإعجاب
        await sb.from('post_likes').delete().eq('post_id', postId).eq('user_id', currentUser.id);
        const newCount = Math.max(0, (currentCount || 1) - 1);
        await sb.from('posts').update({ likes_count: newCount }).eq('id', postId);
    } else {
        // تسجيل إعجاب واحد فقط
        const { error } = await sb.from('post_likes').insert([{ post_id: postId, user_id: currentUser.id }]);
        if (!error) {
            await sb.from('posts').update({ likes_count: (currentCount || 0) + 1 }).eq('id', postId);
        }
    }
    await loadAllData();
};

// تعديل المنشور
window.openEditPost = (id, content) => {
    document.getElementById('edit-post-id').value = id;
    document.getElementById('edit-post-content').value = content;
    editModal.classList.remove('hidden');
};

document.getElementById('btn-close-edit').addEventListener('click', () => editModal.classList.add('hidden'));

document.getElementById('edit-post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-post-id').value;
    const content = document.getElementById('edit-post-content').value.trim();
    await sb.from('posts').update({ content }).eq('id', id);
    editModal.classList.add('hidden');
    await loadAllData();
});

// حذف المنشور
window.deletePost = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا المنشور؟')) return;
    await sb.from('posts').delete().eq('id', id);
    await loadAllData();
};

// إضافة تعليق
window.addComment = async (e, postId) => {
    e.preventDefault();
    if (!currentUser || !currentProfile) return;
    const f = e.target;
    await sb.from('comments').insert([{
        post_id: postId,
        commenter_name: currentProfile.full_name,
        comment_text: f.ctext.value.trim()
    }]);
    f.reset();
    await loadAllData();
};

// حذف تعليق
window.deleteComment = async (id) => {
    await sb.from('comments').delete().eq('id', id);
    await loadAllData();
};

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
