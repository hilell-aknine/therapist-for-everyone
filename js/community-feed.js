// ============================================================================
// Community Feed — minimal inline post board for course-library.html
// Supabase tables: community_posts, community_members, profiles
// ============================================================================

(function () {
    let _posts = [];
    let _loaded = false;
    let _isAdmin = false;
    let _userId = null;
    let _userFullName = '';
    let _members = new Map();
    let _openMenuId = null;

    function el(id) { return document.getElementById(id); }
    function show(id) { var e = el(id); if (e) e.style.display = ''; }
    function hide(id) { var e = el(id); if (e) e.style.display = 'none'; }

    // ── Hebrew relative time ────────────────────────────────────────────────
    function timeAgo(dateStr) {
        var diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (diff < 60) return 'עכשיו';
        if (diff < 3600) return 'לפני ' + Math.floor(diff / 60) + ' דק׳';
        if (diff < 86400) return 'לפני ' + Math.floor(diff / 3600) + ' שעות';
        if (diff < 172800) return 'אתמול';
        if (diff < 604800) return 'לפני ' + Math.floor(diff / 86400) + ' ימים';
        return new Date(dateStr).toLocaleDateString('he-IL');
    }

    // ── Escape HTML ─────────────────────────────────────────────────────────
    function esc(s) {
        if (!s) return '';
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Init (idempotent) ───────────────────────────────────────────────────
    async function init() {
        if (_loaded) { renderFeed(); return; }
        try {
            var sess = await supabaseClient.auth.getSession();
            if (!sess.data?.session?.user) return;
            _userId = sess.data.session.user.id;

            var prof = await supabaseClient.from('profiles').select('role, full_name').eq('id', _userId).single();
            _isAdmin = prof.data?.role === 'admin';
            _userFullName = prof.data?.full_name || '';

            await loadPosts();
            _loaded = true;
        } catch (err) {
            console.error('[community-feed] init error:', err);
        }
    }

    // ── Load posts ──────────────────────────────────────────────────────────
    async function loadPosts() {
        show('communityLoading');
        hide('communityEmpty');
        var feedEl = el('communityFeed');
        if (feedEl) feedEl.innerHTML = '';

        var res = await supabaseClient
            .from('community_posts')
            .select('id, author_id, body, is_pinned, created_at')
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(50);

        var posts = res.data || [];

        // Resolve author names
        var authorIds = [...new Set(posts.map(function (p) { return p.author_id; }))];
        if (authorIds.length) {
            var mRes = await supabaseClient.from('community_members')
                .select('user_id, display_name, avatar_url')
                .in('user_id', authorIds);
            _members.clear();
            (mRes.data || []).forEach(function (m) { _members.set(m.user_id, m); });

            // Fallback to profiles for authors not in community_members
            for (var i = 0; i < authorIds.length; i++) {
                if (!_members.has(authorIds[i])) {
                    var pRes = await supabaseClient.from('profiles')
                        .select('full_name').eq('id', authorIds[i]).single();
                    if (pRes.data) _members.set(authorIds[i], { display_name: pRes.data.full_name, avatar_url: null });
                }
            }
        }

        _posts = posts;
        hide('communityLoading');
        renderFeed();
    }

    // ── Render ──────────────────────────────────────────────────────────────
    function renderFeed() {
        var feedEl = el('communityFeed');
        if (!feedEl) return;

        if (_posts.length === 0) {
            feedEl.innerHTML = '';
            show('communityEmpty');
            return;
        }
        hide('communityEmpty');

        feedEl.innerHTML = _posts.map(function (post) {
            var member = _members.get(post.author_id) || { display_name: 'משתמש', avatar_url: null };
            var name = esc(member.display_name || 'משתמש');
            var initials = (member.display_name || '?').charAt(0);
            var isOwn = post.author_id === _userId;
            var showMenu = _isAdmin || isOwn;
            var pinLabel = post.is_pinned ? 'בטל נעיצה' : 'נעץ פוסט';

            return '<div class="community-post' + (post.is_pinned ? ' pinned' : '') + '" data-id="' + post.id + '">'
                + (post.is_pinned ? '<div class="community-pin-badge"><i class="fa-solid fa-thumbtack"></i> פוסט נעוץ</div>' : '')
                + '<div class="community-post-meta">'
                +   '<div class="community-avatar">' + esc(initials) + '</div>'
                +   '<div class="community-meta-text">'
                +     '<span class="community-author">' + name + '</span>'
                +     '<span class="community-time">' + timeAgo(post.created_at) + '</span>'
                +   '</div>'
                +   (showMenu ? '<button class="community-menu-btn" onclick="CommunityFeed._toggleMenu(\'' + post.id + '\', event)"><i class="fa-solid fa-ellipsis-vertical"></i></button>' : '')
                + '</div>'
                + (showMenu ? '<div class="community-menu" id="cmenu-' + post.id + '" style="display:none;">'
                    + (_isAdmin ? '<div class="community-menu-item" onclick="CommunityFeed._pin(\'' + post.id + '\',' + !post.is_pinned + ')"><i class="fa-solid fa-thumbtack"></i> ' + pinLabel + '</div>' : '')
                    + '<div class="community-menu-item danger" onclick="CommunityFeed._delete(\'' + post.id + '\')"><i class="fa-solid fa-trash"></i> מחק</div>'
                + '</div>' : '')
                + '<div class="community-post-body">' + esc(post.body).replace(/\n/g, '<br>') + '</div>'
            + '</div>';
        }).join('');
    }

    // ── Actions ─────────────────────────────────────────────────────────────
    function toggleMenu(postId, event) {
        event.stopPropagation();
        var menu = el('cmenu-' + postId);
        if (!menu) return;

        // Close any previously open menu
        if (_openMenuId && _openMenuId !== postId) {
            var prev = el('cmenu-' + _openMenuId);
            if (prev) prev.style.display = 'none';
        }

        if (menu.style.display === 'none') {
            menu.style.display = '';
            _openMenuId = postId;
        } else {
            menu.style.display = 'none';
            _openMenuId = null;
        }
    }

    async function submitPost() {
        var input = el('communityPostInput');
        var btn = el('communityPostBtn');
        if (!input || !btn) return;

        var body = input.value.trim();
        if (!body) return;

        btn.disabled = true;
        btn.textContent = 'שולח...';

        try {
            // Ensure author exists in community_members
            var existing = await supabaseClient.from('community_members')
                .select('user_id').eq('user_id', _userId).single();
            if (!existing.data) {
                await supabaseClient.from('community_members').insert({
                    user_id: _userId,
                    display_name: _userFullName || 'משתמש',
                    level: 1,
                    total_points: 0,
                    posts_count: 0,
                    likes_received: 0
                });
            }

            var ins = await supabaseClient.from('community_posts').insert({
                author_id: _userId,
                body: body,
                is_pinned: false,
                is_locked: false,
                likes_count: 0,
                comments_count: 0
            });
            if (ins.error) throw ins.error;

            input.value = '';
            _loaded = false;
            await init();
        } catch (err) {
            console.error('[community-feed] post error:', err);
            alert('שגיאה בפרסום — נסה שוב.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'פרסם ▸';
        }
    }

    async function deletePost(postId) {
        if (!confirm('למחוק את הפוסט?')) return;
        try {
            await supabaseClient.from('community_posts').delete().eq('id', postId);
            _loaded = false;
            await init();
        } catch (err) {
            alert('שגיאה במחיקה.');
        }
    }

    async function togglePin(postId, pinned) {
        try {
            await supabaseClient.from('community_posts')
                .update({ is_pinned: pinned })
                .eq('id', postId);
            _loaded = false;
            await init();
        } catch (err) {
            alert('שגיאה בנעיצה.');
        }
    }

    // Close menus on click outside
    document.addEventListener('click', function () {
        if (_openMenuId) {
            var menu = el('cmenu-' + _openMenuId);
            if (menu) menu.style.display = 'none';
            _openMenuId = null;
        }
    });

    // ── Public API ──────────────────────────────────────────────────────────
    window.CommunityFeed = {
        init: init,
        loadPosts: loadPosts,
        _toggleMenu: toggleMenu,
        _pin: togglePin,
        _delete: deletePost
    };
    window.submitCommunityPost = submitPost;
})();
