// admin-pipeline.js — Pipeline: 7 stages, modal, assign, bulk assign, salesRepsCache

const PIPELINE_STAGES = {
    'new_lead': 'ליד חדש',
    'call_attempts': 'בחיוגים',
    'no_answer_callback': 'לא ענה — חזרה',
    'answered': 'ענה',
    'presentation': 'הצגת מוצר',
    'closed_won': 'קנה',
    'closed_lost': 'לא קנה'
};

let salesRepsCache = [];

async function loadSalesReps() {
    if (window._userProfileRole !== 'admin') return;
    const { data } = await db.from('profiles').select('id, full_name, email').eq('role', 'sales_rep');
    salesRepsCache = data || [];
    // Populate bulk assign dropdown
    const sel = document.getElementById('bulk-assign-select');
    if (sel) {
        sel.innerHTML = '<option value="">הקצה ל...</option>' +
            salesRepsCache.map(r => `<option value="${r.id}">${escapeHtml(r.full_name || r.email)}</option>`).join('') +
            '<option value="__auto__">🔄 הקצאה אוטומטית (Round Robin)</option>';
    }
}

async function loadPipeline() {
    const { data } = await db.from('sales_leads').select('*').order('created_at', { ascending: false });
    pipelineLeads = data || [];

    // Resolve assigned_to names (admin only)
    if (window._userProfileRole === 'admin' && pipelineLeads.some(l => l.assigned_to)) {
        await loadSalesReps();
        const repMap = {};
        salesRepsCache.forEach(r => { repMap[r.id] = r.full_name || r.email; });
        pipelineLeads.forEach(l => { l._assignedName = l.assigned_to ? (repMap[l.assigned_to] || 'לא ידוע') : ''; });
    }

    document.getElementById('pipeline-count').textContent = pipelineLeads.filter(l => !['closed_won','closed_lost'].includes(l.stage)).length;
    updatePipelineStats();
    renderPipeline();
}

function updatePipelineStats() {
    const total = pipelineLeads.length;
    const calling = pipelineLeads.filter(l => ['call_attempts','no_answer_callback'].includes(l.stage)).length;
    const presentation = pipelineLeads.filter(l => l.stage === 'presentation').length;
    const won = pipelineLeads.filter(l => l.stage === 'closed_won').length;
    const lost = pipelineLeads.filter(l => l.stage === 'closed_lost').length;
    const revenue = pipelineLeads.filter(l => l.stage === 'closed_won' && l.deal_amount).reduce((s, l) => s + Number(l.deal_amount), 0);
    const closed = won + lost;
    const rate = closed > 0 ? Math.round((won / closed) * 100) : 0;

    document.getElementById('stat-p-total').textContent = total;
    document.getElementById('stat-p-calling').textContent = calling;
    document.getElementById('stat-p-presentation').textContent = presentation;
    document.getElementById('stat-p-won').textContent = won;
    document.getElementById('stat-p-lost').textContent = lost;
    document.getElementById('stat-p-revenue').textContent = revenue.toLocaleString();
    document.getElementById('conversion-bar-fill').style.width = rate + '%';
    document.getElementById('conversion-rate-value').textContent = rate + '%';
}

function filterPipeline(filter) {
    currentPipelineFilter = filter;
    document.querySelectorAll('#pipeline-view .tab').forEach(t => t.classList.remove('active'));
    event.currentTarget.classList.add('active');
    renderPipeline();
}

function renderPipeline() {
    const search = document.getElementById('pipeline-search')?.value?.toLowerCase() || '';
    let filtered = pipelineLeads;

    if (currentPipelineFilter !== 'all') {
        if (currentPipelineFilter === 'calling') {
            filtered = filtered.filter(l => ['call_attempts','no_answer_callback'].includes(l.stage));
        } else {
            filtered = filtered.filter(l => l.stage === currentPipelineFilter);
        }
    }

    if (search) filtered = filtered.filter(l =>
        (l.full_name || '').toLowerCase().includes(search) ||
        (l.phone || '').includes(search) ||
        (l.email || '').toLowerCase().includes(search)
    );
    const srcFilter = (typeof currentSourceFilter !== 'undefined') ? currentSourceFilter.pipeline : 'all';
    if (srcFilter && srcFilter !== 'all') {
        filtered = filtered.filter(l => leadMatchesSourceFilter(l, attributionMap.get('sales_leads:' + l.id), srcFilter));
    }

    const tbody = document.getElementById('pipeline-table');
    resetSelectAll('select-all-pipeline');
    updateBulkBarFor('pipeline');

    refreshSourceFilterDropdown('pipeline-source-filter', pipelineLeads, 'sales_leads', srcFilter);

    const isAdmin = window._userProfileRole === 'admin';
    const colSpan = isAdmin ? 11 : 10;

    // Hide admin-only columns for sales_rep
    document.querySelectorAll('.admin-only-col').forEach(el => el.style.display = isAdmin ? '' : 'none');
    // Hide bulk assign controls for sales_rep
    const bulkAssignSel = document.getElementById('bulk-assign-select');
    if (bulkAssignSel) bulkAssignSel.style.display = isAdmin ? '' : 'none';
    document.querySelectorAll('#bulk-bar-pipeline .btn[onclick*="bulkAssign"]').forEach(b => b.style.display = isAdmin ? '' : 'none');

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}" class="empty-state"><i class="fa-solid fa-filter-circle-dollar"></i><br>אין לידים</td></tr>`;
        return;
    }

    const groups = groupByDate(filtered);
    let html = '';
    for (const [group, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<tr class="date-group-row"><td colspan="${colSpan}"><i class="fa-solid ${dateGroupIcons[group]}"></i> ${group} (${items.length})</td></tr>`;
        html += items.map(l => {
            const dots = Array.from({length:6}, (_,i) => `<span class="dot ${i < l.call_attempts ? 'filled' : 'empty'}"></span>`).join('');
            const callback = l.callback_at ? new Date(l.callback_at).toLocaleString('he-IL', {day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'}) : '-';
            const amount = l.deal_amount ? '₪' + Number(l.deal_amount).toLocaleString() : '-';
            const safeName = (l.full_name || 'ללא שם').replace(/'/g, "\\'");
            const assignedName = l._assignedName || '';
            return `
            <tr style="cursor:pointer;" onclick="openPipelineDetail('${l.id}')">
                <td class="lead-checkbox" onclick="event.stopPropagation()"><input type="checkbox" value="${l.id}" onchange="updateBulkBarFor('pipeline')"></td>
                <td><strong>${escapeHtml(l.full_name || 'ללא שם')}</strong></td>
                <td>${l.phone ? `<a href="tel:${l.phone}" style="color:var(--info);text-decoration:none;" onclick="event.stopPropagation()">${l.phone}</a>` : '-'}</td>
                <td><span class="status-badge stage-${l.stage}">${PIPELINE_STAGES[l.stage] || l.stage}</span></td>
                <td>${renderSourceChip(l, attributionMap.get('sales_leads:' + l.id))}</td>
                <td><div class="call-dots">${dots}</div></td>
                ${isAdmin ? `<td style="font-size:0.82rem;">${assignedName ? `<span style="color:var(--muted-teal);font-weight:600;">${escapeHtml(assignedName)}</span>` : '<span style="color:var(--text-secondary);">—</span>'}</td>` : ''}
                <td style="font-size:0.82rem;">${callback}</td>
                <td>${amount}</td>
                <td>${formatDate(l.created_at)}</td>
                <td class="action-btns" onclick="event.stopPropagation()">
                    <div class="row-menu" id="menu-pl-${l.id}">
                        <button class="row-menu-btn" onclick="toggleRowMenu('menu-pl-${l.id}')">⋮</button>
                        <div class="row-menu-dropdown">
                            <button class="row-menu-item" onclick="openPipelineDetail('${l.id}');closeAllMenus()"><i class="fa-solid fa-eye"></i> צפייה</button>
                            ${l.phone ? `<button class="row-menu-item" onclick="window.open('https://wa.me/${l.phone.replace(/^0/,'972')}','_blank');closeAllMenus()"><i class="fa-brands fa-whatsapp" style="color:#25D366;"></i> WhatsApp</button>` : ''}
                            ${isAdmin ? `<button class="row-menu-item danger" onclick="deleteEntity('sales_leads','${l.id}','${safeName}');closeAllMenus()"><i class="fa-solid fa-trash"></i> מחיקה</button>` : ''}
                        </div>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }
    tbody.innerHTML = html;
}


async function openPipelineDetail(id) {
    const l = pipelineLeads.find(x => x.id === id);
    if (!l) return;
    currentPipelineId = id;

    // Fetch questionnaire answers if linked
    let q = null;
    if (l.questionnaire_id) {
        const { data } = await db.rpc('admin_get_questionnaire_by_id', { q_id: l.questionnaire_id });
        q = data?.[0] || null;
    }

    document.getElementById('pipeline-modal-title').textContent = `Pipeline — ${l.full_name || 'ללא שם'}`;

    const dots = Array.from({length:6}, (_,i) => `<span class="dot ${i < l.call_attempts ? 'filled' : 'empty'}"></span>`).join('');
    const stageName = PIPELINE_STAGES[l.stage] || l.stage;

    let formHtml = '';
    // Stage-specific form
    if (['new_lead','call_attempts','no_answer_callback'].includes(l.stage)) {
        formHtml = `
            <div class="pipeline-form-group">
                <label>תוצאת שיחה</label>
                <select id="pl-call-result">
                    <option value="">בחר...</option>
                    <option value="no_answer">לא ענה</option>
                    <option value="answered">ענה</option>
                </select>
            </div>
            <div class="pipeline-form-group" id="pl-callback-group" style="display:none;">
                <label>מתי לחזור?</label>
                <input type="datetime-local" id="pl-callback-time">
            </div>
            <button class="btn btn-gold" onclick="savePipelineCallResult()" style="width:100%;margin-top:0.5rem;">
                <i class="fa-solid fa-phone"></i> רשום חיוג #${l.call_attempts + 1}
            </button>`;
    } else if (l.stage === 'answered') {
        formHtml = `
            <button class="btn" onclick="advancePipelineStage('presentation')" style="width:100%;background:#8857e5;color:white;">
                <i class="fa-solid fa-presentation-screen"></i> קדם להצגת מוצר
            </button>`;
    } else if (l.stage === 'presentation') {
        formHtml = `
            <div class="pipeline-form-group">
                <label>תוצאה</label>
                <div class="pipeline-radio-group">
                    <label><input type="radio" name="pl-outcome" value="won"> קנה</label>
                    <label><input type="radio" name="pl-outcome" value="lost"> לא קנה</label>
                </div>
            </div>
            <div id="pl-won-fields" style="display:none;">
                <div class="pipeline-form-group">
                    <label>סכום עסקה (₪)</label>
                    <input type="number" id="pl-deal-amount" placeholder="3500">
                </div>
                <div class="pipeline-form-group">
                    <label>צורת תשלום</label>
                    <select id="pl-payment-method">
                        <option value="">בחר...</option>
                        <option value="bank_transfer">העברה בנקאית</option>
                        <option value="bank_transfer_and_credit">העברה + אשראי</option>
                        <option value="credit_card">כרטיס אשראי</option>
                    </select>
                </div>
                <div class="pipeline-form-group">
                    <label><input type="checkbox" id="pl-contract-signed"> חוזה נחתם</label>
                </div>
                <div class="pipeline-form-group">
                    <label>סיבת רכישה</label>
                    <textarea id="pl-won-reason" rows="2" placeholder="למה קנה..."></textarea>
                </div>
            </div>
            <div id="pl-lost-fields" style="display:none;">
                <div class="pipeline-form-group">
                    <label>סיבה</label>
                    <select id="pl-lost-reason">
                        <option value="money">כסף / יקר</option>
                        <option value="unsupportive_env">סביבה לא תומכת</option>
                        <option value="fear">פחד / חשש</option>
                        <option value="other_college">מכללה אחרת</option>
                        <option value="other">אחר</option>
                    </select>
                </div>
            </div>
            <button class="btn btn-gold" onclick="savePipelineOutcome()" style="width:100%;margin-top:0.5rem;">
                <i class="fa-solid fa-check"></i> שמור תוצאה
            </button>`;
    }

    // Deal info for closed leads
    let dealInfo = '';
    if (l.stage === 'closed_won') {
        dealInfo = `
            <div style="background:rgba(40,167,69,0.08);border-radius:10px;padding:1rem;margin-bottom:1rem;border-right:3px solid #28a745;">
                <strong style="color:var(--success);">עסקה סגורה</strong><br>
                ${l.deal_amount ? `💰 ₪${Number(l.deal_amount).toLocaleString()}<br>` : ''}
                ${l.payment_method ? `💳 ${PIPELINE_PAYMENT_METHODS[l.payment_method] || l.payment_method}<br>` : ''}
                ${l.contract_signed ? '✍️ חוזה נחתם<br>' : ''}
                ${l.won_reason ? `📝 ${escapeHtml(l.won_reason)}` : ''}
            </div>`;
    } else if (l.stage === 'closed_lost') {
        dealInfo = `
            <div style="background:rgba(248,81,73,0.08);border-radius:10px;padding:1rem;margin-bottom:1rem;border-right:3px solid var(--danger);">
                <strong style="color:var(--danger);">לא קנה</strong><br>
                ${l.lost_reason ? `סיבה: ${PIPELINE_LOST_REASONS[l.lost_reason] || l.lost_reason}` : ''}
            </div>`;
    }

    const html = `
        <div style="padding:1.5rem;">
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
                <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,var(--gold),#c9a227);display:flex;align-items:center;justify-content:center;color:white;font-size:1.3rem;font-weight:700;">
                    ${(l.full_name || '?')[0]}
                </div>
                <div>
                    <h3 style="margin:0;">${escapeHtml(l.full_name || 'ללא שם')}</h3>
                    <span class="status-badge stage-${l.stage}">${stageName}</span>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem 1.5rem;margin-bottom:1rem;font-size:0.9rem;">
                ${l.phone ? `<div>📱 <a href="tel:${l.phone}" style="color:var(--info);">${l.phone}</a></div>` : ''}
                ${l.email ? `<div>📧 ${escapeHtml(l.email)}</div>` : ''}
                ${l.occupation ? `<div>💼 ${escapeHtml(l.occupation)}</div>` : ''}
                <div>📅 ${formatDate(l.created_at)}</div>
            </div>
            <div style="margin-bottom:1rem;">
                <span style="font-size:0.85rem;color:var(--text-secondary);">חיוגים:</span>
                <div class="call-dots" style="display:inline-flex;margin-right:0.5rem;">${dots}</div>
                <span style="font-size:0.85rem;">${l.call_attempts}/6</span>
                ${l.last_call_at ? `<span style="font-size:0.8rem;color:var(--text-secondary);margin-right:0.5rem;">אחרון: ${new Date(l.last_call_at).toLocaleString('he-IL')}</span>` : ''}
            </div>
            <div style="margin-bottom:1rem;display:flex;align-items:center;gap:0.8rem;">
                <label style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);white-space:nowrap;">העבר שלב:</label>
                <select id="pl-stage-select" style="flex:1;padding:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:0.85rem;">
                    ${Object.entries(PIPELINE_STAGES).map(([k,v]) => `<option value="${k}" ${k === l.stage ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
                <button class="btn btn-gold" style="font-size:0.85rem;padding:0.5rem 1rem;" onclick="changePipelineStage()"><i class="fa-solid fa-arrow-left"></i> העבר</button>
            </div>
            ${window._userProfileRole === 'admin' ? `
            <div style="margin-bottom:1rem;display:flex;align-items:center;gap:0.8rem;">
                <label style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);white-space:nowrap;"><i class="fa-solid fa-user-tag"></i> הקצה ל:</label>
                <select id="pl-assign-select" style="flex:1;padding:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:0.85rem;">
                    <option value="">ללא הקצאה</option>
                    ${salesRepsCache.map(r => `<option value="${r.id}" ${l.assigned_to === r.id ? 'selected' : ''}>${escapeHtml(r.full_name || r.email)}</option>`).join('')}
                </select>
                <button class="btn" style="font-size:0.85rem;padding:0.5rem 1rem;background:var(--muted-teal);color:white;" onclick="assignLeadToRep()"><i class="fa-solid fa-user-check"></i> הקצה</button>
            </div>` : ''}
            ${dealInfo}
            ${q ? `
            <details style="margin-bottom:1rem;background:var(--bg);border-radius:10px;border:1px solid var(--border);overflow:hidden;">
                <summary style="padding:0.8rem 1rem;cursor:pointer;font-weight:600;font-size:0.9rem;color:var(--gold);user-select:none;">
                    <i class="fa-solid fa-clipboard-question"></i> תשובות השאלון
                </summary>
                <div style="padding:0 1rem 1rem;font-size:0.85rem;line-height:1.7;">
                    ${q.how_found ? `<div style="margin-top:0.5rem;"><strong>איך הגיע:</strong> ${escapeHtml(q.how_found)}</div>` : ''}
                    ${q.what_touched_you ? `<div style="margin-top:0.5rem;"><strong>מה נגע בו:</strong> ${escapeHtml(q.what_touched_you)}</div>` : ''}
                    ${q.what_is_therapist ? `<div style="margin-top:0.5rem;"><strong>מה זה "מטפל" עבורו:</strong> ${escapeHtml(q.what_is_therapist)}</div>` : ''}
                    ${q.weakness ? `<div style="margin-top:0.5rem;"><strong>חולשה:</strong> ${escapeHtml(q.weakness)}</div>` : ''}
                    ${q.challenge ? `<div style="margin-top:0.5rem;"><strong>אתגר/משבר:</strong> ${escapeHtml(q.challenge)}</div>` : ''}
                    ${q.achievement ? `<div style="margin-top:0.5rem;"><strong>הישג:</strong> ${escapeHtml(q.achievement)}</div>` : ''}
                    ${q.why_now ? `<div style="margin-top:0.5rem;"><strong>למה עכשיו:</strong> ${escapeHtml(q.why_now)}</div>` : ''}
                    ${q.vision_3_years ? `<div style="margin-top:0.5rem;"><strong>חזון 3 שנים:</strong> ${escapeHtml(q.vision_3_years)}</div>` : ''}
                    ${q.motto ? `<div style="margin-top:0.5rem;"><strong>מוטו:</strong> ${escapeHtml(q.motto)}</div>` : ''}
                    ${q.currently_practicing ? `<div style="margin-top:0.5rem;"><strong>עוסק בטיפול:</strong> ${escapeHtml(q.currently_practicing)}</div>` : ''}
                    ${q.previous_studies ? `<div style="margin-top:0.5rem;"><strong>לימודים קודמים:</strong> ${escapeHtml(q.previous_studies)}</div>` : ''}
                    ${q.people_accompanied ? `<div style="margin-top:0.5rem;"><strong>אנשים שליווה:</strong> ${escapeHtml(q.people_accompanied)}</div>` : ''}
                </div>
            </details>` : ''}
            ${formHtml}
            <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border);">
                <label style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:0.3rem;">הערות</label>
                <textarea id="pl-admin-notes" style="width:100%;min-height:60px;border-radius:8px;border:1px solid var(--border);padding:0.6rem;font-family:inherit;font-size:0.85rem;resize:vertical;background:var(--bg);" placeholder="הערות...">${escapeHtml(l.admin_notes || '')}</textarea>
                <button class="btn" style="margin-top:0.3rem;background:var(--muted-teal);color:white;font-size:0.85rem;" onclick="savePipelineNotes()"><i class="fa-solid fa-save"></i> שמור</button>
            </div>
        </div>`;

    document.getElementById('pipeline-modal-body').innerHTML = html;

    // Footer buttons
    const waPhone = (l.phone || '').replace(/^0/, '972').replace(/[^0-9]/g, '');
    document.getElementById('pipeline-modal-footer').innerHTML = `
        ${waPhone ? `<a href="https://wa.me/${waPhone}" target="_blank" class="btn" style="background:#25D366;color:white;"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>` : ''}
        <button class="btn btn-outline" onclick="closeModal('pipeline-modal')">סגור</button>
    `;

    document.getElementById('pipeline-modal').classList.add('active');

    // Event listeners for dynamic form
    setTimeout(() => {
        const callResult = document.getElementById('pl-call-result');
        if (callResult) {
            callResult.addEventListener('change', () => {
                const cbGroup = document.getElementById('pl-callback-group');
                if (cbGroup) cbGroup.style.display = callResult.value === 'no_answer' ? '' : 'none';
            });
        }
        document.querySelectorAll('input[name="pl-outcome"]').forEach(r => {
            r.addEventListener('change', () => {
                const v = document.querySelector('input[name="pl-outcome"]:checked')?.value;
                const wonF = document.getElementById('pl-won-fields');
                const lostF = document.getElementById('pl-lost-fields');
                if (wonF) wonF.style.display = v === 'won' ? '' : 'none';
                if (lostF) lostF.style.display = v === 'lost' ? '' : 'none';
            });
        });
    }, 50);
}

async function savePipelineCallResult() {
    if (!currentPipelineId) return;
    const result = document.getElementById('pl-call-result')?.value;
    const callbackTime = document.getElementById('pl-callback-time')?.value;

    // Always increment call attempt
    const lead = pipelineLeads.find(l => l.id === currentPipelineId);
    const newAttempts = Math.min((lead?.call_attempts || 0) + 1, 6);
    const updates = {
        call_attempts: newAttempts,
        last_call_at: new Date().toISOString()
    };

    if (result === 'answered') {
        updates.stage = 'answered';
    } else if (result === 'no_answer') {
        updates.stage = 'no_answer_callback';
        if (callbackTime) updates.callback_at = new Date(callbackTime).toISOString();
    } else {
        // Just log call, advance to call_attempts if new
        if (lead?.stage === 'new_lead') updates.stage = 'call_attempts';
    }

    const { error } = await db.from('sales_leads').update(updates).eq('id', currentPipelineId);
    if (error) { showToast('שגיאה בעדכון', 'error'); return; }
    showToast('חיוג נרשם', 'success');
    closeModal('pipeline-modal');
    loadPipeline();
    updateCounts();
}

async function advancePipelineStage(newStage) {
    if (!currentPipelineId) return;
    const { error } = await db.from('sales_leads').update({ stage: newStage }).eq('id', currentPipelineId);
    if (error) { showToast('שגיאה בעדכון', 'error'); return; }
    showToast('שלב עודכן', 'success');
    closeModal('pipeline-modal');
    loadPipeline();
    updateCounts();
}

async function changePipelineStage() {
    if (!currentPipelineId) return;
    const newStage = document.getElementById('pl-stage-select')?.value;
    if (!newStage) return;
    const lead = pipelineLeads.find(l => l.id === currentPipelineId);
    if (lead && lead.stage === newStage) { showToast('הליד כבר בשלב הזה', 'warning'); return; }

    const updates = { stage: newStage };
    if (newStage === 'closed_won') updates.is_bought = true;
    if (newStage === 'closed_lost') updates.is_bought = false;

    const { error } = await db.from('sales_leads').update(updates).eq('id', currentPipelineId);
    if (error) { showToast('שגיאה בעדכון', 'error'); return; }
    showToast(`שלב עודכן ל: ${PIPELINE_STAGES[newStage]}`, 'success');
    closeModal('pipeline-modal');
    loadPipeline();
    updateCounts();
}

async function savePipelineOutcome() {
    if (!currentPipelineId) return;
    const outcome = document.querySelector('input[name="pl-outcome"]:checked')?.value;
    if (!outcome) { showToast('בחר תוצאה', 'error'); return; }

    let updates = {};
    if (outcome === 'won') {
        updates = {
            stage: 'closed_won',
            is_bought: true,
            deal_amount: document.getElementById('pl-deal-amount')?.value || null,
            payment_method: document.getElementById('pl-payment-method')?.value || null,
            contract_signed: document.getElementById('pl-contract-signed')?.checked || false,
            won_reason: document.getElementById('pl-won-reason')?.value || null
        };
        if (updates.contract_signed) updates.contract_signed_at = new Date().toISOString();
    } else {
        updates = {
            stage: 'closed_lost',
            is_bought: false,
            lost_reason: document.getElementById('pl-lost-reason')?.value || 'other'
        };
    }

    const { error } = await db.from('sales_leads').update(updates).eq('id', currentPipelineId);
    if (error) { showToast('שגיאה בעדכון', 'error'); return; }
    showToast(outcome === 'won' ? 'סגירה מוצלחת!' : 'ליד סגור', 'success');
    closeModal('pipeline-modal');
    loadPipeline();
    updateCounts();
}

async function savePipelineNotes() {
    if (!currentPipelineId) return;
    const notes = document.getElementById('pl-admin-notes')?.value || '';
    const { error } = await db.from('sales_leads').update({ admin_notes: notes }).eq('id', currentPipelineId);
    if (error) { showToast('שגיאה בשמירה', 'error'); return; }
    showToast('הערות נשמרו', 'success');
    loadPipeline();
}

// === LEAD ASSIGNMENT (Admin only) ===

async function notifyRepAssignment(repProfileId, leadCount, leadNames) {
    try {
        const { data: { session } } = await db.auth.getSession();
        await fetch(`${BOT_URL}/api/notify-assignment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ repProfileId, leadCount, leadNames })
        });
    } catch (e) { console.warn('Notification failed:', e.message); }
}

async function assignLeadToRep() {
    if (window._userProfileRole !== 'admin') return;
    if (!currentPipelineId) return;
    const repId = document.getElementById('pl-assign-select')?.value || null;
    const { error } = await db.from('sales_leads').update({ assigned_to: repId || null }).eq('id', currentPipelineId);
    if (error) { showToast('שגיאה בהקצאה: ' + error.message, 'error'); return; }
    const repName = repId ? salesRepsCache.find(r => r.id === repId)?.full_name || 'איש מכירות' : 'ללא';
    showToast(`הליד הוקצה ל: ${repName}`, 'success');

    // Send WhatsApp notification to sales rep
    if (repId) {
        const lead = pipelineLeads.find(l => l.id === currentPipelineId);
        notifyRepAssignment(repId, 1, [lead?.full_name || 'ליד']).catch(() => {});
    }

    closeModal('pipeline-modal');
    loadPipeline();
}

async function bulkAssignLeads() {
    if (window._userProfileRole !== 'admin') return;
    const sel = document.getElementById('bulk-assign-select');
    const repId = sel?.value;
    if (!repId) { showToast('בחר איש מכירות', 'warning'); return; }

    const checked = [...document.querySelectorAll('#pipeline-table input[type="checkbox"]:checked')].map(c => c.value);
    if (!checked.length) { showToast('בחר לידים', 'warning'); return; }

    if (repId === '__auto__') {
        // Round-robin assignment
        await loadSalesReps();
        if (!salesRepsCache.length) { showToast('אין אנשי מכירות רשומים', 'error'); return; }
        let errors = 0;
        const assignmentsByRep = {};
        for (let i = 0; i < checked.length; i++) {
            const rep = salesRepsCache[i % salesRepsCache.length];
            const { error } = await db.from('sales_leads').update({ assigned_to: rep.id }).eq('id', checked[i]);
            if (error) { errors++; } else {
                if (!assignmentsByRep[rep.id]) assignmentsByRep[rep.id] = [];
                const lead = pipelineLeads.find(l => l.id === checked[i]);
                assignmentsByRep[rep.id].push(lead?.full_name || 'ליד');
            }
        }
        showToast(`הוקצו ${checked.length - errors} לידים (Round Robin)`, errors ? 'warning' : 'success');
        // Notify each rep
        for (const [rId, names] of Object.entries(assignmentsByRep)) {
            notifyRepAssignment(rId, names.length, names).catch(() => {});
        }
    } else {
        // Assign all to specific rep
        let errors = 0;
        const assignedNames = [];
        for (const id of checked) {
            const { error } = await db.from('sales_leads').update({ assigned_to: repId }).eq('id', id);
            if (error) { errors++; } else {
                const lead = pipelineLeads.find(l => l.id === id);
                assignedNames.push(lead?.full_name || 'ליד');
            }
        }
        const repName = salesRepsCache.find(r => r.id === repId)?.full_name || 'איש מכירות';
        showToast(`הוקצו ${checked.length - errors} לידים ל: ${repName}`, errors ? 'warning' : 'success');
        // Notify rep
        if (assignedNames.length) notifyRepAssignment(repId, assignedNames.length, assignedNames).catch(() => {});
    }
    loadPipeline();
}

async function moveQToPipeline() {
    if (!currentQId) return;
    const q = questionnaires.find(x => x.id === currentQId);
    if (!q) return;

    // Check if already in pipeline
    const existing = pipelineLeads.find(l => l.questionnaire_id === currentQId);
    if (existing) { showToast('הליד כבר קיים ב-Pipeline', 'warning'); return; }

    const { data, error } = await db.from('sales_leads').insert({
        questionnaire_id: currentQId,
        full_name: q.full_name,
        phone: q.phone,
        email: q.email,
        occupation: q.occupation,
        stage: 'new_lead',
        call_attempts: 0
    }).select().single();

    if (error) { showToast('שגיאה: ' + error.message, 'error'); return; }

    showToast('הליד הועבר ל-Pipeline!', 'success');
    closeModal('questionnaire-modal');
    await loadPipeline();
    updateCounts();
}
