// admin-export.js — CSV export modal, print signed document

function exportPipelineCSV() {
    if (pipelineLeads.length === 0) { showToast('אין נתונים לייצוא', 'warning'); return; }
    const headers = ['שם', 'טלפון', 'אימייל', 'עיסוק', 'שלב', 'ניסיונות חיוג', 'חזרה', 'קנה', 'סכום', 'תשלום', 'חוזה', 'סיבת רכישה', 'סיבת אי-רכישה', 'הערות', 'תאריך'];
    const rows = pipelineLeads.map(l => [
        l.full_name || '', l.phone || '', l.email || '', l.occupation || '',
        PIPELINE_STAGES[l.stage] || l.stage, l.call_attempts,
        l.callback_at ? new Date(l.callback_at).toLocaleString('he-IL') : '',
        l.is_bought === true ? 'כן' : l.is_bought === false ? 'לא' : '',
        l.deal_amount || '', PIPELINE_PAYMENT_METHODS[l.payment_method] || '',
        l.contract_signed ? 'כן' : '', l.won_reason || '',
        PIPELINE_LOST_REASONS[l.lost_reason] || '', l.admin_notes || '',
        formatDate(l.created_at)
    ]);
    const bom = '\uFEFF';
    const csv = bom + [headers, ...rows].map(r => r.map(c => `"${(c+'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pipeline_${getDateString()}.csv`;
    link.click();
    showToast('הקובץ הורד בהצלחה!', 'success');
}

// ===================
// CSV EXPORT FUNCTIONS
// ===================

let currentExportType = null; // 'therapists' or 'patients'

function getDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('\n') || str.includes('"') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function downloadCSV(content, filename) {
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    showToast('הקובץ הורד בהצלחה!', 'success');
}


function openExportModal(type) {
    currentExportType = type;
    const isTherapists = type === 'therapists';

    document.getElementById('export-modal-title').textContent = isTherapists ? 'ייצוא מטפלים' : 'ייצוא מטופלים';

    // Build status checkboxes based on type
    const statusFilters = document.getElementById('export-status-filters');
    const statuses = isTherapists
        ? [
            { value: 'new', label: 'חדש' },
            { value: 'pending_review', label: 'בבדיקה' },
            { value: 'approved', label: 'מאושר' },
            { value: 'active', label: 'פעיל' },
            { value: 'inactive', label: 'לא פעיל' },
            { value: 'rejected', label: 'נדחה' }
        ]
        : [
            { value: 'new', label: 'חדש' },
            { value: 'waiting', label: 'ממתין' },
            { value: 'matched', label: 'שובץ' },
            { value: 'in_treatment', label: 'בטיפול' },
            { value: 'completed', label: 'הושלם' },
            { value: 'rejected', label: 'נדחה' }
        ];

    statusFilters.innerHTML = statuses.map(s => `
        <label>
            <input type="checkbox" value="${s.value}" checked onchange="updateExportCount()">
            ${s.label}
        </label>
    `).join('');

    // Reset date filters
    document.getElementById('export-date-from').value = '';
    document.getElementById('export-date-to').value = '';

    // Reset verified filter
    document.querySelector('input[name="export-verified"][value="all"]').checked = true;

    // Update count
    updateExportCount();

    // Show modal
    openModal('export-modal');
}

function exportTherapistsCSV() { openExportModal('therapists'); }
function exportPatientsCSV() { openExportModal('patients'); }

// Get filtered data based on export modal filters
function getFilteredExportData() {
    const isTherapists = currentExportType === 'therapists';
    let data = isTherapists ? [...therapists] : [...patients];

    // Status filter
    const selectedStatuses = Array.from(document.querySelectorAll('#export-status-filters input:checked')).map(cb => cb.value);
    if (selectedStatuses.length > 0) {
        data = data.filter(item => selectedStatuses.includes(item.status));
    }

    // Date range filter
    const dateFrom = document.getElementById('export-date-from').value;
    const dateTo = document.getElementById('export-date-to').value;

    if (dateFrom) {
        const fromDate = new Date(dateFrom);
        data = data.filter(item => new Date(item.created_at) >= fromDate);
    }
    if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59); // Include the entire day
        data = data.filter(item => new Date(item.created_at) <= toDate);
    }

    // Verified filter
    const verifiedFilter = document.querySelector('input[name="export-verified"]:checked').value;
    if (verifiedFilter === 'yes') {
        data = data.filter(item => isTherapists ? item.documents_verified : item.id_verified);
    } else if (verifiedFilter === 'no') {
        data = data.filter(item => isTherapists ? !item.documents_verified : !item.id_verified);
    }

    return data;
}

function updateExportCount() {
    const data = getFilteredExportData();
    document.getElementById('export-count').textContent = data.length;
}

// Add event listeners for date inputs
document.getElementById('export-date-from')?.addEventListener('change', updateExportCount);
document.getElementById('export-date-to')?.addEventListener('change', updateExportCount);
document.querySelectorAll('input[name="export-verified"]').forEach(r => r.addEventListener('change', updateExportCount));

function executeExport() {
    const data = getFilteredExportData();

    if (data.length === 0) {
        showToast('אין נתונים לייצוא עם הפילטרים הנבחרים', 'error');
        return;
    }

    if (currentExportType === 'therapists') {
        exportTherapistsData(data);
    } else {
        exportPatientsData(data);
    }

    closeModal('export-modal');
}

function exportTherapistsData(filteredData) {
    const headers = [
        'שם מלא', 'טלפון', 'אימייל', 'עיר', 'מגדר', 'התמחות',
        'שיטות טיפול', 'שנות ניסיון', 'מספר רישיון', 'השכלה',
        'עבודה בזום', 'עבודה פרונטלית', 'שעות פנויות בשבוע', 'קישור חיצוני',
        'מטופלים לאורך הקריירה', 'מטופלים פעילים',
        'שעות בחודש', 'תקופת התחייבות', 'אופן טיפול מועדף',
        'בעיות רפואיות', 'פירוט בעיות רפואיות', 'תרופות פסיכיאטריות', 'בטיפול אישי',
        'למה בחרת במקצוע', 'למה הצטרפת לפרויקט', 'ניסיון מעשי', 'מקרה מורכב', 'אתגרים',
        'מסמכים מאומתים', 'סטטוס', 'תאריך הרשמה'
    ];

    const rows = filteredData.map(t => {
        const q = t.questionnaire || {};
        const health = q.health || {};
        const commitment = q.commitment || {};
        const practice = q.practice || {};
        const methods = practice.treatment_methods || [];
        const methodsStr = Array.isArray(methods) ? methods.join(', ') : '';

        return [
            t.full_name || '', t.phone || '', t.email || '', t.city || '',
            genderDisplayLabel(t.gender), t.specialization || '', methodsStr,
            t.experience_years || 0, t.license_number || '', t.education || '',
            t.works_online ? 'כן' : 'לא', t.works_in_person ? 'כן' : 'לא',
            t.available_hours_per_week || '', t.social_link || '',
            practice.total_patients_estimate || 0, practice.current_active_patients || 0,
            commitment.monthly_hours || '', commitment.duration_months || '', commitment.therapy_mode || '',
            health.has_medical_issues ? 'כן' : 'לא', health.medical_issues_details || '',
            health.takes_psychiatric_meds ? 'כן' : 'לא', health.in_personal_therapy ? 'כן' : 'לא',
            q.why_profession || '', q.why_join || '', q.experience || '', q.case_study || '', q.challenges || '',
            t.documents_verified ? 'כן' : 'לא', statusLabel(t.status), formatDate(t.created_at)
        ].map(escapeCSV);
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSV(csvContent, `therapists_${getDateString()}_filtered.csv`);
}

function exportPatientsData(filteredData) {
    const headers = [
        'שם מלא', 'טלפון', 'אימייל', 'עיר', 'העדפת טיפול', 'העדפת מגדר מטפל',
        'איש קשר לחירום', 'סיבת פנייה', 'טיפול קודם', 'ציפיות',
        'רקע משפחתי', 'רקע רפואי', 'תרופות', 'מידע נוסף',
        'זהות מאומתת', 'סטטוס', 'תאריך הרשמה'
    ];

    const rows = filteredData.map(p => {
        const q = p.questionnaire || {};
        return [
            p.full_name || '', p.phone || '', p.email || '', p.city || '',
            therapyTypeLabel(p.therapy_type), genderLabel(p.therapist_gender_preference),
            q.emergency_contact || '', q.main_reason || '', q.previous_therapy || '', q.expectations || '',
            q.family_background || '', q.medical_history || '', q.medications || '', q.additional_info || '',
            p.id_verified ? 'כן' : 'לא', statusLabel(p.status), formatDate(p.created_at)
        ].map(escapeCSV);
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSV(csvContent, `patients_${getDateString()}_filtered.csv`);
}

// ===================
// PRINT SIGNED DOCUMENT

function printSignedDocument(type) {
    const isTherapist = type === 'therapist';
    const data = isTherapist ? currentViewedTherapist : currentViewedPatient;

    if (!data) {
        showToast('לא נמצאו נתונים להדפסה', 'error');
        return;
    }

    const today = new Date().toLocaleDateString('he-IL');
    const signedDate = data.created_at ? formatDateTime(data.created_at) : today;

    // Build details based on type
    let detailsHTML = '';
    let typeTitle = '';
    let additionalInfo = '';

    if (isTherapist) {
        typeTitle = 'תיק מטפל/ת';
        const q = data.questionnaire || {};
        const commitment = q.commitment || {};

        detailsHTML = `
            <tr><td class="label">שם מלא:</td><td class="value">${data.full_name || '-'}</td></tr>
            <tr><td class="label">טלפון:</td><td class="value">${data.phone || '-'}</td></tr>
            <tr><td class="label">אימייל:</td><td class="value">${data.email || '-'}</td></tr>
            <tr><td class="label">עיר מגורים:</td><td class="value">${data.city || '-'}</td></tr>
            <tr><td class="label">תחום התמחות:</td><td class="value">${data.specialization || '-'}</td></tr>
            <tr><td class="label">שנות ניסיון:</td><td class="value">${data.experience_years || 0}</td></tr>
            <tr><td class="label">מספר רישיון:</td><td class="value">${data.license_number || '-'}</td></tr>
            <tr><td class="label">אופן טיפול:</td><td class="value">${data.works_online ? 'זום' : ''} ${data.works_in_person ? 'פרונטלי' : ''}</td></tr>
            <tr><td class="label">שעות התחייבות בחודש:</td><td class="value">${commitment.monthly_hours || '-'}</td></tr>
            <tr><td class="label">תקופת התחייבות:</td><td class="value">${commitment.duration_months || '-'}</td></tr>
        `;

        additionalInfo = `
            <div class="section">
                <h3>הצהרות המטפל/ת</h3>
                <ul>
                    <li>המטפל/ת מצהיר/ה כי יש ברשותו/ה ביטוח אחריות מקצועית בתוקף</li>
                    <li>המטפל/ת מבין/ה שכל האחריות המקצועית, החוקית והתיעודית היא עליו/ה בלבד</li>
                    <li>המטפל/ת משחרר/ת את הפלטפורמה מכל אחריות לטיפול או לתוצאותיו</li>
                </ul>
            </div>
        `;
    } else {
        typeTitle = 'תיק מטופל/ת';
        const q = data.questionnaire || {};

        detailsHTML = `
            <tr><td class="label">שם מלא:</td><td class="value">${data.full_name || '-'}</td></tr>
            <tr><td class="label">טלפון:</td><td class="value">${data.phone || '-'}</td></tr>
            <tr><td class="label">אימייל:</td><td class="value">${data.email || '-'}</td></tr>
            <tr><td class="label">עיר מגורים:</td><td class="value">${data.city || '-'}</td></tr>
            <tr><td class="label">העדפת טיפול:</td><td class="value">${therapyTypeLabel(data.therapy_type)}</td></tr>
            <tr><td class="label">העדפת מטפל/ת:</td><td class="value">${genderLabel(data.therapist_gender_preference)}</td></tr>
            <tr><td class="label">איש קשר לחירום:</td><td class="value">${q.emergency_contact || '-'}</td></tr>
        `;

        if (q.main_reason) {
            additionalInfo = `
                <div class="section">
                    <h3>סיבת הפנייה</h3>
                    <p>${q.main_reason}</p>
                </div>
            `;
        }
    }

    // Create the print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>${typeTitle} - ${data.full_name}</title>
    <style>
@import url('https://fonts.googleapis.com/css2?family=David+Libre:wght@400;500;700&family=Heebo:wght@400;500;700&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: 'David Libre', 'Heebo', serif;
    background: white;
    color: #1a1a1a;
    padding: 40px;
    line-height: 1.8;
    font-size: 14px;
}

.document {
    max-width: 800px;
    margin: 0 auto;
    border: 2px solid #003B46;
    padding: 40px;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px double #003B46;
    padding-bottom: 20px;
    margin-bottom: 30px;
}

.logo-section {
    display: flex;
    align-items: center;
    gap: 15px;
}

.logo-icon {
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, #D4AF37, #c9a227);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #003B46;
    font-size: 28px;
}

.logo-text h1 {
    font-size: 22px;
    color: #003B46;
    font-weight: 700;
}

.logo-text p {
    font-size: 12px;
    color: #666;
}

.date-section {
    text-align: left;
    font-size: 13px;
    color: #666;
}

.title {
    text-align: center;
    margin-bottom: 30px;
}

.title h2 {
    font-size: 24px;
    color: #003B46;
    margin-bottom: 5px;
}

.title .subtitle {
    font-size: 14px;
    color: #D4AF37;
    font-weight: 500;
}

.badge {
    display: inline-block;
    background: #003B46;
    color: white;
    padding: 5px 15px;
    border-radius: 20px;
    font-size: 12px;
    margin-top: 10px;
}

.details-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 30px;
}

.details-table tr {
    border-bottom: 1px solid #e0e0e0;
}

.details-table td {
    padding: 12px 10px;
}

.details-table .label {
    font-weight: 700;
    color: #003B46;
    width: 180px;
}

.details-table .value {
    color: #333;
}

.section {
    margin-bottom: 25px;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 8px;
    border-right: 4px solid #D4AF37;
}

.section h3 {
    font-size: 16px;
    color: #003B46;
    margin-bottom: 10px;
}

.section p, .section ul {
    color: #333;
    font-size: 13px;
}

.section ul {
    padding-right: 20px;
}

.section li {
    margin-bottom: 5px;
}

.legal-notice {
    background: linear-gradient(135deg, #003B46, #00606B);
    color: white;
    padding: 20px;
    border-radius: 10px;
    margin-bottom: 30px;
}

.legal-notice h3 {
    font-size: 16px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.legal-notice p {
    font-size: 13px;
    opacity: 0.95;
}

.signature-section {
    margin-top: 30px;
    border-top: 2px solid #e0e0e0;
    padding-top: 20px;
}

.signature-section h3 {
    font-size: 16px;
    color: #003B46;
    margin-bottom: 15px;
}

.signature-box {
    background: white;
    border: 2px solid #003B46;
    border-radius: 10px;
    padding: 20px;
    text-align: center;
}

.signature-box img {
    max-width: 300px;
    max-height: 120px;
}

.signature-date {
    margin-top: 10px;
    font-size: 12px;
    color: #666;
}

.footer {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #e0e0e0;
    text-align: center;
    font-size: 11px;
    color: #999;
}

.no-signature {
    color: #999;
    font-style: italic;
    padding: 30px;
}

@media print {
    body { padding: 0; }
    .document { border: none; padding: 20px; }
    @page { margin: 1cm; }
}
    </style>
</head>
<body>
    <div class="document">
<div class="header">
    <div class="logo-section">
        <div class="logo-icon">❤</div>
        <div style="font-size:1.2rem;font-weight:700;color:#003B46;">בית המטפלים</div>
    </div>
    <div class="date-section">
        <div>תאריך הפקת המסמך:</div>
        <div><strong>${today}</strong></div>
    </div>
</div>

<div class="title">
    <h2>${typeTitle}</h2>
    <div class="subtitle">מסמך רשמי</div>
    <span class="badge">${isTherapist ? (data.documents_verified ? '✓ מסמכים מאומתים' : 'ממתין לאימות') : (data.id_verified ? '✓ זהות מאומתת' : 'ממתין לאימות')}</span>
</div>

<table class="details-table">
    ${detailsHTML}
    <tr><td class="label">תאריך הרשמה:</td><td class="value">${formatDate(data.created_at)}</td></tr>
    <tr><td class="label">סטטוס:</td><td class="value">${statusLabel(data.status)}</td></tr>
</table>

${additionalInfo}

<div class="legal-notice">
    <h3>📋 הצהרה משפטית</h3>
    <p>
        ${isTherapist ? 'המטפל/ת' : 'המטופל/ת'} חתם/ה באופן דיגיטלי על תנאי השימוש והמסמך המשפטי של פלטפורמת "בית המטפלים".
        החתימה בוצעה בתאריך ${signedDate} ומהווה הסכמה מלאה לכל התנאים המפורטים במסמך.
    </p>
</div>

<div class="signature-section">
    <h3>חתימה דיגיטלית</h3>
    <div class="signature-box">
        ${data.signature_data
            ? `<img src="${data.signature_data}" alt="חתימה דיגיטלית">`
            : '<div class="no-signature">לא נמצאה חתימה דיגיטלית</div>'
        }
        <div class="signature-date">נחתם בתאריך: ${signedDate}</div>
    </div>
</div>

<div class="footer">
    <p>מסמך זה הופק אוטומטית ממערכת ה-CRM של "בית המטפלים"</p>
    <p>www.therapist-home.com</p>
</div>
    </div>

    <` + `script>
window.onload = function() {
    setTimeout(function() {
        window.print();
    }, 500);
};
    <` + `/script>
</body>
</html>
    `);
    printWindow.document.close();
}

// ============================================================
// BOT CRM TAB
// ============================================================
