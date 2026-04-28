// V1 — Balanced Glass LMS (Updated to match real content)
// 5 real tabs · "המורה של NLP" chat · floating feedback · Instagram banner · partners card

(function(){
  const html = `
<div class="frame" id="frame-v1">
  <div class="atmos">
    <div class="atmos__base"></div>
    <div class="atmos__blob atmos__blob--a"></div>
    <div class="atmos__blob atmos__blob--b"></div>
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
      <!-- Video -->
      <div class="v1-video g">
        <div class="v1-video__frame">
          <img class="v1-video__poster" src="https://img.youtube.com/vi/FzT3lFqqg9A/maxresdefault.jpg" alt="">
          <div class="v1-video__scrim"></div>
          <button class="v1-video__play" aria-label="play"><i class="fa-solid fa-play"></i></button>
          <div class="v1-video__topbar">
            <span class="v1-video__title">שיעור 1 חלק 2 | מהן האמונות שמסתתרות בתת המודע? | קורס NLP מלא</span>
            <span class="v1-video__author"><img src="https://i.pravatar.cc/80?img=12" alt="">רם אלוס</span>
          </div>
          <div class="v1-video__bar">
            <div class="v1-video__bar-inner">
              <button class="v1-video__ctl v1-video__ctl--play" aria-label="play"><i class="fa-solid fa-play"></i></button>
              <span class="v1-video__time">00:02</span>
              <div class="v1-video__track"><span style="width:2%"></span></div>
              <span class="v1-video__time">21:39</span>
              <button class="v1-video__ctl" aria-label="cc"><i class="fa-solid fa-closed-captioning"></i></button>
              <button class="v1-video__ctl" aria-label="settings"><i class="fa-solid fa-gear"></i></button>
              <button class="v1-video__ctl" aria-label="fullscreen"><i class="fa-solid fa-expand"></i></button>
            </div>
          </div>
        </div>
      </div>

      <!-- Nav bar -->
      <div class="v1-navbar g">
        <button class="btn btn--clear v1-nav-prev">
          <i class="fa-solid fa-arrow-right"></i>
          <span class="v1-navbar__lbl"><strong>הקודם</strong><small>איך NLP יכול לשנות את חייך?</small></span>
        </button>
        <div class="v1-navbar__center">
          <span class="v1-navbar__counter">שיעור <strong>2</strong> מתוך <strong>51</strong></span>
          <button class="btn btn--clear btn--sm"><i class="fa-solid fa-check"></i> סמן כהושלם</button>
        </div>
        <button class="btn btn--gold v1-nav-next">
          <span class="v1-navbar__lbl"><strong>השיעור הבא</strong><small>מה זה (בכלל) NLP?</small></span>
          <i class="fa-solid fa-arrow-left"></i>
        </button>
      </div>

      <!-- Instagram share strip -->
      <div class="v1-ig">
        <i class="fa-brands fa-instagram"></i>
        <span>אהבת את התוכן וקיבלת ערך? שתף בסטורי ותייג אותנו כדי שנוכל להגיע לעוד אנשים טובים!</span>
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

  <!-- Floating feedback button -->
  <button class="v1-fab" aria-label="feedback">
    <i class="fa-regular fa-lightbulb"></i>
    <span>משוב</span>
  </button>
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
  .v1-body{display:grid;grid-template-columns:1fr 360px;gap:1rem;padding:1rem;min-height:calc(100vh - 114px);}

  /* ==================== SIDEBAR ==================== */
  .v1-side{
    position:sticky;top:130px;height:calc(100vh - 130px);
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
  .v1-main{min-width:0;display:flex;flex-direction:column;gap:.9rem;}

  /* Video */
  .v1-video{border-radius:20px;overflow:hidden;padding:8px;box-shadow:0 30px 60px rgba(0,0,0,.4);}
  .v1-video__frame{position:relative;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#000;}
  .v1-video__poster{width:100%;height:100%;object-fit:cover;}
  .v1-video__scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.4) 0%,rgba(0,0,0,0) 18%,rgba(0,0,0,0) 60%,rgba(0,0,0,.75) 100%);}
  .v1-video__topbar{position:absolute;inset-inline:0;top:0;padding:1rem 1.25rem;display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;color:#fff;}
  .v1-video__title{font-family:'Frank Ruhl Libre',serif;font-weight:600;font-size:.95rem;line-height:1.3;max-width:65%;}
  .v1-video__author{display:flex;align-items:center;gap:.4rem;font-size:.78rem;font-weight:500;opacity:.9;background:rgba(0,0,0,.35);padding:.3rem .6rem;border-radius:50px;backdrop-filter:blur(12px);}
  .v1-video__author img{width:22px;height:22px;border-radius:50%;object-fit:cover;mix-blend-mode:luminosity;}
  .v1-video__play{
    position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    width:82px;height:82px;border-radius:50%;border:none;cursor:pointer;
    background:linear-gradient(135deg,rgba(230,198,90,.9),rgba(212,175,55,.8));
    color:#1a1205;font-size:1.5rem;
    backdrop-filter:blur(10px);
    box-shadow:0 12px 40px rgba(212,175,55,.5), inset 0 0 0 1px rgba(255,255,255,.4);
    display:flex;align-items:center;justify-content:center;
    padding-inline-start:4px;
    transition:transform .25s;
  }
  .v1-video__play:hover{transform:translate(-50%,-50%) scale(1.05);}
  .v1-video__bar{position:absolute;inset-inline:0;bottom:0;padding:0 12px 12px;}
  .v1-video__bar-inner{
    display:flex;align-items:center;gap:.7rem;
    padding:.5rem .8rem;border-radius:12px;
    background:rgba(0,0,0,.45);backdrop-filter:blur(18px);
    border:1px solid rgba(255,255,255,.12);
  }
  .v1-video__time{font-size:.72rem;color:rgba(255,255,255,.85);font-variant-numeric:tabular-nums;}
  .v1-video__track{flex:1;height:4px;background:rgba(255,255,255,.18);border-radius:2px;overflow:hidden;position:relative;}
  .v1-video__track span{display:block;height:100%;background:linear-gradient(90deg,#D4AF37,#E6C65A);position:relative;}
  .v1-video__track span::after{content:'';position:absolute;inset-inline-end:-5px;top:50%;transform:translateY(-50%);width:10px;height:10px;border-radius:50%;background:#E6C65A;box-shadow:0 0 0 3px rgba(230,198,90,.3);}
  .v1-video__ctl{background:none;border:none;color:rgba(255,255,255,.8);cursor:pointer;padding:.25rem;font-size:.82rem;}
  .v1-video__ctl:hover{color:#fff;}
  .v1-video__ctl--play{color:#E6C65A;font-size:.95rem;}

  /* Nav bar */
  .v1-navbar{
    display:flex;align-items:center;justify-content:space-between;gap:.75rem;
    padding:.6rem .8rem;border-radius:14px;
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
  @media (max-width:1100px){
    .v1-body{grid-template-columns:1fr;}
    .v1-side{position:static;height:auto;max-height:400px;order:2;}
    .v1-res{grid-template-columns:1fr;}
  }
  @media (max-width:768px){
    .v1-hd__course,.v1-hd__sep{display:none;}
    .v1-hd__label{display:none;}
    .v1-hd__progress-bar{width:50px;}
    .v1-hd__left .btn:not(.btn--icon){display:none;}
    .v1-video__title{max-width:100%;font-size:.8rem;}
    .v1-video__author{display:none;}
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
