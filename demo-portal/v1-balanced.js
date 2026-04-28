// V1 — Balanced Glass LMS (Updated to match real content)
// 5 real tabs · "המורה של NLP" chat · floating feedback · Instagram banner · partners card

(function(){
  const html = `
<div class="frame" id="frame-v1">
  <div class="atmos">
    <div class="atmos__base"></div>
    <div class="atmos__blob atmos__blob--a"></div>
    <div class="atmos__blob atmos__blob--b"></div>
    <div class="atmos__blob atmos__blob--c"></div>
    <div class="atmos__blob atmos__blob--d"></div>
    <div class="atmos__grid"></div>
    <div class="atmos__grain"></div>
  </div>

  <!-- ===== HEADER ===== -->
  <header class="v1-header">
    <div class="v1-hd__right">
      <a class="v1-hd__brand" href="#">
        <img src="../assets/logo-square.png" alt="">
        <span>בית <b>המטפלים</b></span>
      </a>
      <span class="v1-hd__sep"></span>
      <span class="v1-hd__course">קורס NLP · יסודות ומעשה</span>
    </div>

    <div class="v1-hd__center">
      <button class="v1-hd__pill v1-hd__pill--course">
        <i class="fa-solid fa-circle"></i>
        <span>NLP Practitioner</span>
        <i class="fa-solid fa-chevron-down chev"></i>
      </button>
      <div class="v1-hd__progress">
        <span class="v1-hd__label">התקדמות</span>
        <span class="v1-hd__progress-bar"><span style="width:6%"></span></span>
        <b>6%</b>
      </div>
    </div>

    <div class="v1-hd__left">
      <a class="btn btn--gold btn--sm" href="#"><i class="fa-solid fa-rocket"></i> לקבלת פרטים לתוכנית ההכשרה</a>
      <button class="btn btn--clear btn--icon" aria-label="theme"><i class="fa-regular fa-sun"></i></button>
      <button class="btn btn--clear btn--icon" aria-label="back to site"><i class="fa-solid fa-arrow-left"></i></button>
      <button class="btn btn--clear btn--icon" aria-label="notifications"><i class="fa-regular fa-bell"></i></button>
      <button class="btn btn--clear btn--sm"><span class="v1-av">ה</span> הילל <i class="fa-solid fa-chevron-down" style="font-size:.55rem;opacity:.6;"></i></button>
    </div>
  </header>

  <!-- ===== BODY ===== -->
  <div class="v1-body">
    <!-- SIDEBAR -->
    <aside class="v1-side g">
      <!-- Partners program banner -->
      <div class="v1-partners">
        <div class="v1-partners__badge">חדש</div>
        <div class="v1-partners__title"><i class="fa-solid fa-heart"></i> תוכנית השותפים</div>
        <div class="v1-partners__desc">אהבת את התוכן? הזמן חברים ובני משפחה גם הם יהנו — ותזכה בהטבות</div>
        <button class="btn btn--gold btn--sm" style="width:100%;justify-content:center;margin-top:.7rem;">שתף והרווח</button>
      </div>

      <div class="v1-side__head">
        <div class="v1-side__head-top">
          <span class="v1-side__h1">התקדמות בקורס</span>
          <span class="v1-side__count">3/51 שיעורים</span>
        </div>
        <div class="v1-side__bar"><span style="width:6%"></span></div>
        <div class="v1-side__pct">6%</div>
      </div>

      <div class="v1-side__search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" placeholder="חפש שיעור...">
      </div>

      <div class="v1-side__h2">תוכן הקורס</div>

      <div class="v1-side__list">
        <!-- Highlight items -->
        <div class="v1-side__hl">
          <i class="fa-solid fa-door-open"></i>
          <span>ברוך הבא לפורטל</span>
        </div>
        <div class="v1-side__hl">
          <i class="fa-brands fa-whatsapp"></i>
          <span>קהילת NLP</span>
        </div>

        <!-- Module 1 -->
        <div class="v1-mod open">
          <button class="v1-mod__hd">
            <span class="v1-mod__num">1</span>
            <span class="v1-mod__title">מבוא ל-NLP</span>
            <span class="v1-mod__count">3/8</span>
            <i class="fa-solid fa-chevron-down v1-mod__chev"></i>
          </button>
          <div class="v1-mod__list">
            <div class="v1-les done">
              <span class="v1-les__thumb"><img src="https://img.youtube.com/vi/HLyiS3Bz6N4/mqdefault.jpg" alt=""><i class="fa-solid fa-check v1-les__check"></i></span>
              <div class="v1-les__txt">
                <span class="v1-les__title">איך NLP יכול לשנות את חייך?</span>
                <span class="v1-les__meta">20:20 · שיעור 1</span>
              </div>
            </div>
            <div class="v1-les active">
              <span class="v1-les__thumb"><img src="https://img.youtube.com/vi/FzT3lFqqg9A/mqdefault.jpg" alt=""><i class="fa-solid fa-play v1-les__play"></i></span>
              <div class="v1-les__txt">
                <span class="v1-les__title">מהן האמונות שמסתתרות בתת המודע?</span>
                <span class="v1-les__meta">21:40 · נצפה כעת</span>
              </div>
            </div>
            <div class="v1-les done">
              <span class="v1-les__thumb"><img src="https://img.youtube.com/vi/lC7F0Bv-4Lc/mqdefault.jpg" alt=""><i class="fa-solid fa-check v1-les__check"></i></span>
              <div class="v1-les__txt">
                <span class="v1-les__title">מה זה (בכלל) NLP?</span>
                <span class="v1-les__meta">22:10 · שיעור 3</span>
              </div>
            </div>
            <div class="v1-les">
              <span class="v1-les__thumb"><img src="https://img.youtube.com/vi/Q5WT2vweFRY/mqdefault.jpg" alt=""></span>
              <div class="v1-les__txt">
                <span class="v1-les__title">4 עמודי התווך של NLP</span>
                <span class="v1-les__meta">18:05 · שיעור 4</span>
              </div>
            </div>
            <div class="v1-les locked">
              <span class="v1-les__thumb"><i class="fa-solid fa-lock"></i></span>
              <div class="v1-les__txt">
                <span class="v1-les__title">מודל התקשורת האנושית</span>
                <span class="v1-les__meta">24:00 · נעול</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Module 2 -->
        <div class="v1-mod">
          <button class="v1-mod__hd">
            <span class="v1-mod__num">2</span>
            <span class="v1-mod__title">מערכות ייצוג וחושים</span>
            <span class="v1-mod__count">0/7</span>
            <i class="fa-solid fa-chevron-down v1-mod__chev"></i>
          </button>
        </div>
        <div class="v1-mod">
          <button class="v1-mod__hd">
            <span class="v1-mod__num">3</span>
            <span class="v1-mod__title">ראפור ובניית קשר</span>
            <span class="v1-mod__count">0/6</span>
            <i class="fa-solid fa-chevron-down v1-mod__chev"></i>
          </button>
        </div>
        <div class="v1-mod">
          <button class="v1-mod__hd">
            <span class="v1-mod__num">4</span>
            <span class="v1-mod__title">מטא-מודל השפה</span>
            <span class="v1-mod__count">0/8</span>
            <i class="fa-solid fa-chevron-down v1-mod__chev"></i>
          </button>
        </div>
        <div class="v1-mod">
          <button class="v1-mod__hd">
            <span class="v1-mod__num">5</span>
            <span class="v1-mod__title">עוגנים ומצבי עוצמה</span>
            <span class="v1-mod__count">0/7</span>
            <i class="fa-solid fa-chevron-down v1-mod__chev"></i>
          </button>
        </div>
        <div class="v1-mod">
          <button class="v1-mod__hd">
            <span class="v1-mod__num">6</span>
            <span class="v1-mod__title">תת מודע ושינוי אמונות</span>
            <span class="v1-mod__count">0/9</span>
            <i class="fa-solid fa-chevron-down v1-mod__chev"></i>
          </button>
        </div>
        <div class="v1-mod">
          <button class="v1-mod__hd">
            <span class="v1-mod__num">7</span>
            <span class="v1-mod__title">אינטגרציה ופרקטיקה</span>
            <span class="v1-mod__count">0/6</span>
            <i class="fa-solid fa-chevron-down v1-mod__chev"></i>
          </button>
        </div>
      </div>
    </aside>

    <!-- MAIN -->
    <main class="v1-main">

      <!-- ===== HERO: Continue Learning ===== -->
      <section class="v1-hero g" aria-label="המשך ללמוד">
        <div class="v1-hero__orb"></div>

        <div class="v1-hero__content">
          <span class="v1-hero__eyebrow">השיעור הבא שלך</span>
          <h1 class="v1-hero__title">סיכום השיעור ונקודות חשובות</h1>
          <div class="v1-hero__meta">
            <span><i class="fa-regular fa-folder-open"></i> מודול 1: מבוא ל-NLP</span>
            <span class="v1-hero__dot">·</span>
            <span><i class="fa-regular fa-clock"></i> 19:46 דק'</span>
            <span class="v1-hero__dot">·</span>
            <span><i class="fa-regular fa-circle-play"></i> שיעור 2</span>
          </div>
          <div class="v1-hero__actions">
            <button class="btn btn--gold v1-hero__cta">
              <i class="fa-solid fa-play"></i> המשך ללמוד
              <span class="v1-hero__cta-arrow"><i class="fa-solid fa-arrow-left"></i></span>
            </button>
            <button class="btn btn--clear btn--sm v1-hero__skip">
              <i class="fa-solid fa-forward"></i> דלג לשיעור הבא
            </button>
          </div>

          <div class="v1-hero__progress">
            <div class="v1-hero__progress-row">
              <span>השלמת <b>7</b> מתוך <b>51</b> שיעורים</span>
              <span class="v1-hero__progress-pct">14%</span>
            </div>
            <div class="v1-hero__progress-bar"><span style="width:14%"></span></div>
          </div>
        </div>

        <button class="v1-hero__preview" aria-label="הפעל שיעור">
          <img src="https://img.youtube.com/vi/FzT3lFqqg9A/maxresdefault.jpg" alt="">
          <div class="v1-hero__preview-scrim"></div>
          <span class="v1-hero__preview-author"><img src="https://i.pravatar.cc/80?img=12" alt=""> רם אלוס</span>
          <span class="v1-hero__preview-play"><i class="fa-solid fa-play"></i></span>
        </button>
      </section>

      <!-- ===== STATS ROW ===== -->
      <section class="v1-stats" aria-label="סטטיסטיקות">
        <div class="v1-stat g">
          <div class="v1-stat__icon v1-stat__icon--book">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          </div>
          <div class="v1-stat__num">7<span>/8</span></div>
          <div class="v1-stat__label">במודול הנוכחי</div>
          <div class="v1-stat__ctx">מבוא ל-NLP · כמעט סיימת</div>
        </div>

        <div class="v1-stat g">
          <div class="v1-stat__icon v1-stat__icon--time">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          </div>
          <div class="v1-stat__num">15.5<span> שעות</span></div>
          <div class="v1-stat__label">זמן שנותר בקורס</div>
          <div class="v1-stat__ctx">בקצב הנוכחי · 3 שבועות</div>
        </div>

        <div class="v1-stat g">
          <div class="v1-stat__icon v1-stat__icon--flame">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4c.7 2.7-.5 4.5-2 6-1.5 1.5-3 3-3 5.5a4.5 4.5 0 0 0 9 0c0-3-2-5-2-7 0 0-1 .5-2 1.5"/><path d="M9.5 14.5c-.5 1 .5 3 2.5 3"/></svg>
          </div>
          <div class="v1-stat__num">2<span> ימים</span></div>
          <div class="v1-stat__label">רצף לימוד</div>
          <div class="v1-stat__ctx">השיא שלך: 7 ימים</div>
        </div>
      </section>

      <!-- ===== ANNOUNCEMENT BOARD ===== -->
      <section class="v1-announce g" aria-label="לוח מודעות">
        <header class="v1-announce__hd">
          <span class="v1-announce__title">
            <span class="v1-announce__icon"><i class="fa-solid fa-bullhorn"></i></span>
            לוח מודעות
          </span>
          <button class="btn btn--clear btn--sm v1-announce__all">
            ראה הכל <i class="fa-solid fa-arrow-left" style="font-size:.6rem;"></i>
          </button>
        </header>
        <div class="v1-announce__empty">
          <svg width="44" height="44" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M44 4 22 26"/>
            <path d="M44 4 30 44l-8-18-18-8z"/>
          </svg>
          <h4>אין מודעות חדשות</h4>
          <p>נעדכן אותך כשיהיה משהו חדש.</p>
        </div>
      </section>

      <!-- ===== REFERRAL BANNER ===== -->
      <section class="v1-referral lg-glass lg-glass--warm" aria-label="תוכנית השותפים">
        <span class="v1-referral__icon-wrap">
          <span class="v1-referral__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>
          </span>
        </span>
        <div class="v1-referral__body">
          <h3 class="v1-referral__title">קיבלת טוב? תחזיר טוב <span aria-hidden="true">💜</span></h3>
          <p class="v1-referral__sub">שתפו את הפורטל עם חברים והצטרפו לתוכנית השותפים שלנו · קבלו הטבות בכל הזמנה</p>
        </div>
        <button class="btn btn--gold v1-referral__cta">
          <i class="fa-solid fa-arrow-left" style="font-size:.7rem;opacity:.8;"></i>
          למידע נוסף
        </button>
      </section>

      <!-- ===== LESSON NAV (prev / mark / next) ===== -->
      <div class="v1-navbar g">
        <button class="btn btn--clear v1-nav-prev">
          <i class="fa-solid fa-arrow-right"></i>
          <span class="v1-navbar__lbl"><strong>הקודם</strong><small>איך NLP יכול לשנות את חייך?</small></span>
        </button>
        <div class="v1-navbar__center">
          <span class="v1-navbar__counter">שיעור <strong>2</strong> מתוך <strong>51</strong></span>
          <span class="v1-navbar__sep"></span>
          <button class="btn btn--clear btn--sm"><i class="fa-solid fa-check"></i> סמן כהושלם</button>
        </div>
        <button class="btn btn--gold v1-nav-next">
          <span class="v1-navbar__lbl"><strong>השיעור הבא</strong><small>מה זה (בכלל) NLP?</small></span>
          <i class="fa-solid fa-arrow-left"></i>
        </button>
      </div>

      <!-- Tabs -->
      <div class="v1-tabs g">
        <div class="v1-tabs__hd">
          <button class="v1-tab" data-tab="updates"><i class="fa-brands fa-whatsapp"></i> קבוצת עדכונים</button>
          <button class="v1-tab" data-tab="resources"><i class="fa-solid fa-download"></i> חומרי עזר</button>
          <button class="v1-tab" data-tab="notes"><i class="fa-regular fa-pen-to-square"></i> הערות אישיות</button>
          <button class="v1-tab active" data-tab="ai"><i class="fa-solid fa-robot"></i> העוזר האישי</button>
          <button class="v1-tab" data-tab="game"><i class="fa-solid fa-gamepad"></i> משחק תרגול</button>
        </div>

        <!-- TAB: AI Tutor (default active) -->
        <div class="v1-panel active" data-panel="ai">
          <div class="v1-chat">
            <div class="v1-chat__hd">
              <div class="v1-chat__hd-right">
                <div class="v1-chat__bot-av"><i class="fa-solid fa-robot"></i></div>
                <div>
                  <strong>המורה של NLP</strong>
                  <small><span class="v1-dot"></span> מוכן לעזור</small>
                </div>
              </div>
              <div class="v1-chat__badge">מהן האמונות שמסתתרות ב...</div>
            </div>
            <div class="v1-chat__body">
              <div class="v1-msg v1-msg--bot">
                <div class="v1-msg__av"><i class="fa-solid fa-robot"></i></div>
                <div class="v1-msg__bubble">
                  שלום! 👋 אני המורה שלכם לקורס NLP. שאלו אותי כל שאלה על החומר — טכניקות, מושגים, תרגולים. אני כאן כדי לעזור!
                </div>
              </div>
              <div class="v1-chat__suggestions">
                <button class="v1-suggest">💡 מה אתה יודע לעשות?</button>
                <button class="v1-suggest">🎬 תרגול NLP דרך סדרה/סרט</button>
                <button class="v1-suggest">📖 הסבר על אמונות מוגבלות</button>
              </div>
            </div>
            <div class="v1-chat__input">
              <input type="text" placeholder="שאלו שאלה על NLP...">
              <button class="v1-chat__send" aria-label="send"><i class="fa-solid fa-paper-plane"></i></button>
            </div>
          </div>
        </div>

        <!-- TAB: Updates (WhatsApp) -->
        <div class="v1-panel" data-panel="updates">
          <div class="v1-updates">
            <div class="v1-updates__icon"><i class="fa-brands fa-whatsapp"></i></div>
            <h3 class="v1-h3">הצטרפו לקבוצת העדכונים השקטה שלנו</h3>
            <p class="v1-p">קבלו עדכונים על אירועים, הטבות בלעדיות, תכנים חדשים וטיפים מקצועיים — בלי הצפות, בלי ספאם.</p>
            <div class="v1-qr">
              <div class="v1-qr__code">
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                  <rect width="100" height="100" fill="#fff"/>
                  <g fill="#000">${genQR()}</g>
                </svg>
              </div>
              <small>סרקו כדי להצטרף לקהילה השקטה שלנו</small>
              <span class="v1-qr__tag"><i class="fa-brands fa-whatsapp"></i> קהילת וואטסאפ</span>
            </div>
          </div>
        </div>

        <!-- TAB: Resources -->
        <div class="v1-panel" data-panel="resources">
          <div class="v1-res">
            <div class="v1-res__card">
              <div class="v1-res__icon"><i class="fa-solid fa-book-open"></i></div>
              <div class="v1-res__body">
                <h4>חוברת NLP Practitioner</h4>
                <p>7 שיעורים, 50 פרקים — טכניקות, תרגולים ועקרונות</p>
                <div class="v1-res__actions">
                  <button class="btn btn--gold btn--sm"><i class="fa-regular fa-eye"></i> צפייה בחוברת</button>
                  <button class="btn btn--clear btn--sm"><i class="fa-solid fa-download"></i> הורד PDF</button>
                </div>
              </div>
            </div>
            <div class="v1-res__card">
              <div class="v1-res__icon"><i class="fa-solid fa-clipboard-list"></i></div>
              <div class="v1-res__body">
                <h4>סיכומי שיעורים</h4>
                <p>7 מודולים — סיכום מקצועי עם דוגמאות מהשיעורים</p>
                <div class="v1-res__actions">
                  <button class="btn btn--gold btn--sm"><i class="fa-regular fa-eye"></i> צפייה בסיכומים</button>
                </div>
              </div>
            </div>
            <div class="v1-res__card v1-res__card--locked">
              <div class="v1-res__icon"><i class="fa-solid fa-file-waveform"></i></div>
              <div class="v1-res__body">
                <h4>הקלטות אודיו</h4>
                <p>השיעורים בפורמט MP3 — להאזנה בדרכים</p>
                <div class="v1-res__actions">
                  <button class="btn btn--clear btn--sm"><i class="fa-solid fa-lock"></i> נפתח בחודש הבא</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB: Notes -->
        <div class="v1-panel" data-panel="notes">
          <div class="v1-notes">
            <textarea placeholder="כתבו כאן את ההערות שלכם לשיעור זה..."></textarea>
            <div class="v1-notes__foot">
              <span class="v1-notes__count">0 תווים · נשמר אוטומטית</span>
              <div class="v1-notes__exp">
                <button class="btn btn--clear btn--sm"><i class="fa-solid fa-file-word"></i> Word</button>
                <button class="btn btn--clear btn--sm"><i class="fa-solid fa-file-pdf"></i> PDF</button>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB: Game -->
        <div class="v1-panel" data-panel="game">
          <div class="v1-game">
            <div class="v1-game__brain">🧠</div>
            <h3 class="v1-h3">תרגלו NLP בצורה אינטראקטיבית</h3>
            <p class="v1-p">+80 תרגילים, XP, רמות והישגים — למידה בסגנון Duolingo<br>עם מנטור AI שמלווה אתכם בכל שלב</p>
            <button class="btn btn--gold"><i class="fa-solid fa-play"></i> התחילו לשחק</button>
            <div class="v1-game__stats">
              <div><b>0</b><span>XP</span></div>
              <div><b>1</b><span>רמה</span></div>
              <div><b>0/80</b><span>תרגילים</span></div>
            </div>
          </div>
        </div>

      </div>
    </main>
  </div>

  <!-- Floating actions: AI assistant (primary, pulsing) + Help + Feedback -->
  <div class="v1-fabs" role="group" aria-label="פעולות צפות">
    <button class="v1-fab v1-fab--ai" aria-label="העוזר ה-AI" data-tip="המורה של NLP">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
      <span class="v1-fab__sr">העוזר ה-AI</span>
    </button>
    <button class="v1-fab v1-fab--help" aria-label="עזרה" data-tip="עזרה ותמיכה">
      <i class="fa-regular fa-circle-question"></i>
      <span class="v1-fab__sr">עזרה</span>
    </button>
    <button class="v1-fab v1-fab--feedback" aria-label="משוב" data-tip="שלח משוב">
      <i class="fa-regular fa-lightbulb"></i>
      <span class="v1-fab__sr">משוב</span>
    </button>
  </div>
</div>
`;

  const styles = `
<style>
  /* ==================== V1 HEADER ==================== */
  .v1-header{
    position:sticky;top:50px;z-index:50;
    display:flex;align-items:center;justify-content:space-between;gap:1rem;
    padding:.75rem 1.25rem;
    background:rgba(4,22,27,.55);
    backdrop-filter:blur(26px) saturate(180%);
    -webkit-backdrop-filter:blur(26px) saturate(180%);
    border-bottom:1px solid rgba(255,255,255,.08);
    min-height:64px;
  }
  .v1-hd__right,.v1-hd__center,.v1-hd__left{display:flex;align-items:center;gap:.55rem;}
  .v1-hd__brand{display:flex;align-items:center;gap:.55rem;text-decoration:none;color:#fff;}
  .v1-hd__brand img{height:32px;border-radius:7px;}
  .v1-hd__brand span{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:.95rem;letter-spacing:-.01em;}
  .v1-hd__brand b{color:#E6C65A;}
  .v1-hd__sep{width:1px;height:22px;background:rgba(255,255,255,.14);}
  .v1-hd__course{font-size:.8rem;color:rgba(232,241,242,.7);font-weight:500;}

  .v1-hd__pill{
    display:inline-flex;align-items:center;gap:.45rem;
    padding:.4rem .85rem;border-radius:50px;
    background:rgba(47,133,146,.18);
    border:1px solid rgba(63,170,187,.3);
    color:#9FDBE5;font-size:.76rem;font-weight:600;font-family:inherit;cursor:pointer;
    backdrop-filter:blur(10px);
  }
  .v1-hd__pill i.fa-circle{font-size:.4rem;color:#E6C65A;}
  .v1-hd__pill .chev{font-size:.55rem;opacity:.6;}
  .v1-hd__progress{display:flex;align-items:center;gap:.5rem;padding:.35rem .75rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:50px;}
  .v1-hd__label{font-size:.7rem;color:rgba(232,241,242,.55);}
  .v1-hd__progress-bar{display:block;width:90px;height:5px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;}
  .v1-hd__progress-bar span{display:block;height:100%;background:linear-gradient(90deg,#D4AF37,#E6C65A);}
  .v1-hd__progress b{font-size:.72rem;color:#E6C65A;font-weight:700;}

  .v1-av{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#E6C65A,#D4AF37);color:#1a1205;font-weight:700;font-size:.72rem;margin-inline-end:.1rem;}

  /* ==================== BODY ==================== */
  .v1-body{display:grid;grid-template-columns:1fr 360px;gap:1rem;padding:.6rem 1rem 1rem;min-height:calc(100vh - 114px);}

  /* ==================== SIDEBAR ==================== */
  /* Sidebar sits a bit higher now that body padding is tighter */
  .v1-side{
    position:sticky;top:124px;height:calc(100vh - 138px);
    border-radius:20px;padding:1rem;
    display:flex;flex-direction:column;gap:.85rem;
    overflow:hidden;
    box-shadow:0 20px 48px rgba(0,0,0,.3);
  }
  .v1-side > *{position:relative;z-index:1;}
  .v1-side::before{z-index:0;}

  .v1-partners{
    padding:.85rem;border-radius:14px;
    background:linear-gradient(135deg,rgba(212,175,55,.22),rgba(230,198,90,.08));
    border:1px solid rgba(230,198,90,.32);
    position:relative;
    box-shadow:0 0 0 1px rgba(230,198,90,.08), inset 0 1px 0 rgba(255,255,255,.08);
  }
  .v1-partners__badge{position:absolute;top:-8px;inset-inline-start:12px;padding:.2rem .55rem;border-radius:50px;background:#E6C65A;color:#1a1205;font-size:.62rem;font-weight:700;letter-spacing:.05em;}
  .v1-partners__title{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1rem;color:#fff;margin-bottom:.3rem;display:flex;align-items:center;gap:.4rem;}
  .v1-partners__title i{color:#E6C65A;font-size:.82rem;}
  .v1-partners__desc{font-size:.76rem;color:rgba(232,241,242,.72);line-height:1.45;}

  .v1-side__head{padding:.4rem .2rem;}
  .v1-side__head-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:.45rem;}
  .v1-side__h1{font-size:.85rem;font-weight:600;color:#fff;}
  .v1-side__count{font-size:.72rem;color:rgba(232,241,242,.55);}
  .v1-side__bar{display:block;height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;}
  .v1-side__bar span{display:block;height:100%;background:linear-gradient(90deg,#D4AF37,#E6C65A);border-radius:3px;}
  .v1-side__pct{font-size:.72rem;color:#E6C65A;font-weight:700;margin-top:.25rem;}

  .v1-side__search{position:relative;}
  .v1-side__search input{
    width:100%;padding:.55rem .9rem;padding-inline-start:2.2rem;
    background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.1);
    border-radius:10px;color:#fff;font-family:inherit;font-size:.82rem;outline:none;
    transition:border-color .2s;
  }
  .v1-side__search input::placeholder{color:rgba(232,241,242,.4);}
  .v1-side__search input:focus{border-color:rgba(230,198,90,.4);background:rgba(0,0,0,.35);}
  .v1-side__search i{position:absolute;inset-inline-start:.85rem;top:50%;transform:translateY(-50%);color:rgba(232,241,242,.5);font-size:.8rem;}

  .v1-side__h2{font-size:.7rem;font-weight:600;color:rgba(232,241,242,.5);text-transform:uppercase;letter-spacing:.14em;padding:.25rem .2rem;}

  .v1-side__list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:.4rem;padding-inline-end:.3rem;margin-inline-end:-.3rem;}
  .v1-side__list::-webkit-scrollbar{width:4px;}
  .v1-side__list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:2px;}

  .v1-side__hl{
    display:flex;align-items:center;gap:.65rem;
    padding:.7rem .85rem;border-radius:12px;
    background:linear-gradient(135deg,rgba(230,198,90,.16),rgba(212,175,55,.06));
    border:1px solid rgba(230,198,90,.22);
    font-size:.85rem;color:#fff;font-weight:500;cursor:pointer;
    transition:background .2s;
  }
  .v1-side__hl:hover{background:linear-gradient(135deg,rgba(230,198,90,.24),rgba(212,175,55,.1));}
  .v1-side__hl i{color:#E6C65A;width:18px;text-align:center;}

  .v1-mod{border-radius:12px;overflow:hidden;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);}
  .v1-mod__hd{
    width:100%;display:flex;align-items:center;gap:.6rem;padding:.7rem .8rem;
    background:none;border:none;color:#fff;font-family:inherit;cursor:pointer;text-align:inherit;
  }
  .v1-mod__num{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;background:rgba(47,133,146,.25);border:1px solid rgba(63,170,187,.3);font-size:.78rem;font-weight:700;color:#9FDBE5;}
  .v1-mod__title{font-size:.86rem;font-weight:600;flex:1;}
  .v1-mod__count{font-size:.7rem;color:rgba(232,241,242,.5);}
  .v1-mod__chev{font-size:.65rem;color:rgba(232,241,242,.4);transition:transform .2s;}
  .v1-mod.open .v1-mod__chev{transform:rotate(180deg);}

  .v1-mod__list{display:none;padding:.25rem .4rem .5rem;flex-direction:column;gap:.25rem;}
  .v1-mod.open .v1-mod__list{display:flex;}

  .v1-les{
    display:flex;align-items:center;gap:.6rem;padding:.5rem;border-radius:10px;
    cursor:pointer;transition:background .15s;border:1px solid transparent;
  }
  .v1-les:hover{background:rgba(255,255,255,.04);}
  .v1-les.active{background:linear-gradient(135deg,rgba(230,198,90,.14),rgba(212,175,55,.04));border-color:rgba(230,198,90,.3);}
  .v1-les__thumb{position:relative;width:62px;height:38px;border-radius:6px;overflow:hidden;background:#04161b;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
  .v1-les__thumb img{width:100%;height:100%;object-fit:cover;}
  .v1-les__thumb i{color:rgba(232,241,242,.3);font-size:.85rem;}
  .v1-les__check{position:absolute!important;inset:0;background:rgba(0,184,148,.75);color:#fff!important;display:flex;align-items:center;justify-content:center;font-size:.85rem!important;}
  .v1-les__play{position:absolute!important;inset:0;background:rgba(212,175,55,.55);color:#1a1205!important;display:flex;align-items:center;justify-content:center;font-size:.75rem!important;}
  .v1-les__txt{display:flex;flex-direction:column;gap:.15rem;min-width:0;flex:1;}
  .v1-les__title{font-size:.78rem;color:#fff;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .v1-les.done .v1-les__title{color:rgba(232,241,242,.55);}
  .v1-les__meta{font-size:.66rem;color:rgba(232,241,242,.45);}
  .v1-les.locked{opacity:.45;}

  /* ==================== MAIN ==================== */
  .v1-main{min-width:0;display:flex;flex-direction:column;gap:1rem;}
  .v1-navbar__sep{width:1px;height:18px;background:rgba(255,255,255,.14);}

  /* ==================== HERO ==================== */
  /* Concentric radii: outer 28 → preview 18 → icons/buttons inside ~12 (52-2=50→radius matches) */
  .v1-hero{
    position:relative;
    border-radius:28px;
    padding:2rem 2.25rem;
    display:grid;grid-template-columns:1fr 320px;gap:2rem;
    align-items:center;
    overflow:hidden;
    background:
      linear-gradient(135deg, rgba(26,79,79,.55), rgba(45,107,95,.35)),
      rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.14);
    backdrop-filter:blur(40px) saturate(180%);
    -webkit-backdrop-filter:blur(40px) saturate(180%);
    box-shadow:
      0 24px 70px rgba(0,0,0,.34),
      0 1px 0 rgba(255,255,255,.18) inset,
      0 -1px 0 rgba(0,0,0,.18) inset;
    isolation:isolate;
  }
  /* Specular highlight — bright top-edge band + soft corner bloom */
  .v1-hero::before{
    content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;
    background:
      radial-gradient(120% 80% at 18% -10%, rgba(255,255,255,.18), transparent 55%),
      linear-gradient(180deg, rgba(255,255,255,.12) 0%, rgba(255,255,255,0) 30%);
    mix-blend-mode:screen;z-index:0;
  }
  /* Subtle inner gold edge — refractive frame */
  .v1-hero::after{
    content:'';position:absolute;inset:1px;border-radius:27px;pointer-events:none;
    border:1px solid transparent;
    background:linear-gradient(135deg, rgba(229,181,71,.22), transparent 30%, transparent 70%, rgba(229,181,71,.14)) border-box;
    -webkit-mask:linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite:xor;mask-composite:exclude;
    z-index:0;
  }
  .v1-hero__orb{
    position:absolute;width:520px;height:520px;border-radius:50%;
    background:radial-gradient(circle, rgba(212,165,116,.32), transparent 65%);
    inset-inline-end:-180px;top:-200px;filter:blur(40px);pointer-events:none;
    animation:heroOrb 18s ease-in-out infinite;
  }
  @keyframes heroOrb{0%,100%{transform:translate(0,0) scale(1);opacity:.85;}50%{transform:translate(-30px,20px) scale(1.06);opacity:1;}}

  .v1-hero__content{position:relative;z-index:1;display:flex;flex-direction:column;gap:.85rem;}
  .v1-hero__eyebrow{
    font-size:.72rem;font-weight:600;color:rgba(255,255,255,.62);
    letter-spacing:.14em;text-transform:uppercase;
  }
  .v1-hero__title{
    font-family:'Frank Ruhl Libre','SF Pro Display',serif;
    font-size:2rem;line-height:1.18;letter-spacing:-.02em;font-weight:700;
    color:#fff;margin:0;text-wrap:balance;
  }
  .v1-hero__meta{
    display:flex;align-items:center;flex-wrap:wrap;gap:.45rem;
    font-size:.82rem;color:rgba(255,255,255,.72);
  }
  .v1-hero__meta i{margin-inline-end:.3rem;opacity:.7;font-size:.78rem;}
  .v1-hero__dot{opacity:.4;}
  .v1-hero__actions{display:flex;align-items:center;gap:.7rem;margin-top:.4rem;}
  .v1-hero__cta{
    height:52px;padding:0 1.6rem;font-size:.95rem;font-weight:600;border-radius:999px;
    background:linear-gradient(135deg,#E5B547,#D4A03B);color:#1A2E2E;
    box-shadow:0 8px 24px rgba(229,181,71,.35), inset 0 1px 0 rgba(255,255,255,.45);
    border:1px solid rgba(229,181,71,.5);
    transition:all .3s cubic-bezier(.32,.72,0,1);
    position:relative;
  }
  .v1-hero__cta::before{display:none;}
  .v1-hero__cta:hover{filter:brightness(1.08);transform:translateY(-2px);box-shadow:0 14px 32px rgba(229,181,71,.5);}
  .v1-hero__cta i.fa-play{font-size:.78rem;}
  .v1-hero__cta-arrow{display:inline-flex;margin-inline-start:.35rem;font-size:.7rem;opacity:.7;}
  .v1-hero__skip{padding:.5rem .9rem;}

  .v1-hero__progress{margin-top:.6rem;display:flex;flex-direction:column;gap:.45rem;}
  .v1-hero__progress-row{display:flex;justify-content:space-between;align-items:center;font-size:.78rem;color:rgba(255,255,255,.7);}
  .v1-hero__progress-row b{color:#fff;font-weight:600;font-variant-numeric:tabular-nums;}
  .v1-hero__progress-pct{font-weight:700;color:#E5B547;font-size:.85rem;font-variant-numeric:tabular-nums;}
  .v1-hero__progress-bar{height:6px;background:rgba(255,255,255,.15);border-radius:999px;overflow:hidden;position:relative;}
  .v1-hero__progress-bar span{
    display:block;height:100%;border-radius:999px;
    background:linear-gradient(90deg,#D4A03B,#E5B547,#E8D5B7);
    box-shadow:0 0 12px rgba(229,181,71,.5);
    position:relative;overflow:hidden;
  }
  .v1-hero__progress-bar span::after{
    content:'';position:absolute;inset:0;
    background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.4) 50%,transparent 100%);
    animation:shimmer 2.4s ease-in-out infinite;
  }
  @keyframes shimmer{0%{transform:translateX(-100%);}100%{transform:translateX(100%);}}

  /* Video preview thumbnail */
  .v1-hero__preview{
    position:relative;z-index:1;
    aspect-ratio:16/10;border-radius:18px;overflow:hidden;
    border:1px solid rgba(255,255,255,.18);
    box-shadow:0 16px 48px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.18);
    cursor:pointer;background:#000;padding:0;
    transition:transform .35s cubic-bezier(.32,.72,0,1), box-shadow .35s;
  }
  .v1-hero__preview:hover{transform:scale(1.02);box-shadow:0 22px 60px rgba(0,0,0,.5), 0 0 0 2px rgba(229,181,71,.35);}
  .v1-hero__preview img{width:100%;height:100%;object-fit:cover;}
  .v1-hero__preview-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15) 0%,transparent 30%,transparent 60%,rgba(0,0,0,.7) 100%);}
  .v1-hero__preview-author{
    position:absolute;bottom:.7rem;inset-inline-start:.7rem;
    display:flex;align-items:center;gap:.4rem;
    font-size:.72rem;color:#fff;font-weight:500;
    background:rgba(0,0,0,.4);backdrop-filter:blur(12px);
    padding:.3rem .6rem;border-radius:999px;
    border:1px solid rgba(255,255,255,.12);
  }
  .v1-hero__preview-author img{width:18px;height:18px;border-radius:50%;}
  .v1-hero__preview-play{
    position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    width:64px;height:64px;border-radius:50%;
    background:linear-gradient(135deg, rgba(229,181,71,.92), rgba(212,160,59,.85));
    color:#1A2E2E;font-size:1.1rem;
    display:flex;align-items:center;justify-content:center;padding-inline-start:4px;
    backdrop-filter:blur(10px);
    box-shadow:0 8px 28px rgba(229,181,71,.5), inset 0 0 0 1px rgba(255,255,255,.4);
    transition:transform .3s cubic-bezier(.32,.72,0,1);
  }
  .v1-hero__preview:hover .v1-hero__preview-play{transform:translate(-50%,-50%) scale(1.08);}

  /* ==================== STATS ROW ==================== */
  /* Concentric radii: stat outer 24 → icon inner 14 (matches 24-padding ratio) */
  .v1-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;}
  .v1-stat{
    border-radius:24px;padding:1.4rem 1.25rem;
    display:flex;flex-direction:column;gap:.4rem;align-items:flex-start;
    transition:transform .3s cubic-bezier(.32,.72,0,1), box-shadow .3s, border-color .3s;
    position:relative;isolation:isolate;
    box-shadow:
      0 12px 36px rgba(0,0,0,.22),
      0 1px 0 rgba(255,255,255,.14) inset,
      0 -1px 0 rgba(0,0,0,.14) inset;
  }
  /* Specular: top-corner light bloom on every stat card */
  .v1-stat::before{
    content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;
    background:
      radial-gradient(85% 55% at 100% 0%, rgba(255,255,255,.16), transparent 55%),
      linear-gradient(180deg, rgba(255,255,255,.08) 0%, transparent 28%);
    mix-blend-mode:screen;
  }
  .v1-stat > *{position:relative;z-index:1;}
  .v1-stat:hover{transform:translateY(-4px);box-shadow:0 22px 48px rgba(0,0,0,.32), 0 0 0 1px rgba(229,181,71,.32), 0 1px 0 rgba(255,255,255,.18) inset;}
  .v1-stat__icon{
    width:42px;height:42px;border-radius:14px;
    display:flex;align-items:center;justify-content:center;
    color:#E5B547;
    background:linear-gradient(135deg, rgba(229,181,71,.22), rgba(229,181,71,.06));
    border:1px solid rgba(229,181,71,.32);
    box-shadow:
      0 6px 18px rgba(229,181,71,.18),
      0 1px 0 rgba(255,255,255,.22) inset;
    margin-bottom:.4rem;
    position:relative;
  }
  .v1-stat__icon::after{
    content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;
    background:radial-gradient(70% 50% at 30% 0%, rgba(255,255,255,.4), transparent 60%);
    mix-blend-mode:screen;
  }
  .v1-stat__num{
    font-family:'SF Pro Display','Frank Ruhl Libre',serif;
    font-size:2.4rem;font-weight:700;color:#fff;line-height:1;
    letter-spacing:-.02em;font-variant-numeric:tabular-nums;
  }
  .v1-stat__num span{font-size:1rem;font-weight:500;color:rgba(255,255,255,.55);margin-inline-start:.15rem;letter-spacing:0;}
  .v1-stat__label{font-size:.92rem;font-weight:600;color:rgba(255,255,255,.85);}
  .v1-stat__ctx{font-size:.74rem;color:rgba(255,255,255,.55);margin-top:.1rem;}

  /* ==================== ANNOUNCE ==================== */
  /* Concentric radii: outer 24 → header pill area 18 → icon 11 (24/2.2 ≈ icon ratio) */
  .v1-announce{
    border-radius:24px;padding:1.25rem 1.5rem;
    position:relative;isolation:isolate;
    box-shadow:
      0 14px 38px rgba(0,0,0,.22),
      0 1px 0 rgba(255,255,255,.14) inset,
      0 -1px 0 rgba(0,0,0,.14) inset;
  }
  .v1-announce::before{
    content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;
    background:
      radial-gradient(70% 40% at 0% 0%, rgba(255,255,255,.12), transparent 55%),
      linear-gradient(180deg, rgba(255,255,255,.07) 0%, transparent 25%);
    mix-blend-mode:screen;
  }
  .v1-announce > *{position:relative;z-index:1;}
  .v1-announce__hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem;}
  .v1-announce__title{display:flex;align-items:center;gap:.55rem;font-size:.95rem;font-weight:600;color:#fff;}
  .v1-announce__icon{
    width:32px;height:32px;border-radius:11px;
    background:linear-gradient(135deg,rgba(229,181,71,.26),rgba(229,181,71,.08));
    border:1px solid rgba(229,181,71,.34);color:#E5B547;
    display:inline-flex;align-items:center;justify-content:center;font-size:.74rem;
    box-shadow:0 4px 14px rgba(229,181,71,.18), 0 1px 0 rgba(255,255,255,.22) inset;
    position:relative;
  }
  .v1-announce__icon::after{
    content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;
    background:radial-gradient(70% 50% at 30% 0%, rgba(255,255,255,.42), transparent 60%);
    mix-blend-mode:screen;
  }
  .v1-announce__empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:1.6rem 1rem .6rem;color:rgba(255,255,255,.7);}
  .v1-announce__empty svg{color:rgba(229,181,71,.55);margin-bottom:.7rem;}
  .v1-announce__empty h4{margin:0 0 .25rem;font-family:'Frank Ruhl Libre',serif;font-size:1.05rem;font-weight:600;color:#fff;}
  .v1-announce__empty p{margin:0;font-size:.82rem;color:rgba(255,255,255,.55);}

  /* Nav bar */
  .v1-navbar{
    display:flex;align-items:center;justify-content:space-between;gap:.75rem;
    padding:.55rem .75rem;border-radius:14px;
  }
  .v1-navbar__center{display:flex;align-items:center;gap:.8rem;font-size:.82rem;color:rgba(232,241,242,.7);}
  .v1-navbar__counter strong{color:#fff;font-weight:700;font-size:.9rem;}
  .v1-navbar__lbl{display:flex;flex-direction:column;align-items:flex-start;line-height:1.25;}
  .v1-navbar__lbl strong{font-size:.88rem;font-weight:700;}
  .v1-navbar__lbl small{font-size:.66rem;opacity:.7;font-weight:400;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

  /* Instagram strip */
  .v1-ig{
    display:flex;align-items:center;justify-content:center;gap:.5rem;
    padding:.5rem 1rem;
    font-size:.75rem;color:rgba(232,241,242,.55);text-align:center;
  }
  .v1-ig i{background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);-webkit-background-clip:text;background-clip:text;color:transparent;font-size:.95rem;}

  /* Tabs */
  .v1-tabs{border-radius:18px;overflow:hidden;}
  .v1-tabs__hd{display:flex;gap:.2rem;padding:.45rem;border-bottom:1px solid rgba(255,255,255,.06);overflow-x:auto;background:rgba(4,22,27,.35);}
  .v1-tabs__hd::-webkit-scrollbar{height:0;}
  .v1-tab{
    display:inline-flex;align-items:center;gap:.45rem;
    padding:.65rem 1.1rem;border-radius:10px;
    background:none;border:1px solid transparent;color:rgba(232,241,242,.6);
    font-family:inherit;font-size:.83rem;font-weight:500;cursor:pointer;
    white-space:nowrap;transition:all .2s;
  }
  .v1-tab:hover{color:#fff;background:rgba(255,255,255,.04);}
  .v1-tab.active{color:#1a1205;background:linear-gradient(135deg,rgba(230,198,90,.8),rgba(212,175,55,.6));font-weight:600;border-color:rgba(230,198,90,.5);box-shadow:0 4px 14px rgba(212,175,55,.25);}
  .v1-tab i{font-size:.82rem;opacity:.9;}

  .v1-panel{display:none;padding:1.75rem;}
  .v1-panel.active{display:block;}

  /* Shared typography in panels */
  .v1-h3{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1.45rem;color:#fff;line-height:1.25;letter-spacing:-.01em;margin:0 0 .7rem;text-wrap:balance;}
  .v1-p{font-size:.92rem;line-height:1.7;color:rgba(232,241,242,.76);margin:0 0 1rem;text-wrap:pretty;}

  /* AI Chat panel */
  .v1-chat{display:flex;flex-direction:column;height:500px;border-radius:16px;overflow:hidden;background:rgba(4,22,27,.55);border:1px solid rgba(255,255,255,.08);}
  .v1-chat__hd{display:flex;align-items:center;justify-content:space-between;gap:.8rem;padding:.85rem 1rem;background:rgba(6,34,41,.85);border-bottom:1px solid rgba(255,255,255,.06);}
  .v1-chat__hd-right{display:flex;align-items:center;gap:.7rem;flex-direction:row-reverse;}
  .v1-chat__bot-av{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#E6C65A,#D4AF37);color:#1a1205;display:flex;align-items:center;justify-content:center;font-size:1rem;box-shadow:0 4px 14px rgba(212,175,55,.3);}
  .v1-chat__hd strong{display:block;font-size:.92rem;color:#fff;font-weight:600;}
  .v1-chat__hd small{font-size:.72rem;color:rgba(232,241,242,.55);display:flex;align-items:center;gap:.35rem;}
  .v1-dot{width:7px;height:7px;border-radius:50%;background:#00cec9;box-shadow:0 0 0 3px rgba(0,206,201,.2);animation:pulse 2s ease-in-out infinite;}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  .v1-chat__badge{padding:.3rem .7rem;border-radius:50px;background:rgba(47,133,146,.2);border:1px solid rgba(63,170,187,.3);color:#9FDBE5;font-size:.7rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

  .v1-chat__body{flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.85rem;}
  .v1-msg{display:flex;gap:.55rem;max-width:85%;}
  .v1-msg--bot{align-self:flex-start;}
  .v1-msg__av{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#E6C65A,#D4AF37);color:#1a1205;display:flex;align-items:center;justify-content:center;font-size:.78rem;flex-shrink:0;}
  .v1-msg__bubble{padding:.75rem 1rem;border-radius:14px;border-top-right-radius:4px;font-size:.9rem;line-height:1.65;background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.08);}
  .v1-chat__suggestions{display:flex;flex-wrap:wrap;gap:.5rem;padding-inline-start:42px;}
  .v1-suggest{padding:.5rem .95rem;border-radius:50px;background:rgba(47,133,146,.15);border:1px solid rgba(63,170,187,.28);color:#9FDBE5;font-family:inherit;font-size:.8rem;cursor:pointer;transition:all .2s;}
  .v1-suggest:hover{background:rgba(47,133,146,.25);color:#fff;border-color:rgba(63,170,187,.5);}

  .v1-chat__input{display:flex;align-items:center;gap:.5rem;padding:.75rem;border-top:1px solid rgba(255,255,255,.08);background:rgba(4,22,27,.35);}
  .v1-chat__input input{flex:1;padding:.65rem 1rem;border-radius:50px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff;font-family:inherit;font-size:.88rem;outline:none;}
  .v1-chat__input input:focus{border-color:rgba(230,198,90,.4);background:rgba(255,255,255,.12);}
  .v1-chat__input input::placeholder{color:rgba(232,241,242,.4);}
  .v1-chat__send{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#E6C65A,#D4AF37);color:#1a1205;border:none;cursor:pointer;font-size:.9rem;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(212,175,55,.3);}

  /* Updates panel */
  .v1-updates{text-align:center;padding:1rem;}
  .v1-updates__icon{width:64px;height:64px;border-radius:50%;background:#25D366;color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.8rem;margin:0 auto 1.2rem;box-shadow:0 8px 24px rgba(37,211,102,.3);}
  .v1-qr{display:flex;flex-direction:column;align-items:center;gap:.6rem;margin-top:1.4rem;}
  .v1-qr__code{width:180px;height:180px;padding:12px;background:#fff;border-radius:16px;border:2px solid rgba(230,198,90,.5);box-shadow:0 0 0 6px rgba(230,198,90,.1);}
  .v1-qr__code svg{width:100%;height:100%;}
  .v1-qr small{font-size:.82rem;color:rgba(232,241,242,.65);margin-top:.5rem;}
  .v1-qr__tag{display:inline-flex;align-items:center;gap:.4rem;font-size:.75rem;color:#E6C65A;font-weight:600;margin-top:.2rem;padding-top:.7rem;border-top:1px solid rgba(230,198,90,.2);width:180px;justify-content:center;}

  /* Resources panel */
  .v1-res{display:grid;grid-template-columns:repeat(2,1fr);gap:1rem;}
  .v1-res__card{display:flex;align-items:flex-start;gap:.85rem;padding:1.25rem;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);transition:all .2s;}
  .v1-res__card:hover{background:rgba(255,255,255,.07);border-color:rgba(230,198,90,.3);}
  .v1-res__card--locked{opacity:.55;}
  .v1-res__icon{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,rgba(47,133,146,.4),rgba(0,96,107,.25));border:1px solid rgba(63,170,187,.3);color:#9FDBE5;display:flex;align-items:center;justify-content:center;font-size:1.15rem;flex-shrink:0;}
  .v1-res__body{flex:1;min-width:0;}
  .v1-res__body h4{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1.05rem;color:#fff;margin:0 0 .35rem;}
  .v1-res__body p{font-size:.82rem;color:rgba(232,241,242,.65);line-height:1.5;margin:0 0 .8rem;}
  .v1-res__actions{display:flex;gap:.5rem;flex-wrap:wrap;}

  /* Notes */
  .v1-notes textarea{
    width:100%;min-height:220px;
    padding:1.1rem;border-radius:14px;
    background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);
    color:#fff;font-family:inherit;font-size:.95rem;line-height:1.7;resize:vertical;outline:none;
    transition:all .2s;
  }
  .v1-notes textarea::placeholder{color:rgba(232,241,242,.4);}
  .v1-notes textarea:focus{background:rgba(255,255,255,.06);border-color:rgba(230,198,90,.35);}
  .v1-notes__foot{display:flex;align-items:center;justify-content:space-between;gap:.8rem;margin-top:.7rem;}
  .v1-notes__count{font-size:.72rem;color:rgba(232,241,242,.5);}
  .v1-notes__exp{display:flex;gap:.4rem;}

  /* Game */
  .v1-game{text-align:center;padding:1.5rem 1rem;}
  .v1-game__brain{font-size:3.5rem;margin-bottom:.9rem;filter:drop-shadow(0 8px 24px rgba(255,105,180,.3));}
  .v1-game__stats{display:flex;justify-content:center;gap:1rem;margin-top:1.8rem;padding-top:1.4rem;border-top:1px solid rgba(255,255,255,.08);}
  .v1-game__stats > div{padding:.6rem 1.1rem;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);min-width:85px;}
  .v1-game__stats b{display:block;font-family:'Frank Ruhl Libre',serif;font-size:1.3rem;font-weight:700;color:#E6C65A;line-height:1;}
  .v1-game__stats span{display:block;font-size:.68rem;color:rgba(232,241,242,.55);margin-top:.3rem;}

  /* Floating feedback FAB */
  .v1-fab{
    position:fixed;bottom:1.5rem;inset-inline-start:1.5rem;z-index:80;
    display:flex;align-items:center;gap:.5rem;
    padding:.7rem 1.1rem;border-radius:50px;
    background:linear-gradient(135deg,rgba(230,198,90,.95),rgba(212,175,55,.85));
    color:#1a1205;border:1px solid rgba(255,255,255,.25);
    font-family:inherit;font-size:.82rem;font-weight:600;cursor:pointer;
    box-shadow:0 12px 32px rgba(212,175,55,.4), inset 0 0 0 1px rgba(255,255,255,.25);
    backdrop-filter:blur(12px);
    transition:transform .2s;
  }
  .v1-fab:hover{transform:translateY(-2px);}
  .v1-fab i{font-size:.95rem;}

  /* ==================== Responsive ==================== */
  @media (max-width:1280px){
    .v1-hero{grid-template-columns:1fr 280px;padding:1.7rem 1.85rem;gap:1.5rem;}
    .v1-hero__title{font-size:1.7rem;}
  }
  @media (max-width:1100px){
    .v1-body{grid-template-columns:1fr;}
    .v1-side{position:static;height:auto;max-height:400px;order:2;}
    .v1-res{grid-template-columns:1fr;}
    .v1-hero{grid-template-columns:1fr;}
    .v1-hero__preview{aspect-ratio:16/9;max-height:260px;}
  }
  @media (max-width:768px){
    .v1-hd__course,.v1-hd__sep{display:none;}
    .v1-hd__label{display:none;}
    .v1-hd__progress-bar{width:50px;}
    .v1-hd__left .btn:not(.btn--icon){display:none;}
    .v1-stats{grid-template-columns:1fr;}
    .v1-hero{padding:1.3rem;}
    .v1-hero__title{font-size:1.45rem;}
  }

  /* ============================================================
     LIQUID GLASS OVERLAY — Apple visionOS / iOS 26 / macOS Tahoe
     Refines the existing V1 with proper specular highlights,
     concentric radii, atmospheric refraction, and motion.
     ============================================================ */

  :root{
    /* Apple-spec easing */
    --ease-out-expo:cubic-bezier(.16,1,.3,1);
    --ease-spring:cubic-bezier(.34,1.56,.64,1);
    --ease-smooth:cubic-bezier(.32,.72,0,1);
    /* Liquid Glass tokens */
    --lg-shadow:0 8px 32px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.10);
    --lg-shadow-lift:0 22px 48px rgba(0,0,0,.32), 0 6px 14px rgba(0,0,0,.16);
    --lg-border-top:rgba(255,255,255,.28);
    --lg-border-bottom:rgba(255,255,255,.06);
    --lg-gold:#E5B547;
    --lg-gold-deep:#D4A03B;
    --lg-cream:#E8D5B7;
  }

  /* ---------- ATMOSPHERIC CANVAS (4-blob mesh + grain) ---------- */
  /* Override the existing 2-blob atmos with a proper mesh */
  #frame-v1 .atmos__base{
    background:
      radial-gradient(ellipse 60% 50% at 90% 12%, rgba(26,79,79,.7), transparent 60%),
      radial-gradient(ellipse 55% 50% at 12% 88%, rgba(45,107,95,.6), transparent 60%),
      radial-gradient(circle 480px at 70% 55%, rgba(212,165,116,.22), transparent 60%),
      radial-gradient(circle 360px at 18% 18%, rgba(232,213,183,.13), transparent 60%),
      linear-gradient(160deg,#0F2D2D 0%,#0a2528 55%,#0F2D2D 100%);
  }
  #frame-v1 .atmos__blob--a{width:600px;height:600px;background:#D4A574;opacity:.18;
    top:-220px;inset-inline-end:-180px;animation:lgFloatA 60s ease-in-out infinite;}
  #frame-v1 .atmos__blob--b{width:520px;height:520px;background:#2D6B5F;opacity:.22;
    bottom:-200px;inset-inline-start:-160px;animation:lgFloatB 60s ease-in-out infinite;}
  @keyframes lgFloatA{
    0%,100%{transform:translate(0,0) rotate(0deg);}
    33%{transform:translate(-60px,40px) rotate(8deg);}
    66%{transform:translate(30px,-30px) rotate(-5deg);}
  }
  @keyframes lgFloatB{
    0%,100%{transform:translate(0,0) rotate(0deg);}
    33%{transform:translate(50px,-40px) rotate(-6deg);}
    66%{transform:translate(-40px,30px) rotate(9deg);}
  }

  /* ---------- LIQUID GLASS UTILITIES ---------- */

  /* All ".g" panels in V1 inherit upgraded glass recipe */
  #frame-v1 .g{
    background:linear-gradient(135deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.05) 100%);
    backdrop-filter:blur(40px) saturate(180%) brightness(1.05);
    -webkit-backdrop-filter:blur(40px) saturate(180%) brightness(1.05);
    border:1px solid rgba(255,255,255,.16);
    border-top-color:var(--lg-border-top);
    border-bottom-color:var(--lg-border-bottom);
    box-shadow:var(--lg-shadow), inset 0 1px 0 rgba(255,255,255,.18);
    isolation:isolate;
    transition:box-shadow .35s var(--ease-smooth), background .35s var(--ease-smooth);
  }
  /* Specular highlight (top half) */
  #frame-v1 .g::before{
    content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;
    background:linear-gradient(180deg,
      rgba(255,255,255,.10) 0%,
      rgba(255,255,255,.02) 35%,
      transparent 55%);
    z-index:0;
  }
  #frame-v1 .g > *{position:relative;z-index:1;}

  .lg-glass{
    position:relative;isolation:isolate;
    background:linear-gradient(135deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.05) 100%);
    backdrop-filter:blur(40px) saturate(180%) brightness(1.05);
    -webkit-backdrop-filter:blur(40px) saturate(180%) brightness(1.05);
    border:1px solid rgba(255,255,255,.16);
    border-top-color:var(--lg-border-top);
    border-bottom-color:var(--lg-border-bottom);
    box-shadow:var(--lg-shadow), inset 0 1px 0 rgba(255,255,255,.18);
  }
  .lg-glass::before{
    content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;
    background:linear-gradient(180deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.02) 35%, transparent 55%);
    z-index:0;
  }
  .lg-glass > *{position:relative;z-index:1;}
  .lg-glass--warm{
    background:
      linear-gradient(135deg, rgba(232,213,183,.16) 0%, rgba(212,165,116,.05) 60%, rgba(255,255,255,.04) 100%);
    border-color:rgba(232,213,183,.22);
  }

  /* ---------- HEADER REFINEMENTS ---------- */
  #frame-v1 .v1-header{
    background:linear-gradient(180deg, rgba(15,45,45,.72) 0%, rgba(15,45,45,.55) 100%);
    backdrop-filter:blur(60px) saturate(200%) brightness(1.05);
    -webkit-backdrop-filter:blur(60px) saturate(200%) brightness(1.05);
    border-bottom:1px solid rgba(255,255,255,.10);
    box-shadow:0 1px 0 rgba(255,255,255,.05) inset, 0 8px 24px rgba(0,0,0,.18);
  }
  /* ---------- COURSE PILL — .lg-glass + RTL specular highlight ---------- */
  #frame-v1 .v1-hd__pill{
    position:relative;isolation:isolate;
    background:linear-gradient(135deg, rgba(255,255,255,.14), rgba(255,255,255,.06));
    border:1px solid rgba(255,255,255,.10);
    backdrop-filter:blur(22px) saturate(220%);
    -webkit-backdrop-filter:blur(22px) saturate(220%);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.28),
      inset 0 -1px 0 rgba(0,0,0,.14),
      0 6px 18px rgba(0,0,0,.20);
    color:#fff;
    transition:transform .2s var(--ease-smooth), background .2s var(--ease-smooth), box-shadow .2s var(--ease-smooth);
  }
  /* Specular highlight — top-left corner (RTL "starts on the right" so highlight on visual top-LEFT mirrors light source) */
  #frame-v1 .v1-hd__pill::before{
    content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;
    background:
      radial-gradient(75% 80% at 0% 0%, rgba(255,255,255,.34), transparent 55%),
      linear-gradient(180deg, rgba(255,255,255,.14) 0%, transparent 35%);
    mix-blend-mode:screen;
  }
  #frame-v1 .v1-hd__pill > *{position:relative;z-index:1;}
  #frame-v1 .v1-hd__pill:hover{
    transform:translateY(-1px);
    background:linear-gradient(135deg, rgba(255,255,255,.20), rgba(255,255,255,.08));
    box-shadow:inset 0 1px 0 rgba(255,255,255,.32), 0 10px 24px rgba(0,0,0,.26);
  }
  #frame-v1 .v1-hd__pill i.fa-circle{color:var(--lg-gold);box-shadow:0 0 8px rgba(229,181,71,.6);border-radius:50%;}

  /* ---------- PROGRESS — "liquid inside a glass tube" ---------- */
  /* Container = test-tube glass: 10% white + blur(10) + soft inner shadow */
  #frame-v1 .v1-hd__progress{
    position:relative;
    background:rgba(255,255,255,.10);
    border:1px solid rgba(255,255,255,.16);
    backdrop-filter:blur(10px) saturate(180%);
    -webkit-backdrop-filter:blur(10px) saturate(180%);
    border-radius:50px; /* outer pill */
    padding:.4rem .8rem;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.20),
      inset 0 -1px 0 rgba(0,0,0,.14);
  }
  /* Inner track — concentric radius (outer 50px → inner 999/full) */
  #frame-v1 .v1-hd__progress-bar{
    width:100px;height:6px;border-radius:999px;
    background:rgba(0,0,0,.28);
    box-shadow:
      inset 0 1px 2px rgba(0,0,0,.4),
      inset 0 -1px 0 rgba(255,255,255,.06);
    overflow:hidden;
  }
  /* Liquid fill — gold gradient + glowing inner highlight */
  #frame-v1 .v1-hd__progress-bar span{
    display:block;height:100%;border-radius:999px;
    background:linear-gradient(180deg, var(--lg-gold) 0%, var(--lg-gold-deep) 100%);
    background-size:200% 100%;
    animation:lgGoldShimmer 3.5s linear infinite;
    box-shadow:
      inset 0 1px 2px rgba(255,255,255,.40),
      inset 0 -1px 1px rgba(0,0,0,.18),
      0 0 10px rgba(229,181,71,.55);
    position:relative;
  }
  /* Liquid sheen — moving meniscus light streak */
  #frame-v1 .v1-hd__progress-bar span::after{
    content:'';position:absolute;inset:0;border-radius:inherit;
    background:linear-gradient(90deg, transparent 0%, rgba(255,255,255,.55) 50%, transparent 100%);
    animation:lgLiquidSheen 2.6s ease-in-out infinite;
    mix-blend-mode:screen;
  }
  @keyframes lgGoldShimmer{0%{background-position:0% 0%;}100%{background-position:200% 0%;}}
  @keyframes lgLiquidSheen{0%{transform:translateX(-100%);}50%{transform:translateX(100%);}100%{transform:translateX(100%);}}
  #frame-v1 .v1-hd__progress b{color:var(--lg-gold);text-shadow:0 0 12px rgba(229,181,71,.45);}

  /* ---------- NOTIFICATION BELL — .lg-crystal + glowing gold dot ---------- */
  #frame-v1 .btn--icon[aria-label="notifications"]{
    position:relative;isolation:isolate;
    background:rgba(255,255,255,.18);
    border:1px solid rgba(255,255,255,.22);
    backdrop-filter:blur(14px) saturate(220%);
    -webkit-backdrop-filter:blur(14px) saturate(220%);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.40),
      inset 0 -1px 0 rgba(0,0,0,.14),
      0 6px 18px rgba(0,0,0,.22);
    color:#fff;
    transition:transform .2s var(--ease-smooth), box-shadow .2s var(--ease-smooth);
  }
  #frame-v1 .btn--icon[aria-label="notifications"]::before{
    content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;
    background:
      radial-gradient(70% 60% at 30% 0%, rgba(255,255,255,.55), transparent 60%),
      linear-gradient(180deg, rgba(255,255,255,.14) 0%, transparent 40%);
    mix-blend-mode:screen;
  }
  #frame-v1 .btn--icon[aria-label="notifications"] > *{position:relative;z-index:1;}
  #frame-v1 .btn--icon[aria-label="notifications"]:hover{
    transform:translateY(-1px);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.5), 0 10px 26px rgba(0,0,0,.28);
  }
  /* Active notification dot — glowing gold */
  #frame-v1 .btn--icon[aria-label="notifications"]::after{
    content:'';position:absolute;top:6px;inset-inline-end:6px;z-index:2;
    width:9px;height:9px;border-radius:50%;
    background:radial-gradient(circle at 30% 30%, #F7E5A8, var(--lg-gold) 55%, var(--lg-gold-deep) 100%);
    border:1.5px solid rgba(15,45,45,.9);
    box-shadow:
      0 0 0 0 rgba(229,181,71,.6),
      0 0 14px 2px rgba(229,181,71,.7),
      0 0 24px 4px rgba(229,181,71,.35);
    animation:lgBellPulse 2.4s ease-in-out infinite;
  }
  @keyframes lgBellPulse{
    0%,100%{box-shadow:0 0 0 0 rgba(229,181,71,.6), 0 0 14px 2px rgba(229,181,71,.7), 0 0 24px 4px rgba(229,181,71,.35);}
    50%{box-shadow:0 0 0 4px rgba(229,181,71,.0), 0 0 18px 3px rgba(229,181,71,.85), 0 0 30px 6px rgba(229,181,71,.45);}
  }

  /* "המשך בשיעור הבא" header banner — refine to crystal glass */
  #frame-v1 .btn--gold{
    background:linear-gradient(135deg, var(--lg-gold) 0%, var(--lg-gold-deep) 50%, var(--lg-gold) 100%);
    background-size:200% 100%;
    color:#1A2E2E;
    border:1px solid rgba(229,181,71,.55);
    box-shadow:0 8px 22px rgba(229,181,71,.35), inset 0 1px 0 rgba(255,255,255,.45), inset 0 -1px 0 rgba(0,0,0,.12);
    transition:all .3s var(--ease-smooth);
  }
  #frame-v1 .btn--gold:hover{
    background-position:100% 0%;
    transform:translateY(-2px);
    box-shadow:0 14px 30px rgba(229,181,71,.5), inset 0 1px 0 rgba(255,255,255,.5);
    filter:brightness(1.06);
  }

  /* ---------- HERO REFINEMENTS (concentric radii + lensing) ---------- */
  #frame-v1 .v1-hero{
    border-radius:36px;padding:42px;
    background:
      radial-gradient(ellipse 80% 100% at 100% 0%, rgba(212,165,116,.18), transparent 55%),
      linear-gradient(135deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
    border:1px solid rgba(255,255,255,.18);
    border-top-color:rgba(255,255,255,.32);
    backdrop-filter:blur(40px) saturate(180%) brightness(1.05);
    box-shadow:0 20px 60px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.22);
    overflow:hidden;
  }
  #frame-v1 .v1-hero::before{
    content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;
    background:linear-gradient(180deg, rgba(255,255,255,.12) 0%, rgba(255,255,255,.02) 30%, transparent 50%);
  }
  #frame-v1 .v1-hero__title{font-size:2.15rem;letter-spacing:-.022em;}
  #frame-v1 .v1-hero__eyebrow{color:var(--lg-gold);letter-spacing:.16em;}
  /* Concentric: hero 36px - 42px padding → preview ≈ 24px → play 12px */
  #frame-v1 .v1-hero__preview{border-radius:24px;}
  #frame-v1 .v1-hero__preview-play{
    width:72px;height:72px;
    background:radial-gradient(circle at 30% 30%, rgba(255,255,255,.55), transparent 50%),
               linear-gradient(135deg, var(--lg-gold) 0%, var(--lg-gold-deep) 100%);
    box-shadow:0 0 0 1px rgba(255,255,255,.45) inset, 0 12px 36px rgba(229,181,71,.55), 0 0 30px rgba(229,181,71,.4);
  }
  #frame-v1 .v1-hero__cta{border-radius:14px;height:56px;padding:0 36px;}

  /* Hero progress bar — recessed track + shimmer */
  #frame-v1 .v1-hero__progress-bar{
    height:8px;background:rgba(255,255,255,.08);
    box-shadow:inset 0 1px 2px rgba(0,0,0,.32), inset 0 -1px 0 rgba(255,255,255,.04);
  }
  #frame-v1 .v1-hero__progress-bar span{
    background:linear-gradient(90deg, var(--lg-gold-deep), var(--lg-gold), var(--lg-cream), var(--lg-gold), var(--lg-gold-deep));
    background-size:200% 100%;
    animation:lgGoldShimmer 3.5s linear infinite;
    box-shadow:0 0 14px rgba(229,181,71,.55);
  }
  #frame-v1 .v1-hero__progress-bar span::after{display:none;}

  /* ---------- STATS — concentric radii (24px outer, 12px icon) ---------- */
  #frame-v1 .v1-stat{border-radius:24px;padding:30px 28px;}
  #frame-v1 .v1-stat__icon{
    width:52px;height:52px;border-radius:14px;
    background:radial-gradient(circle at 30% 30%, rgba(255,255,255,.32), transparent 55%),
               linear-gradient(135deg, rgba(229,181,71,.22), rgba(229,181,71,.06));
    border:1px solid rgba(229,181,71,.32);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.32), 0 4px 14px rgba(229,181,71,.14);
  }
  #frame-v1 .v1-stat:hover{
    transform:translateY(-6px);
    background:linear-gradient(135deg, rgba(255,255,255,.14), rgba(255,255,255,.06));
    box-shadow:0 22px 48px rgba(0,0,0,.32), 0 0 0 1px rgba(229,181,71,.35), inset 0 1px 0 rgba(255,255,255,.25);
  }
  /* Subtle per-card gradient tint variation (Apple's "adaptive tinting") */
  #frame-v1 .v1-stats > .v1-stat:nth-child(1){background:linear-gradient(135deg, rgba(255,255,255,.10), rgba(212,165,116,.05));}
  #frame-v1 .v1-stats > .v1-stat:nth-child(2){background:linear-gradient(135deg, rgba(255,255,255,.10), rgba(63,170,187,.06));}
  #frame-v1 .v1-stats > .v1-stat:nth-child(3){background:linear-gradient(135deg, rgba(255,255,255,.10), rgba(229,181,71,.06));}

  /* ---------- ANNOUNCEMENT BOARD ---------- */
  #frame-v1 .v1-announce{border-radius:28px;padding:28px 32px;}
  #frame-v1 .v1-announce__icon{
    background:linear-gradient(135deg, rgba(229,181,71,.32), rgba(229,181,71,.10));
    border:1px solid rgba(229,181,71,.38);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.25), 0 0 12px rgba(229,181,71,.18);
  }
  #frame-v1 .v1-announce__empty svg{
    animation:lgFloat 3.2s ease-in-out infinite;
  }
  @keyframes lgFloat{0%,100%{transform:translateY(0);}50%{transform:translateY(-4px);}}

  /* ---------- REFERRAL BANNER ---------- */
  /* Concentric radii: outer 28 → icon-wrap 50% → inner icon 18 → CTA pill 999 */
  .v1-referral{
    border-radius:28px;padding:24px 32px;
    display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:1.4rem;
    position:relative;isolation:isolate;
    box-shadow:
      0 18px 50px rgba(0,0,0,.28),
      0 1px 0 rgba(255,255,255,.18) inset,
      0 -1px 0 rgba(0,0,0,.16) inset;
  }
  /* Specular highlight — gold-tinted top corner bloom */
  .v1-referral::before{
    content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;
    background:
      radial-gradient(80% 60% at 100% 0%, rgba(229,181,71,.22), transparent 55%),
      radial-gradient(70% 50% at 0% 0%, rgba(255,255,255,.14), transparent 55%),
      linear-gradient(180deg, rgba(255,255,255,.08) 0%, transparent 30%);
    mix-blend-mode:screen;
  }
  /* Refractive gold inner edge */
  .v1-referral::after{
    content:'';position:absolute;inset:1px;border-radius:27px;pointer-events:none;z-index:0;
    background:linear-gradient(135deg, rgba(229,181,71,.32), transparent 35%, transparent 65%, rgba(229,181,71,.18)) border-box;
    -webkit-mask:linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite:xor;mask-composite:exclude;
  }
  .v1-referral > *{position:relative;z-index:1;}
  .v1-referral__icon-wrap{position:relative;width:64px;height:64px;display:flex;align-items:center;justify-content:center;}
  .v1-referral__icon-wrap::before{
    content:'';position:absolute;inset:0;border-radius:50%;
    background:radial-gradient(circle, rgba(229,181,71,.45), transparent 70%);
    animation:lgPulse 2.8s ease-in-out infinite;
  }
  .v1-referral__icon{
    position:relative;z-index:1;
    width:56px;height:56px;border-radius:18px;
    display:flex;align-items:center;justify-content:center;
    background:radial-gradient(circle at 30% 30%, rgba(255,255,255,.45), transparent 50%),
               linear-gradient(135deg, var(--lg-gold), var(--lg-gold-deep));
    color:#1A2E2E;
    box-shadow:0 0 0 1px rgba(255,255,255,.4) inset, 0 8px 24px rgba(229,181,71,.45);
  }
  @keyframes lgPulse{0%,100%{transform:scale(1);opacity:.7;}50%{transform:scale(1.15);opacity:1;}}
  .v1-referral__title{
    font-family:'Frank Ruhl Libre','SF Pro Display',serif;
    font-size:1.35rem;font-weight:700;letter-spacing:-.015em;
    color:#fff;margin:0 0 .35rem;line-height:1.25;
  }
  .v1-referral__sub{font-size:.86rem;line-height:1.55;color:rgba(255,255,255,.72);margin:0;}
  .v1-referral__cta{height:48px;border-radius:999px;padding:0 22px;font-weight:600;}

  /* ---------- FAB STACK — Crystal Glass + tooltip + 3-layer pulse ---------- */
  #frame-v1 .v1-fabs{
    position:fixed;bottom:1.4rem;inset-inline-start:1.4rem;z-index:80;
    display:flex;flex-direction:column-reverse;gap:.7rem;
  }
  #frame-v1 .v1-fab{
    position:relative;width:56px;height:56px;padding:0;border-radius:50%;
    inset-inline-start:auto;bottom:auto;
    background:linear-gradient(135deg, rgba(255,255,255,.20), rgba(255,255,255,.06));
    backdrop-filter:blur(14px) saturate(220%);
    -webkit-backdrop-filter:blur(14px) saturate(220%);
    border:1px solid rgba(255,255,255,.26);
    color:var(--lg-gold);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.45),
      inset 0 0 0 1px rgba(255,255,255,.10),
      inset 0 -1px 0 rgba(0,0,0,.18),
      0 12px 32px rgba(0,0,0,.30);
    display:flex;align-items:center;justify-content:center;cursor:pointer;
    transition:transform .3s var(--ease-spring), box-shadow .3s var(--ease-smooth);
    overflow:visible;isolation:isolate;
  }
  #frame-v1 .v1-fab .v1-fab__sr,
  #frame-v1 .v1-fab > span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);}
  /* Specular top-glow — convex polished glass */
  #frame-v1 .v1-fab::before{
    content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;
    background:
      radial-gradient(60% 50% at 32% 18%, rgba(255,255,255,.55), transparent 65%),
      linear-gradient(180deg, rgba(255,255,255,.18) 0%, transparent 35%);
    mix-blend-mode:screen;z-index:1;
  }
  /* Icon — gold gradient + reflection */
  #frame-v1 .v1-fab i{
    position:relative;z-index:2;font-size:1.15rem;
    background:linear-gradient(160deg, var(--lg-cream) 0%, var(--lg-gold) 45%, var(--lg-gold-deep) 100%);
    -webkit-background-clip:text;background-clip:text;
    -webkit-text-fill-color:transparent;color:transparent;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.35)) drop-shadow(0 0 6px rgba(229,181,71,.35));
  }
  /* Tooltip — .lg-glass, fade + slide-up */
  #frame-v1 .v1-fab[data-tip]::after{
    content:attr(data-tip);
    position:absolute;bottom:calc(100% + 10px);inset-inline-start:50%;transform:translateX(-50%) translateY(6px);
    padding:.5rem .85rem;border-radius:10px;
    background:rgba(15,45,45,.62);
    backdrop-filter:blur(22px) saturate(180%);
    -webkit-backdrop-filter:blur(22px) saturate(180%);
    border:1px solid rgba(255,255,255,.14);
    color:#fff;font-size:.78rem;font-weight:500;white-space:nowrap;letter-spacing:.01em;
    box-shadow:0 8px 22px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.16);
    opacity:0;pointer-events:none;z-index:3;
    transition:opacity .22s var(--ease-smooth), transform .22s var(--ease-smooth);
  }
  #frame-v1 .v1-fab:hover[data-tip]::after,
  #frame-v1 .v1-fab:focus-visible[data-tip]::after{opacity:1;transform:translateX(-50%) translateY(0);}
  #frame-v1 .v1-fab:hover{
    transform:translateY(-2px) scale(1.05);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.55),
      inset 0 0 0 1px rgba(255,255,255,.14),
      inset 0 -1px 0 rgba(0,0,0,.18),
      0 18px 40px rgba(0,0,0,.36),
      0 0 0 2px rgba(229,181,71,.32);
  }
  #frame-v1 .v1-fab:active{transform:translateY(0) scale(.98);}
  /* AI variant — primary, with 3-layer animated pulse */
  #frame-v1 .v1-fab--ai{
    background:linear-gradient(135deg, rgba(229,181,71,.18), rgba(229,181,71,.04));
    border-color:rgba(229,181,71,.40);
    width:62px;height:62px;
    animation:lgFabPulse 2.4s ease-in-out infinite;
  }
  #frame-v1 .v1-fab--ai i{font-size:1.3rem;}
  @keyframes lgFabPulse{
    0%,100%{
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.45),
        inset 0 0 0 1px rgba(255,255,255,.10),
        inset 0 -1px 0 rgba(0,0,0,.18),
        0 0 18px 2px rgba(229,181,71,.55),
        0 0 0 0 rgba(229,181,71,.45),
        0 12px 32px rgba(0,0,0,.30);
    }
    50%{
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.55),
        inset 0 0 0 1px rgba(255,255,255,.16),
        inset 0 -1px 0 rgba(0,0,0,.18),
        0 0 26px 5px rgba(229,181,71,.75),
        0 0 0 12px rgba(229,181,71,.0),
        0 12px 32px rgba(0,0,0,.30);
    }
  }
  #frame-v1 .v1-fab--help,
  #frame-v1 .v1-fab--feedback{width:48px;height:48px;}
  #frame-v1 .v1-fab--help i,
  #frame-v1 .v1-fab--feedback i{font-size:1.0rem;}
  /* Reduced-transparency: opaque petrol fill */
  @media (prefers-reduced-transparency: reduce){
    #frame-v1 .v1-fab{
      background:#0F2D2D !important;
      backdrop-filter:none !important;-webkit-backdrop-filter:none !important;
      border-color:rgba(229,181,71,.5) !important;
    }
    #frame-v1 .v1-fab--ai{background:#13393A !important;}
    #frame-v1 .v1-fab[data-tip]::after{
      background:#0F2D2D !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;
    }
    #frame-v1 .v1-fab::before{display:none;}
  }
  /* Reduced-motion: stop pulse + tooltip transitions */
  @media (prefers-reduced-motion: reduce){
    #frame-v1 .v1-fab--ai{animation:none !important;}
    #frame-v1 .v1-fab[data-tip]::after{transition:none !important;}
    #frame-v1 .v1-fab:hover{transform:none !important;}
  }

  /* ---------- TABS — refined glass + concentric ---------- */
  #frame-v1 .v1-tabs{border-radius:28px;}
  #frame-v1 .v1-tabs__hd{background:rgba(0,0,0,.18);}
  #frame-v1 .v1-tab{border-radius:14px;}

  /* ---------- SIDEBAR ---------- */
  #frame-v1 .v1-side{border-radius:28px;}
  #frame-v1 .v1-mod{border-radius:14px;}
  #frame-v1 .v1-mod__num{box-shadow:inset 0 1px 0 rgba(255,255,255,.2);}
  #frame-v1 .v1-les{border-radius:12px;}
  #frame-v1 .v1-les__thumb{border-radius:8px;}
  #frame-v1 .v1-side__hl{border-radius:14px;}

  /* ---------- ACCESSIBILITY FALLBACKS ---------- */
  @media (prefers-reduced-transparency: reduce){
    #frame-v1 .g, #frame-v1 .v1-hero, .lg-glass{
      backdrop-filter:none !important;-webkit-backdrop-filter:none !important;
      background:#1A3838 !important;
    }
    #frame-v1 .v1-header{background:#0F2D2D !important;backdrop-filter:none !important;}
  }
  @media (prefers-reduced-motion: reduce){
    #frame-v1 .atmos__blob,
    #frame-v1 .v1-hero__progress-bar span,
    #frame-v1 .v1-hd__progress-bar span,
    #frame-v1 .v1-hd__progress-bar span::after,
    #frame-v1 .btn--icon[aria-label="notifications"]::after,
    #frame-v1 .v1-announce__empty svg,
    #frame-v1 .v1-fab--ai,
    .v1-referral__icon-wrap::before{animation:none !important;}
  }
  /* Focus visibility */
  #frame-v1 button:focus-visible, #frame-v1 a:focus-visible{
    outline:3px solid var(--lg-gold);outline-offset:2px;border-radius:inherit;
  }
</style>`;

  // Simple deterministic QR-like glyph (decorative, not scannable)
  function genQR(){
    let out='';
    const size=21;
    const seed=[3,7,11,13,17,2,5,19,23];
    let s=seed[0];
    for(let y=0;y<size;y++){
      for(let x=0;x<size;x++){
        s=(s*seed[(x+y)%seed.length]+7)%97;
        // Corners pattern (finder squares)
        const isCorner = (x<7&&y<7)||(x>=size-7&&y<7)||(x<7&&y>=size-7);
        if(isCorner){
          const cx = x<7?x:size-1-x;
          const cy = y<7?y:size-1-y;
          const dist = Math.max(Math.abs(cx-3),Math.abs(cy-3));
          if(dist===3||dist===0||dist===1) out+=`<rect x="${x*4.3+3}" y="${y*4.3+3}" width="4.3" height="4.3"/>`;
          continue;
        }
        if(s%5<2) out+=`<rect x="${x*4.3+3}" y="${y*4.3+3}" width="4.3" height="4.3"/>`;
      }
    }
    return out;
  }

  document.getElementById('canvas').insertAdjacentHTML('beforeend', html.replace('${genQR()}', genQR()));
  document.head.insertAdjacentHTML('beforeend', styles);

  // Module toggle
  document.querySelectorAll('#frame-v1 .v1-mod__hd').forEach(hd=>{
    hd.addEventListener('click',()=>hd.parentElement.classList.toggle('open'));
  });
  // Tabs toggle
  const panels = document.querySelectorAll('#frame-v1 [data-panel]');
  document.querySelectorAll('#frame-v1 .v1-tab').forEach(t=>{
    t.addEventListener('click',()=>{
      document.querySelectorAll('#frame-v1 .v1-tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      panels.forEach(p=>p.classList.toggle('active', p.dataset.panel===t.dataset.tab));
    });
  });
})();
