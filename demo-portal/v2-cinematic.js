// V2 — Cinematic LMS
// Full-bleed video hero · floating glass doors · real lesson data
(function(){
  // Real data from Claude Code
  const LESSONS_M1 = [
    {n:1, title:'איך NLP יכול לשנות את חייך?', dur:'20:20', yt:'HdJTrqV-8kw', done:true},
    {n:2, title:'מהן האמונות שמסתתרות בתת המודע?', dur:'21:40', yt:'I4r3oERlZpc', active:true},
    {n:3, title:'מה זה (בכלל) NLP?', dur:'22:10', yt:'zGuxyfbYdUY', done:true},
    {n:4, title:'שלוש הנחות יסוד משנות חיים', dur:'27:23', yt:'fo90wrXPJjQ'},
    {n:5, title:'מודע, תת מודע ומודל התקשורת', dur:'24:28', yt:'kccllbuObhs'},
    {n:6, title:'תקשורת לא מילולית, קליברציה וחדות חושים', dur:'15:01', yt:'ahN0Q2wGVa0'},
    {n:7, title:'ראפור ויצירת כימיה ברמה הלא מודעת', dur:'24:19', yt:'Nt8MK8CNvYo'},
    {n:8, title:'סיכום השיעור ונקודות חשובות', dur:'19:46', yt:'PMCuz1jiMk-'},
  ];
  const MODULES = [
    {n:1, title:'מבוא ל-NLP', count:8, done:3, open:true},
    {n:2, title:'עמדות תפיסה ומערכות יחסים', count:6, done:0},
    {n:3, title:'שפה, שאלות והצבת מטרות', count:7, done:0},
    {n:4, title:'השפה של המוח, מערכות ייצוג והרגלים', count:7, done:0},
    {n:5, title:'צרכים אנושיים, אישיות והרגלים', count:7, done:0},
    {n:6, title:'פרשנות, רגשות ומשאבים', count:8, done:0},
    {n:7, title:'אמונות, שינוי זהות וציר הזמן', count:8, done:0},
  ];

  const currentLesson = LESSONS_M1[1];

  const modulesHTML = MODULES.map(m=>`
    <div class="v2-mod ${m.open?'open':''}">
      <button class="v2-mod__hd">
        <span class="v2-mod__num">${m.n}</span>
        <span class="v2-mod__title">${m.title}</span>
        <span class="v2-mod__pill">${m.done}/${m.count}</span>
        <i class="fa-solid fa-chevron-down v2-mod__chev"></i>
      </button>
      ${m.open?`<div class="v2-mod__lessons">${LESSONS_M1.map(l=>`
        <div class="v2-les ${l.done?'done':''} ${l.active?'active':''}">
          <span class="v2-les__num">${l.done?'<i class="fa-solid fa-check"></i>':l.active?'<i class="fa-solid fa-play"></i>':l.n}</span>
          <div class="v2-les__info">
            <span class="v2-les__title">${l.title}</span>
            <span class="v2-les__dur">${l.dur}</span>
          </div>
        </div>`).join('')}</div>`:''}
    </div>
  `).join('');

  const html = `
<div class="frame" id="frame-v2">

  <!-- HERO: Full-bleed cinematic video -->
  <section class="v2-hero">
    <div class="v2-hero__bg">
      <img src="https://img.youtube.com/vi/${currentLesson.yt}/maxresdefault.jpg" alt="">
      <div class="v2-hero__scrim-top"></div>
      <div class="v2-hero__scrim-bot"></div>
    </div>

    <!-- Floating top bar — full portal header, cinematic treatment -->
    <header class="v2-topbar">
      <div class="v2-topbar__right">
        <a class="v2-brand" href="#">
          <img src="../assets/logo-square.png" alt="">
          <span>בית <b>המטפלים</b></span>
        </a>
        <span class="v2-topbar__sep"></span>
        <span class="v2-course-label">קורס NLP · יסודות ומעשה</span>
      </div>

      <div class="v2-topbar__center">
        <button class="v2-switcher">
          <div class="v2-switcher__dot"></div>
          <span class="v2-switcher__chip">קורס</span>
          <strong>NLP Practitioner</strong>
          <i class="fa-solid fa-chevron-down"></i>
        </button>
        <div class="v2-progress-bar">
          <span class="v2-progress-bar__lbl">התקדמות</span>
          <div class="v2-progress-bar__track"><span style="width:6%"></span></div>
          <b>6%</b>
        </div>
      </div>

      <div class="v2-topbar__left">
        <a class="btn btn--gold btn--sm" href="#"><i class="fa-solid fa-rocket"></i> לקבלת פרטים לתוכנית ההכשרה</a>
        <button class="v2-iconbtn" aria-label="theme"><i class="fa-regular fa-sun"></i></button>
        <a class="btn btn--clear btn--sm v2-backlink" href="#"><i class="fa-solid fa-arrow-left"></i> חזרה לאתר</a>
        <button class="v2-iconbtn" aria-label="notifications"><i class="fa-regular fa-bell"></i><span class="v2-iconbtn__dot"></span></button>
        <button class="v2-userbtn"><span class="v2-avatar">ה</span> <span class="v2-userbtn__name">הילל</span> <i class="fa-solid fa-chevron-down"></i></button>
      </div>
    </header>

    <!-- Cinematic content overlay -->
    <div class="v2-hero__content">
      <div class="v2-hero__main">
        <div class="v2-hero__meta">
          <span class="v2-hero__chip"><i class="fa-solid fa-bookmark"></i> מודול 1 · מבוא ל-NLP</span>
          <span class="v2-hero__chip v2-hero__chip--gold">שיעור 2 מתוך 51</span>
        </div>
        <h1 class="v2-hero__title">${currentLesson.title}</h1>
        <div class="v2-hero__by">
          <img src="https://i.pravatar.cc/80?img=12" alt="">
          <div>
            <small>מועבר על ידי</small>
            <strong>רם אלוס</strong>
          </div>
          <span class="v2-hero__by-sep"></span>
          <div class="v2-hero__stat"><i class="fa-regular fa-clock"></i> ${currentLesson.dur}</div>
        </div>

        <div class="v2-hero__actions">
          <button class="v2-playbtn">
            <span class="v2-playbtn__icon"><i class="fa-solid fa-play"></i></span>
            <span class="v2-playbtn__txt">
              <strong>המשך לצפות</strong>
              <small>נעצר ב-00:02 · נותרו ${currentLesson.dur}</small>
            </span>
          </button>
          <button class="btn btn--dark"><i class="fa-solid fa-check"></i> סמן כהושלם</button>
          <button class="btn btn--clear btn--icon" aria-label="bookmark"><i class="fa-regular fa-bookmark"></i></button>
          <button class="btn btn--clear btn--icon" aria-label="share"><i class="fa-solid fa-share-nodes"></i></button>
        </div>

        <!-- Inline player strip -->
        <div class="v2-playstrip">
          <span class="v2-playstrip__time">00:02</span>
          <div class="v2-playstrip__track"><span style="width:2%"></span></div>
          <span class="v2-playstrip__time v2-playstrip__time--total">21:40</span>
          <button class="v2-playstrip__ctl" aria-label="cc"><i class="fa-solid fa-closed-captioning"></i></button>
          <button class="v2-playstrip__ctl" aria-label="speed"><span class="v2-speed">1.0×</span></button>
          <button class="v2-playstrip__ctl" aria-label="full"><i class="fa-solid fa-expand"></i></button>
        </div>
      </div>

      <!-- Floating "now playing" card -->
      <aside class="v2-nowcard">
        <div class="v2-nowcard__head">
          <span class="v2-nowcard__eyebrow">הבא בתור</span>
          <span class="v2-nowcard__count">#3 / 51</span>
        </div>
        <div class="v2-nowcard__thumb">
          <img src="https://img.youtube.com/vi/zGuxyfbYdUY/mqdefault.jpg" alt="">
          <span class="v2-nowcard__dur">22:10</span>
        </div>
        <h4 class="v2-nowcard__title">מה זה (בכלל) NLP?</h4>
        <p class="v2-nowcard__desc">ההגדרה המעשית, איך זה עובד בחיים היומיומיים, ולמה זו לא פסיכולוגיה קלאסית.</p>
        <button class="v2-nowcard__btn">המשך בציר <i class="fa-solid fa-arrow-left"></i></button>
      </aside>
    </div>

    <!-- Bottom shelf: scroll hint -->
    <div class="v2-shelf">
      <div class="v2-shelf__rail">
        <span class="v2-shelf__lbl">כלים לשיעור הזה</span>
        <div class="v2-shelf__arrow">גלול למטה</div>
      </div>
    </div>
  </section>

  <!-- DOORS: 5 floating glass pillars instead of tabs -->
  <section class="v2-doors">
    <div class="v2-doors__head">
      <span class="eyebrow-gold">כלי השיעור</span>
      <h2 class="v2-h2">5 דרכים להעמיק את הלמידה</h2>
      <p class="v2-doors__sub">בחר כלי כדי להיכנס — או השתמש בכולם במקביל</p>
    </div>

    <div class="v2-doors__grid">
      <!-- Door 1: AI Tutor -->
      <button class="v2-door v2-door--ai" data-door="ai">
        <div class="v2-door__glow"></div>
        <div class="v2-door__icon"><i class="fa-solid fa-robot"></i></div>
        <div class="v2-door__meta">זמין 24/7 · 100 הודעות ליום</div>
        <h3 class="v2-door__title">המורה של NLP</h3>
        <p class="v2-door__desc">שאל שאלה על החומר — מקבל תשובה מותאמת אישית עם הקשר מהשיעור</p>
        <div class="v2-door__action"><span>פתח שיחה</span> <i class="fa-solid fa-arrow-left"></i></div>
      </button>

      <!-- Door 2: Game -->
      <button class="v2-door v2-door--game" data-door="game">
        <div class="v2-door__glow"></div>
        <div class="v2-door__icon v2-door__icon--pink">🧠</div>
        <div class="v2-door__meta">80+ תרגילים · XP · לבבות</div>
        <h3 class="v2-door__title">משחק תרגול</h3>
        <p class="v2-door__desc">תרגילים אינטראקטיביים בסגנון Duolingo עם מנטור AI שמלווה אותך</p>
        <div class="v2-door__action"><span>התחל לשחק</span> <i class="fa-solid fa-arrow-left"></i></div>
      </button>

      <!-- Door 3: Notes -->
      <button class="v2-door v2-door--notes" data-door="notes">
        <div class="v2-door__glow"></div>
        <div class="v2-door__icon"><i class="fa-regular fa-pen-to-square"></i></div>
        <div class="v2-door__meta">נשמר לפי שיעור</div>
        <h3 class="v2-door__title">הערות אישיות</h3>
        <p class="v2-door__desc">כתוב תובנות, שאלות ומחשבות — הכל נשאר שלך ונשמר אוטומטית</p>
        <div class="v2-door__action"><span>פתח מחברת</span> <i class="fa-solid fa-arrow-left"></i></div>
      </button>

      <!-- Door 4: Resources -->
      <button class="v2-door v2-door--res" data-door="res">
        <div class="v2-door__glow"></div>
        <div class="v2-door__icon"><i class="fa-solid fa-download"></i></div>
        <div class="v2-door__meta">חוברת + 7 סיכומים</div>
        <h3 class="v2-door__title">חומרי עזר</h3>
        <p class="v2-door__desc">חוברת ה-Practitioner המלאה וסיכומי השיעורים להורדה ולצפייה</p>
        <div class="v2-door__action"><span>פתח ספריה</span> <i class="fa-solid fa-arrow-left"></i></div>
      </button>

      <!-- Door 5: Community -->
      <button class="v2-door v2-door--com" data-door="com">
        <div class="v2-door__glow"></div>
        <div class="v2-door__icon v2-door__icon--green"><i class="fa-brands fa-whatsapp"></i></div>
        <div class="v2-door__meta">קבוצה שקטה · ללא ספאם</div>
        <h3 class="v2-door__title">קבוצת עדכונים</h3>
        <p class="v2-door__desc">עדכונים על אירועים, תכנים חדשים והטבות בלעדיות דרך ווטסאפ</p>
        <div class="v2-door__action"><span>הצטרף</span> <i class="fa-solid fa-arrow-left"></i></div>
      </button>

      <!-- Door 6: Partners (NEW) -->
      <button class="v2-door v2-door--partners" data-door="partners">
        <div class="v2-door__glow"></div>
        <div class="v2-door__badge">חדש</div>
        <div class="v2-door__icon v2-door__icon--gold"><i class="fa-solid fa-heart"></i></div>
        <div class="v2-door__meta">שתף · הרוויח מעשה טוב</div>
        <h3 class="v2-door__title">תוכנית השותפים</h3>
        <p class="v2-door__desc">הזמן חברים ובני משפחה שיקבלו את הקורס — עלה בלידרבורד החודשי</p>
        <div class="v2-door__action"><span>שתף והרווח</span> <i class="fa-solid fa-arrow-left"></i></div>
      </button>
    </div>
  </section>

  <!-- TIMELINE: Horizontal course rail -->
  <section class="v2-rail">
    <div class="v2-rail__head">
      <div>
        <span class="eyebrow-gold">תוכנית הקורס</span>
        <h2 class="v2-h2">מסע של 51 שיעורים, 7 מודולים</h2>
      </div>
      <div class="v2-rail__stats">
        <div class="v2-rail__stat"><b>3</b><span>הושלמו</span></div>
        <div class="v2-rail__stat"><b>48</b><span>לפניך</span></div>
        <div class="v2-rail__stat"><b>~18.5</b><span>שעות תוכן</span></div>
      </div>
    </div>

    <div class="v2-rail__container">
      <aside class="v2-rail__side">
        <div class="v2-rail__search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" placeholder="חפש שיעור...">
        </div>
        <div class="v2-rail__modlist">
          ${modulesHTML}
        </div>
      </aside>

      <div class="v2-rail__detail g">
        <!-- Active lesson detail -->
        <div class="v2-detail">
          <div class="v2-detail__thumb">
            <img src="https://img.youtube.com/vi/${currentLesson.yt}/maxresdefault.jpg" alt="">
            <button class="v2-detail__play"><i class="fa-solid fa-play"></i></button>
            <div class="v2-detail__prog"><span style="width:2%"></span></div>
          </div>
          <div class="v2-detail__body">
            <span class="v2-detail__eyebrow">נצפה כעת · מודול 1, שיעור 2</span>
            <h3 class="v2-detail__title">${currentLesson.title}</h3>
            <p class="v2-detail__desc">הרעיון הגדול בשיעור הזה: אמונות לא נוצרות בחלל ריק — הן בנויות מחוויות ילדות, משפות ששמענו בבית, ומחיבורים שתת המודע עשה מבלי שנתנו לו רשות. ברגע שמתחילים לזהות אותן, משהו משתחרר.</p>
            <div class="v2-detail__tags">
              <span class="v2-tag">אמונות מוגבלות</span>
              <span class="v2-tag">תת מודע</span>
              <span class="v2-tag">NLP בסיס</span>
              <span class="v2-tag">תרגיל מעשי</span>
            </div>
            <div class="v2-detail__foot">
              <button class="btn btn--gold">המשך ב-00:02 <i class="fa-solid fa-arrow-left"></i></button>
              <div class="v2-detail__nav">
                <button class="btn btn--clear btn--sm"><i class="fa-solid fa-arrow-right"></i> הקודם</button>
                <button class="btn btn--clear btn--sm">הבא <i class="fa-solid fa-arrow-left"></i></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Instagram strip -->
  <section class="v2-ig">
    <i class="fa-brands fa-instagram"></i>
    <span>אהבת את התוכן וקיבלת ערך? שתף בסטורי ותייג אותנו כדי שנוכל להגיע לעוד אנשים טובים!</span>
    <button class="btn btn--clear btn--sm">שתף בסטורי <i class="fa-solid fa-arrow-left"></i></button>
  </section>

  <!-- Floating feedback FAB -->
  <button class="v2-fab" aria-label="feedback">
    <i class="fa-regular fa-lightbulb"></i>
    <span>משוב</span>
  </button>
</div>
`;

  const styles = `
<style>
/* ============ V2 CINEMATIC ============ */
#frame-v2{background:#04161b;}

/* Topbar floating — full portal header */
.v2-topbar{
  position:sticky;top:50px;inset-inline:0;z-index:40;
  display:flex;align-items:center;justify-content:space-between;gap:1rem;
  padding:.7rem 1.25rem;
  background:rgba(4,22,27,.6);
  backdrop-filter:blur(26px) saturate(180%);
  -webkit-backdrop-filter:blur(26px) saturate(180%);
  border-bottom:1px solid rgba(255,255,255,.08);
  min-height:64px;
}
.v2-topbar__right,.v2-topbar__center,.v2-topbar__left{display:flex;align-items:center;gap:.55rem;}
.v2-brand{display:flex;align-items:center;gap:.5rem;color:#fff;text-decoration:none;}
.v2-brand img{height:32px;border-radius:7px;}
.v2-brand span{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:.95rem;letter-spacing:-.01em;}
.v2-brand b{color:#E6C65A;}
.v2-topbar__sep{width:1px;height:22px;background:rgba(255,255,255,.14);}
.v2-course-label{font-size:.78rem;color:rgba(232,241,242,.7);font-weight:500;padding-inline-start:.65rem;border-inline-start:1px solid rgba(255,255,255,.14);}

.v2-switcher{
  display:inline-flex;align-items:center;gap:.5rem;
  padding:.4rem .85rem;border-radius:50px;
  background:rgba(47,133,146,.18);border:1px solid rgba(63,170,187,.3);
  color:#9FDBE5;font-family:inherit;cursor:pointer;
  backdrop-filter:blur(10px);
}
.v2-switcher__dot{width:7px;height:7px;border-radius:50%;background:#E6C65A;box-shadow:0 0 0 2px rgba(230,198,90,.25);}
.v2-switcher__chip{font-size:.68rem;color:rgba(232,241,242,.55);font-weight:500;}
.v2-switcher strong{font-size:.78rem;font-weight:600;color:#9FDBE5;}
.v2-switcher i{font-size:.55rem;opacity:.6;margin-inline-start:.15rem;}

.v2-progress-bar{display:flex;align-items:center;gap:.55rem;padding:.35rem .75rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:50px;}
.v2-progress-bar__lbl{font-size:.7rem;color:rgba(232,241,242,.55);}
.v2-progress-bar__track{display:block;width:90px;height:5px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;}
.v2-progress-bar__track span{display:block;height:100%;background:linear-gradient(90deg,#D4AF37,#E6C65A);}
.v2-progress-bar b{font-size:.72rem;color:#E6C65A;font-weight:700;}

.v2-iconbtn{position:relative;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#fff;cursor:pointer;backdrop-filter:blur(12px);font-size:.82rem;display:flex;align-items:center;justify-content:center;}
.v2-iconbtn:hover{background:rgba(255,255,255,.12);}
.v2-iconbtn__dot{position:absolute;top:7px;inset-inline-end:8px;width:7px;height:7px;border-radius:50%;background:#E6C65A;box-shadow:0 0 0 2px rgba(4,22,27,.9);}
.v2-backlink{display:inline-flex;}

.v2-userbtn{
  display:inline-flex;align-items:center;gap:.4rem;
  padding:.35rem .7rem .35rem .35rem;border-radius:50px;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
  color:#fff;font-family:inherit;font-size:.78rem;font-weight:500;cursor:pointer;
  backdrop-filter:blur(12px);
}
.v2-userbtn__name{padding-inline-end:.1rem;}
.v2-userbtn i{font-size:.55rem;opacity:.6;}
.v2-avatar{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#E6C65A,#D4AF37);color:#1a1205;font-weight:700;font-size:.74rem;}

/* HERO */
.v2-hero{
  position:relative;min-height:720px;overflow:hidden;
  display:flex;flex-direction:column;
  margin-top:-64px; /* Hero starts behind sticky topbar */
}
.v2-hero__bg{position:absolute;inset:0;z-index:0;}
.v2-hero__bg img{width:100%;height:100%;object-fit:cover;filter:saturate(.85) contrast(.95);}
.v2-hero__scrim-top{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,22,27,.45) 0%,rgba(4,22,27,.2) 30%,transparent 50%);}
.v2-hero__scrim-bot{position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,rgba(4,22,27,.85) 75%,#04161b 100%), linear-gradient(270deg,rgba(4,22,27,0) 50%,rgba(4,22,27,.8) 100%);}

.v2-hero__content{
  position:relative;z-index:2;flex:1;
  display:grid;grid-template-columns:1fr 360px;gap:2rem;
  align-items:end;padding:8rem 3rem 5rem;
}

.v2-hero__meta{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1.2rem;}
.v2-hero__chip{display:inline-flex;align-items:center;gap:.4rem;padding:.4rem .9rem;border-radius:50px;background:rgba(0,0,0,.4);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:.75rem;font-weight:500;}
.v2-hero__chip i{color:rgba(255,255,255,.7);font-size:.7rem;}
.v2-hero__chip--gold{background:linear-gradient(135deg,rgba(230,198,90,.55),rgba(212,175,55,.35));color:#1a1205;border-color:rgba(230,198,90,.5);font-weight:600;}

.v2-hero__title{
  font-family:'Frank Ruhl Libre',serif;font-weight:700;
  font-size:clamp(2.4rem, 4.5vw, 4.2rem);line-height:1.05;letter-spacing:-.02em;
  color:#fff;margin:0 0 1.5rem;text-wrap:balance;max-width:22ch;
  text-shadow:0 4px 24px rgba(0,0,0,.5);
}

.v2-hero__by{display:flex;align-items:center;gap:.7rem;margin-bottom:1.8rem;flex-wrap:wrap;}
.v2-hero__by img{width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid rgba(230,198,90,.45);mix-blend-mode:luminosity;}
.v2-hero__by > div{display:flex;flex-direction:column;line-height:1.2;}
.v2-hero__by small{font-size:.7rem;color:rgba(232,241,242,.65);}
.v2-hero__by strong{font-size:.95rem;color:#fff;font-weight:600;}
.v2-hero__by-sep{width:1px;height:24px;background:rgba(255,255,255,.2);}
.v2-hero__stat{display:flex;align-items:center;gap:.4rem;font-size:.82rem;color:rgba(232,241,242,.85);}
.v2-hero__stat i{color:#E6C65A;}

.v2-hero__actions{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin-bottom:2rem;}

.v2-playbtn{
  position:relative;display:flex;align-items:center;gap:.85rem;
  padding:.65rem 1.6rem .65rem .75rem;
  border-radius:50px;
  background:linear-gradient(135deg,rgba(230,198,90,.95),rgba(212,175,55,.85));
  color:#1a1205;border:1px solid rgba(255,255,255,.3);
  cursor:pointer;font-family:inherit;
  box-shadow:0 14px 40px rgba(212,175,55,.4), inset 0 1px 0 rgba(255,255,255,.4);
  transition:transform .2s;
}
.v2-playbtn:hover{transform:translateY(-2px);}
.v2-playbtn__icon{width:44px;height:44px;border-radius:50%;background:rgba(26,18,5,.15);display:flex;align-items:center;justify-content:center;font-size:1rem;padding-inline-start:2px;}
.v2-playbtn__txt{display:flex;flex-direction:column;align-items:flex-start;line-height:1.2;}
.v2-playbtn__txt strong{font-size:.95rem;font-weight:700;}
.v2-playbtn__txt small{font-size:.7rem;opacity:.8;}

/* Play strip */
.v2-playstrip{
  display:flex;align-items:center;gap:.9rem;
  padding:.65rem 1rem;border-radius:14px;max-width:560px;
  background:rgba(0,0,0,.45);backdrop-filter:blur(18px);
  border:1px solid rgba(255,255,255,.12);
}
.v2-playstrip__time{font-size:.78rem;color:rgba(255,255,255,.85);font-variant-numeric:tabular-nums;}
.v2-playstrip__time--total{color:rgba(255,255,255,.55);}
.v2-playstrip__track{flex:1;height:5px;background:rgba(255,255,255,.18);border-radius:3px;overflow:hidden;position:relative;}
.v2-playstrip__track span{display:block;height:100%;background:linear-gradient(90deg,#D4AF37,#E6C65A);position:relative;}
.v2-playstrip__track span::after{content:'';position:absolute;inset-inline-end:-6px;top:50%;transform:translateY(-50%);width:12px;height:12px;border-radius:50%;background:#E6C65A;box-shadow:0 0 0 4px rgba(230,198,90,.25);}
.v2-playstrip__ctl{background:none;border:none;color:rgba(255,255,255,.75);cursor:pointer;padding:.25rem .4rem;font-size:.85rem;font-family:inherit;}
.v2-playstrip__ctl:hover{color:#fff;}
.v2-speed{font-size:.72rem;font-weight:600;}

/* Now-playing card */
.v2-nowcard{
  padding:1.2rem;border-radius:18px;
  background:rgba(4,22,27,.6);backdrop-filter:blur(24px);
  border:1px solid rgba(255,255,255,.12);
  box-shadow:0 20px 60px rgba(0,0,0,.4);
  max-width:360px;
}
.v2-nowcard__head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.85rem;}
.v2-nowcard__eyebrow{font-size:.7rem;font-weight:700;color:#E6C65A;text-transform:uppercase;letter-spacing:.12em;}
.v2-nowcard__count{font-size:.72rem;color:rgba(232,241,242,.55);font-variant-numeric:tabular-nums;}
.v2-nowcard__thumb{position:relative;border-radius:12px;overflow:hidden;aspect-ratio:16/9;margin-bottom:.8rem;}
.v2-nowcard__thumb img{width:100%;height:100%;object-fit:cover;}
.v2-nowcard__dur{position:absolute;bottom:8px;inset-inline-end:8px;padding:.15rem .5rem;border-radius:6px;background:rgba(0,0,0,.75);color:#fff;font-size:.7rem;font-weight:600;}
.v2-nowcard__title{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1.05rem;color:#fff;margin:0 0 .4rem;line-height:1.3;}
.v2-nowcard__desc{font-size:.78rem;color:rgba(232,241,242,.65);line-height:1.5;margin:0 0 .9rem;}
.v2-nowcard__btn{display:flex;align-items:center;justify-content:space-between;width:100%;padding:.55rem .8rem;border-radius:10px;background:linear-gradient(135deg,rgba(230,198,90,.3),rgba(212,175,55,.18));border:1px solid rgba(230,198,90,.35);color:#E6C65A;font-size:.82rem;font-weight:600;font-family:inherit;cursor:pointer;}

/* Shelf hint */
.v2-shelf{position:relative;z-index:2;padding:0 3rem 2rem;}
.v2-shelf__rail{display:flex;align-items:center;justify-content:space-between;padding:.85rem 1.2rem;border-radius:50px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(16px);}
.v2-shelf__lbl{font-size:.78rem;color:rgba(232,241,242,.7);font-weight:500;}
.v2-shelf__arrow{display:inline-flex;align-items:center;gap:.4rem;font-size:.72rem;color:#E6C65A;font-weight:600;}
.v2-shelf__arrow::after{content:'↓';font-size:.9rem;animation:bounceDown 2s ease-in-out infinite;}
@keyframes bounceDown{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}

/* DOORS */
.v2-doors{padding:6rem 3rem 4rem;position:relative;}
.v2-doors__head{text-align:center;margin-bottom:3rem;max-width:700px;margin-inline:auto;}
.eyebrow-gold{display:inline-block;font-size:.75rem;font-weight:700;color:#E6C65A;text-transform:uppercase;letter-spacing:.18em;margin-bottom:1rem;}
.v2-h2{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:clamp(1.8rem,3vw,2.6rem);color:#fff;line-height:1.2;letter-spacing:-.01em;margin:0 0 .8rem;text-wrap:balance;}
.v2-doors__sub{font-size:.95rem;color:rgba(232,241,242,.65);line-height:1.6;margin:0;}

.v2-doors__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.2rem;max-width:1280px;margin:0 auto;}

.v2-door{
  position:relative;text-align:start;
  padding:1.7rem 1.5rem;border-radius:20px;
  background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.1);
  backdrop-filter:blur(22px);
  color:#fff;font-family:inherit;cursor:pointer;
  display:flex;flex-direction:column;gap:.7rem;
  min-height:260px;
  transition:all .3s;
  overflow:hidden;
}
.v2-door::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.07) 0%,transparent 40%);}
.v2-door:hover{transform:translateY(-4px);background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.18);}
.v2-door__glow{position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle,rgba(230,198,90,.08),transparent 40%);opacity:0;transition:opacity .3s;pointer-events:none;}
.v2-door:hover .v2-door__glow{opacity:1;}

.v2-door__badge{position:absolute;top:12px;inset-inline-start:12px;padding:.2rem .55rem;border-radius:50px;background:#E6C65A;color:#1a1205;font-size:.62rem;font-weight:700;letter-spacing:.05em;}

.v2-door__icon{
  width:54px;height:54px;border-radius:14px;
  background:rgba(47,133,146,.25);
  border:1px solid rgba(63,170,187,.35);
  color:#9FDBE5;
  display:flex;align-items:center;justify-content:center;
  font-size:1.35rem;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.1);
}
.v2-door__icon--pink{background:rgba(255,105,180,.22);border-color:rgba(255,105,180,.4);color:#ff9ecf;font-size:1.6rem;}
.v2-door__icon--green{background:rgba(37,211,102,.2);border-color:rgba(37,211,102,.4);color:#5ee499;}
.v2-door__icon--gold{background:linear-gradient(135deg,rgba(230,198,90,.35),rgba(212,175,55,.2));border-color:rgba(230,198,90,.5);color:#E6C65A;}

.v2-door__meta{font-size:.7rem;color:rgba(232,241,242,.55);text-transform:uppercase;letter-spacing:.08em;font-weight:600;}
.v2-door__title{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1.35rem;color:#fff;margin:0;line-height:1.2;}
.v2-door__desc{font-size:.85rem;color:rgba(232,241,242,.7);line-height:1.6;margin:0;flex:1;}
.v2-door__action{display:flex;align-items:center;justify-content:space-between;padding-top:.8rem;border-top:1px solid rgba(255,255,255,.08);font-size:.82rem;color:#E6C65A;font-weight:600;}
.v2-door__action i{transition:transform .2s;}
.v2-door:hover .v2-door__action i{transform:translateX(-4px);}

/* RAIL — course overview */
.v2-rail{padding:3rem 3rem 5rem;}
.v2-rail__head{display:flex;align-items:flex-end;justify-content:space-between;gap:2rem;margin-bottom:2.5rem;flex-wrap:wrap;}
.v2-rail__head h2{margin-top:.2rem;}
.v2-rail__stats{display:flex;gap:1.5rem;}
.v2-rail__stat{text-align:center;}
.v2-rail__stat b{display:block;font-family:'Frank Ruhl Libre',serif;font-size:1.85rem;font-weight:700;color:#E6C65A;line-height:1;}
.v2-rail__stat span{display:block;font-size:.7rem;color:rgba(232,241,242,.55);text-transform:uppercase;letter-spacing:.1em;margin-top:.35rem;}

.v2-rail__container{display:grid;grid-template-columns:340px 1fr;gap:1.5rem;}

.v2-rail__side{display:flex;flex-direction:column;gap:.8rem;}
.v2-rail__search{position:relative;}
.v2-rail__search input{width:100%;padding:.7rem 1rem;padding-inline-start:2.4rem;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;color:#fff;font-family:inherit;font-size:.88rem;outline:none;}
.v2-rail__search input::placeholder{color:rgba(232,241,242,.4);}
.v2-rail__search i{position:absolute;inset-inline-start:.9rem;top:50%;transform:translateY(-50%);color:rgba(232,241,242,.5);font-size:.88rem;}

.v2-rail__modlist{display:flex;flex-direction:column;gap:.4rem;max-height:560px;overflow-y:auto;padding-inline-end:.25rem;}
.v2-rail__modlist::-webkit-scrollbar{width:4px;}
.v2-rail__modlist::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:2px;}

.v2-mod{border-radius:12px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.08);overflow:hidden;}
.v2-mod.open{background:rgba(230,198,90,.06);border-color:rgba(230,198,90,.2);}
.v2-mod__hd{width:100%;display:flex;align-items:center;gap:.7rem;padding:.85rem .95rem;background:none;border:none;color:#fff;font-family:inherit;cursor:pointer;text-align:inherit;}
.v2-mod__num{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:rgba(47,133,146,.3);border:1px solid rgba(63,170,187,.35);font-size:.78rem;font-weight:700;color:#9FDBE5;}
.v2-mod.open .v2-mod__num{background:linear-gradient(135deg,#E6C65A,#D4AF37);color:#1a1205;border-color:rgba(230,198,90,.6);}
.v2-mod__title{font-size:.85rem;font-weight:600;flex:1;}
.v2-mod__pill{font-size:.66rem;padding:.15rem .5rem;border-radius:50px;background:rgba(255,255,255,.08);color:rgba(232,241,242,.75);font-weight:600;}
.v2-mod.open .v2-mod__pill{background:rgba(230,198,90,.18);color:#E6C65A;}
.v2-mod__chev{font-size:.65rem;color:rgba(232,241,242,.5);transition:transform .2s;}
.v2-mod.open .v2-mod__chev{transform:rotate(180deg);}

.v2-mod__lessons{display:flex;flex-direction:column;gap:.15rem;padding:.2rem .4rem .5rem;}
.v2-les{display:flex;align-items:center;gap:.65rem;padding:.55rem .6rem;border-radius:8px;cursor:pointer;transition:background .15s;}
.v2-les:hover{background:rgba(255,255,255,.04);}
.v2-les.active{background:linear-gradient(135deg,rgba(230,198,90,.18),rgba(212,175,55,.06));border:1px solid rgba(230,198,90,.3);}
.v2-les__num{width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;color:rgba(232,241,242,.7);flex-shrink:0;}
.v2-les.done .v2-les__num{background:#00b894;border-color:#00b894;color:#fff;font-size:.75rem;}
.v2-les.active .v2-les__num{background:linear-gradient(135deg,#E6C65A,#D4AF37);border-color:rgba(230,198,90,.6);color:#1a1205;}
.v2-les__info{display:flex;flex-direction:column;gap:.1rem;flex:1;min-width:0;}
.v2-les__title{font-size:.78rem;color:#fff;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.v2-les.done .v2-les__title{color:rgba(232,241,242,.55);}
.v2-les__dur{font-size:.65rem;color:rgba(232,241,242,.45);font-variant-numeric:tabular-nums;}

/* Rail detail */
.v2-rail__detail{border-radius:20px;overflow:hidden;}
.v2-detail{display:grid;grid-template-columns:1fr 1.1fr;gap:0;min-height:420px;}
.v2-detail__thumb{position:relative;overflow:hidden;}
.v2-detail__thumb img{width:100%;height:100%;object-fit:cover;}
.v2-detail__thumb::after{content:'';position:absolute;inset:0;background:linear-gradient(270deg,rgba(6,40,49,.75) 0%,transparent 30%),linear-gradient(180deg,transparent 60%,rgba(0,0,0,.65) 100%);}
.v2-detail__play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:68px;height:68px;border-radius:50%;background:linear-gradient(135deg,rgba(230,198,90,.95),rgba(212,175,55,.8));color:#1a1205;border:1px solid rgba(255,255,255,.4);font-size:1.2rem;cursor:pointer;padding-inline-start:4px;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 40px rgba(212,175,55,.5);z-index:2;}
.v2-detail__prog{position:absolute;bottom:16px;inset-inline:16px;height:4px;background:rgba(255,255,255,.2);border-radius:2px;overflow:hidden;z-index:2;}
.v2-detail__prog span{display:block;height:100%;background:linear-gradient(90deg,#D4AF37,#E6C65A);}

.v2-detail__body{padding:2rem;display:flex;flex-direction:column;gap:1rem;}
.v2-detail__eyebrow{font-size:.72rem;font-weight:700;color:#E6C65A;text-transform:uppercase;letter-spacing:.14em;}
.v2-detail__title{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1.8rem;color:#fff;line-height:1.2;letter-spacing:-.01em;margin:0;text-wrap:balance;}
.v2-detail__desc{font-size:.92rem;line-height:1.75;color:rgba(232,241,242,.76);margin:0;text-wrap:pretty;}
.v2-detail__tags{display:flex;flex-wrap:wrap;gap:.4rem;}
.v2-tag{padding:.3rem .75rem;border-radius:50px;background:rgba(47,133,146,.18);border:1px solid rgba(63,170,187,.3);color:#9FDBE5;font-size:.72rem;font-weight:500;}
.v2-detail__foot{display:flex;align-items:center;justify-content:space-between;gap:.8rem;margin-top:auto;padding-top:.5rem;flex-wrap:wrap;}
.v2-detail__nav{display:flex;gap:.4rem;}

/* Instagram strip */
.v2-ig{display:flex;align-items:center;justify-content:center;gap:1rem;padding:1.5rem 3rem;text-align:center;flex-wrap:wrap;background:rgba(0,0,0,.2);border-top:1px solid rgba(255,255,255,.05);border-bottom:1px solid rgba(255,255,255,.05);}
.v2-ig > span{font-size:.85rem;color:rgba(232,241,242,.75);}
.v2-ig i{font-size:1.3rem;background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);-webkit-background-clip:text;background-clip:text;color:transparent;}

/* FAB */
.v2-fab{
  position:fixed;bottom:1.5rem;inset-inline-start:1.5rem;z-index:80;
  display:flex;align-items:center;gap:.5rem;
  padding:.7rem 1.1rem;border-radius:50px;
  background:linear-gradient(135deg,rgba(230,198,90,.95),rgba(212,175,55,.85));
  color:#1a1205;border:1px solid rgba(255,255,255,.25);
  font-family:inherit;font-size:.82rem;font-weight:600;cursor:pointer;
  box-shadow:0 12px 32px rgba(212,175,55,.4);
  transition:transform .2s;
}
.v2-fab:hover{transform:translateY(-2px);}

/* Responsive */
@media (max-width:1100px){
  .v2-hero__content{grid-template-columns:1fr;padding:5rem 1.5rem 3rem;}
  .v2-nowcard{max-width:none;}
  .v2-doors,.v2-rail{padding-inline:1.5rem;}
  .v2-doors__grid{grid-template-columns:repeat(2,1fr);}
  .v2-rail__container{grid-template-columns:1fr;}
  .v2-detail{grid-template-columns:1fr;}
  .v2-detail__thumb{aspect-ratio:16/9;}
}
@media (max-width:1280px){
  .v2-course-label,.v2-progress-bar__lbl,.v2-userbtn__name,.v2-backlink{display:none;}
  .v2-topbar .btn--gold span{display:none;}
}
@media (max-width:960px){
  .v2-topbar{flex-wrap:wrap;gap:.5rem;padding:.6rem .9rem;}
  .v2-topbar__center{order:3;flex-basis:100%;justify-content:center;border-top:1px solid rgba(255,255,255,.06);padding-top:.45rem;margin-top:.1rem;}
}
@media (max-width:768px){
  .v2-topbar{padding:.6rem .8rem;}
  .v2-topbar__sep,.v2-switcher__chip,.v2-progress-bar__lbl{display:none;}
  .v2-switcher,.v2-progress-bar{padding:.3rem .6rem;}
  .v2-hero{min-height:600px;}
  .v2-hero__content{padding-inline:1.25rem;padding-top:6rem;}
  .v2-doors__grid{grid-template-columns:1fr;}
  .v2-shelf{padding-inline:1.25rem;}
}
</style>
`;

  document.getElementById('canvas').insertAdjacentHTML('beforeend', html);
  document.head.insertAdjacentHTML('beforeend', styles);

  // Module expand
  document.querySelectorAll('#frame-v2 .v2-mod__hd').forEach(hd=>{
    hd.addEventListener('click',()=>hd.parentElement.classList.toggle('open'));
  });
})();
