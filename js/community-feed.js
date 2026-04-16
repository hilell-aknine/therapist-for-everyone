// ============================================================================
// Community Feed — Facebook-style with likes + comments
// Tables: community_posts, community_comments, community_likes, community_members, profiles
// ============================================================================

(function () {
    var _posts = [];
    var _loaded = false;
    var _isAdmin = false;
    var _userId = null;
    var _userFullName = '';
    var _userAvatar = null;
    var _authors = new Map();
    var _myLikes = new Set();       // post IDs user liked
    var _comments = new Map();      // post_id → [comments]
    var _openMenuId = null;
    var _expandedComments = new Set(); // post IDs with comments section open

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
            _userAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;

            var prof = await supabaseClient.from('profiles')
                .select('role, full_name, avatar_url').eq('id', _userId).single();
            _isAdmin = prof.data?.role === 'admin';
            _userFullName = prof.data?.full_name || user.user_metadata?.full_name || '';
            if (prof.data?.avatar_url) _userAvatar = prof.data.avatar_url;

            renderComposer();
            await loadPosts();
            _loaded = true;
        } catch (err) {
            console.error('[community-feed] init error:', err);
        }
    }

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

    // ── Load posts + likes + comments ───────────────────────────────────────
    async function loadPosts() {
        show('communityLoading');
        hide('communityEmpty');
        var feedEl = el('communityFeed');
        if (feedEl) feedEl.innerHTML = '';

        var [postsRes, likesRes, commentsRes] = await Promise.all([
            supabaseClient.from('community_posts')
                .select('id, author_id, body, is_pinned, likes_count, comments_count, created_at')
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(50),
            // My likes
            supabaseClient.from('community_likes')
                .select('post_id')
                .eq('user_id', _userId)
                .not('post_id', 'is', null),
            // All comments
            supabaseClient.from('community_comments')
                .select('id, post_id, author_id, body, created_at')
                .order('created_at', { ascending: true })
                .limit(500)
        ]);

        var posts = postsRes.data || [];

        // My likes set
        _myLikes.clear();
        (likesRes.data || []).forEach(function (l) { if (l.post_id) _myLikes.add(l.post_id); });

        // Comments grouped by post
        _comments.clear();
        (commentsRes.data || []).forEach(function (c) {
            var arr = _comments.get(c.post_id) || [];
            arr.push(c);
            _comments.set(c.post_id, arr);
        });

        // Resolve authors — collect all unique IDs (from posts + comments)
        var allAuthorIds = new Set(posts.map(function (p) { return p.author_id; }));
        (commentsRes.data || []).forEach(function (c) { allAuthorIds.add(c.author_id); });
        if (_userId) allAuthorIds.add(_userId);
        var authorIds = [...allAuthorIds];

        _authors.clear();
        if (authorIds.length) {
            var mRes = await supabaseClient.from('community_members')
                .select('user_id, display_name, avatar_url').in('user_id', authorIds);
            (mRes.data || []).forEach(function (m) {
                _authors.set(m.user_id, { name: m.display_name, avatar: m.avatar_url });
            });
            var missing = authorIds.filter(function (id) { return !_authors.has(id); });
            if (missing.length) {
                var pRes = await supabaseClient.from('profiles')
                    .select('id, full_name, avatar_url').in('id', missing);
                (pRes.data || []).forEach(function (p) {
                    _authors.set(p.id, { name: p.full_name, avatar: p.avatar_url });
                });
            }
        }
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
        if (_posts.length === 0) { feedEl.innerHTML = ''; show('communityEmpty'); return; }
        hide('communityEmpty');
        feedEl.innerHTML = _posts.map(renderPost).join('');
    }

    function renderPost(post) {
        var author = _authors.get(post.author_id) || { name: 'משתמש', avatar: null };
        var name = esc(author.name || 'משתמש');
        var isOwn = post.author_id === _userId;
        var showMenu = _isAdmin || isOwn;
        var pinLabel = post.is_pinned ? 'בטל נעיצה' : 'נעץ פוסט';
        var liked = _myLikes.has(post.id);
        var likeCount = post.likes_count || 0;
        var commentCount = post.comments_count || 0;
        var postComments = _comments.get(post.id) || [];
        var commentsOpen = _expandedComments.has(post.id);

        var html = '<div class="cf-post' + (post.is_pinned ? ' pinned' : '') + '" data-id="' + post.id + '">';

        // Pin badge
        if (post.is_pinned) html += '<div class="cf-pin-badge"><i class="fa-solid fa-thumbtack"></i> פוסט נעוץ</div>';

        // Header
        html += '<div class="cf-post-header">'
            + avatarHtml(author.name, author.avatar, 44)
            + '<div class="cf-post-info">'
            + '<span class="cf-post-author">' + name + '</span>'
            + '<span class="cf-post-time">' + timeAgo(post.created_at) + '</span>'
            + '</div>'
            + (showMenu ? '<button class="cf-menu-btn" onclick="CommunityFeed._toggleMenu(\'' + post.id + '\', event)"><i class="fa-solid fa-ellipsis"></i></button>' : '')
            + '</div>';

        // Menu
        if (showMenu) {
            html += '<div class="cf-menu" id="cmenu-' + post.id + '" style="display:none;">'
                + (_isAdmin ? '<div class="cf-menu-item" onclick="CommunityFeed._pin(\'' + post.id + '\',' + !post.is_pinned + ')"><i class="fa-solid fa-thumbtack"></i> ' + pinLabel + '</div>' : '')
                + '<div class="cf-menu-item danger" onclick="CommunityFeed._delete(\'' + post.id + '\')"><i class="fa-solid fa-trash-can"></i> מחק פוסט</div>'
                + '</div>';
        }

        // Body
        html += '<div class="cf-post-body">' + esc(post.body).replace(/\n/g, '<br>') + '</div>';

        // Like + comment counts bar
        if (likeCount > 0 || commentCount > 0) {
            html += '<div class="cf-counts">';
            if (likeCount > 0) html += '<span class="cf-count-likes"><i class="fa-solid fa-thumbs-up cf-like-icon-small"></i> ' + likeCount + '</span>';
            if (commentCount > 0) html += '<span class="cf-count-comments" onclick="CommunityFeed._toggleComments(\'' + post.id + '\')">' + commentCount + ' תגובות</span>';
            html += '</div>';
        }

        // Action buttons bar (Like + Comment)
        html += '<div class="cf-actions">'
            + '<button class="cf-action-btn' + (liked ? ' liked' : '') + '" onclick="CommunityFeed._like(\'' + post.id + '\',' + liked + ')">'
            + '<i class="' + (liked ? 'fa-solid' : 'fa-regular') + ' fa-thumbs-up"></i> אהבתי'
            + '</button>'
            + '<button class="cf-action-btn" onclick="CommunityFeed._toggleComments(\'' + post.id + '\')">'
            + '<i class="fa-regular fa-comment"></i> תגובה'
            + '</button>'
            + '</div>';

        // Comments section
        html += '<div class="cf-comments-section" id="cf-comments-' + post.id + '" style="display:' + (commentsOpen ? '' : 'none') + ';">';

        // Existing comments
        if (postComments.length) {
            html += postComments.map(function (c) {
                var ca = _authors.get(c.author_id) || { name: 'משתמש', avatar: null };
                var canDeleteComment = _isAdmin || c.author_id === _userId;
                return '<div class="cf-comment">'
                    + avatarHtml(ca.name, ca.avatar, 32)
                    + '<div class="cf-comment-bubble">'
                    + '<span class="cf-comment-author">' + esc(ca.name || 'משתמש') + '</span>'
                    + '<span class="cf-comment-body">' + esc(c.body).replace(/\n/g, '<br>') + '</span>'
                    + '</div>'
                    + (canDeleteComment ? '<button class="cf-comment-delete" onclick="CommunityFeed._deleteComment(\'' + c.id + '\',\'' + post.id + '\')" title="מחק"><i class="fa-solid fa-xmark"></i></button>' : '')
                    + '</div>'
                    + '<div class="cf-comment-time">' + timeAgo(c.created_at) + '</div>';
            }).join('');
        }

        // Comment input
        html += '<div class="cf-comment-input">'
            + avatarHtml(_userFullName, _userAvatar, 32)
            + '<input type="text" placeholder="כתוב תגובה..." maxlength="1000" dir="rtl"'
            + ' id="cf-cinput-' + post.id + '"'
            + ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();CommunityFeed._submitComment(\'' + post.id + '\')}">'
            + '</div>';

        html += '</div>'; // cf-comments-section
        html += '</div>'; // cf-post
        return html;
    }

    // ── Like ────────────────────────────────────────────────────────────────
    async function toggleLike(postId, alreadyLiked) {
        try {
            if (alreadyLiked) {
                await supabaseClient.from('community_likes')
                    .delete().eq('user_id', _userId).eq('post_id', postId);
                _myLikes.delete(postId);
                // Decrement count locally
                var p = _posts.find(function (x) { return x.id === postId; });
                if (p) p.likes_count = Math.max(0, (p.likes_count || 0) - 1);
            } else {
                await supabaseClient.from('community_likes')
                    .insert({ user_id: _userId, post_id: postId });
                _myLikes.add(postId);
                var p2 = _posts.find(function (x) { return x.id === postId; });
                if (p2) p2.likes_count = (p2.likes_count || 0) + 1;
            }
            renderFeed();
        } catch (err) {
            console.error('[community-feed] like error:', err);
        }
    }

    // ── Comments ────────────────────────────────────────────────────────────
    function toggleComments(postId) {
        if (_expandedComments.has(postId)) {
            _expandedComments.delete(postId);
        } else {
            _expandedComments.add(postId);
        }
        renderFeed();
        // Focus the input after render
        if (_expandedComments.has(postId)) {
            setTimeout(function () {
                var inp = el('cf-cinput-' + postId);
                if (inp) inp.focus();
            }, 50);
        }
    }

    async function submitComment(postId) {
        var inp = el('cf-cinput-' + postId);
        if (!inp) return;
        var body = inp.value.trim();
        if (!body) return;
        inp.disabled = true;

        try {
            // Ensure author in community_members
            var existing = await supabaseClient.from('community_members')
                .select('user_id').eq('user_id', _userId).single();
            if (!existing.data) {
                await supabaseClient.from('community_members').insert({
                    user_id: _userId, display_name: _userFullName || 'משתמש',
                    avatar_url: _userAvatar || null,
                    level: 1, total_points: 0, posts_count: 0, likes_received: 0
                });
            }

            var ins = await supabaseClient.from('community_comments').insert({
                post_id: postId, author_id: _userId, body: body
            });
            if (ins.error) throw ins.error;

            // Update local comments_count
            var post = _posts.find(function (x) { return x.id === postId; });
            if (post) post.comments_count = (post.comments_count || 0) + 1;

            // Add to local comments map
            var arr = _comments.get(postId) || [];
            arr.push({ id: 'temp-' + Date.now(), post_id: postId, author_id: _userId, body: body, created_at: new Date().toISOString() });
            _comments.set(postId, arr);

            _expandedComments.add(postId);
            renderFeed();
        } catch (err) {
            console.error('[community-feed] comment error:', err);
            alert('שגיאה בתגובה — נסה שוב.');
        } finally {
            if (inp) inp.disabled = false;
        }
    }

    async function deleteComment(commentId, postId) {
        if (!confirm('למחוק את התגובה?')) return;
        try {
            await supabaseClient.from('community_comments').delete().eq('id', commentId);
            var arr = _comments.get(postId) || [];
            _comments.set(postId, arr.filter(function (c) { return c.id !== commentId; }));
            var post = _posts.find(function (x) { return x.id === postId; });
            if (post) post.comments_count = Math.max(0, (post.comments_count || 0) - 1);
            renderFeed();
        } catch (err) { alert('שגיאה במחיקה.'); }
    }

    // ── Post actions ────────────────────────────────────────────────────────
    function toggleMenu(postId, event) {
        event.stopPropagation();
        var menu = el('cmenu-' + postId);
        if (!menu) return;
        if (_openMenuId && _openMenuId !== postId) {
            var prev = el('cmenu-' + _openMenuId);
            if (prev) prev.style.display = 'none';
        }
        menu.style.display = menu.style.display === 'none' ? '' : 'none';
        _openMenuId = menu.style.display === 'none' ? null : postId;
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
            var existing = await supabaseClient.from('community_members')
                .select('user_id, avatar_url').eq('user_id', _userId).single();
            if (!existing.data) {
                await supabaseClient.from('community_members').insert({
                    user_id: _userId, display_name: _userFullName || 'משתמש',
                    avatar_url: _userAvatar || null,
                    level: 1, total_points: 0, posts_count: 0, likes_received: 0
                });
            } else if (_userAvatar && !existing.data.avatar_url) {
                await supabaseClient.from('community_members')
                    .update({ avatar_url: _userAvatar }).eq('user_id', _userId);
            }
            var ins = await supabaseClient.from('community_posts').insert({
                author_id: _userId, body: body,
                is_pinned: false, is_locked: false, likes_count: 0, comments_count: 0
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
        _toggleMenu: toggleMenu, _pin: togglePin, _delete: deletePost,
        _like: toggleLike,
        _toggleComments: toggleComments, _submitComment: submitComment,
        _deleteComment: deleteComment
    };
    window.submitCommunityPost = submitPost;
})();
