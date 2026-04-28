// admin-portal-questionnaires.js — Full CRM: Questionnaires + Caller + Scoring + Funnel

let portalQuestionnaires = [];
let portalQLoaded = false;
let pqFilters = { dateRange: 'all', status: 'all', howFound: 'all', whyNlp: 'all', heat: 'all', sortBy: 'score', gender: 'all', city: 'all', ageMin: '', ageMax: '', dateFrom: '', dateTo: '', occupationSearch: '', lessons: 'all', requestType: 'all' };
let pqEngagementMap = {};
let pqCurrentSubView = 'table'; // 'table' | 'caller'

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadPortalQuestionnaires() {
    try {
        const [allLeadsRes, progRes] = await Promise.all([
            db.rpc('admin_get_all_leads'),
            db.from('course_progress').select('user_id, completed, watched_seconds, completed_at, updated_at, created_at, video_id').order('completed_at', { ascending: false })
        ]);

        if (allLeadsRes.error) {
            console.error('❌ RPC admin_get_all_leads failed:', allLeadsRes.error);
            // Fallback to old RPC
            const fallback = await db.rpc('admin_get_portal_questionnaires_full');
            if (fallback.error) throw fallback.error;
            const profRes = await db.from('profiles').select('id, full_name, email, phone');
            const profileMap = {};
            (profRes.data || []).forEach(p => { profileMap[p.id] = p; });
            allLeadsRes.data = (fallback.data || []).map(q => ({
                profile_id: q.user_id, user_email: profileMap[q.user_id]?.email || '', user_phone: profileMap[q.user_id]?.phone || '',
                full_name: profileMap[q.user_id]?.full_name || '', user_role: null, profile_created_at: q.created_at,
                has_questionnaire: true, q_id: q.id, ...q, q_status: q.status, q_created_at: q.created_at
            }));
            console.warn('⚠️ Fallback to old RPC, got', allLeadsRes.data?.length, 'rows');
        } else {
            console.log('✅ All leads loaded via RPC:', allLeadsRes.data?.length, 'rows');
        }

        pqEngagementMap = {};
        (progRes.data || []).filter(r => !r.video_id?.startsWith('last_watched_')).forEach(r => {
            if (!pqEngagementMap[r.user_id]) pqEngagementMap[r.user_id] = { completed_count: 0, watched_seconds: 0, last_activity: null };
            const u = pqEngagementMap[r.user_id];
            if (r.completed) u.completed_count++;
            u.watched_seconds += r.watched_seconds || 0;
            const act = r.completed_at || r.updated_at || r.created_at;
            if (act && (!u.last_activity || act > u.last_activity)) u.last_activity = act;
        });

        portalQuestionnaires = (allLeadsRes.data || []).map(row => {
            const e = pqEngagementMap[row.profile_id] || { completed_count: 0, watched_seconds: 0, last_activity: null };
            return {
                id: row.q_id || row.profile_id,
                user_id: row.profile_id,
                full_name: row.full_name || '',
                email: row.user_email || '',
                phone: row.phone || row.user_phone || '',
                gender: row.gender,
                birth_date: row.birth_date,
                city: row.city,
                occupation: row.occupation,
                how_found: row.how_found,
                why_nlp: row.why_nlp,
                study_time: row.study_time,
                digital_challenge: row.digital_challenge,
                knew_ram: row.knew_ram,
                motivation_tip: row.motivation_tip,
                main_challenge: row.main_challenge,
                vision_one_year: row.vision_one_year,
                status: row.q_status || 'new',
                heat_level: row.heat_level,
                call_count: row.call_count || 0,
                last_called_at: row.last_called_at,
                caller_notes: row.caller_notes,
                assigned_caller: row.assigned_caller,
                utm_source: row.utm_source,
                created_at: row.q_created_at || row.profile_created_at,
                has_questionnaire: row.has_questionnaire,
                user_role: row.user_role,
                lead_source: row.lead_source || 'profile',
                request_type: row.request_type,
                contact_message: row.contact_message,
                completed_count: e.completed_count,
                watched_hours: Math.round((e.watched_seconds / 3600) * 10) / 10,
                last_activity: e.last_activity,
                fitScore: 0
            };
        });
        portalQuestionnaires.forEach(q => { q.fitScore = calculateFitScore(q); });

        portalQLoaded = true;
        updatePqStats();
        populatePqFilterOptions();
        renderPortalQuestionnaires();
        updateFunnelStats();
    } catch (err) { console.error('Error loading portal questionnaires:', err); }
}

// ============================================================================
// FIT SCORE
// ============================================================================

function calculateFitScore(q) {
    let s = 0;
    if (q.why_nlp === 'קליניקה') s += 30; else if (q.why_nlp === 'שילוב בעסק') s += 20; else if (q.why_nlp === 'התפתחות אישית') s += 10;
    if (q.study_time === 'יותר מ-2 שעות') s += 20; else if (q.study_time === '1-2 שעות') s += 15; else if (q.study_time === '30 דק - שעה') s += 10; else s += 5;
    if (q.knew_ram === 'כן') s += 10;
    if (q.motivation_tip?.length > 5) s += 10;
    if (q.vision_one_year?.length > 5) s += 10;
    s += Math.min((q.completed_count || 0), 10) * 2;
    return Math.min(s, 100);
}

function scoreClass(s) { return s >= 70 ? 'pq-score-high' : s >= 40 ? 'pq-score-mid' : 'pq-score-low'; }
function heatIcon(h) { return h === 'hot' ? '🔥🔥' : h === 'warm' ? '🔥' : h === 'cold' ? '❄️' : '—'; }
function heatLabel(h) { return h === 'hot' ? 'רותח' : h === 'warm' ? 'חם' : h === 'cold' ? 'קר' : 'לא סווג'; }

// ============================================================================
// STATS + FUNNEL
// ============================================================================

function updatePqStats() {
    const t = portalQuestionnaires.length;
    const withQ = portalQuestionnaires.filter(q => q.has_questionnaire).length;
    const today = portalQuestionnaires.filter(q => isToday(q.created_at)).length;
    const avg = t > 0 ? Math.round(portalQuestionnaires.reduce((s, q) => s + q.fitScore, 0) / t) : 0;
    const hot = portalQuestionnaires.filter(q => q.heat_level === 'hot').length;
    const warm = portalQuestionnaires.filter(q => q.heat_level === 'warm').length;
    const notCalled = portalQuestionnaires.filter(q => q.has_questionnaire && (!q.call_count || q.call_count === 0)).length;

    setText('portal-q-count', t);
    setText('stat-portal-q-total', t);
    setText('learning-count', t);
    setText('stat-portal-q-today', today);
    setText('stat-portal-q-avg-score', avg);
    setText('stat-portal-q-hot', hot + warm);
    setText('stat-portal-q-not-called', notCalled);

    // Training-leads-specific stats (sidebar badge + overview card)
    const trainingAll = portalQuestionnaires.filter(q => q.request_type === 'training');
    const trainingWeek = trainingAll.filter(q => isThisWeek(q.created_at)).length;
    const trainingUncalled = trainingAll.filter(q => (!q.call_count || q.call_count === 0) && q.status !== 'client').length;
    setText('training-leads-badge', trainingWeek > 0 ? trainingWeek : trainingAll.length);
    const badgeEl = document.getElementById('training-leads-badge');
    if (badgeEl) {
        // Red pulse when fresh leads waiting
        badgeEl.style.background = trainingWeek > 0 ? '#f85149' : '#D4AF37';
        badgeEl.style.color = trainingWeek > 0 ? '#fff' : '#003B46';
    }
    setText('ov-training-total', trainingAll.length);
    setText('ov-training-week', trainingWeek);
    setText('ov-training-uncalled', trainingUncalled);
    const newBadge = document.getElementById('ov-training-new-badge');
    if (newBadge) newBadge.style.display = trainingWeek > 0 ? 'inline-block' : 'none';
}

function updateFunnelStats() {
    // Update overview funnel if elements exist
    const total = portalQuestionnaires.length;
    const active = portalQuestionnaires.filter(q => (q.completed_count || 0) > 0).length;
    const hotWarm = portalQuestionnaires.filter(q => q.heat_level === 'hot' || q.heat_level === 'warm').length;
    const inPipeline = portalQuestionnaires.filter(q => q.status === 'potential' || q.status === 'client').length;

    setText('funnel-registered', total);
    setText('funnel-active', active);
    setText('funnel-hot', hotWarm);
    setText('funnel-pipeline', inPipeline);
}

// ============================================================================
// HELPERS
// ============================================================================

function isToday(d) { return d && new Date(d).toDateString() === new Date().toDateString(); }
function isThisWeek(d) { return d && (Date.now() - new Date(d).getTime()) < 7 * 86400000; }
function isThisMonth(d) { return d && (Date.now() - new Date(d).getTime()) < 30 * 86400000; }

// ============================================================================
// FILTERS
// ============================================================================

function populatePqFilterOptions() {
    const sources = [...new Set(portalQuestionnaires.map(q => q.how_found).filter(Boolean))];
    const el1 = document.getElementById('pq-filter-source');
    if (el1) el1.innerHTML = '<option value="all">מקור: הכל</option>' + sources.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');

    const whys = [...new Set(portalQuestionnaires.map(q => q.why_nlp).filter(Boolean))];
    const el2 = document.getElementById('pq-filter-why');
    if (el2) el2.innerHTML = '<option value="all">למה NLP: הכל</option>' + whys.map(w => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join('');

    const genders = [...new Set(portalQuestionnaires.map(q => q.gender).filter(Boolean))];
    const el3 = document.getElementById('pq-filter-gender');
    if (el3) el3.innerHTML = '<option value="all">מין: הכל</option>' + genders.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');

    const cities = [...new Set(portalQuestionnaires.map(q => q.city).filter(Boolean))].sort();
    const el4 = document.getElementById('pq-filter-city');
    if (el4) el4.innerHTML = '<option value="all">עיר: הכל</option>' + cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}

function applyPqFilters() {
    pqFilters.dateRange = document.getElementById('pq-filter-date')?.value || 'all';
    pqFilters.status = document.getElementById('pq-filter-status')?.value || 'all';
    pqFilters.howFound = document.getElementById('pq-filter-source')?.value || 'all';
    pqFilters.whyNlp = document.getElementById('pq-filter-why')?.value || 'all';
    pqFilters.heat = document.getElementById('pq-filter-heat')?.value || 'all';
    pqFilters.sortBy = document.getElementById('pq-filter-sort')?.value || 'score';
    pqFilters.gender = document.getElementById('pq-filter-gender')?.value || 'all';
    pqFilters.city = document.getElementById('pq-filter-city')?.value || 'all';
    pqFilters.ageMin = document.getElementById('pq-filter-age-min')?.value || '';
    pqFilters.ageMax = document.getElementById('pq-filter-age-max')?.value || '';
    pqFilters.dateFrom = document.getElementById('pq-filter-date-from')?.value || '';
    pqFilters.dateTo = document.getElementById('pq-filter-date-to')?.value || '';
    pqFilters.occupationSearch = document.getElementById('pq-filter-occupation')?.value?.toLowerCase() || '';
    pqFilters.lessons = document.getElementById('pq-filter-lessons')?.value || 'all';
    pqFilters.requestType = document.getElementById('pq-filter-request-type')?.value || 'all';
    renderPortalQuestionnaires();
}

function applyFiltered() {
    let f = [...portalQuestionnaires];
    const search = document.getElementById('portal-q-search')?.value?.toLowerCase() || '';
    if (search) f = f.filter(q => (q.full_name||'').toLowerCase().includes(search) || (q.email||'').toLowerCase().includes(search) || (q.phone||'').includes(search) || (q.city||'').toLowerCase().includes(search));
    if (pqFilters.dateRange === 'today') f = f.filter(q => isToday(q.created_at));
    else if (pqFilters.dateRange === 'week') f = f.filter(q => isThisWeek(q.created_at));
    else if (pqFilters.dateRange === 'month') f = f.filter(q => isThisMonth(q.created_at));
    if (pqFilters.status !== 'all') f = f.filter(q => (q.status || 'new') === pqFilters.status);
    if (pqFilters.howFound !== 'all') f = f.filter(q => q.how_found === pqFilters.howFound);
    if (pqFilters.whyNlp !== 'all') f = f.filter(q => q.why_nlp === pqFilters.whyNlp);
    if (pqFilters.heat !== 'all') {
        if (pqFilters.heat === 'none') f = f.filter(q => !q.heat_level);
        else f = f.filter(q => q.heat_level === pqFilters.heat);
    }
    if (pqFilters.lessons !== 'all') {
        f = f.filter(q => {
            const c = q.completed_count || 0;
            if (pqFilters.lessons === '0')    return c === 0;
            if (pqFilters.lessons === '1-5')  return c >= 1 && c <= 5;
            if (pqFilters.lessons === '6-10') return c >= 6 && c <= 10;
            if (pqFilters.lessons === '11+')  return c >= 11;
            return true;
        });
    }
    if (pqFilters.requestType !== 'all') f = f.filter(q => q.request_type === pqFilters.requestType);
    // Advanced filters
    if (pqFilters.gender !== 'all') f = f.filter(q => q.gender === pqFilters.gender);
    if (pqFilters.city !== 'all') f = f.filter(q => q.city === pqFilters.city);
    if (pqFilters.occupationSearch) f = f.filter(q => (q.occupation || '').toLowerCase().includes(pqFilters.occupationSearch));
    if (pqFilters.ageMin || pqFilters.ageMax) {
        const now = new Date();
        f = f.filter(q => {
            if (!q.birth_date || !/^\d{4}-\d{2}-\d{2}$/.test(q.birth_date)) return false;
            const age = Math.floor((now - new Date(q.birth_date)) / (365.25 * 86400000));
            if (pqFilters.ageMin && age < Number(pqFilters.ageMin)) return false;
            if (pqFilters.ageMax && age > Number(pqFilters.ageMax)) return false;
            return true;
        });
    }
    if (pqFilters.dateFrom || pqFilters.dateTo) {
        f = f.filter(q => {
            if (!q.created_at) return false;
            const d = q.created_at.slice(0, 10);
            if (pqFilters.dateFrom && d < pqFilters.dateFrom) return false;
            if (pqFilters.dateTo && d > pqFilters.dateTo) return false;
            return true;
        });
    }
    // Sort
    if (pqFilters.sortBy === 'score') f.sort((a, b) => b.fitScore - a.fitScore);
    else if (pqFilters.sortBy === 'views') f.sort((a, b) => (b.completed_count || 0) - (a.completed_count || 0));
    else if (pqFilters.sortBy === 'heat') f.sort((a, b) => { const o = { hot: 3, warm: 2, cold: 1 }; return (o[b.heat_level] || 0) - (o[a.heat_level] || 0); });
    else if (pqFilters.sortBy === 'date') f.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return f;
}

function resetPqFilters() {
    pqFilters = { dateRange: 'all', status: 'all', howFound: 'all', whyNlp: 'all', heat: 'all', sortBy: 'score', gender: 'all', city: 'all', ageMin: '', ageMax: '', dateFrom: '', dateTo: '', occupationSearch: '', lessons: 'all', requestType: 'all' };
    ['pq-filter-date','pq-filter-status','pq-filter-heat','pq-filter-source','pq-filter-why','pq-filter-gender','pq-filter-city','pq-filter-sort','pq-filter-lessons','pq-filter-request-type'].forEach(id => { const el = document.getElementById(id); if (el) el.value = 'all'; });
    ['pq-filter-age-min','pq-filter-age-max','pq-filter-date-from','pq-filter-date-to','pq-filter-occupation'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    renderPortalQuestionnaires();
}

// ============================================================================
// SUB-VIEW SWITCH (Table / Caller)
// ============================================================================

function switchPqSubView(view) {
    pqCurrentSubView = view;
    document.getElementById('pq-table-view')?.classList.toggle('hidden', view !== 'table');
    document.getElementById('pq-caller-view')?.classList.toggle('hidden', view !== 'caller');
    document.querySelectorAll('.pq-view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    if (view === 'caller') renderCallerView();
}

// ============================================================================
// TABLE VIEW
// ============================================================================

function renderPortalQuestionnaires() {
    const filtered = applyFiltered();
    const countEl = document.getElementById('pq-results-count');
    if (countEl) countEl.textContent = `${filtered.length} תוצאות`;

    const tbody = document.getElementById('portal-q-table');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><i class="fa-solid fa-clipboard-list"></i><br>אין תוצאות</td></tr>';
        return;
    }

    const groups = groupByDate(filtered);
    let html = '';
    for (const [group, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<tr class="date-group-row"><td colspan="10"><i class="fa-solid ${dateGroupIcons[group]}"></i> ${group} (${items.length})</td></tr>`;
        html += items.map(q => {
            const st = q.status || 'new';
            const sc = q.fitScore || 0;
            const src = q.how_found || q.utm_source || '—';
            return `
                <tr onclick="viewPortalQ('${q.id}')" style="cursor:pointer;">
                    <td><strong>${escapeHtml(q.full_name || '-')}</strong>${q.lead_source === 'contact_form' ? ` <span style="font-size:0.65rem;background:rgba(212,175,55,0.15);color:#D4AF37;padding:0.1rem 0.3rem;border-radius:4px;">טופס${q.request_type === "training" ? " הכשרה" : ""}</span>` : !q.has_questionnaire ? ' <span style="font-size:0.65rem;background:rgba(232,241,242,0.1);color:rgba(232,241,242,0.4);padding:0.1rem 0.3rem;border-radius:4px;">ללא שאלון</span>' : ''}</td>
                    <td style="font-size:0.82rem;">${escapeHtml(src)}</td>
                    <td>${q.phone ? `<a href="tel:${escapeHtml(q.phone)}" onclick="event.stopPropagation()">${escapeHtml(q.phone)}</a>` : '-'}</td>
                    <td style="font-size:0.85rem;">${escapeHtml(q.city || '-')}</td>
                    <td><span class="pq-score ${scoreClass(sc)}">${sc}</span></td>
                    <td style="font-size:0.9rem;">${heatIcon(q.heat_level)}</td>
                    <td style="font-size:0.85rem;">${q.completed_count > 0 ? `<strong>${q.completed_count}</strong>` : '<span style="opacity:0.4;">0</span>'}${q.completed_count >= 10 ? ' <i class="fa-solid fa-fire" style="color:#f85149;font-size:0.7rem;"></i>' : ''}</td>
                    <td onclick="event.stopPropagation();">
                        <select class="pq-inline-status pq-st-${st}" onchange="changePortalQStatus('${q.id}', this.value); this.className='pq-inline-status pq-st-'+this.value;">
                            <option value="new" ${st === 'new' ? 'selected' : ''}>תלמיד</option>
                            <option value="potential" ${st === 'potential' ? 'selected' : ''}>פוטנציאלי</option>
                            <option value="client" ${st === 'client' ? 'selected' : ''}>לקוח</option>
                        </select>
                    </td>
                    <td style="font-size:0.85rem;">${formatDate(q.created_at)}</td>
                    <td onclick="event.stopPropagation();" style="white-space:nowrap;">
                        ${q.phone ? `<a href="https://wa.me/${(q.phone||'').replace(/^0/,'972').replace(/[^0-9]/g,'')}" target="_blank" title="WhatsApp" style="color:#25D366;margin-left:0.4rem;font-size:1.05rem;"><i class="fa-brands fa-whatsapp"></i></a>` : ''}
                        ${st !== 'client' ? `<button onclick="movePortalQToPipeline('${q.id}')" title="העבר ל-Pipeline" style="background:none;border:none;cursor:pointer;color:#D4AF37;font-size:1rem;padding:0.2rem;"><i class="fa-solid fa-filter-circle-dollar"></i></button>` : '<span style="color:rgba(232,241,242,0.3);font-size:0.75rem;">לקוח</span>'}
                    </td>
                </tr>`;
        }).join('');
    }
    tbody.innerHTML = html;

    // Also refresh caller view if visible
    if (pqCurrentSubView === 'caller') renderCallerView();
}

// ============================================================================
// CALLER VIEW — SDR Workflow
// ============================================================================

function renderCallerView() {
    const container = document.getElementById('pq-caller-cards');
    if (!container) return;

    // Show uncalled first, then by score
    let list = [...portalQuestionnaires].sort((a, b) => {
        // Priority: not called > called. Then by score desc
        const aCalled = (a.call_count || 0) > 0 ? 1 : 0;
        const bCalled = (b.call_count || 0) > 0 ? 1 : 0;
        if (aCalled !== bCalled) return aCalled - bCalled;
        return b.fitScore - a.fitScore;
    });

    // Apply heat filter if set
    if (pqFilters.heat !== 'all') {
        if (pqFilters.heat === 'none') list = list.filter(q => !q.heat_level);
        else list = list.filter(q => q.heat_level === pqFilters.heat);
    }

    if (list.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:3rem;text-align:center;"><i class="fa-solid fa-phone-slash" style="font-size:2rem;opacity:0.3;"></i><br>אין נרשמים להתקשר</div>';
        return;
    }

    container.innerHTML = list.map(q => {
        const sc = q.fitScore || 0;
        const called = (q.call_count || 0) > 0;
        const heat = q.heat_level;
        const border = heat === 'hot' ? '#f85149' : heat === 'warm' ? '#D4AF37' : heat === 'cold' ? '#58a6ff' : 'rgba(232,241,242,0.1)';

        return `
        <div class="pq-caller-card" style="border-right:4px solid ${border};" id="caller-card-${q.id}">
            <div class="pq-caller-top">
                <div class="pq-caller-info">
                    <strong>${escapeHtml(q.full_name || '-')}</strong>
                    <span class="pq-score ${scoreClass(sc)}" style="margin-right:0.5rem;">${sc}</span>
                    ${heat ? `<span style="margin-right:0.3rem;">${heatIcon(heat)}</span>` : ''}
                    ${called ? `<span style="font-size:0.75rem;color:rgba(232,241,242,0.4);">📞 ${q.call_count}x</span>` : '<span style="font-size:0.75rem;background:rgba(212,175,55,0.15);color:#D4AF37;padding:0.1rem 0.4rem;border-radius:4px;">חדש</span>'}
                </div>
                <div class="pq-caller-contact">
                    ${q.phone ? `<a href="tel:${escapeHtml(q.phone)}" class="pq-caller-phone"><i class="fa-solid fa-phone"></i> ${escapeHtml(q.phone)}</a>` : ''}
                    ${q.phone ? `<a href="https://wa.me/${(q.phone||'').replace(/^0/,'972').replace(/[^0-9]/g,'')}" target="_blank" class="pq-caller-wa"><i class="fa-brands fa-whatsapp"></i></a>` : ''}
                </div>
            </div>
            <div class="pq-caller-details">
                <span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(q.city || '-')}</span>
                <span><i class="fa-solid fa-bullseye"></i> ${escapeHtml(q.why_nlp || '-')}</span>
                <span><i class="fa-solid fa-graduation-cap"></i> ${q.completed_count || 0} שיעורים</span>
                <span><i class="fa-solid fa-clock"></i> ${q.watched_hours || 0} שע׳</span>
            </div>
            ${q.caller_notes ? `<div class="pq-caller-prev-note"><i class="fa-solid fa-note-sticky"></i> ${escapeHtml(q.caller_notes)}</div>` : ''}
            <div class="pq-caller-actions">
                <select onchange="markHeat('${q.id}', this.value)" class="pq-heat-select">
                    <option value="" ${!heat ? 'selected' : ''}>סמן חום...</option>
                    <option value="hot" ${heat === 'hot' ? 'selected' : ''}>🔥🔥 רותח</option>
                    <option value="warm" ${heat === 'warm' ? 'selected' : ''}>🔥 חם</option>
                    <option value="cold" ${heat === 'cold' ? 'selected' : ''}>❄️ קר</option>
                </select>
                <input type="text" class="pq-note-input" id="note-${q.id}" placeholder="הערה מהשיחה..." value="${escapeHtml(q.caller_notes || '')}">
                <button class="pq-btn pq-btn-call" onclick="logCall('${q.id}')">
                    <i class="fa-solid fa-phone-flip"></i> התקשרתי
                </button>
                ${(heat === 'hot' || heat === 'warm') && q.status === 'new' ? `<button class="pq-btn pq-btn-pipeline" onclick="movePortalQToPipeline('${q.id}')" style="font-size:0.75rem;"><i class="fa-solid fa-arrow-left"></i> העבר למכירות</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

// ============================================================================
// CALLER ACTIONS
// ============================================================================

async function markHeat(id, level) {
    try {
        const { error } = await db.from('portal_questionnaires').update({ heat_level: level || null }).eq('id', id);
        if (error) throw error;
        const q = portalQuestionnaires.find(x => x.id === id);
        if (q) q.heat_level = level || null;
        updatePqStats();
        renderPortalQuestionnaires();
        showToast(`סומן כ-${heatLabel(level)}`, 'success');
    } catch (err) { showToast('שגיאה בעדכון', 'error'); }
}

async function logCall(id) {
    const noteInput = document.getElementById('note-' + id);
    const notes = noteInput?.value?.trim() || '';

    try {
        const q = portalQuestionnaires.find(x => x.id === id);
        const newCount = (q?.call_count || 0) + 1;

        const { error } = await db.from('portal_questionnaires').update({
            call_count: newCount,
            last_called_at: new Date().toISOString(),
            caller_notes: notes || q?.caller_notes || null
        }).eq('id', id);

        if (error) throw error;

        if (q) {
            q.call_count = newCount;
            q.last_called_at = new Date().toISOString();
            if (notes) q.caller_notes = notes;
        }

        updatePqStats();
        renderPortalQuestionnaires();
        showToast(`שיחה ${newCount} נרשמה ✓`, 'success');
    } catch (err) { showToast('שגיאה ברישום שיחה', 'error'); }
}

// ============================================================================
// DETAIL MODAL
// ============================================================================

const _pqLabels = {
    studyTime: { 'פחות מ-30 דק': 'פחות מ-30 דק׳ ביום', '30 דק - שעה': '30 דק׳ – שעה ביום', '1-2 שעות': '1-2 שעות ביום', 'יותר מ-2 שעות': 'יותר מ-2 שעות ביום' },
    challenge: { 'מוטיבציה': 'שמירה על מוטיבציה', 'ניהול זמן': 'ניהול זמן', 'הבנת חומר': 'הבנת חומר ללא תמיכה', 'טכנולוגי': 'קושי טכנולוגי' },
    status: { 'new': 'תלמיד', 'potential': 'לקוח פוטנציאלי', 'client': 'לקוח' }
};

function _pqField(icon, label, value) {
    return `<div class="pq-field"><i class="fa-solid fa-${icon}" style="color:#D4AF37;font-size:0.75rem;margin-left:0.4rem;"></i><span class="pq-field-label">${label}</span><span class="pq-field-value">${escapeHtml(value != null ? String(value) : '-')}</span></div>`;
}
function _pqSection(icon, title, content) {
    return `<div class="pq-section"><div class="pq-section-header"><i class="fa-solid fa-${icon}"></i> ${title}</div><div class="pq-section-body">${content}</div></div>`;
}
function _pqAnswer(question, answer) {
    if (!answer) return '';
    return `<div class="pq-answer"><div class="pq-answer-q">${question}</div><div class="pq-answer-a">${escapeHtml(answer)}</div></div>`;
}

function viewPortalQ(id) {
    const q = portalQuestionnaires.find(x => x.id === id);
    if (!q) return;
    const st = q.status || 'new';
    const sc = q.fitScore || 0;
    const content = document.getElementById('portal-q-modal-content');

    content.innerHTML = `
        <div class="pq-header-card">
            <div class="pq-avatar">${(q.full_name || '?')[0]}</div>
            <div class="pq-header-info">
                <h2 class="pq-name">${escapeHtml(q.full_name || 'ללא שם')} <span class="pq-score ${scoreClass(sc)}" style="font-size:0.75rem;margin-right:0.5rem;">${sc} נק׳</span> ${q.heat_level ? `<span style="font-size:0.85rem;">${heatIcon(q.heat_level)}</span>` : ''}</h2>
                <div class="pq-meta">
                    ${q.email ? `<span><i class="fa-solid fa-envelope"></i> ${escapeHtml(q.email)}</span>` : ''}
                    ${q.phone ? `<span><i class="fa-solid fa-phone"></i> <a href="tel:${escapeHtml(q.phone)}" style="color:inherit;">${escapeHtml(q.phone)}</a></span>` : ''}
                    ${q.call_count ? `<span><i class="fa-solid fa-phone-flip"></i> ${q.call_count} שיחות</span>` : ''}
                </div>
            </div>
            <div class="pq-status-area">
                <select id="pq-status-select" class="pq-status-select" onchange="changePortalQStatus('${q.id}', this.value)">
                    <option value="new" ${st === 'new' ? 'selected' : ''}>תלמיד</option>
                    <option value="potential" ${st === 'potential' ? 'selected' : ''}>לקוח פוטנציאלי</option>
                    <option value="client" ${st === 'client' ? 'selected' : ''}>לקוח</option>
                </select>
            </div>
        </div>

        ${_pqSection('user', 'פרטים אישיים', `<div class="pq-fields-grid">
            ${_pqField('venus-mars', 'מין', q.gender)}
            ${_pqField('cake-candles', 'תאריך לידה', q.birth_date)}
            ${_pqField('location-dot', 'עיר', q.city)}
            ${_pqField('briefcase', 'עיסוק', q.occupation)}
            ${_pqField('map-pin', 'מאיפה הגיע/ה', q.how_found)}
            ${_pqField('video', 'מכיר את רם?', q.knew_ram)}
        </div>`)}

        ${_pqSection('chart-line', 'מעורבות בלמידה', `<div class="pq-fields-grid">
            ${_pqField('star', 'ציון התאמה', sc + '/100')}
            ${_pqField('check-double', 'שיעורים', q.completed_count || 0)}
            ${_pqField('clock', 'שעות צפייה', (q.watched_hours || 0).toFixed(1))}
            ${_pqField('calendar-check', 'פעילות אחרונה', q.last_activity ? formatDate(q.last_activity) : 'אין עדיין')}
        </div>`)}

        ${_pqSection('sliders', 'העדפות למידה', `<div class="pq-fields-grid">
            ${_pqField('bullseye', 'למה NLP?', q.why_nlp)}
            ${_pqField('clock', 'זמן ללמידה', _pqLabels.studyTime[q.study_time] || q.study_time)}
            ${_pqField('triangle-exclamation', 'אתגר דיגיטלי', _pqLabels.challenge[q.digital_challenge] || q.digital_challenge)}
        </div>`)}

        ${q.caller_notes ? _pqSection('note-sticky', 'הערות מתקשר', `<p style="line-height:1.7;">${escapeHtml(q.caller_notes)}</p>`) : ''}

        ${_pqSection('comment-dots', 'תשובות פתוחות', `
            ${_pqAnswer('מה עוזר לך לשמור על מוטיבציית למידה?', q.motivation_tip)}
            ${_pqAnswer('מה הכי רוצה לפתור?', q.main_challenge)}
            ${_pqAnswer('איפה רואה את עצמך בעוד שנה?', q.vision_one_year)}
        `)}

        <div class="pq-actions">
            <button class="pq-btn pq-btn-docx" onclick="downloadPortalQDocx('${q.id}')"><i class="fa-solid fa-file-word"></i> הורד כמסמך</button>
            <button class="pq-btn pq-btn-whatsapp" onclick="window.open('https://wa.me/${(q.phone||'').replace(/^0/,'972').replace(/[^0-9]/g,'')}','_blank')"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
            <button class="pq-btn pq-btn-pipeline" onclick="movePortalQToPipeline('${q.id}')"><i class="fa-solid fa-filter-circle-dollar"></i> העבר ל-Pipeline</button>
        </div>`;

    document.getElementById('portal-q-modal').classList.add('active');
}

// ============================================================================
// STATUS + PIPELINE
// ============================================================================

async function changePortalQStatus(id, newStatus) {
    try {
        const { error } = await db.from('portal_questionnaires').update({ status: newStatus }).eq('id', id);
        if (error) throw error;
        const q = portalQuestionnaires.find(x => x.id === id);
        if (q) q.status = newStatus;
        renderPortalQuestionnaires();
        showToast(`סטטוס עודכן ל: ${_pqLabels.status[newStatus]}`, 'success');
    } catch (err) { showToast('שגיאה בעדכון סטטוס', 'error'); }
}

async function movePortalQToPipeline(id) {
    const q = portalQuestionnaires.find(x => x.id === id);
    if (!q) return;
    if (!confirm(`להעביר את ${q.full_name || 'הנרשם'} ל-Pipeline כליד חדש?`)) return;
    try {
        const { error } = await db.from('sales_leads').insert({
            full_name: q.full_name, phone: q.phone, email: q.email, occupation: q.occupation,
            stage: 'new_lead',
            admin_notes: `מקור: פורטל חינמי | ציון: ${q.fitScore}/100 | חום: ${heatLabel(q.heat_level)}\nלמה NLP: ${q.why_nlp || '-'} | עיר: ${q.city || '-'}\nצפה ב-${q.completed_count || 0} שיעורים (${q.watched_hours || 0} שע')\nחזון: ${q.vision_one_year || '-'}\nהערות מתקשר: ${q.caller_notes || '-'}`
        });
        if (error) throw error;
        await changePortalQStatus(id, 'potential');
        if (typeof loadPipeline === 'function') await loadPipeline();
        document.getElementById('portal-q-modal').classList.remove('active');
        showToast(`${q.full_name} הועבר/ה ל-Pipeline!`, 'success');
    } catch (err) { showToast('שגיאה בהעברה', 'error'); }
}

// ============================================================================
// DOCX EXPORT
// ============================================================================

function downloadPortalQDocx(id) {
    const q = portalQuestionnaires.find(x => x.id === id);
    if (!q) return;
    const sl = _pqLabels.studyTime[q.study_time] || q.study_time || '-';
    const cl = _pqLabels.challenge[q.digital_challenge] || q.digital_challenge || '-';
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>@page{size:A4;margin:2cm}body{font-family:'David Libre','David','Arial',sans-serif;direction:rtl;color:#1a2d33;line-height:1.8;font-size:13pt}h1{font-size:22pt;color:#003B46;border-bottom:3px solid #D4AF37;padding-bottom:8px;margin-bottom:20px}h2{font-size:15pt;color:#003B46;background:#f0f7f8;padding:8px 14px;border-right:4px solid #D4AF37;margin:24px 0 12px}.t{width:100%;border-collapse:collapse;margin-bottom:16px}.t td{padding:6px 12px;border-bottom:1px solid #e8e4da;vertical-align:top}.t td:first-child{font-weight:bold;color:#003B46;width:130px}.ab{margin-bottom:18px}.aq{font-weight:bold;color:#003B46;margin-bottom:4px}.aa{background:#faf8f4;padding:10px 14px;border-right:3px solid #D4AF37;border-radius:4px}.f{margin-top:30px;padding-top:10px;border-top:1px solid #e8e4da;font-size:10pt;color:#999;text-align:center}.b{display:inline-block;background:#D4AF37;color:#003B46;padding:2px 12px;border-radius:12px;font-size:11pt;font-weight:bold}</style></head><body><h1>שאלון היכרות — פורטל לימודים</h1><p><strong>${esc(q.full_name)}</strong> <span class="b">${_pqLabels.status[q.status]||'תלמיד'}</span> <span class="b">ציון: ${q.fitScore}/100</span> <span class="b">חום: ${heatLabel(q.heat_level)}</span></p><h2>פרטים אישיים</h2><table class="t"><tr><td>שם</td><td>${esc(q.full_name)}</td></tr><tr><td>אימייל</td><td>${esc(q.email)}</td></tr><tr><td>טלפון</td><td>${esc(q.phone)}</td></tr><tr><td>מין</td><td>${esc(q.gender)}</td></tr><tr><td>תאריך לידה</td><td>${esc(q.birth_date)}</td></tr><tr><td>עיר</td><td>${esc(q.city)}</td></tr><tr><td>עיסוק</td><td>${esc(q.occupation)}</td></tr><tr><td>מאיפה הגיע/ה</td><td>${esc(q.how_found)}</td></tr><tr><td>מכיר את רם?</td><td>${esc(q.knew_ram)}</td></tr></table><h2>מעורבות</h2><table class="t"><tr><td>ציון</td><td>${q.fitScore}/100</td></tr><tr><td>שיעורים</td><td>${q.completed_count||0}</td></tr><tr><td>שעות</td><td>${(q.watched_hours||0).toFixed(1)}</td></tr><tr><td>שיחות</td><td>${q.call_count||0}</td></tr></table><h2>העדפות</h2><table class="t"><tr><td>למה NLP?</td><td>${esc(q.why_nlp)}</td></tr><tr><td>זמן</td><td>${esc(sl)}</td></tr><tr><td>אתגר</td><td>${esc(cl)}</td></tr></table>${q.caller_notes?`<h2>הערות מתקשר</h2><p>${esc(q.caller_notes)}</p>`:''}<h2>תשובות פתוחות</h2><div class="ab"><div class="aq">מוטיבציה</div><div class="aa">${esc(q.motivation_tip)}</div></div><div class="ab"><div class="aq">מה לפתור</div><div class="aa">${esc(q.main_challenge)}</div></div><div class="ab"><div class="aq">חזון שנה</div><div class="aa">${esc(q.vision_one_year)}</div></div><div class="f">${formatDate(q.created_at)} | בית המטפלים</div></body></html>`;
    const blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `שאלון_${(q.full_name||'x').replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.doc`;
    a.click(); showToast('הורד!', 'success');
}
function esc(v) { return escapeHtml(v || '-'); }

// ============================================================================
// CSV
// ============================================================================

function exportPortalQCSV() {
    if (!portalQuestionnaires.length) { showToast('אין נתונים', 'warning'); return; }
    const h = ['שם','טלפון','אימייל','מין','עיר','עיסוק','מאיפה','למה NLP','זמן','אתגר','מכיר רם','ציון','חום','שיעורים','שעות','שיחות','הערות מתקשר','מוטיבציה','מה לפתור','חזון','סטטוס','תאריך'];
    const r = portalQuestionnaires.map(q => [q.full_name||'',q.phone||'',q.email||'',q.gender||'',q.city||'',q.occupation||'',q.how_found||'',q.why_nlp||'',q.study_time||'',q.digital_challenge||'',q.knew_ram||'',q.fitScore||0,heatLabel(q.heat_level),q.completed_count||0,q.watched_hours||0,q.call_count||0,q.caller_notes||'',q.motivation_tip||'',q.main_challenge||'',q.vision_one_year||'',_pqLabels.status[q.status]||'תלמיד',formatDate(q.created_at)]);
    const csv = '\uFEFF' + [h,...r].map(x => x.map(c => `"${(c+'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    a.download = `portal_q_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    showToast('הורד!', 'success');
}

// ============================================================================
// LEAD-VIEW MODE SWITCHERS — wired to the sidebar nav-items + overview cards
// ============================================================================

function _applyLeadViewMode(mode) {
    // mode: 'training' | 'all'
    const titleEl = document.getElementById('portal-q-page-title');
    const tableTitleEl = document.getElementById('portal-q-table-title');
    if (mode === 'training') {
        pqFilters.requestType = 'training';
        pqFilters.sortBy = 'date';
        const rt = document.getElementById('pq-filter-request-type'); if (rt) rt.value = 'training';
        const sort = document.getElementById('pq-filter-sort'); if (sort) sort.value = 'date';
        if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-graduation-cap" style="color:var(--gold);margin-left:0.5rem;"></i> לידי הכשרה — חמים ופתוחים לחזרה';
        if (tableTitleEl) tableTitleEl.textContent = 'בקשות לתוכנית הכשרה';
    } else {
        pqFilters.requestType = 'all';
        const rt = document.getElementById('pq-filter-request-type'); if (rt) rt.value = 'all';
        if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-clipboard-list" style="color:var(--gold);margin-left:0.5rem;"></i> ניהול לידים';
        if (tableTitleEl) tableTitleEl.textContent = 'נרשמים לפורטל';
    }
    if (typeof renderPortalQuestionnaires === 'function') renderPortalQuestionnaires();
}

function enterTrainingLeadsView() {
    if (typeof switchView === 'function') switchView('learning');
    if (portalQLoaded) {
        _applyLeadViewMode('training');
    } else {
        const wait = setInterval(() => {
            if (portalQLoaded) { clearInterval(wait); _applyLeadViewMode('training'); }
        }, 80);
        setTimeout(() => clearInterval(wait), 5000);
    }
}

function enterAllLeadsView() {
    if (typeof switchView === 'function') switchView('learning');
    if (portalQLoaded) {
        _applyLeadViewMode('all');
    } else {
        const wait = setInterval(() => {
            if (portalQLoaded) { clearInterval(wait); _applyLeadViewMode('all'); }
        }, 80);
        setTimeout(() => clearInterval(wait), 5000);
    }
}
