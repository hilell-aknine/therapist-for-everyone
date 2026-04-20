// V3 · Bold — Timeline Sidebar + full-bleed video + huge typography
// Structure: vertical course timeline on the right (sticky), hero full-bleed video player left,
// below: giant lesson title, then collapsible content strip, then doors grid + modules list.

(function(){
  const html = `
<div class="frame" id="frame-v3">
  <div class="atmos">
    <div class="atmos__base"></div>
    <div class="atmos__blob atmos__blob--a"></div>
    <div class="atmos__blob atmos__blob--b"></div>
    <div class="atmos__grain"></div>
  </div>

  <!-- ===== Top bar (slim) ===== -->
  <header class="v3-topbar">
    <div class="v3-topbar__right">
      <button class="v3-rail-toggle" aria-label="menu"><i class="fa-solid fa-bars"></i></button>
      <a class="v3-brand" href="#">
        <img src="../assets/logo-square.png" alt="">
        <span>בית <b>המטפלים</b></span>
      </a>
      <span class="v3-topbar__sep"></span>
      <nav class="v3-crumbs">
        <a href="#">הקורסים שלי</a>
        <i class="fa-solid fa-chevron-left"></i>
        <a href="#">NLP Practitioner</a>
        <i class="fa-solid fa-chevron-left"></i>
        <span>מודול 1 · שיעור 2</span>
      </nav>
    </div>
    <div class="v3-topbar__left">
      <a class="btn btn--gold btn--sm" href="#"><i class="fa-solid fa-rocket"></i> לקבלת פרטים לתוכנית ההכשרה</a>
      <button class="v3-iconbtn" aria-label="theme"><i class="fa-regular fa-sun"></i></button>
      <a class="btn btn--clear btn--sm" href="#"><i class="fa-solid fa-arrow-left"></i> חזרה לאתר</a>
      <button class="v3-iconbtn" aria-label="notifications"><i class="fa-regular fa-bell"></i><span class="v3-iconbtn__dot"></span></button>
      <button class="v3-userbtn"><span class="v3-avatar">ה</span> <span>הילל</span> <i class="fa-solid fa-chevron-down"></i></button>
    </div>
  </header>

  <!-- ===== Main layout: content + vertical timeline ===== -->
  <div class="v3-layout">

    <!-- Content column -->
    <main class="v3-main">

      <!-- Full-bleed video stage -->
      <section class="v3-stage">
        <div class="v3-stage__frame">
          <img src="https://img.youtube.com/vi/I4r3oERlZpc/maxresdefault.jpg" alt="">
          <div class="v3-stage__scrim"></div>
          <div class="v3-stage__topchips">
            <span class="v3-chip v3-chip--dark">מודול 1 · מבוא ל-NLP</span>
            <span class="v3-chip v3-chip--dark">שיעור 2 / 51</span>
          </div>
          <button class="v3-stage__play" aria-label="play"><i class="fa-solid fa-play"></i></button>
          <div class="v3-stage__bottombar">
            <div class="v3-stage__controls">
              <button><i class="fa-solid fa-backward-step"></i></button>
              <button class="primary"><i class="fa-solid fa-play"></i></button>
              <button><i class="fa-solid fa-forward-step"></i></button>
              <span class="v3-stage__time">00:02 / 21:40</span>
            </div>
            <div class="v3-stage__track"><span style="width:2%"></span></div>
            <div class="v3-stage__right">
              <button><i class="fa-solid fa-closed-captioning"></i></button>
              <button><i class="fa-solid fa-gauge-high"></i> 1x</button>
              <button><i class="fa-solid fa-volume-high"></i></button>
              <button><i class="fa-solid fa-expand"></i></button>
            </div>
          </div>
        </div>
      </section>

      <!-- BIG TITLE BLOCK -->
      <section class="v3-titlewrap">
        <div class="v3-eyebrow">
          <span class="v3-eyebrow__dot"></span>
          שיעור פעיל · 00:02 / 21:40
        </div>
        <h1 class="v3-title">
          מהן האמונות<br>
          <em>שמסתתרות</em><br>
          בתת המודע?
        </h1>
        <div class="v3-titlemeta">
          <div class="v3-author">
            <img src="https://i.pravatar.cc/80?img=12" alt="">
            <div>
              <strong>רם אלוס</strong>
              <small>NLP Master Practitioner &amp; Trainer</small>
            </div>
          </div>
          <div class="v3-stats">
            <div class="v3-stat"><b>21:40</b><small>משך השיעור</small></div>
            <div class="v3-stat"><b>PDF</b><small>+ סיכום מוכן</small></div>
            <div class="v3-stat"><b>80+</b><small>שאלות בתרגול</small></div>
          </div>
        </div>

        <div class="v3-actions">
          <button class="btn btn--gold"><i class="fa-solid fa-play"></i> המשך לצפות מ-00:02</button>
          <button class="btn btn--clear"><i class="fa-regular fa-bookmark"></i> סמן לחזרה</button>
          <button class="btn btn--clear"><i class="fa-solid fa-share-nodes"></i></button>
          <span class="v3-actions__spacer"></span>
          <button class="btn btn--clear btn--sm"><i class="fa-solid fa-arrow-right"></i> הקודם</button>
          <button class="btn btn--clear btn--sm">הבא <i class="fa-solid fa-arrow-left"></i></button>
        </div>
      </section>

      <!-- 5 doors grid — wide editorial strip -->
      <section class="v3-section">
        <header class="v3-section__head">
          <div>
            <span class="v3-section__eyebrow">אחרי שצפית</span>
            <h2>העמק בחומר ב-5 דרכים</h2>
          </div>
          <a href="#" class="v3-section__link">לכל הכלים <i class="fa-solid fa-arrow-left"></i></a>
        </header>

        <div class="v3-doors">
          <a class="v3-door v3-door--01" href="#">
            <div class="v3-door__num">01</div>
            <div class="v3-door__ic"><i class="fa-solid fa-robot"></i></div>
            <div class="v3-door__body">
              <strong>המורה האישי של NLP</strong>
              <p>שאל שאלה על החומר — תשובה תוך שניות, בשפה שלך</p>
            </div>
            <div class="v3-door__meta">
              <span><i class="fa-solid fa-message"></i> 100 הודעות/יום</span>
              <span><i class="fa-solid fa-arrow-left"></i></span>
            </div>
          </a>

          <a class="v3-door v3-door--02" href="#">
            <div class="v3-door__num">02</div>
            <div class="v3-door__ic">🧠</div>
            <div class="v3-door__body">
              <strong>משחק תרגול יומי</strong>
              <p>תרגול קצר של מה שלמדת בשיעור הזה — לפני המשך</p>
            </div>
            <div class="v3-door__meta">
              <span><i class="fa-solid fa-bullseye"></i> 80+ תרגילים</span>
              <span><i class="fa-solid fa-arrow-left"></i></span>
            </div>
          </a>

          <a class="v3-door v3-door--03" href="#">
            <div class="v3-door__num">03</div>
            <div class="v3-door__ic"><i class="fa-regular fa-pen-to-square"></i></div>
            <div class="v3-door__body">
              <strong>הערות ומחברת</strong>
              <p>הערות אישיות צמודות לתזמון בווידאו — שלך לתמיד</p>
            </div>
            <div class="v3-door__meta">
              <span><i class="fa-solid fa-cloud-arrow-up"></i> נשמר אוטו'</span>
              <span><i class="fa-solid fa-arrow-left"></i></span>
            </div>
          </a>

          <a class="v3-door v3-door--04" href="#">
            <div class="v3-door__num">04</div>
            <div class="v3-door__ic"><i class="fa-solid fa-download"></i></div>
            <div class="v3-door__body">
              <strong>חומרי עזר להורדה</strong>
              <p>חוברת PDF + סיכום השיעור + תסריטי תרגול</p>
            </div>
            <div class="v3-door__meta">
              <span><i class="fa-regular fa-file"></i> 3 קבצים</span>
              <span><i class="fa-solid fa-arrow-left"></i></span>
            </div>
          </a>

          <a class="v3-door v3-door--05" href="#">
            <div class="v3-door__num">05</div>
            <div class="v3-door__ic"><i class="fa-brands fa-whatsapp"></i></div>
            <div class="v3-door__body">
              <strong>קבוצת עדכונים</strong>
              <p>הודעות מרם, שיעורים חדשים ואירועים — ללא ספאם</p>
            </div>
            <div class="v3-door__meta">
              <span><i class="fa-solid fa-users"></i> 1,240 חברים</span>
              <span><i class="fa-solid fa-arrow-left"></i></span>
            </div>
          </a>

          <a class="v3-door v3-door--06" href="#">
            <span class="v3-door__new">חדש</span>
            <div class="v3-door__num">+</div>
            <div class="v3-door__ic"><i class="fa-solid fa-heart"></i></div>
            <div class="v3-door__body">
              <strong>תוכנית שותפים</strong>
              <p>הזמן חברים שיהנו מהקורס, תרוויח על כל הצטרפות</p>
            </div>
            <div class="v3-door__meta">
              <span><i class="fa-solid fa-coins"></i> עמלות אטרקטיביות</span>
              <span><i class="fa-solid fa-arrow-left"></i></span>
            </div>
          </a>
        </div>
      </section>

      <!-- Next up lesson -->
      <section class="v3-section">
        <header class="v3-section__head">
          <div>
            <span class="v3-section__eyebrow">הבא בתור</span>
            <h2>שיעור 3 · מה זה (בכלל) NLP?</h2>
          </div>
          <a href="#" class="v3-section__link">לכל השיעורים <i class="fa-solid fa-arrow-left"></i></a>
        </header>
        <a href="#" class="v3-nextup g">
          <div class="v3-nextup__thumb">
            <img src="https://img.youtube.com/vi/zGuxyfbYdUY/maxresdefault.jpg" alt="">
            <span class="v3-nextup__dur">22:10</span>
            <div class="v3-nextup__play"><i class="fa-solid fa-play"></i></div>
          </div>
          <div class="v3-nextup__body">
            <span class="v3-nextup__eyebrow">מודול 1 · שיעור 3</span>
            <h3>מה זה (בכלל) NLP?</h3>
            <p>ההגדרה המעשית, איך זה עובד בחיים היומיומיים, ומה כדאי לזכור לפני שעוברים לשיעור הבא.</p>
            <div class="v3-nextup__cta">המשך בציר <i class="fa-solid fa-arrow-left"></i></div>
          </div>
        </a>
      </section>

    </main>

    <!-- ===== VERTICAL TIMELINE SIDEBAR ===== -->
    <aside class="v3-timeline">
      <div class="v3-timeline__head">
        <div>
          <strong>ציר הקורס</strong>
          <small>7 מודולים · 51 שיעורים</small>
        </div>
        <div class="v3-timeline__progress">
          <b>6%</b>
          <div class="v3-timeline__bar"><span style="width:6%"></span></div>
        </div>
      </div>

      <div class="v3-timeline__search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" placeholder="חפש שיעור…">
      </div>

      <div class="v3-timeline__track">

        <!-- Module 1 -->
        <div class="v3-tm open">
          <div class="v3-tm__hd">
            <span class="v3-tm__marker done"><i class="fa-solid fa-check"></i></span>
            <div class="v3-tm__txt">
              <b>מודול 1</b>
              <strong>מבוא ל-NLP</strong>
              <small>8 שיעורים · 3 הושלמו · 45%</small>
              <div class="v3-tm__bar"><span style="width:37.5%"></span></div>
            </div>
          </div>
          <div class="v3-tm__list">
            <a class="v3-ln done"><span class="v3-ln__dot done"><i class="fa-solid fa-check"></i></span><span class="v3-ln__line"></span><div class="v3-ln__txt"><strong>איך NLP יכול לשנות את חייך?</strong><small>20:20</small></div></a>
            <a class="v3-ln active"><span class="v3-ln__dot active"><i class="fa-solid fa-play"></i></span><span class="v3-ln__line"></span><div class="v3-ln__txt"><strong>מהן האמונות שמסתתרות בתת המודע?</strong><small><span class="v3-ln__live">משודר עכשיו</span> · 21:40</small></div></a>
            <a class="v3-ln done"><span class="v3-ln__dot done"><i class="fa-solid fa-check"></i></span><span class="v3-ln__line"></span><div class="v3-ln__txt"><strong>מה זה (בכלל) NLP?</strong><small>22:10</small></div></a>
            <a class="v3-ln"><span class="v3-ln__dot">4</span><span class="v3-ln__line"></span><div class="v3-ln__txt"><strong>שלוש הנחות יסוד משנות חיים</strong><small>27:23</small></div></a>
            <a class="v3-ln"><span class="v3-ln__dot">5</span><span class="v3-ln__line"></span><div class="v3-ln__txt"><strong>מודע, תת מודע ומודל התקשורת</strong><small>24:28</small></div></a>
            <a class="v3-ln"><span class="v3-ln__dot">6</span><span class="v3-ln__line"></span><div class="v3-ln__txt"><strong>איך לנצל את היכולת להשפיע על עצמי</strong><small>18:12</small></div></a>
          </div>
        </div>

        <!-- Module 2 -->
        <div class="v3-tm">
          <div class="v3-tm__hd">
            <span class="v3-tm__marker">2</span>
            <div class="v3-tm__txt">
              <b>מודול 2</b>
              <strong>עמדות תפיסה ומערכות יחסים</strong>
              <small>6 שיעורים · 00:00 · 0%</small>
            </div>
            <i class="fa-solid fa-chevron-down v3-tm__chev"></i>
          </div>
        </div>

        <!-- Module 3 -->
        <div class="v3-tm">
          <div class="v3-tm__hd">
            <span class="v3-tm__marker">3</span>
            <div class="v3-tm__txt">
              <b>מודול 3</b>
              <strong>שפה, שאלות והצבת מטרות</strong>
              <small>7 שיעורים · 00:00 · 0%</small>
            </div>
            <i class="fa-solid fa-chevron-down v3-tm__chev"></i>
          </div>
        </div>

        <div class="v3-tm">
          <div class="v3-tm__hd">
            <span class="v3-tm__marker">4</span>
            <div class="v3-tm__txt">
              <b>מודול 4</b>
              <strong>השפה של המוח</strong>
              <small>7 שיעורים · 0%</small>
            </div>
            <i class="fa-solid fa-chevron-down v3-tm__chev"></i>
          </div>
        </div>

        <div class="v3-tm">
          <div class="v3-tm__hd">
            <span class="v3-tm__marker">5</span>
            <div class="v3-tm__txt">
              <b>מודול 5</b>
              <strong>עוגנים ו-NLP מתקדם</strong>
              <small>7 שיעורים · 0%</small>
            </div>
            <i class="fa-solid fa-chevron-down v3-tm__chev"></i>
          </div>
        </div>

        <div class="v3-tm v3-tm--locked">
          <div class="v3-tm__hd">
            <span class="v3-tm__marker"><i class="fa-solid fa-lock"></i></span>
            <div class="v3-tm__txt">
              <b>מודול 6</b>
              <strong>טיפול בפוביות וחרדות</strong>
              <small>8 שיעורים · נעול</small>
            </div>
          </div>
        </div>

        <div class="v3-tm v3-tm--locked">
          <div class="v3-tm__hd">
            <span class="v3-tm__marker"><i class="fa-solid fa-lock"></i></span>
            <div class="v3-tm__txt">
              <b>מודול 7</b>
              <strong>התעוררות אישית ומטא-מצבים</strong>
              <small>8 שיעורים · נעול</small>
            </div>
          </div>
        </div>

      </div>

      <div class="v3-timeline__foot">
        <button class="btn btn--teal btn--sm"><i class="fa-solid fa-certificate"></i> קבל תעודה</button>
      </div>
    </aside>
  </div>
</div>
`;

  const styles = `
<style>
/* ==================== V3 · Timeline Bold ==================== */
#frame-v3{font-family:'Heebo',sans-serif;direction:rtl;}

/* Top bar */
.v3-topbar{
  position:sticky;top:50px;z-index:40;
  display:flex;align-items:center;justify-content:space-between;gap:1rem;
  padding:.65rem 1.5rem;min-height:60px;
  background:rgba(4,22,27,.78);backdrop-filter:blur(22px) saturate(180%);
  border-bottom:1px solid rgba(255,255,255,.08);
}
.v3-topbar__right,.v3-topbar__left{display:flex;align-items:center;gap:.55rem;}
.v3-rail-toggle{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:.85rem;}
.v3-brand{display:flex;align-items:center;gap:.5rem;color:#fff;text-decoration:none;}
.v3-brand img{height:30px;border-radius:7px;}
.v3-brand span{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:.95rem;}
.v3-brand b{color:#E6C65A;}
.v3-topbar__sep{width:1px;height:22px;background:rgba(255,255,255,.12);margin-inline:.25rem;}
.v3-crumbs{display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:rgba(232,241,242,.55);}
.v3-crumbs a{color:rgba(232,241,242,.55);text-decoration:none;}
.v3-crumbs a:hover{color:#fff;}
.v3-crumbs span{color:#fff;font-weight:500;}
.v3-crumbs i{font-size:.55rem;opacity:.5;}
.v3-iconbtn{position:relative;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:.82rem;display:flex;align-items:center;justify-content:center;}
.v3-iconbtn__dot{position:absolute;top:7px;inset-inline-end:8px;width:7px;height:7px;border-radius:50%;background:#E6C65A;box-shadow:0 0 0 2px rgba(4,22,27,.9);}
.v3-userbtn{display:inline-flex;align-items:center;gap:.4rem;padding:.3rem .7rem .3rem .35rem;border-radius:50px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#fff;font-family:inherit;font-size:.78rem;font-weight:500;}
.v3-userbtn i{font-size:.55rem;opacity:.6;}
.v3-avatar{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#E6C65A,#D4AF37);color:#1a1205;font-weight:700;font-size:.7rem;}

/* Layout */
.v3-layout{
  display:grid;grid-template-columns:minmax(0,1fr) 400px;
  gap:0;
  max-width:1600px;margin:0 auto;
}
.v3-main{min-width:0;padding:2rem 2rem 4rem 2rem;display:flex;flex-direction:column;gap:3rem;}

/* STAGE — full-bleed cinematic video */
.v3-stage{margin-inline:-2rem;margin-top:-2rem;padding:1.25rem 2rem 0;}
.v3-stage__frame{position:relative;aspect-ratio:21/9;border-radius:0 0 28px 28px;overflow:hidden;background:#000;box-shadow:0 50px 100px rgba(0,0,0,.55);}
.v3-stage__frame img{width:100%;height:100%;object-fit:cover;filter:saturate(.9);}
.v3-stage__scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45) 0%,transparent 35%,transparent 55%,rgba(0,0,0,.85) 100%);}
.v3-stage__topchips{position:absolute;top:1.25rem;inset-inline-end:1.5rem;display:flex;gap:.45rem;}
.v3-chip{display:inline-flex;align-items:center;padding:.35rem .75rem;border-radius:50px;font-size:.74rem;font-weight:500;color:#fff;}
.v3-chip--dark{background:rgba(0,0,0,.55);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.16);}

.v3-stage__play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:98px;height:98px;border-radius:50%;background:linear-gradient(135deg,rgba(230,198,90,.95),rgba(212,175,55,.82));border:2px solid rgba(255,255,255,.35);color:#1a1205;font-size:1.9rem;padding-inline-start:6px;display:flex;align-items:center;justify-content:center;box-shadow:0 20px 60px rgba(212,175,55,.5),inset 0 1px 0 rgba(255,255,255,.5);cursor:pointer;transition:transform .25s;}
.v3-stage__play:hover{transform:translate(-50%,-50%) scale(1.06);}

.v3-stage__bottombar{position:absolute;bottom:0;inset-inline:0;padding:1rem 1.5rem 1.25rem;display:flex;align-items:center;gap:1rem;color:#fff;}
.v3-stage__controls{display:flex;align-items:center;gap:.25rem;}
.v3-stage__controls button{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#fff;backdrop-filter:blur(10px);font-size:.78rem;}
.v3-stage__controls button.primary{width:42px;height:42px;background:linear-gradient(135deg,rgba(230,198,90,.9),rgba(212,175,55,.75));color:#1a1205;border-color:rgba(255,255,255,.25);font-size:.85rem;padding-inline-start:3px;}
.v3-stage__time{margin-inline-start:.5rem;font-size:.76rem;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.82);}
.v3-stage__track{flex:1;height:5px;background:rgba(255,255,255,.18);border-radius:3px;overflow:hidden;}
.v3-stage__track span{display:block;height:100%;background:linear-gradient(90deg,#D4AF37,#E6C65A);border-radius:3px;box-shadow:0 0 12px rgba(230,198,90,.6);}
.v3-stage__right{display:flex;align-items:center;gap:.25rem;}
.v3-stage__right button{min-width:34px;height:34px;border-radius:50px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#fff;padding:0 .6rem;font-size:.76rem;font-family:inherit;backdrop-filter:blur(10px);display:inline-flex;align-items:center;gap:.3rem;}

/* TITLE block — large editorial */
.v3-titlewrap{padding:.5rem 0;}
.v3-eyebrow{display:inline-flex;align-items:center;gap:.5rem;padding:.35rem .85rem;margin-bottom:1.25rem;border-radius:50px;background:rgba(230,198,90,.12);border:1px solid rgba(230,198,90,.3);color:#E6C65A;font-size:.72rem;font-weight:600;letter-spacing:.04em;}
.v3-eyebrow__dot{width:7px;height:7px;border-radius:50%;background:#E6C65A;box-shadow:0 0 0 3px rgba(230,198,90,.25);animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
.v3-title{
  font-family:'Frank Ruhl Libre',serif;font-weight:700;
  font-size:clamp(2.5rem,5.5vw,5rem);line-height:.98;letter-spacing:-.025em;
  margin:0 0 1.75rem;color:#fff;text-wrap:balance;
}
.v3-title em{font-style:italic;background:linear-gradient(135deg,#E6C65A 0%,#D4AF37 60%);-webkit-background-clip:text;background-clip:text;color:transparent;}

.v3-titlemeta{display:flex;align-items:center;justify-content:space-between;gap:2rem;flex-wrap:wrap;padding-block:1.25rem;border-block:1px solid rgba(255,255,255,.08);margin-bottom:1.5rem;}
.v3-author{display:flex;align-items:center;gap:.85rem;}
.v3-author img{width:52px;height:52px;border-radius:50%;border:2px solid rgba(230,198,90,.4);}
.v3-author strong{display:block;font-size:1rem;color:#fff;font-weight:600;}
.v3-author small{font-size:.78rem;color:rgba(232,241,242,.6);}
.v3-stats{display:flex;gap:2rem;}
.v3-stat{text-align:start;line-height:1.15;}
.v3-stat b{display:block;font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1.45rem;color:#fff;}
.v3-stat small{font-size:.7rem;color:rgba(232,241,242,.55);}

.v3-actions{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;}
.v3-actions__spacer{flex:1;}

/* SECTION scaffolding */
.v3-section{display:flex;flex-direction:column;gap:1.5rem;}
.v3-section__head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;padding-block:.5rem 0;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:1rem;}
.v3-section__eyebrow{display:block;font-size:.66rem;font-weight:700;color:#E6C65A;letter-spacing:.14em;text-transform:uppercase;margin-bottom:.35rem;}
.v3-section__head h2{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:clamp(1.6rem,2.6vw,2.1rem);line-height:1.15;letter-spacing:-.015em;margin:0;color:#fff;}
.v3-section__link{font-size:.82rem;color:#9FDBE5;text-decoration:none;display:inline-flex;align-items:center;gap:.3rem;}
.v3-section__link:hover{color:#E6C65A;}

/* DOORS */
.v3-doors{display:grid;grid-template-columns:repeat(3,1fr);gap:.85rem;}
.v3-door{
  position:relative;display:flex;flex-direction:column;gap:.7rem;
  padding:1.25rem;min-height:200px;border-radius:16px;
  background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.1);
  color:#fff;text-decoration:none;overflow:hidden;
  transition:all .25s;
}
.v3-door::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.04) 0%,transparent 40%);pointer-events:none;}
.v3-door:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.2);transform:translateY(-2px);}
.v3-door__num{position:absolute;top:1rem;inset-inline-end:1.25rem;font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:2.2rem;color:rgba(255,255,255,.12);line-height:1;letter-spacing:-.02em;}
.v3-door__ic{width:42px;height:42px;border-radius:12px;background:rgba(47,133,146,.25);border:1px solid rgba(63,170,187,.35);color:#9FDBE5;display:flex;align-items:center;justify-content:center;font-size:1.1rem;}
.v3-door__body{flex:1;display:flex;flex-direction:column;gap:.3rem;}
.v3-door__body strong{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1.15rem;line-height:1.2;color:#fff;}
.v3-door__body p{margin:0;font-size:.82rem;line-height:1.5;color:rgba(232,241,242,.65);}
.v3-door__meta{display:flex;align-items:center;justify-content:space-between;padding-top:.75rem;border-top:1px solid rgba(255,255,255,.07);font-size:.72rem;color:rgba(232,241,242,.6);}
.v3-door__meta span:last-child{width:26px;height:26px;border-radius:50%;background:rgba(230,198,90,.15);color:#E6C65A;display:flex;align-items:center;justify-content:center;font-size:.68rem;}
.v3-door__new{position:absolute;top:1rem;inset-inline-start:1rem;padding:.2rem .55rem;border-radius:50px;background:#E6C65A;color:#1a1205;font-size:.6rem;font-weight:700;letter-spacing:.04em;z-index:2;}

.v3-door--02 .v3-door__ic{background:rgba(255,105,180,.18);border-color:rgba(255,105,180,.3);font-size:1.3rem;}
.v3-door--03 .v3-door__ic{background:rgba(159,219,229,.14);border-color:rgba(159,219,229,.28);}
.v3-door--04 .v3-door__ic{background:rgba(230,198,90,.14);border-color:rgba(230,198,90,.3);color:#E6C65A;}
.v3-door--05 .v3-door__ic{background:rgba(37,211,102,.18);border-color:rgba(37,211,102,.35);color:#5ee499;}
.v3-door--06{background:linear-gradient(135deg,rgba(212,175,55,.2),rgba(230,198,90,.03));border-color:rgba(230,198,90,.3);}
.v3-door--06 .v3-door__ic{background:linear-gradient(135deg,rgba(230,198,90,.3),rgba(212,175,55,.15));border-color:rgba(230,198,90,.4);color:#E6C65A;}
.v3-door--06 .v3-door__num{color:rgba(230,198,90,.25);}

/* NEXT UP */
.v3-nextup{display:grid;grid-template-columns:340px 1fr;gap:1.75rem;padding:1.25rem;border-radius:18px;color:#fff;text-decoration:none;align-items:center;transition:transform .2s;}
.v3-nextup:hover{transform:translateY(-2px);}
.v3-nextup__thumb{position:relative;border-radius:12px;overflow:hidden;aspect-ratio:16/9;}
.v3-nextup__thumb img{width:100%;height:100%;object-fit:cover;}
.v3-nextup__dur{position:absolute;bottom:8px;inset-inline-end:8px;padding:.2rem .55rem;border-radius:6px;background:rgba(0,0,0,.75);font-size:.7rem;font-weight:600;}
.v3-nextup__play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,rgba(230,198,90,.95),rgba(212,175,55,.82));color:#1a1205;display:flex;align-items:center;justify-content:center;font-size:1rem;padding-inline-start:3px;border:2px solid rgba(255,255,255,.3);box-shadow:0 12px 28px rgba(212,175,55,.4);}
.v3-nextup__body{display:flex;flex-direction:column;gap:.45rem;}
.v3-nextup__eyebrow{font-size:.7rem;font-weight:700;color:#E6C65A;text-transform:uppercase;letter-spacing:.14em;}
.v3-nextup__body h3{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1.65rem;line-height:1.2;margin:0;letter-spacing:-.015em;}
.v3-nextup__body p{margin:0;font-size:.88rem;line-height:1.55;color:rgba(232,241,242,.65);}
.v3-nextup__cta{display:inline-flex;align-items:center;gap:.4rem;margin-top:.3rem;padding:.5rem 1rem;border-radius:10px;background:rgba(230,198,90,.14);border:1px solid rgba(230,198,90,.32);color:#E6C65A;font-weight:600;font-size:.82rem;align-self:flex-start;}

/* ==================== VERTICAL TIMELINE SIDEBAR ==================== */
.v3-timeline{
  position:sticky;top:calc(50px + 60px);
  align-self:start;height:calc(100vh - 50px - 60px);
  display:flex;flex-direction:column;
  background:rgba(6,26,32,.55);backdrop-filter:blur(26px) saturate(180%);
  border-inline-start:1px solid rgba(255,255,255,.08);
}

.v3-timeline__head{padding:1.1rem 1.25rem;display:flex;align-items:center;justify-content:space-between;gap:.75rem;border-bottom:1px solid rgba(255,255,255,.06);}
.v3-timeline__head strong{display:block;font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1rem;}
.v3-timeline__head small{font-size:.7rem;color:rgba(232,241,242,.55);}
.v3-timeline__progress{text-align:end;}
.v3-timeline__progress b{display:block;font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1.1rem;color:#E6C65A;line-height:1;}
.v3-timeline__bar{display:block;width:56px;height:4px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;margin-top:.3rem;}
.v3-timeline__bar span{display:block;height:100%;background:linear-gradient(90deg,#D4AF37,#E6C65A);}

.v3-timeline__search{padding:.75rem 1rem;display:flex;align-items:center;gap:.5rem;border-bottom:1px solid rgba(255,255,255,.06);}
.v3-timeline__search i{color:rgba(232,241,242,.4);font-size:.78rem;}
.v3-timeline__search input{flex:1;background:none;border:none;color:#fff;font-family:inherit;font-size:.82rem;outline:none;padding:.3rem 0;}
.v3-timeline__search input::placeholder{color:rgba(232,241,242,.35);}

.v3-timeline__track{flex:1;overflow-y:auto;padding:.75rem 0 1rem;}
.v3-timeline__track::-webkit-scrollbar{width:4px;}
.v3-timeline__track::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px;}

/* Module timeline item */
.v3-tm{padding:.6rem 1rem .35rem;}
.v3-tm__hd{display:flex;align-items:center;gap:.75rem;padding:.55rem .65rem;border-radius:10px;cursor:pointer;background:none;width:100%;border:none;color:inherit;font-family:inherit;text-align:inherit;}
.v3-tm__hd:hover{background:rgba(255,255,255,.04);}
.v3-tm.open .v3-tm__hd{background:rgba(230,198,90,.08);}
.v3-tm__marker{width:34px;height:34px;border-radius:10px;background:rgba(47,133,146,.25);border:1px solid rgba(63,170,187,.35);display:flex;align-items:center;justify-content:center;font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1rem;color:#9FDBE5;flex-shrink:0;}
.v3-tm__marker.done{background:#00b894;border-color:#00b894;color:#fff;font-size:.75rem;}
.v3-tm.open .v3-tm__marker:not(.done){background:linear-gradient(135deg,#E6C65A,#D4AF37);color:#1a1205;border-color:transparent;}
.v3-tm--locked .v3-tm__marker{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08);color:rgba(232,241,242,.4);font-size:.72rem;}
.v3-tm__txt{flex:1;line-height:1.25;}
.v3-tm__txt b{display:block;font-size:.62rem;color:#E6C65A;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:.1rem;}
.v3-tm__txt strong{display:block;font-size:.85rem;font-weight:600;color:#fff;}
.v3-tm__txt small{font-size:.68rem;color:rgba(232,241,242,.55);}
.v3-tm__bar{margin-top:.35rem;height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;}
.v3-tm__bar span{display:block;height:100%;background:linear-gradient(90deg,#D4AF37,#E6C65A);}
.v3-tm__chev{font-size:.62rem;color:rgba(232,241,242,.4);}
.v3-tm--locked{opacity:.55;}
.v3-tm--locked .v3-tm__txt b{color:rgba(232,241,242,.4);}

.v3-tm__list{display:none;flex-direction:column;padding:.5rem 0 .4rem;margin-inline-start:16px;position:relative;}
.v3-tm.open .v3-tm__list{display:flex;}
.v3-tm__list::before{content:'';position:absolute;top:14px;bottom:14px;inset-inline-end:16px;width:2px;background:linear-gradient(180deg,rgba(230,198,90,.35),rgba(230,198,90,.08));}

/* Lesson node */
.v3-ln{position:relative;display:flex;align-items:center;gap:.6rem;padding:.5rem .5rem .5rem 0;color:#fff;text-decoration:none;cursor:pointer;}
.v3-ln__dot{position:relative;z-index:1;width:24px;height:24px;border-radius:50%;background:#0c2f36;border:2px solid rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;font-size:.62rem;font-weight:700;color:rgba(232,241,242,.6);flex-shrink:0;margin-inline-end:6px;}
.v3-ln__dot.done{background:#00b894;border-color:#00b894;color:#fff;font-size:.58rem;}
.v3-ln__dot.active{background:linear-gradient(135deg,#E6C65A,#D4AF37);border-color:#04161b;color:#1a1205;font-size:.55rem;padding-inline-start:1px;box-shadow:0 0 0 3px rgba(230,198,90,.25);}
.v3-ln__line{display:none;}
.v3-ln__txt{flex:1;line-height:1.25;padding:.25rem 0;border-radius:8px;padding-inline-start:.5rem;}
.v3-ln__txt strong{display:block;font-size:.78rem;font-weight:500;color:rgba(232,241,242,.85);}
.v3-ln.done .v3-ln__txt strong{color:rgba(232,241,242,.55);text-decoration:line-through;text-decoration-thickness:1px;text-decoration-color:rgba(232,241,242,.25);}
.v3-ln.active .v3-ln__txt{background:linear-gradient(135deg,rgba(230,198,90,.12),rgba(212,175,55,.02));}
.v3-ln.active .v3-ln__txt strong{color:#fff;font-weight:600;}
.v3-ln__txt small{font-size:.64rem;color:rgba(232,241,242,.45);}
.v3-ln__live{color:#E6C65A;font-weight:600;}
.v3-ln:hover .v3-ln__txt{background:rgba(255,255,255,.03);}

.v3-timeline__foot{padding:.85rem 1rem 1rem;border-top:1px solid rgba(255,255,255,.06);}
.v3-timeline__foot .btn{width:100%;justify-content:center;}

/* Responsive */
@media (max-width:1280px){
  .v3-doors{grid-template-columns:repeat(2,1fr);}
  .v3-crumbs,.v3-topbar .btn:not(.btn--gold),.v3-userbtn span:not(.v3-avatar){display:none;}
}
@media (max-width:1100px){
  .v3-layout{grid-template-columns:1fr;}
  .v3-timeline{position:static;height:auto;border-inline-start:none;border-top:1px solid rgba(255,255,255,.08);}
  .v3-timeline__track{max-height:600px;}
}
@media (max-width:768px){
  .v3-main{padding:1rem 1rem 3rem;gap:2rem;}
  .v3-stage{margin-inline:-1rem;padding:0 1rem;}
  .v3-stage__frame{aspect-ratio:16/9;border-radius:20px;}
  .v3-stage__play{width:64px;height:64px;font-size:1.15rem;}
  .v3-stage__bottombar{padding:.5rem .75rem .75rem;flex-wrap:wrap;gap:.5rem;}
  .v3-stage__track{flex-basis:100%;order:3;}
  .v3-doors{grid-template-columns:1fr;}
  .v3-nextup{grid-template-columns:1fr;gap:1rem;}
  .v3-titlemeta{flex-direction:column;align-items:flex-start;gap:1.25rem;}
  .v3-stats{gap:1.25rem;}
}
</style>
`;

  document.getElementById('canvas').insertAdjacentHTML('beforeend', html);
  document.head.insertAdjacentHTML('beforeend', styles);

  // Interactions
  document.querySelectorAll('#frame-v3 .v3-tm__hd').forEach(hd=>{
    hd.addEventListener('click',()=>{
      const mod = hd.parentElement;
      if(mod.classList.contains('v3-tm--locked')) return;
      mod.classList.toggle('open');
    });
  });
})();
