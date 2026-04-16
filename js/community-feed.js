// ============================================================================
// Community Feed — Facebook-style inline post board for course-library.html
// ============================================================================

(function () {
    var _posts = [];
    var _loaded = false;
    var _isAdmin = false;
    var _userId = null;
    var _userFullName = '';
    var _userAvatar = null;
    var _authors = new Map(); // user_id → { name, avatar }
    var _openMenuId = null;

    function el(id) { return document.getElementById(id); }
    function show(id) { var e = el(id); if (e) e.style.display = ''; }
    function hide(id) { var e = el(id); if (e) e.style.display = 'none'; }

    function timeAgo(dateStr) {
        var diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (diff < 60) return 'עכשיו';
        if (diff < 3600) return 'לפני ' + Math.floor(diff / 60) + ' דק׳';
        if (diff < 86400) {
            var h = Math.floor(diff / 3600);
            return 'לפני ' + h + (h === 1 ? ' שעה' : ' שעות');
        }
        if (diff < 172800) return 'אתמול';
        if (diff < 604800) return 'לפני ' + Math.floor(diff / 86400) + ' ימים';
        return new Date(dateStr).toLocaleDateString('he-IL');
    }

    function esc(s) {
        if (!s) return '';
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function avatarHtml(name, url, size) {
        size = size || 40;
        if (url) {
            return '<img class="cf-avatar" src="' + esc(url) + '" alt="' + esc(name) + '"'
                + ' style="width:' + size + 'px;height:' + size + 'px;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
                + '<div class="cf-avatar cf-avatar-fallback" style="width:' + size + 'px;height:' + size + 'px;display:none;font-size:' + Math.round(size * 0.42) + 'px">'
                + esc((name || '?').charAt(0)) + '</div>';
        }
        return '<div class="cf-avatar cf-avatar-fallback" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.42) + 'px">'
            + esc((name || '?').charAt(0)) + '</div>';
    }

    // ── Init ────────────────────────────────────────────────────────────────
    async function init() {
        if (_loaded) { renderFeed(); return; }
        try {
            var sess = await supabaseClient.auth.getSession();
            if (!sess.data?.session?.user) return;
            var user = sess.data.session.user;
            _userId = user.id;

            // Get avatar from Google OAuth metadata
            _userAvatar = user.user_metadata?.avatar_url
                || user.user_metadata?.picture
                || null;

            var prof = await supabaseClient.from('profiles')
                .select('role, full_name, avatar_url')
                .eq('id', _userId).single();
            _isAdmin = prof.data?.role === 'admin';
            _userFullName = prof.data?.full_name || user.user_metadata?.full_name || '';
            // Prefer profiles.avatar_url if set, else OAuth
            if (prof.data?.avatar_url) _userAvatar = prof.data.avatar_url;

            // Render composer with user avatar
            renderComposer();

            await loadPosts();
            _loaded = true;
        } catch (err) {
            console.error('[community-feed] init error:', err);
        }
    }

    // ── Composer ────────────────────────────────────────────────────────────
    function renderComposer() {
        var comp = el('communityComposer');
        if (!comp) return;
        comp.innerHTML =
            '<div class="cf-composer-top">'
            +   avatarHtml(_userFullName, _userAvatar, 40)
            +   '<textarea id="communityPostInput" placeholder="מה חדש אצלך?" rows="1" maxlength="2000" dir="rtl"'
            +   ' onfocus="this.rows=4" onblur="if(!this.value.trim())this.rows=1"></textarea>'
            + '</div>'
            + '<div class="cf-composer-bottom">'
            +   '<button id="communityPostBtn" onclick="submitCommunityPost()">פרסם</button>'
            + '</div>';
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

        // Resolve author info: try community_members first, fallback to profiles
        var authorIds = [...new Set(posts.map(function (p) { return p.author_id; }))];
        // Add current user so we always have their info
        if (_userId && !authorIds.includes(_userId)) authorIds.push(_userId);

        _authors.clear();
        if (authorIds.length) {
            // Batch: community_members
            var mRes = await supabaseClient.from('community_members')
                .select('user_id, display_name, avatar_url')
                .in('user_id', authorIds);
            (mRes.data || []).forEach(function (m) {
                _authors.set(m.user_id, { name: m.display_name, avatar: m.avatar_url });
            });

            // Batch: profiles for anyone still missing
            var missing = authorIds.filter(function (id) { return !_authors.has(id); });
            if (missing.length) {
                var pRes = await supabaseClient.from('profiles')
                    .select('id, full_name, avatar_url')
                    .in('id', missing);
                (pRes.data || []).forEach(function (p) {
                    _authors.set(p.id, { name: p.full_name, avatar: p.avatar_url });
                });
            }
        }

        // Current user override — use fresh OAuth avatar if profiles doesn't have one
        if (_userId && _userAvatar) {
            var cur = _authors.get(_userId) || { name: _userFullName, avatar: null };
            if (!cur.avatar) cur.avatar = _userAvatar;
            cur.name = cur.name || _userFullName;
            _authors.set(_userId, cur);
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
            var author = _authors.get(post.author_id) || { name: 'משתמש', avatar: null };
            var name = esc(author.name || 'משתמש');
            var isOwn = post.author_id === _userId;
            var showMenu = _isAdmin || isOwn;
            var pinLabel = post.is_pinned ? 'בטל נעיצה' : 'נעץ פוסט';

            return '<div class="cf-post' + (post.is_pinned ? ' pinned' : '') + '" data-id="' + post.id + '">'
                + (post.is_pinned ? '<div class="cf-pin-badge"><i class="fa-solid fa-thumbtack"></i> פוסט נעוץ</div>' : '')
                + '<div class="cf-post-header">'
                +   avatarHtml(author.name, author.avatar, 44)
                +   '<div class="cf-post-info">'
                +     '<span class="cf-post-author">' + name + '</span>'
                +     '<span class="cf-post-time">' + timeAgo(post.created_at) + '</span>'
                +   '</div>'
                +   (showMenu ? '<button class="cf-menu-btn" onclick="CommunityFeed._toggleMenu(\'' + post.id + '\', event)"><i class="fa-solid fa-ellipsis"></i></button>' : '')
                + '</div>'
                + (showMenu ? '<div class="cf-menu" id="cmenu-' + post.id + '" style="display:none;">'
                    + (_isAdmin ? '<div class="cf-menu-item" onclick="CommunityFeed._pin(\'' + post.id + '\',' + !post.is_pinned + ')"><i class="fa-solid fa-thumbtack"></i> ' + pinLabel + '</div>' : '')
                    + '<div class="cf-menu-item danger" onclick="CommunityFeed._delete(\'' + post.id + '\')"><i class="fa-solid fa-trash-can"></i> מחק פוסט</div>'
                + '</div>' : '')
                + '<div class="cf-post-body">' + esc(post.body).replace(/\n/g, '<br>') + '</div>'
            + '</div>';
        }).join('');
    }

    // ── Actions ─────────────────────────────────────────────────────────────
    function toggleMenu(postId, event) {
        event.stopPropagation();
        var menu = el('cmenu-' + postId);
        if (!menu) return;
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
        btn.textContent = 'מפרסם...';

        try {
            // Ensure author exists in community_members (with avatar)
            var existing = await supabaseClient.from('community_members')
                .select('user_id, avatar_url').eq('user_id', _userId).single();
            if (!existing.data) {
                await supabaseClient.from('community_members').insert({
                    user_id: _userId,
                    display_name: _userFullName || 'משתמש',
                    avatar_url: _userAvatar || null,
                    level: 1, total_points: 0, posts_count: 0, likes_received: 0
                });
            } else if (_userAvatar && !existing.data.avatar_url) {
                // Update avatar if we have one from OAuth but community_members doesn't
                await supabaseClient.from('community_members')
                    .update({ avatar_url: _userAvatar })
                    .eq('user_id', _userId);
            }

            var ins = await supabaseClient.from('community_posts').insert({
                author_id: _userId,
                body: body,
                is_pinned: false, is_locked: false,
                likes_count: 0, comments_count: 0
            });
            if (ins.error) throw ins.error;

            input.value = '';
            input.rows = 1;
            _loaded = false;
            await init();
        } catch (err) {
            console.error('[community-feed] post error:', err);
            alert('שגיאה בפרסום — נסה שוב.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'פרסם';
        }
    }

    async function deletePost(postId) {
        if (!confirm('למחוק את הפוסט?')) return;
        try {
            await supabaseClient.from('community_posts').delete().eq('id', postId);
            _loaded = false;
            await init();
        } catch (err) { alert('שגיאה במחיקה.'); }
    }

    async function togglePin(postId, pinned) {
        try {
            await supabaseClient.from('community_posts')
                .update({ is_pinned: pinned }).eq('id', postId);
            _loaded = false;
            await init();
        } catch (err) { alert('שגיאה בנעיצה.'); }
    }

    document.addEventListener('click', function () {
        if (_openMenuId) {
            var menu = el('cmenu-' + _openMenuId);
            if (menu) menu.style.display = 'none';
            _openMenuId = null;
        }
    });

    window.CommunityFeed = {
        init: init, loadPosts: loadPosts,
        _toggleMenu: toggleMenu, _pin: togglePin, _delete: deletePost
    };
    window.submitCommunityPost = submitPost;
})();
