/**
 * Community Module — קהילת NLP (Skool-style)
 * IIFE pattern → window.Community
 */
(function () {
    'use strict';
    if (window._communityInitialized) return;
    window._communityInitialized = true;

    const db = window.supabaseClient;
    const PAGE_SIZE = 20;
    const ALLOWED_ROLES = ['admin', 'student_lead', 'student', 'paid_customer'];
    // Beta access whitelist — remove when ready for public launch
    const BETA_EMAILS = ['htjewelry.a474@gmail.com'];

    // ─── State ──────────────────────────────────────────────
    const state = {
        user: null,
        profile: null,
        member: null,
        isAdmin: false,
        categories: [],
        currentCategory: 'all',
        currentSort: 'recent',
        posts: [],
        currentPost: null,
        page: 0,
        hasMore: true,
        loading: false,
        searchQuery: '',
        searchTimeout: null,
        realtimeChannel: null,
        userLikes: new Set() // track which post/comment IDs current user liked
    };

    // ─── Helpers ────────────────────────────────────────────
    function timeAgo(dateStr) {
        const now = Date.now();
        const then = new Date(dateStr).getTime();
        const diff = Math.floor((now - then) / 1000);
        if (diff < 60) return 'עכשיו';
        if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דק׳`;
        if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שע׳`;
        if (diff < 604800) return `לפני ${Math.floor(diff / 86400)} ימים`;
        return new Date(dateStr).toLocaleDateString('he-IL');
    }

    function getInitials(name) {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        return parts.length >= 2
            ? (parts[0][0] + parts[1][0])
            : parts[0].slice(0, 2);
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function renderAvatar(name, avatarUrl, extraClass) {
        const cls = 'community-avatar' + (extraClass ? ' ' + extraClass : '');
        if (avatarUrl) {
            return `<div class="${cls}"><img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}" loading="lazy"></div>`;
        }
        return `<div class="${cls}">${escapeHtml(getInitials(name))}</div>`;
    }

    // ─── Data Layer ─────────────────────────────────────────
    const Data = {
        async fetchCategories() {
            const { data, error } = await db
                .from('community_categories')
                .select('*')
                .order('sort_order');
            if (error) { console.error('Categories error:', error); return []; }
            return data || [];
        },

        async fetchFeed(category, sort, page) {
            let query = db
                .from('community_posts')
                .select(`
                    *,
                    community_categories!inner(name, slug, icon, color),
                    community_members!community_posts_author_id_fkey(display_name, avatar_url, level)
                `);

            if (category && category !== 'all') {
                // Filter by category slug
                query = query.eq('community_categories.slug', category);
            }

            if (sort === 'popular') {
                query = query.order('likes_count', { ascending: false });
            } else {
                query = query.order('is_pinned', { ascending: false })
                    .order('created_at', { ascending: false });
            }

            const from = page * PAGE_SIZE;
            query = query.range(from, from + PAGE_SIZE - 1);

            const { data, error } = await query;
            if (error) { console.error('Feed error:', error); return []; }
            return data || [];
        },

        async fetchPost(postId) {
            const { data, error } = await db
                .from('community_posts')
                .select(`
                    *,
                    community_categories(name, slug, icon, color),
                    community_members!community_posts_author_id_fkey(display_name, avatar_url, level, bio)
                `)
                .eq('id', postId)
                .single();
            if (error) { console.error('Post error:', error); return null; }
            return data;
        },

        async fetchComments(postId) {
            const { data, error } = await db
                .from('community_comments')
                .select(`
                    *,
                    community_members!community_comments_author_id_fkey(display_name, avatar_url, level)
                `)
                .eq('post_id', postId)
                .order('created_at', { ascending: true });
            if (error) { console.error('Comments error:', error); return []; }
            return data || [];
        },

        async createPost(title, body, categoryId, imageUrl, linkUrl) {
            const { data, error } = await db
                .from('community_posts')
                .insert({
                    author_id: state.user.id,
                    category_id: categoryId,
                    title,
                    body,
                    image_url: imageUrl || null,
                    link_url: linkUrl || null
                })
                .select(`
                    *,
                    community_categories(name, slug, icon, color),
                    community_members!community_posts_author_id_fkey(display_name, avatar_url, level)
                `)
                .single();
            if (error) throw error;
            return data;
        },

        async deletePost(postId) {
            const { error } = await db
                .from('community_posts')
                .delete()
                .eq('id', postId);
            if (error) throw error;
        },

        async createComment(postId, body, parentId) {
            const { data, error } = await db
                .from('community_comments')
                .insert({
                    post_id: postId,
                    author_id: state.user.id,
                    parent_id: parentId || null,
                    body
                })
                .select(`
                    *,
                    community_members!community_comments_author_id_fkey(display_name, avatar_url, level)
                `)
                .single();
            if (error) throw error;
            return data;
        },

        async deleteComment(commentId) {
            const { error } = await db
                .from('community_comments')
                .delete()
                .eq('id', commentId);
            if (error) throw error;
        },

        async toggleLike(postId, commentId) {
            const col = postId ? 'post_id' : 'comment_id';
            const targetId = postId || commentId;
            const likeKey = (postId ? 'p_' : 'c_') + targetId;

            if (state.userLikes.has(likeKey)) {
                // Unlike
                let query = db.from('community_likes').delete().eq('user_id', state.user.id);
                if (postId) query = query.eq('post_id', postId);
                else query = query.eq('comment_id', commentId);
                const { error } = await query;
                if (error) throw error;
                state.userLikes.delete(likeKey);
                return false;
            } else {
                // Like
                const row = { user_id: state.user.id };
                if (postId) row.post_id = postId;
                else row.comment_id = commentId;
                const { error } = await db.from('community_likes').insert(row);
                if (error) throw error;
                state.userLikes.add(likeKey);
                return true;
            }
        },

        async fetchUserLikes() {
            const { data, error } = await db
                .from('community_likes')
                .select('post_id, comment_id')
                .eq('user_id', state.user.id);
            if (error) { console.error('Likes error:', error); return; }
            state.userLikes.clear();
            (data || []).forEach(l => {
                if (l.post_id) state.userLikes.add('p_' + l.post_id);
                if (l.comment_id) state.userLikes.add('c_' + l.comment_id);
            });
        },

        async fetchLeaderboard(limit = 10) {
            const { data, error } = await db
                .from('community_members')
                .select('user_id, display_name, avatar_url, total_points, level')
                .gt('total_points', 0)
                .order('total_points', { ascending: false })
                .limit(limit);
            if (error) { console.error('Leaderboard error:', error); return []; }
            return data || [];
        },

        async fetchMemberCount() {
            const { count, error } = await db
                .from('community_members')
                .select('*', { count: 'exact', head: true });
            if (error) return 0;
            return count || 0;
        },

        async ensureMember() {
            // Try to get existing
            const { data: existing } = await db
                .from('community_members')
                .select('*')
                .eq('user_id', state.user.id)
                .single();

            if (existing) return existing;

            // Create new
            const name = state.profile?.full_name || 'חבר קהילה';
            const avatar = state.profile?.avatar_url || null;
            const { data, error } = await db
                .from('community_members')
                .insert({
                    user_id: state.user.id,
                    display_name: name,
                    avatar_url: avatar
                })
                .select()
                .single();
            if (error) { console.error('Ensure member error:', error); return null; }
            return data;
        },

        async uploadImage(file) {
            const ext = file.name.split('.').pop().toLowerCase();
            const fileName = `${state.user.id}/${Date.now()}.${ext}`;
            const { data, error } = await db.storage
                .from('community-images')
                .upload(fileName, file, { contentType: file.type });
            if (error) throw error;
            const { data: urlData } = db.storage
                .from('community-images')
                .getPublicUrl(data.path);
            return urlData.publicUrl;
        },

        async searchPosts(query) {
            const { data, error } = await db
                .from('community_posts')
                .select(`
                    *,
                    community_categories(name, slug, icon, color),
                    community_members!community_posts_author_id_fkey(display_name, avatar_url, level)
                `)
                .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
                .order('created_at', { ascending: false })
                .limit(PAGE_SIZE);
            if (error) { console.error('Search error:', error); return []; }
            return data || [];
        },

        async pinPost(postId, pinned) {
            const { error } = await db
                .from('community_posts')
                .update({ is_pinned: pinned })
                .eq('id', postId);
            if (error) throw error;
        },

        async lockPost(postId, locked) {
            const { error } = await db
                .from('community_posts')
                .update({ is_locked: locked })
                .eq('id', postId);
            if (error) throw error;
        },

        async getUserRank(userId) {
            const { data } = await db
                .from('community_members')
                .select('user_id')
                .gt('total_points', 0)
                .order('total_points', { ascending: false });
            if (!data) return null;
            const idx = data.findIndex(m => m.user_id === userId);
            return idx >= 0 ? idx + 1 : null;
        }
    };

    // ─── Render Layer ───────────────────────────────────────
    const Render = {
        categories(cats) {
            state.categories = cats;
            const listEl = document.getElementById('categoriesList');
            const selectEl = document.getElementById('composerCategory');
            const pillsEl = document.getElementById('filterPills');

            // Sidebar nav
            let navHtml = '';
            cats.forEach(c => {
                navHtml += `<button class="community-category-item" data-category="${c.slug}">
                    <span class="community-category-icon">${c.icon}</span>
                    <span>${escapeHtml(c.name)}</span>
                </button>`;
            });
            if (listEl) listEl.innerHTML = navHtml;

            // Composer select
            let optHtml = '<option value="">בחרו קטגוריה</option>';
            cats.forEach(c => {
                optHtml += `<option value="${c.id}">${c.icon} ${escapeHtml(c.name)}</option>`;
            });
            if (selectEl) selectEl.innerHTML = optHtml;

            // Filter pills
            let pillHtml = '<button class="community-filter-pill active" data-category="all">הכל</button>';
            cats.forEach(c => {
                pillHtml += `<button class="community-filter-pill" data-category="${c.slug}">${c.icon} ${escapeHtml(c.name)}</button>`;
            });
            if (pillsEl) pillsEl.innerHTML = pillHtml;
        },

        feed(posts, append) {
            const container = document.getElementById('feedContainer');
            const empty = document.getElementById('emptyState');
            const loadMore = document.getElementById('loadMore');

            if (!append) container.innerHTML = '';

            if (posts.length === 0 && !append && state.posts.length === 0) {
                empty.style.display = 'block';
                loadMore.style.display = 'none';
                return;
            }

            empty.style.display = 'none';

            posts.forEach(post => {
                const card = document.createElement('div');
                card.innerHTML = Render.postCard(post);
                const el = card.firstElementChild;
                container.appendChild(el);
            });

            loadMore.style.display = state.hasMore ? 'flex' : 'none';
        },

        postCard(post) {
            const member = post.community_members || {};
            const cat = post.community_categories || {};
            const liked = state.userLikes.has('p_' + post.id);
            const isOwn = post.author_id === state.user.id;

            return `
            <article class="community-post-card${post.is_pinned ? ' pinned' : ''}" data-post-id="${post.id}">
                ${post.is_pinned ? '<div class="community-post-pin-label"><i class="fa-solid fa-thumbtack"></i> פוסט נעוץ</div>' : ''}
                <div class="community-post-header">
                    ${renderAvatar(member.display_name, member.avatar_url)}
                    <div class="community-post-author-info">
                        <div class="community-post-author-name">
                            ${escapeHtml(member.display_name || 'חבר קהילה')}
                            <span class="community-level-badge">⭐ ${member.level || 1}</span>
                        </div>
                        <div class="community-post-meta">
                            <span>${timeAgo(post.created_at)}</span>
                            <span class="community-post-category-pill" style="background:${cat.color || '#2F8592'}20;color:${cat.color || '#2F8592'}">
                                ${cat.icon || ''} ${escapeHtml(cat.name || '')}
                            </span>
                        </div>
                    </div>
                    ${isOwn || state.isAdmin ? `<button class="community-post-action" data-action="menu" data-post-id="${post.id}" title="אפשרויות" aria-label="אפשרויות">⋮</button>` : ''}
                </div>
                <div class="community-post-title">${escapeHtml(post.title)}</div>
                <div class="community-post-body truncated">${escapeHtml(post.body)}</div>
                ${post.image_url ? `<img class="community-post-image" src="${escapeHtml(post.image_url)}" alt="תמונה" loading="lazy">` : ''}
                ${post.link_url ? `<a class="community-post-link" href="${escapeHtml(post.link_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${escapeHtml(post.link_url)}</a>` : ''}
                <div class="community-post-footer">
                    <button class="community-post-action${liked ? ' liked' : ''}" data-action="like" data-post-id="${post.id}">
                        <span class="like-icon"></span> <span class="like-count">${post.likes_count || 0}</span>
                    </button>
                    <button class="community-post-action" data-action="comments" data-post-id="${post.id}">
                        💬 ${post.comments_count || 0}
                    </button>
                    <span class="community-post-time">${timeAgo(post.created_at)}</span>
                </div>
            </article>`;
        },

        postDetail(post) {
            const member = post.community_members || {};
            const cat = post.community_categories || {};
            const liked = state.userLikes.has('p_' + post.id);

            let adminHtml = '';
            if (state.isAdmin) {
                adminHtml = `
                <div class="community-admin-actions">
                    <button class="community-admin-btn" data-action="pin" data-post-id="${post.id}">
                        <i class="fa-solid fa-thumbtack"></i> ${post.is_pinned ? 'בטל נעיצה' : 'נעץ'}
                    </button>
                    <button class="community-admin-btn" data-action="lock" data-post-id="${post.id}">
                        <i class="fa-solid fa-lock"></i> ${post.is_locked ? 'פתח תגובות' : 'נעל תגובות'}
                    </button>
                    <button class="community-admin-btn danger" data-action="delete-post" data-post-id="${post.id}">
                        <i class="fa-solid fa-trash"></i> מחק
                    </button>
                </div>`;
            } else if (post.author_id === state.user.id) {
                adminHtml = `
                <div class="community-admin-actions">
                    <button class="community-admin-btn danger" data-action="delete-post" data-post-id="${post.id}">
                        <i class="fa-solid fa-trash"></i> מחק פוסט
                    </button>
                </div>`;
            }

            const el = document.getElementById('detailPost');
            el.innerHTML = `
                ${post.is_pinned ? '<div class="community-post-pin-label" style="display:inline-flex;"><i class="fa-solid fa-thumbtack"></i> פוסט נעוץ</div>' : ''}
                <div class="community-post-header">
                    ${renderAvatar(member.display_name, member.avatar_url)}
                    <div class="community-post-author-info">
                        <div class="community-post-author-name">
                            ${escapeHtml(member.display_name || 'חבר קהילה')}
                            <span class="community-level-badge">⭐ ${member.level || 1}</span>
                        </div>
                        <div class="community-post-meta">
                            <span>${timeAgo(post.created_at)}</span>
                            <span class="community-post-category-pill" style="background:${cat.color || '#2F8592'}20;color:${cat.color || '#2F8592'}">
                                ${cat.icon || ''} ${escapeHtml(cat.name || '')}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="community-post-title" style="font-size:1.2rem;">${escapeHtml(post.title)}</div>
                <div class="community-post-body">${escapeHtml(post.body).replace(/\n/g, '<br>')}</div>
                ${post.image_url ? `<img class="community-post-image" src="${escapeHtml(post.image_url)}" alt="תמונה">` : ''}
                ${post.link_url ? `<a class="community-post-link" href="${escapeHtml(post.link_url)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${escapeHtml(post.link_url)}</a>` : ''}
                <div class="community-post-footer">
                    <button class="community-post-action${liked ? ' liked' : ''}" data-action="like" data-post-id="${post.id}">
                        <span class="like-icon"></span> <span class="like-count">${post.likes_count || 0}</span>
                    </button>
                    <span>💬 ${post.comments_count || 0} תגובות</span>
                    <span class="community-post-time">${timeAgo(post.created_at)}</span>
                </div>
                ${adminHtml}
            `;
        },

        comments(comments) {
            const container = document.getElementById('commentsList');
            const countEl = document.getElementById('commentsCount');
            countEl.textContent = `(${comments.length})`;

            // Build tree: top-level + replies
            const topLevel = comments.filter(c => !c.parent_id);
            const replies = {};
            comments.filter(c => c.parent_id).forEach(c => {
                if (!replies[c.parent_id]) replies[c.parent_id] = [];
                replies[c.parent_id].push(c);
            });

            let html = '';
            topLevel.forEach(c => {
                html += Render.comment(c);
                if (replies[c.id]) {
                    html += '<div class="community-replies">';
                    replies[c.id].forEach(r => { html += Render.comment(r, true); });
                    html += '</div>';
                }
            });

            if (comments.length === 0) {
                html = '<div style="padding:1rem 0;text-align:center;color:var(--t-text-muted);font-size:0.85rem;">עדיין אין תגובות. היו הראשונים!</div>';
            }

            container.innerHTML = html;
        },

        comment(c, isReply) {
            const member = c.community_members || {};
            const liked = state.userLikes.has('c_' + c.id);
            const isOwn = c.author_id === state.user.id;
            const canDelete = isOwn || state.isAdmin;

            return `
            <div class="community-comment" data-comment-id="${c.id}">
                <div class="community-comment-header">
                    ${renderAvatar(member.display_name, member.avatar_url, 'community-avatar--sm')}
                    <span class="community-comment-author">
                        ${escapeHtml(member.display_name || 'חבר קהילה')}
                        <span class="community-level-badge">⭐ ${member.level || 1}</span>
                    </span>
                    <span class="community-comment-time">${timeAgo(c.created_at)}</span>
                </div>
                <div class="community-comment-body">${escapeHtml(c.body).replace(/\n/g, '<br>')}</div>
                <div class="community-comment-actions">
                    <button class="community-comment-action-btn${liked ? ' liked' : ''}" data-action="like-comment" data-comment-id="${c.id}">
                        ${liked ? '❤️' : '🤍'} ${c.likes_count || 0}
                    </button>
                    ${!isReply && state.currentPost && !state.currentPost.is_locked ? `<button class="community-comment-action-btn" data-action="reply" data-comment-id="${c.id}">↩️ תגובה</button>` : ''}
                    ${canDelete ? `<button class="community-comment-action-btn" data-action="delete-comment" data-comment-id="${c.id}">🗑️ מחק</button>` : ''}
                </div>
            </div>`;
        },

        profileCard(member) {
            if (!member) return;
            const el = document.getElementById('profileCard');
            document.getElementById('profileAvatar').innerHTML = member.avatar_url
                ? `<img src="${escapeHtml(member.avatar_url)}" alt="${escapeHtml(member.display_name)}">`
                : escapeHtml(getInitials(member.display_name));
            document.getElementById('profileName').textContent = member.display_name || 'חבר קהילה';
            document.getElementById('profileLevel').textContent = `⭐ רמה ${member.level || 1}`;
            document.getElementById('profilePoints').textContent = member.total_points || 0;
            document.getElementById('profilePosts').textContent = member.posts_count || 0;
            document.getElementById('profileLikes').textContent = member.likes_received || 0;
            if (member.bio) {
                document.getElementById('profileBio').textContent = member.bio;
            }

            // Composer avatar
            const compAvatar = document.getElementById('composerAvatar');
            if (compAvatar) {
                compAvatar.innerHTML = member.avatar_url
                    ? `<img src="${escapeHtml(member.avatar_url)}" alt="">`
                    : escapeHtml(getInitials(member.display_name));
            }
        },

        async leaderboard(entries) {
            const list = document.getElementById('leaderboardList');
            const medals = ['🥇', '🥈', '🥉'];
            let html = '';
            entries.forEach((entry, i) => {
                const isMe = entry.user_id === state.user.id;
                const rankClass = i < 3 ? ['gold', 'silver', 'bronze'][i] : '';
                html += `
                <li class="community-leaderboard-item${isMe ? ' is-me' : ''}">
                    <span class="community-leaderboard-rank ${rankClass}">${i < 3 ? medals[i] : (i + 1)}</span>
                    ${renderAvatar(entry.display_name, entry.avatar_url, 'community-avatar--sm')}
                    <span class="community-leaderboard-name">${escapeHtml(entry.display_name)}</span>
                    <span class="community-leaderboard-points">${entry.total_points}</span>
                </li>`;
            });

            if (entries.length === 0) {
                html = '<li style="padding:1rem;text-align:center;color:var(--t-text-muted);font-size:0.82rem;">עדיין אין פעילות</li>';
            }

            list.innerHTML = html;
        },

        skeletons(count) {
            const container = document.getElementById('feedContainer');
            let html = '';
            for (let i = 0; i < count; i++) {
                html += `
                <div class="community-skeleton">
                    <div style="display:flex;gap:0.75rem;margin-bottom:0.75rem;">
                        <div class="community-skeleton-avatar"></div>
                        <div style="flex:1;">
                            <div class="community-skeleton-line w-40 h-8"></div>
                            <div class="community-skeleton-line w-60 h-8"></div>
                        </div>
                    </div>
                    <div class="community-skeleton-line w-80 h-16"></div>
                    <div class="community-skeleton-line w-100"></div>
                    <div class="community-skeleton-line w-60"></div>
                </div>`;
            }
            container.innerHTML = html;
        },

        updateCategoryActive(slug) {
            // Sidebar
            document.querySelectorAll('.community-category-item').forEach(el => {
                el.classList.toggle('active', el.dataset.category === slug);
            });
            // Pills
            document.querySelectorAll('.community-filter-pill').forEach(el => {
                el.classList.toggle('active', el.dataset.category === slug);
            });
        },

        updateSortActive(sort) {
            document.querySelectorAll('.community-sort-btn').forEach(el => {
                el.classList.toggle('active', el.dataset.sort === sort);
            });
        }
    };

    // ─── Feed Loading ───────────────────────────────────────
    async function loadFeed(append) {
        if (state.loading) return;
        state.loading = true;

        if (!append) {
            state.page = 0;
            state.posts = [];
            state.hasMore = true;
            Render.skeletons(3);
        }

        try {
            let posts;
            if (state.searchQuery) {
                posts = await Data.searchPosts(state.searchQuery);
                state.hasMore = false;
            } else {
                posts = await Data.fetchFeed(state.currentCategory, state.currentSort, state.page);
                state.hasMore = posts.length === PAGE_SIZE;
            }

            if (append) {
                state.posts = state.posts.concat(posts);
            } else {
                state.posts = posts;
            }

            Render.feed(posts, append);
        } catch (err) {
            console.error('Load feed error:', err);
            if (window.UI) UI.showError('שגיאה בטעינת הפיד');
        }

        state.loading = false;
    }

    async function loadLeaderboard() {
        const entries = await Data.fetchLeaderboard(10);
        Render.leaderboard(entries);
        const count = await Data.fetchMemberCount();
        document.getElementById('membersCount').textContent = count;
    }

    async function refreshProfile() {
        state.member = await Data.ensureMember();
        Render.profileCard(state.member);
        const rank = await Data.getUserRank(state.user.id);
        const rankEl = document.getElementById('profileRank');
        if (rank) {
            rankEl.innerHTML = `מקום <strong>#${rank}</strong> בלידרבורד`;
        }
    }

    // ─── Events ─────────────────────────────────────────────
    const Events = {
        init() {
            const main = document.querySelector('.community-main');

            // Event delegation on main area
            main.addEventListener('click', (e) => {
                const target = e.target.closest('[data-action]');
                if (!target) {
                    // Click on post card → open detail
                    const card = e.target.closest('.community-post-card');
                    if (card && !e.target.closest('a') && !e.target.closest('button')) {
                        Events.openPost(card.dataset.postId);
                    }
                    return;
                }

                const action = target.dataset.action;
                const postId = target.dataset.postId;
                const commentId = target.dataset.commentId;

                switch (action) {
                    case 'like': Events.toggleLike(postId, null, target); break;
                    case 'like-comment': Events.toggleLikeComment(commentId, target); break;
                    case 'comments': Events.openPost(postId); break;
                    case 'reply': Events.showReplyComposer(commentId); break;
                    case 'delete-post': Events.confirmDelete('post', postId); break;
                    case 'delete-comment': Events.confirmDelete('comment', commentId); break;
                    case 'pin': Events.pinPost(postId); break;
                    case 'lock': Events.lockPost(postId); break;
                    case 'menu': /* Could add dropdown menu later */ break;
                }
            });

            // Category nav (sidebar)
            document.querySelector('.community-categories-nav').addEventListener('click', (e) => {
                const item = e.target.closest('.community-category-item');
                if (!item) return;
                state.currentCategory = item.dataset.category;
                Render.updateCategoryActive(state.currentCategory);
                state.searchQuery = '';
                document.getElementById('communitySearch').value = '';
                loadFeed();
            });

            // Filter pills
            document.getElementById('filterPills').addEventListener('click', (e) => {
                const pill = e.target.closest('.community-filter-pill');
                if (!pill) return;
                state.currentCategory = pill.dataset.category;
                Render.updateCategoryActive(state.currentCategory);
                state.searchQuery = '';
                document.getElementById('communitySearch').value = '';
                loadFeed();
            });

            // Sort buttons
            document.querySelector('.community-sort-bar').addEventListener('click', (e) => {
                const btn = e.target.closest('.community-sort-btn');
                if (!btn) return;
                state.currentSort = btn.dataset.sort;
                Render.updateSortActive(state.currentSort);
                loadFeed();
            });

            // New post button (sidebar)
            document.getElementById('newPostBtn').addEventListener('click', () => {
                Events.openComposer();
            });

            // FAB (mobile)
            document.getElementById('fabBtn').addEventListener('click', () => {
                Events.openComposer();
            });

            // Composer toggle
            document.getElementById('composerToggle').addEventListener('click', () => {
                Events.openComposer();
            });

            // Composer cancel
            document.getElementById('composerCancel').addEventListener('click', () => {
                Events.closeComposer();
            });

            // Composer submit
            document.getElementById('composerForm').addEventListener('submit', (e) => {
                e.preventDefault();
                Events.submitPost();
            });

            // Image upload
            document.getElementById('imageUploadBtn').addEventListener('click', () => {
                document.getElementById('imageFileInput').click();
            });

            document.getElementById('imageFileInput').addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                Events.previewImage(file);
            });

            document.getElementById('imageRemoveBtn').addEventListener('click', () => {
                Events.removeImage();
            });

            // Link toggle
            document.getElementById('linkToggleBtn').addEventListener('click', () => {
                const field = document.getElementById('linkField');
                field.style.display = field.style.display === 'none' ? 'block' : 'none';
            });

            // Back to feed
            document.getElementById('detailBack').addEventListener('click', () => {
                Events.closePosts();
            });

            // Comment submit
            document.getElementById('commentSubmitBtn').addEventListener('click', () => {
                Events.submitComment();
            });

            // Enter to submit comment
            document.getElementById('commentInput').addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    Events.submitComment();
                }
            });

            // Load more
            document.getElementById('loadMoreBtn').addEventListener('click', () => {
                state.page++;
                loadFeed(true);
            });

            // Search
            document.getElementById('communitySearch').addEventListener('input', (e) => {
                clearTimeout(state.searchTimeout);
                state.searchTimeout = setTimeout(() => {
                    state.searchQuery = e.target.value.trim();
                    loadFeed();
                }, 300);
            });

            // Sidebar toggle (mobile)
            document.getElementById('sidebarToggle').addEventListener('click', () => {
                const sidebar = document.getElementById('communitySidebar');
                const overlay = document.getElementById('sidebarOverlay');
                const isOpen = sidebar.classList.toggle('open');
                overlay.classList.toggle('open', isOpen);
                document.getElementById('sidebarToggle').setAttribute('aria-expanded', isOpen);
            });

            document.getElementById('sidebarOverlay').addEventListener('click', () => {
                document.getElementById('communitySidebar').classList.remove('open');
                document.getElementById('sidebarOverlay').classList.remove('open');
                document.getElementById('sidebarToggle').setAttribute('aria-expanded', 'false');
            });

            // Confirm modal
            document.getElementById('confirmNo').addEventListener('click', () => {
                document.getElementById('confirmModal').classList.remove('open');
            });
        },

        openComposer() {
            const composer = document.getElementById('postComposer');
            composer.classList.add('open');
            // Scroll to it on mobile
            if (window.innerWidth <= 768) {
                composer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            document.getElementById('composerTitle').focus();
        },

        closeComposer() {
            const composer = document.getElementById('postComposer');
            composer.classList.remove('open');
            document.getElementById('composerForm').reset();
            Events.removeImage();
            document.getElementById('linkField').style.display = 'none';
        },

        _pendingImageFile: null,

        previewImage(file) {
            if (file.size > 5 * 1024 * 1024) {
                if (window.UI) UI.showError('גודל התמונה מוגבל ל-5MB');
                return;
            }
            Events._pendingImageFile = file;
            const preview = document.getElementById('imagePreview');
            const img = document.getElementById('imagePreviewImg');
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
                preview.classList.add('has-image');
            };
            reader.readAsDataURL(file);
        },

        removeImage() {
            Events._pendingImageFile = null;
            document.getElementById('imagePreview').classList.remove('has-image');
            document.getElementById('imagePreviewImg').src = '';
            document.getElementById('imageFileInput').value = '';
        },

        async submitPost() {
            const title = document.getElementById('composerTitle').value.trim();
            const body = document.getElementById('composerBody').value.trim();
            const categoryId = document.getElementById('composerCategory').value;
            const linkUrl = document.getElementById('composerLink').value.trim();

            if (!title || !body || !categoryId) {
                if (window.UI) UI.showError('יש למלא כותרת, תוכן וקטגוריה');
                return;
            }

            const submitBtn = document.getElementById('composerSubmit');
            submitBtn.disabled = true;
            submitBtn.textContent = 'מפרסם...';

            try {
                let imageUrl = null;
                if (Events._pendingImageFile) {
                    imageUrl = await Data.uploadImage(Events._pendingImageFile);
                }

                const post = await Data.createPost(title, body, categoryId, imageUrl, linkUrl || null);
                Events.closeComposer();

                // Prepend to feed
                const container = document.getElementById('feedContainer');
                const emptyState = document.getElementById('emptyState');
                emptyState.style.display = 'none';

                const div = document.createElement('div');
                div.innerHTML = Render.postCard(post);
                const el = div.firstElementChild;
                el.style.animation = 'community-slide-in 0.3s ease';
                container.prepend(el);
                state.posts.unshift(post);

                // Refresh stats
                refreshProfile();
                loadLeaderboard();

                if (window.UI) UI.showSuccess('הפוסט פורסם!');
            } catch (err) {
                console.error('Submit post error:', err);
                if (window.UI) UI.showError('שגיאה בפרסום הפוסט');
            }

            submitBtn.disabled = false;
            submitBtn.textContent = 'פרסום';
        },

        async openPost(postId) {
            const feedView = document.getElementById('feedView');
            const detailView = document.getElementById('detailView');
            const commentComposer = document.getElementById('commentComposer');

            feedView.classList.add('hidden');
            detailView.classList.add('active');

            try {
                const post = await Data.fetchPost(postId);
                if (!post) {
                    if (window.UI) UI.showError('הפוסט לא נמצא');
                    Events.closePosts();
                    return;
                }
                state.currentPost = post;
                Render.postDetail(post);

                // Hide comment composer if locked
                commentComposer.style.display = post.is_locked ? 'none' : 'flex';

                const comments = await Data.fetchComments(postId);
                Render.comments(comments);
            } catch (err) {
                console.error('Open post error:', err);
                Events.closePosts();
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        closePosts() {
            document.getElementById('feedView').classList.remove('hidden');
            document.getElementById('detailView').classList.remove('active');
            state.currentPost = null;
        },

        async toggleLike(postId, commentId, btn) {
            try {
                const liked = await Data.toggleLike(postId, commentId);
                // Update UI
                if (btn) {
                    btn.classList.toggle('liked', liked);
                    const countEl = btn.querySelector('.like-count');
                    if (countEl) {
                        const current = parseInt(countEl.textContent) || 0;
                        countEl.textContent = liked ? current + 1 : Math.max(0, current - 1);
                    }
                }
                // Also update in detail view if open
                if (state.currentPost && state.currentPost.id === postId) {
                    const detailLikeBtn = document.querySelector('#detailPost [data-action="like"]');
                    if (detailLikeBtn && detailLikeBtn !== btn) {
                        detailLikeBtn.classList.toggle('liked', liked);
                        const dc = detailLikeBtn.querySelector('.like-count');
                        if (dc) {
                            const val = parseInt(dc.textContent) || 0;
                            dc.textContent = liked ? val + 1 : Math.max(0, val - 1);
                        }
                    }
                }
            } catch (err) {
                console.error('Like error:', err);
            }
        },

        async toggleLikeComment(commentId, btn) {
            try {
                const liked = await Data.toggleLike(null, commentId);
                if (btn) {
                    btn.classList.toggle('liked', liked);
                    const current = parseInt(btn.textContent.replace(/[^\d]/g, '')) || 0;
                    const member = state.currentPost ? state.currentPost.community_members : {};
                    btn.innerHTML = `${liked ? '❤️' : '🤍'} ${liked ? current + 1 : Math.max(0, current - 1)}`;
                }
            } catch (err) {
                console.error('Like comment error:', err);
            }
        },

        async submitComment() {
            const input = document.getElementById('commentInput');
            const body = input.value.trim();
            if (!body || !state.currentPost) return;
            if (state.currentPost.is_locked) {
                if (window.UI) UI.showError('התגובות נעולות בפוסט הזה');
                return;
            }

            const btn = document.getElementById('commentSubmitBtn');
            btn.disabled = true;

            try {
                await Data.createComment(state.currentPost.id, body, null);
                input.value = '';

                // Reload comments
                const comments = await Data.fetchComments(state.currentPost.id);
                Render.comments(comments);

                refreshProfile();
                loadLeaderboard();
            } catch (err) {
                console.error('Comment error:', err);
                if (window.UI) UI.showError('שגיאה בשליחת התגובה');
            }

            btn.disabled = false;
        },

        _replyTarget: null,

        showReplyComposer(commentId) {
            // Remove existing reply composers
            document.querySelectorAll('.community-reply-composer').forEach(el => el.remove());

            const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
            if (!commentEl) return;

            Events._replyTarget = commentId;

            const replyHtml = `
            <div class="community-reply-composer">
                <textarea placeholder="כתבו תגובה..." rows="1" aria-label="תגובה"></textarea>
                <button class="community-comment-submit" type="button" data-action="submit-reply">שלח</button>
            </div>`;

            commentEl.insertAdjacentHTML('afterend', replyHtml);

            const composer = commentEl.nextElementSibling;
            const textarea = composer.querySelector('textarea');
            const submitBtn = composer.querySelector('button');

            textarea.focus();

            submitBtn.addEventListener('click', async () => {
                const body = textarea.value.trim();
                if (!body) return;
                submitBtn.disabled = true;
                try {
                    await Data.createComment(state.currentPost.id, body, commentId);
                    const comments = await Data.fetchComments(state.currentPost.id);
                    Render.comments(comments);
                    refreshProfile();
                } catch (err) {
                    console.error('Reply error:', err);
                    if (window.UI) UI.showError('שגיאה בשליחת התגובה');
                }
            });

            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitBtn.click();
                }
            });
        },

        confirmDelete(type, id) {
            const modal = document.getElementById('confirmModal');
            const title = document.getElementById('confirmTitle');
            const text = document.getElementById('confirmText');
            const yes = document.getElementById('confirmYes');

            title.textContent = type === 'post' ? 'מחיקת פוסט' : 'מחיקת תגובה';
            text.textContent = 'הפעולה הזו לא ניתנת לביטול. להמשיך?';
            modal.classList.add('open');

            // Clone to remove old listeners
            const newYes = yes.cloneNode(true);
            yes.parentNode.replaceChild(newYes, yes);

            newYes.addEventListener('click', async () => {
                modal.classList.remove('open');
                try {
                    if (type === 'post') {
                        await Data.deletePost(id);
                        // Remove from feed
                        const card = document.querySelector(`[data-post-id="${id}"]`);
                        if (card) card.remove();
                        state.posts = state.posts.filter(p => p.id !== id);
                        if (state.currentPost && state.currentPost.id === id) {
                            Events.closePosts();
                        }
                        if (window.UI) UI.showSuccess('הפוסט נמחק');
                    } else {
                        await Data.deleteComment(id);
                        // Reload comments
                        if (state.currentPost) {
                            const comments = await Data.fetchComments(state.currentPost.id);
                            Render.comments(comments);
                        }
                        if (window.UI) UI.showSuccess('התגובה נמחקה');
                    }
                    refreshProfile();
                    loadLeaderboard();
                } catch (err) {
                    console.error('Delete error:', err);
                    if (window.UI) UI.showError('שגיאה במחיקה');
                }
            });
        },

        async pinPost(postId) {
            if (!state.isAdmin) return;
            try {
                const post = state.currentPost;
                const newPinned = !post.is_pinned;
                await Data.pinPost(postId, newPinned);
                post.is_pinned = newPinned;
                Render.postDetail(post);
                if (window.UI) UI.showSuccess(newPinned ? 'הפוסט נוענץ' : 'הנעיצה בוטלה');
            } catch (err) {
                console.error('Pin error:', err);
            }
        },

        async lockPost(postId) {
            if (!state.isAdmin) return;
            try {
                const post = state.currentPost;
                const newLocked = !post.is_locked;
                await Data.lockPost(postId, newLocked);
                post.is_locked = newLocked;
                Render.postDetail(post);
                document.getElementById('commentComposer').style.display = newLocked ? 'none' : 'flex';
                if (window.UI) UI.showSuccess(newLocked ? 'התגובות ננעלו' : 'התגובות נפתחו');
            } catch (err) {
                console.error('Lock error:', err);
            }
        }
    };

    // ─── Realtime ───────────────────────────────────────────
    const Realtime = {
        subscribe() {
            state.realtimeChannel = db.channel('community-realtime')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'community_posts'
                }, (payload) => {
                    // Don't add our own posts (already added optimistically)
                    if (payload.new.author_id === state.user.id) return;
                    // Reload feed to get joined data
                    loadFeed();
                })
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'community_comments'
                }, (payload) => {
                    // Reload comments if viewing the same post
                    if (state.currentPost && payload.new.post_id === state.currentPost.id) {
                        if (payload.new.author_id !== state.user.id) {
                            Data.fetchComments(state.currentPost.id).then(comments => {
                                Render.comments(comments);
                            });
                        }
                    }
                })
                .on('postgres_changes', {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'community_posts'
                }, (payload) => {
                    const card = document.querySelector(`[data-post-id="${payload.old.id}"]`);
                    if (card) card.remove();
                    state.posts = state.posts.filter(p => p.id !== payload.old.id);
                })
                .subscribe();
        },

        unsubscribe() {
            if (state.realtimeChannel) {
                db.removeChannel(state.realtimeChannel);
                state.realtimeChannel = null;
            }
        }
    };

    // ─── CSS animation (injected once) ──────────────────────
    const style = document.createElement('style');
    style.textContent = `
        @keyframes community-slide-in {
            from { opacity: 0; transform: translateY(-12px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);

    // ─── Init ───────────────────────────────────────────────
    async function init() {
        try {
            state.user = await Auth.getCurrentUser();
            if (!state.user) {
                window.location.href = 'login.html';
                return;
            }

            // Get profile and check role
            const { data: profile } = await db
                .from('profiles')
                .select('*')
                .eq('id', state.user.id)
                .single();

            state.profile = profile;
            state.isAdmin = profile?.role === 'admin';

            if (!ALLOWED_ROLES.includes(profile?.role)) {
                window.location.href = 'course-library.html';
                return;
            }

            // Beta access check — remove when ready for public launch
            if (BETA_EMAILS.length > 0 && !BETA_EMAILS.includes(state.user.email?.toLowerCase()) && profile?.role !== 'admin') {
                window.location.href = 'course-library.html';
                return;
            }

            // Load in parallel
            const [categories, _member, _likes] = await Promise.all([
                Data.fetchCategories(),
                Data.ensureMember().then(m => { state.member = m; }),
                Data.fetchUserLikes()
            ]);

            Render.categories(categories);
            Render.profileCard(state.member);

            const rank = await Data.getUserRank(state.user.id);
            if (rank) {
                document.getElementById('profileRank').innerHTML = `מקום <strong>#${rank}</strong> בלידרבורד`;
            }

            await Promise.all([
                loadFeed(),
                loadLeaderboard()
            ]);

            Events.init();
            Realtime.subscribe();

        } catch (err) {
            console.error('Community init error:', err);
            if (window.UI) UI.showError('שגיאה בטעינת הקהילה');
        }
    }

    // Export
    window.Community = { init, Data, state };

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
