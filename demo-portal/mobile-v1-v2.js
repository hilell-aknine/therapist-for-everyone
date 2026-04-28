// Mobile variations — V1 (balanced), V2 (cinematic), V3 (timeline)
// Renders inside .device mockup frame

(function(){
  // ===================== MOBILE V1 · BALANCED =====================
  const v1m = `
<div class="mobile-frame" id="frame-v1-m">
  <div class="device-wrap">
    <div class="device">
      <div class="device__inner">
        <div class="mv1">
          <div class="atmos">
            <div class="atmos__base"></div>
            <div class="atmos__blob atmos__blob--a"></div>
            <div class="atmos__blob atmos__blob--b"></div>
          </div>

          <!-- Status bar space -->
          <div class="mv1-stat"><span>9:41</span><span class="mv1-stat__ind"><i class="fa-solid fa-signal"></i> <i class="fa-solid fa-wifi"></i> <i class="fa-solid fa-battery-three-quarters"></i></span></div>

          <!-- App header -->
          <header class="mv1-hd">
            <button class="mv1-hd__menu" aria-label="menu"><i class="fa-solid fa-bars"></i></button>
            <a class="mv1-hd__brand" href="#">
              <img src="../../assets/logo-square.png" alt="">
              <span>בית <b>המטפלים</b></span>
            </a>
            <button class="mv1-hd__bell" aria-label="notifications"><i class="fa-regular fa-bell"></i><span class="mv1-hd__dot"></span></button>
          </header>

          <!-- Course pill + progress -->
          <div class="mv1-band">
            <button class="mv1-chip">
              <span class="mv1-chip__dot"></span>
              NLP Practitioner
              <i class="fa-solid fa-chevron-down"></i>
            </button>
            <div class="mv1-prog">
              <span>6%</span>
              <div class="mv1-prog__bar"><span style="width:6%"></span></div>
              <small>3/51</small>
            </div>
          </div>

          <main class="mv1-main">
            <!-- Video -->
            <div class="mv1-video g">
              <div class="mv1-video__frame">
                <img src="https://img.youtube.com/vi/I4r3oERlZpc/maxresdefault.jpg" alt="">
                <div class="mv1-video__scrim"></div>
                <button class="mv1-video__play" aria-label="play"><i class="fa-solid fa-play"></i></button>
                <div class="mv1-video__top">
                  <span class="mv1-video__mod">מודול 1 · שיעור 2</span>
                  <button class="mv1-video__ic"><i class="fa-solid fa-expand"></i></button>
                </div>
                <div class="mv1-video__bar">
                  <span>00:02</span>
                  <div class="mv1-video__track"><span style="width:2%"></span></div>
                  <span>21:40</span>
                </div>
              </div>
            </div>

            <!-- Title block -->
            <div class="mv1-title">
              <h1>מהן האמונות שמסתתרות בתת המודע?</h1>
              <div class="mv1-title__by">
                <img src="https://i.pravatar.cc/60?img=12" alt="">
                <span>רם אלוס · 21:40 דק</span>
              </div>
            </div>

            <!-- Prev/next pill -->
            <div class="mv1-navpill g">
              <button class="mv1-navpill__side"><i class="fa-solid fa-arrow-right"></i><small>הקודם</small></button>
              <button class="mv1-navpill__center"><i class="fa-solid fa-check"></i></button>
              <button class="mv1-navpill__side mv1-navpill__side--next"><small>הבא</small><i class="fa-solid fa-arrow-left"></i></button>
            </div>

            <!-- Tabs scrollable -->
            <div class="mv1-tabs">
              <button class="mv1-tab active" data-tab="ai"><i class="fa-solid fa-robot"></i> העוזר</button>
              <button class="mv1-tab" data-tab="game"><i class="fa-solid fa-gamepad"></i> משחק</button>
              <button class="mv1-tab" data-tab="notes"><i class="fa-regular fa-pen-to-square"></i> הערות</button>
              <button class="mv1-tab" data-tab="res"><i class="fa-solid fa-download"></i> חומרים</button>
              <button class="mv1-tab" data-tab="com"><i class="fa-brands fa-whatsapp"></i> עדכונים</button>
            </div>

            <!-- Active tab body: AI chat -->
            <div class="mv1-panel mv1-panel--ai g">
              <div class="mv1-chat-head">
                <div class="mv1-chat-head__av"><i class="fa-solid fa-robot"></i></div>
                <div class="mv1-chat-head__info">
                  <strong>המורה של NLP</strong>
                  <small><span class="mv1-dot"></span> מוכן לעזור</small>
                </div>
                <span class="mv1-chat-head__limit">100/יום</span>
              </div>
              <div class="mv1-chat-body">
                <div class="mv1-msg">
                  <div class="mv1-msg__av"><i class="fa-solid fa-robot"></i></div>
                  <div class="mv1-msg__bubble">שלום! 👋 שאלו אותי על החומר — טכניקות, מושגים, תרגולים.</div>
                </div>
                <div class="mv1-sugs">
                  <button>💡 מה אתה יודע לעשות?</button>
                  <button>📖 אמונות מוגבלות</button>
                </div>
              </div>
              <div class="mv1-chat-input">
                <input type="text" placeholder="שאלו שאלה...">
                <button><i class="fa-solid fa-paper-plane"></i></button>
              </div>
            </div>

            <!-- Course content preview -->
            <div class="mv1-course g">
              <div class="mv1-course__hd">
                <strong>תוכן הקורס</strong>
                <button><i class="fa-solid fa-magnifying-glass"></i></button>
              </div>

              <div class="mv1-hl">
                <i class="fa-solid fa-heart"></i>
                <div>
                  <strong>תוכנית השותפים</strong>
                  <small>הזמן חברים שיהנו גם</small>
                </div>
                <span class="mv1-hl__badge">חדש</span>
              </div>

              <div class="mv1-mod open">
                <button class="mv1-mod__hd">
                  <span class="mv1-mod__num">1</span>
                  <div class="mv1-mod__txt">
                    <strong>מבוא ל-NLP</strong>
                    <small>8 שיעורים · 3 הושלמו</small>
                  </div>
                  <i class="fa-solid fa-chevron-down"></i>
                </button>
                <div class="mv1-mod__list">
                  <div class="mv1-les done"><span class="mv1-les__num"><i class="fa-solid fa-check"></i></span><span>איך NLP יכול לשנות את חייך?</span><span class="mv1-les__dur">20:20</span></div>
                  <div class="mv1-les active"><span class="mv1-les__num"><i class="fa-solid fa-play"></i></span><span>מהן האמונות שמסתתרות בתת המודע?</span><span class="mv1-les__dur">21:40</span></div>
                  <div class="mv1-les done"><span class="mv1-les__num"><i class="fa-solid fa-check"></i></span><span>מה זה (בכלל) NLP?</span><span class="mv1-les__dur">22:10</span></div>
                  <div class="mv1-les"><span class="mv1-les__num">4</span><span>שלוש הנחות יסוד משנות חיים</span><span class="mv1-les__dur">27:23</span></div>
                  <div class="mv1-les"><span class="mv1-les__num">5</span><span>מודע, תת מודע ומודל התקשורת</span><span class="mv1-les__dur">24:28</span></div>
                </div>
              </div>
              <div class="mv1-mod">
                <button class="mv1-mod__hd">
                  <span class="mv1-mod__num">2</span>
                  <div class="mv1-mod__txt"><strong>עמדות תפיסה ומערכות יחסים</strong><small>6 שיעורים</small></div>
                  <i class="fa-solid fa-chevron-down"></i>
                </button>
              </div>
              <div class="mv1-mod">
                <button class="mv1-mod__hd">
                  <span class="mv1-mod__num">3</span>
                  <div class="mv1-mod__txt"><strong>שפה, שאלות והצבת מטרות</strong><small>7 שיעורים</small></div>
                  <i class="fa-solid fa-chevron-down"></i>
                </button>
              </div>
            </div>

            <!-- IG strip -->
            <div class="mv1-ig">
              <i class="fa-brands fa-instagram"></i>
              <span>אהבת? שתף בסטורי ותייג אותנו</span>
            </div>

            <div class="mv1-spacer"></div>
          </main>

          <!-- Bottom tab bar -->
          <nav class="mv1-tabbar">
            <button class="active"><i class="fa-solid fa-play"></i><span>הקורס</span></button>
            <button><i class="fa-solid fa-gamepad"></i><span>משחק</span></button>
            <button class="mv1-tabbar__fab"><i class="fa-regular fa-lightbulb"></i></button>
            <button><i class="fa-brands fa-whatsapp"></i><span>קהילה</span></button>
            <button><i class="fa-regular fa-user"></i><span>פרופיל</span></button>
          </nav>

        </div>
      </div>
    </div>
  </div>
</div>
`;

  // ===================== MOBILE V2 · CINEMATIC =====================
  const v2m = `
<div class="mobile-frame" id="frame-v2-m">
  <div class="device-wrap">
    <div class="device">
      <div class="device__inner">
        <div class="mv2">
          <!-- Status -->
          <div class="mv2-stat"><span>9:41</span><span><i class="fa-solid fa-signal"></i> <i class="fa-solid fa-wifi"></i> <i class="fa-solid fa-battery-three-quarters"></i></span></div>

          <!-- Cinematic hero -->
          <div class="mv2-hero">
            <img src="https://img.youtube.com/vi/I4r3oERlZpc/maxresdefault.jpg" alt="" class="mv2-hero__bg">
            <div class="mv2-hero__scrim"></div>

            <header class="mv2-hd">
              <button class="mv2-hd__ic" aria-label="back"><i class="fa-solid fa-arrow-right"></i></button>
              <div class="mv2-hd__progress">
                <svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" stroke="rgba(255,255,255,.15)" stroke-width="2.5" fill="none"/><circle cx="16" cy="16" r="13" stroke="#E6C65A" stroke-width="2.5" fill="none" stroke-dasharray="82" stroke-dashoffset="77" stroke-linecap="round" transform="rotate(-90 16 16)"/></svg>
                <span>6%</span>
              </div>
              <button class="mv2-hd__ic" aria-label="menu"><i class="fa-solid fa-ellipsis-vertical"></i></button>
            </header>

            <div class="mv2-hero__content">
              <div class="mv2-hero__chips">
                <span class="mv2-chip">מודול 1</span>
                <span class="mv2-chip mv2-chip--gold">שיעור 2 / 51</span>
              </div>
              <h1 class="mv2-hero__title">מהן האמונות שמסתתרות בתת המודע?</h1>
              <div class="mv2-hero__by">
                <img src="https://i.pravatar.cc/60?img=12" alt="">
                <div>
                  <strong>רם אלוס</strong>
                  <small>NLP Master · 21:40 דק</small>
                </div>
              </div>

              <button class="mv2-hero__cta">
                <span class="mv2-hero__cta-ic"><i class="fa-solid fa-play"></i></span>
                <span class="mv2-hero__cta-txt">
                  <strong>המשך לצפות</strong>
                  <small>נעצר ב-00:02</small>
                </span>
                <i class="fa-solid fa-arrow-left mv2-hero__cta-arr"></i>
              </button>
            </div>
          </div>

          <!-- Doors grid mobile -->
          <section class="mv2-sec">
            <div class="mv2-sec__head">
              <span class="mv2-eyebrow">כלי השיעור</span>
              <h2>5 דרכים להעמיק</h2>
            </div>
            <div class="mv2-doors">
              <button class="mv2-door">
                <div class="mv2-door__ic"><i class="fa-solid fa-robot"></i></div>
                <strong>המורה של NLP</strong>
                <small>100 הודעות/יום</small>
              </button>
              <button class="mv2-door mv2-door--pink">
                <div class="mv2-door__ic">🧠</div>
                <strong>משחק תרגול</strong>
                <small>80+ תרגילים</small>
              </button>
              <button class="mv2-door">
                <div class="mv2-door__ic"><i class="fa-regular fa-pen-to-square"></i></div>
                <strong>הערות</strong>
                <small>נשמר אוטומטית</small>
              </button>
              <button class="mv2-door">
                <div class="mv2-door__ic"><i class="fa-solid fa-download"></i></div>
                <strong>חומרי עזר</strong>
                <small>חוברת + סיכומים</small>
              </button>
              <button class="mv2-door mv2-door--green">
                <div class="mv2-door__ic"><i class="fa-brands fa-whatsapp"></i></div>
                <strong>קבוצת עדכונים</strong>
                <small>ללא ספאם</small>
              </button>
              <button class="mv2-door mv2-door--gold">
                <span class="mv2-door__new">חדש</span>
                <div class="mv2-door__ic"><i class="fa-solid fa-heart"></i></div>
                <strong>תוכנית שותפים</strong>
                <small>הזמן חברים</small>
              </button>
            </div>
          </section>

          <!-- Up next -->
          <section class="mv2-sec">
            <div class="mv2-sec__head">
              <span class="mv2-eyebrow">הבא בתור</span>
              <h2>שיעור 3 · מה זה NLP?</h2>
            </div>
            <div class="mv2-next g">
              <div class="mv2-next__thumb">
                <img src="https://img.youtube.com/vi/zGuxyfbYdUY/mqdefault.jpg" alt="">
                <span class="mv2-next__dur">22:10</span>
              </div>
              <div class="mv2-next__body">
                <strong>מה זה (בכלל) NLP?</strong>
                <small>ההגדרה המעשית, איך זה עובד בחיים היומיומיים</small>
                <button class="mv2-next__btn">המשך בציר <i class="fa-solid fa-arrow-left"></i></button>
              </div>
            </div>
          </section>

          <!-- Modules list -->
          <section class="mv2-sec">
            <div class="mv2-sec__head mv2-sec__head--row">
              <div>
                <span class="mv2-eyebrow">תוכן הקורס</span>
                <h2>7 מודולים · 51 שיעורים</h2>
              </div>
              <button class="mv2-search-ic"><i class="fa-solid fa-magnifying-glass"></i></button>
            </div>

            <div class="mv2-modlist">
              <div class="mv2-modcard active">
                <div class="mv2-modcard__num">1</div>
                <div class="mv2-modcard__info">
                  <strong>מבוא ל-NLP</strong>
                  <small>8 שיעורים · 3 הושלמו</small>
                  <div class="mv2-modcard__bar"><span style="width:37.5%"></span></div>
                </div>
              </div>
              <div class="mv2-modcard">
                <div class="mv2-modcard__num">2</div>
                <div class="mv2-modcard__info">
                  <strong>עמדות תפיסה</strong>
                  <small>6 שיעורים</small>
                </div>
              </div>
              <div class="mv2-modcard">
                <div class="mv2-modcard__num">3</div>
                <div class="mv2-modcard__info">
                  <strong>שפה ומטרות</strong>
                  <small>7 שיעורים</small>
                </div>
              </div>
              <div class="mv2-modcard">
                <div class="mv2-modcard__num">4</div>
                <div class="mv2-modcard__info">
                  <strong>השפה של המוח</strong>
                  <small>7 שיעורים</small>
                </div>
              </div>
            </div>
          </section>

          <div class="mv1-spacer"></div>

          <!-- Tab bar -->
          <nav class="mv2-tabbar">
            <button class="active"><i class="fa-solid fa-play"></i></button>
            <button><i class="fa-solid fa-gamepad"></i></button>
            <button class="mv2-tabbar__fab"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
            <button><i class="fa-solid fa-book-open"></i></button>
            <button><i class="fa-regular fa-user"></i></button>
          </nav>
        </div>
      </div>
    </div>
  </div>
</div>
`;

  // ===================== STYLES =====================
  const styles = `
<style>
/* Device wrap tweaks for mobile frames */
#frame-v1-m.mobile-frame.active,
#frame-v2-m.mobile-frame.active{display:block;}

/* ========== MV1 · Balanced ========== */
.mv1{position:relative;width:100%;height:100%;background:#04161b;font-family:'Heebo',sans-serif;direction:rtl;overflow-y:auto;overflow-x:hidden;color:#fff;}
.mv1 > .atmos{position:absolute;inset:0;z-index:0;}
.mv1 > *:not(.atmos){position:relative;z-index:1;}

.mv1-stat{display:flex;align-items:center;justify-content:space-between;padding:.5rem 1.5rem .25rem;font-size:.72rem;font-weight:600;color:#fff;font-variant-numeric:tabular-nums;direction:ltr;}
.mv1-stat__ind{display:inline-flex;gap:.3rem;font-size:.68rem;}

.mv1-hd{display:flex;align-items:center;justify-content:space-between;padding:.6rem .95rem;position:sticky;top:0;z-index:5;background:rgba(4,22,27,.8);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,.06);}
.mv1-hd__menu,.mv1-hd__bell{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.82rem;position:relative;}
.mv1-hd__brand{display:flex;align-items:center;gap:.4rem;color:#fff;text-decoration:none;}
.mv1-hd__brand img{height:26px;border-radius:6px;}
.mv1-hd__brand span{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:.8rem;}
.mv1-hd__brand b{color:#E6C65A;}
.mv1-hd__dot{position:absolute;top:8px;inset-inline-end:9px;width:6px;height:6px;border-radius:50%;background:#E6C65A;box-shadow:0 0 0 2px rgba(4,22,27,.9);}

.mv1-band{display:flex;align-items:center;gap:.5rem;padding:.6rem .95rem;border-bottom:1px solid rgba(255,255,255,.05);}
.mv1-chip{display:inline-flex;align-items:center;gap:.35rem;padding:.3rem .7rem;border-radius:50px;background:rgba(47,133,146,.2);border:1px solid rgba(63,170,187,.3);color:#9FDBE5;font-size:.72rem;font-weight:600;font-family:inherit;}
.mv1-chip__dot{width:5px;height:5px;border-radius:50%;background:#E6C65A;}
.mv1-chip i{font-size:.55rem;opacity:.6;}
.mv1-prog{flex:1;display:flex;align-items:center;gap:.5rem;}
.mv1-prog > span{font-size:.72rem;color:#E6C65A;font-weight:700;}
.mv1-prog__bar{flex:1;height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;}
.mv1-prog__bar span{display:block;height:100%;background:linear-gradient(90deg,#D4AF37,#E6C65A);}
.mv1-prog small{font-size:.68rem;color:rgba(232,241,242,.55);}

.mv1-main{padding:.8rem .8rem 5rem;display:flex;flex-direction:column;gap:.85rem;}

.mv1-video{border-radius:16px;overflow:hidden;padding:5px;box-shadow:0 20px 40px rgba(0,0,0,.4);}
.mv1-video__frame{position:relative;aspect-ratio:16/9;border-radius:11px;overflow:hidden;background:#000;}
.mv1-video__frame img{width:100%;height:100%;object-fit:cover;}
.mv1-video__scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45) 0%,transparent 25%,transparent 65%,rgba(0,0,0,.8) 100%);}
.mv1-video__play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,rgba(230,198,90,.95),rgba(212,175,55,.85));border:1px solid rgba(255,255,255,.3);color:#1a1205;font-size:1.05rem;padding-inline-start:3px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(212,175,55,.45);}
.mv1-video__top{position:absolute;top:0;inset-inline:0;padding:.55rem .65rem;display:flex;align-items:flex-start;justify-content:space-between;color:#fff;}
.mv1-video__mod{font-size:.65rem;font-weight:600;padding:.2rem .55rem;border-radius:50px;background:rgba(0,0,0,.55);backdrop-filter:blur(10px);}
.mv1-video__ic{width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,.5);border:none;color:#fff;font-size:.68rem;backdrop-filter:blur(10px);}
.mv1-video__bar{position:absolute;bottom:0;inset-inline:0;padding:.45rem .65rem;display:flex;align-items:center;gap:.5rem;color:#fff;font-size:.65rem;font-variant-numeric:tabular-nums;}
.mv1-video__track{flex:1;height:3px;background:rgba(255,255,255,.22);border-radius:2px;overflow:hidden;}
.mv1-video__track span{display:block;height:100%;background:linear-gradient(90deg,#D4AF37,#E6C65A);}

.mv1-title{padding:.2rem .25rem;}
.mv1-title h1{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1.1rem;line-height:1.3;letter-spacing:-.01em;margin:0 0 .45rem;text-wrap:balance;}
.mv1-title__by{display:flex;align-items:center;gap:.4rem;font-size:.72rem;color:rgba(232,241,242,.65);}
.mv1-title__by img{width:22px;height:22px;border-radius:50%;}

.mv1-navpill{display:flex;align-items:stretch;gap:.25rem;padding:.25rem;border-radius:14px;}
.mv1-navpill__side{flex:1;display:flex;align-items:center;justify-content:center;gap:.3rem;padding:.55rem .5rem;border-radius:11px;background:rgba(255,255,255,.04);border:none;color:#fff;font-family:inherit;font-size:.72rem;font-weight:600;}
.mv1-navpill__side--next{background:linear-gradient(135deg,rgba(230,198,90,.5),rgba(212,175,55,.35));color:#1a1205;}
.mv1-navpill__side small{font-weight:500;opacity:.8;}
.mv1-navpill__center{width:44px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(230,198,90,.2);border:1px solid rgba(230,198,90,.4);color:#E6C65A;font-size:.85rem;}

.mv1-tabs{display:flex;gap:.4rem;overflow-x:auto;padding:.25rem 0;margin-inline:-.8rem;padding-inline:.8rem;}
.mv1-tabs::-webkit-scrollbar{display:none;}
.mv1-tab{flex-shrink:0;display:inline-flex;align-items:center;gap:.35rem;padding:.55rem .9rem;border-radius:50px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:rgba(232,241,242,.65);font-family:inherit;font-size:.76rem;font-weight:500;white-space:nowrap;}
.mv1-tab.active{background:linear-gradient(135deg,rgba(230,198,90,.75),rgba(212,175,55,.55));color:#1a1205;border-color:rgba(230,198,90,.5);font-weight:600;}
.mv1-tab i{font-size:.72rem;}

.mv1-panel{border-radius:16px;overflow:hidden;}
.mv1-chat-head{display:flex;align-items:center;gap:.6rem;padding:.75rem .85rem;background:rgba(6,34,41,.75);border-bottom:1px solid rgba(255,255,255,.06);}
.mv1-chat-head__av{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#E6C65A,#D4AF37);color:#1a1205;display:flex;align-items:center;justify-content:center;font-size:.85rem;}
.mv1-chat-head__info{flex:1;}
.mv1-chat-head__info strong{display:block;font-size:.82rem;color:#fff;}
.mv1-chat-head__info small{font-size:.66rem;color:rgba(232,241,242,.6);display:inline-flex;align-items:center;gap:.3rem;}
.mv1-dot{width:6px;height:6px;border-radius:50%;background:#00cec9;box-shadow:0 0 0 2px rgba(0,206,201,.25);}
.mv1-chat-head__limit{font-size:.62rem;padding:.2rem .5rem;border-radius:50px;background:rgba(47,133,146,.2);border:1px solid rgba(63,170,187,.25);color:#9FDBE5;font-weight:600;}

.mv1-chat-body{padding:.85rem;display:flex;flex-direction:column;gap:.7rem;}
.mv1-msg{display:flex;gap:.5rem;max-width:92%;}
.mv1-msg__av{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#E6C65A,#D4AF37);color:#1a1205;display:flex;align-items:center;justify-content:center;font-size:.7rem;flex-shrink:0;}
.mv1-msg__bubble{padding:.6rem .85rem;border-radius:12px;border-top-right-radius:4px;font-size:.82rem;line-height:1.55;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:#fff;}
.mv1-sugs{display:flex;flex-wrap:wrap;gap:.35rem;padding-inline-start:34px;}
.mv1-sugs button{padding:.4rem .75rem;border-radius:50px;background:rgba(47,133,146,.15);border:1px solid rgba(63,170,187,.28);color:#9FDBE5;font-family:inherit;font-size:.7rem;}

.mv1-chat-input{display:flex;align-items:center;gap:.4rem;padding:.55rem .55rem .55rem .75rem;border-top:1px solid rgba(255,255,255,.06);background:rgba(4,22,27,.55);}
.mv1-chat-input input{flex:1;padding:.55rem .85rem;border-radius:50px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff;font-family:inherit;font-size:.78rem;outline:none;}
.mv1-chat-input input::placeholder{color:rgba(232,241,242,.45);}
.mv1-chat-input button{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#E6C65A,#D4AF37);color:#1a1205;border:none;font-size:.78rem;display:flex;align-items:center;justify-content:center;}

.mv1-course{border-radius:16px;overflow:hidden;padding:.85rem;display:flex;flex-direction:column;gap:.55rem;}
.mv1-course__hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:.2rem;}
.mv1-course__hd strong{font-size:.88rem;color:#fff;font-weight:600;}
.mv1-course__hd button{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;font-size:.72rem;}

.mv1-hl{display:flex;align-items:center;gap:.6rem;padding:.75rem .85rem;border-radius:11px;background:linear-gradient(135deg,rgba(230,198,90,.22),rgba(212,175,55,.08));border:1px solid rgba(230,198,90,.3);position:relative;}
.mv1-hl i{color:#E6C65A;width:18px;text-align:center;}
.mv1-hl strong{display:block;font-size:.82rem;color:#fff;font-weight:600;}
.mv1-hl small{font-size:.7rem;color:rgba(232,241,242,.65);}
.mv1-hl__badge{margin-inline-start:auto;padding:.15rem .45rem;border-radius:50px;background:#E6C65A;color:#1a1205;font-size:.58rem;font-weight:700;}

.mv1-mod{border-radius:11px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);overflow:hidden;}
.mv1-mod__hd{width:100%;display:flex;align-items:center;gap:.55rem;padding:.7rem .75rem;background:none;border:none;color:#fff;font-family:inherit;text-align:inherit;}
.mv1-mod__num{width:26px;height:26px;border-radius:7px;background:rgba(47,133,146,.3);border:1px solid rgba(63,170,187,.35);display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;color:#9FDBE5;flex-shrink:0;}
.mv1-mod.open .mv1-mod__num{background:linear-gradient(135deg,#E6C65A,#D4AF37);color:#1a1205;border-color:transparent;}
.mv1-mod__txt{flex:1;line-height:1.2;}
.mv1-mod__txt strong{display:block;font-size:.78rem;font-weight:600;}
.mv1-mod__txt small{font-size:.65rem;color:rgba(232,241,242,.55);}
.mv1-mod__hd > i{font-size:.62rem;color:rgba(232,241,242,.5);transition:transform .2s;}
.mv1-mod.open .mv1-mod__hd > i{transform:rotate(180deg);}
.mv1-mod__list{display:none;padding:.15rem .4rem .45rem;flex-direction:column;gap:.15rem;}
.mv1-mod.open .mv1-mod__list{display:flex;}

.mv1-les{display:flex;align-items:center;gap:.5rem;padding:.45rem .55rem;border-radius:8px;font-size:.74rem;}
.mv1-les:hover{background:rgba(255,255,255,.03);}
.mv1-les.active{background:linear-gradient(135deg,rgba(230,198,90,.15),rgba(212,175,55,.04));border:1px solid rgba(230,198,90,.25);}
.mv1-les.done span:not(.mv1-les__num):not(.mv1-les__dur){color:rgba(232,241,242,.55);}
.mv1-les__num{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:.64rem;font-weight:700;flex-shrink:0;color:rgba(232,241,242,.7);}
.mv1-les.done .mv1-les__num{background:#00b894;border-color:#00b894;color:#fff;}
.mv1-les.active .mv1-les__num{background:linear-gradient(135deg,#E6C65A,#D4AF37);border-color:transparent;color:#1a1205;}
.mv1-les > span:nth-child(2){flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;}
.mv1-les__dur{font-size:.62rem;color:rgba(232,241,242,.45);font-variant-numeric:tabular-nums;}

.mv1-ig{display:flex;align-items:center;justify-content:center;gap:.4rem;padding:.75rem;font-size:.72rem;color:rgba(232,241,242,.65);text-align:center;}
.mv1-ig i{font-size:.95rem;background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);-webkit-background-clip:text;background-clip:text;color:transparent;}

.mv1-spacer{height:2rem;}

.mv1-tabbar{position:absolute;bottom:0;inset-inline:0;display:flex;align-items:center;justify-content:space-around;padding:.5rem .6rem calc(.5rem + env(safe-area-inset-bottom));background:rgba(4,22,27,.9);backdrop-filter:blur(24px);border-top:1px solid rgba(255,255,255,.08);}
.mv1-tabbar > button{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.15rem;padding:.35rem;background:none;border:none;color:rgba(232,241,242,.5);font-family:inherit;font-size:.62rem;font-weight:500;}
.mv1-tabbar > button.active{color:#E6C65A;}
.mv1-tabbar > button.active i{background:linear-gradient(135deg,rgba(230,198,90,.2),rgba(212,175,55,.1));padding:.35rem .5rem;border-radius:8px;}
.mv1-tabbar > button i{font-size:.88rem;transition:all .2s;}
.mv1-tabbar__fab{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#E6C65A,#D4AF37) !important;color:#1a1205 !important;border:3px solid #04161b !important;box-shadow:0 8px 22px rgba(212,175,55,.45);font-size:1rem !important;flex:initial !important;transform:translateY(-14px);}

/* ========== MV2 · Cinematic ========== */
.mv2{position:relative;width:100%;height:100%;background:#04161b;font-family:'Heebo',sans-serif;direction:rtl;overflow-y:auto;overflow-x:hidden;color:#fff;}

.mv2-stat{display:flex;align-items:center;justify-content:space-between;padding:.5rem 1.5rem .25rem;font-size:.72rem;font-weight:600;color:#fff;font-variant-numeric:tabular-nums;direction:ltr;position:absolute;top:0;inset-inline:0;z-index:10;}

.mv2-hero{position:relative;height:540px;overflow:hidden;}
.mv2-hero__bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.88);}
.mv2-hero__scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,22,27,.45) 0%,rgba(4,22,27,.1) 22%,rgba(4,22,27,.2) 50%,rgba(4,22,27,.85) 82%,#04161b 100%);}

.mv2-hd{position:relative;z-index:3;display:flex;align-items:center;justify-content:space-between;padding:2rem 1rem 0;}
.mv2-hd__ic{width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.15);color:#fff;backdrop-filter:blur(12px);font-size:.82rem;display:flex;align-items:center;justify-content:center;}
.mv2-hd__progress{position:relative;width:42px;height:42px;}
.mv2-hd__progress svg{width:100%;height:100%;}
.mv2-hd__progress span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.64rem;font-weight:700;color:#E6C65A;}

.mv2-hero__content{position:relative;z-index:3;padding:1rem 1.2rem 1.4rem;margin-top:auto;display:flex;flex-direction:column;gap:.9rem;top:130px;}
.mv2-hero__chips{display:flex;gap:.4rem;flex-wrap:wrap;}
.mv2-chip{display:inline-flex;align-items:center;padding:.3rem .7rem;border-radius:50px;background:rgba(0,0,0,.45);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:.68rem;font-weight:500;}
.mv2-chip--gold{background:linear-gradient(135deg,rgba(230,198,90,.6),rgba(212,175,55,.4));color:#1a1205;border-color:rgba(230,198,90,.5);font-weight:600;}

.mv2-hero__title{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1.7rem;line-height:1.15;letter-spacing:-.01em;margin:0;text-wrap:balance;text-shadow:0 4px 20px rgba(0,0,0,.5);}

.mv2-hero__by{display:flex;align-items:center;gap:.55rem;}
.mv2-hero__by img{width:36px;height:36px;border-radius:50%;border:2px solid rgba(230,198,90,.4);mix-blend-mode:luminosity;}
.mv2-hero__by > div{line-height:1.2;}
.mv2-hero__by strong{display:block;font-size:.82rem;}
.mv2-hero__by small{font-size:.66rem;color:rgba(232,241,242,.7);}

.mv2-hero__cta{
  display:flex;align-items:center;gap:.65rem;
  padding:.55rem 1rem .55rem .55rem;border-radius:50px;
  background:linear-gradient(135deg,rgba(230,198,90,.95),rgba(212,175,55,.85));
  color:#1a1205;border:1px solid rgba(255,255,255,.3);
  font-family:inherit;box-shadow:0 14px 32px rgba(212,175,55,.45);
  margin-top:.3rem;
}
.mv2-hero__cta-ic{width:36px;height:36px;border-radius:50%;background:rgba(26,18,5,.15);display:flex;align-items:center;justify-content:center;font-size:.85rem;padding-inline-start:2px;}
.mv2-hero__cta-txt{flex:1;display:flex;flex-direction:column;align-items:flex-start;line-height:1.15;text-align:start;}
.mv2-hero__cta-txt strong{font-size:.88rem;font-weight:700;}
.mv2-hero__cta-txt small{font-size:.66rem;opacity:.8;}
.mv2-hero__cta-arr{font-size:.75rem;opacity:.7;}

/* Sections */
.mv2-sec{padding:1.4rem 1rem .4rem;}
.mv2-sec__head{margin-bottom:.9rem;}
.mv2-sec__head--row{display:flex;align-items:flex-end;justify-content:space-between;gap:.6rem;}
.mv2-eyebrow{display:inline-block;font-size:.6rem;font-weight:700;color:#E6C65A;text-transform:uppercase;letter-spacing:.14em;margin-bottom:.25rem;}
.mv2-sec__head h2{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1.2rem;line-height:1.25;letter-spacing:-.01em;margin:0;}
.mv2-search-ic{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;font-size:.8rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;}

.mv2-doors{display:grid;grid-template-columns:repeat(2,1fr);gap:.6rem;}
.mv2-door{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:.35rem;padding:.9rem .85rem;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#fff;font-family:inherit;text-align:start;min-height:120px;}
.mv2-door__ic{width:36px;height:36px;border-radius:10px;background:rgba(47,133,146,.28);border:1px solid rgba(63,170,187,.35);color:#9FDBE5;display:flex;align-items:center;justify-content:center;font-size:.92rem;margin-bottom:.15rem;}
.mv2-door--pink .mv2-door__ic{background:rgba(255,105,180,.22);border-color:rgba(255,105,180,.35);font-size:1.05rem;}
.mv2-door--green .mv2-door__ic{background:rgba(37,211,102,.22);border-color:rgba(37,211,102,.4);color:#5ee499;}
.mv2-door--gold{background:linear-gradient(135deg,rgba(212,175,55,.18),rgba(230,198,90,.05));border-color:rgba(230,198,90,.3);}
.mv2-door--gold .mv2-door__ic{background:linear-gradient(135deg,rgba(230,198,90,.35),rgba(212,175,55,.2));border-color:rgba(230,198,90,.5);color:#E6C65A;}
.mv2-door strong{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:.92rem;line-height:1.15;}
.mv2-door small{font-size:.64rem;color:rgba(232,241,242,.6);}
.mv2-door__new{position:absolute;top:8px;inset-inline-start:8px;padding:.1rem .4rem;border-radius:50px;background:#E6C65A;color:#1a1205;font-size:.55rem;font-weight:700;}

.mv2-next{border-radius:16px;overflow:hidden;display:flex;align-items:stretch;gap:.85rem;padding:.7rem;}
.mv2-next__thumb{position:relative;width:100px;flex-shrink:0;border-radius:10px;overflow:hidden;aspect-ratio:16/9;}
.mv2-next__thumb img{width:100%;height:100%;object-fit:cover;}
.mv2-next__dur{position:absolute;bottom:4px;inset-inline-end:4px;padding:.1rem .4rem;border-radius:5px;background:rgba(0,0,0,.75);font-size:.6rem;font-weight:600;}
.mv2-next__body{flex:1;display:flex;flex-direction:column;gap:.2rem;justify-content:center;}
.mv2-next__body strong{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:.88rem;line-height:1.2;}
.mv2-next__body small{font-size:.66rem;color:rgba(232,241,242,.6);line-height:1.45;}
.mv2-next__btn{display:inline-flex;align-items:center;gap:.3rem;padding:.3rem .55rem;margin-top:.3rem;border-radius:8px;background:rgba(230,198,90,.15);border:1px solid rgba(230,198,90,.3);color:#E6C65A;font-size:.7rem;font-weight:600;font-family:inherit;align-self:flex-start;}

.mv2-modlist{display:flex;flex-direction:column;gap:.45rem;}
.mv2-modcard{display:flex;align-items:center;gap:.7rem;padding:.85rem .85rem;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);}
.mv2-modcard.active{background:rgba(230,198,90,.06);border-color:rgba(230,198,90,.25);}
.mv2-modcard__num{width:36px;height:36px;border-radius:10px;background:rgba(47,133,146,.25);border:1px solid rgba(63,170,187,.35);display:flex;align-items:center;justify-content:center;font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1rem;color:#9FDBE5;flex-shrink:0;}
.mv2-modcard.active .mv2-modcard__num{background:linear-gradient(135deg,#E6C65A,#D4AF37);border-color:transparent;color:#1a1205;}
.mv2-modcard__info{flex:1;line-height:1.25;}
.mv2-modcard__info strong{display:block;font-size:.85rem;font-weight:600;}
.mv2-modcard__info small{font-size:.66rem;color:rgba(232,241,242,.6);}
.mv2-modcard__bar{margin-top:.3rem;height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;}
.mv2-modcard__bar span{display:block;height:100%;background:linear-gradient(90deg,#D4AF37,#E6C65A);}

.mv2-tabbar{position:absolute;bottom:0;inset-inline:0;display:flex;align-items:center;justify-content:space-around;padding:.55rem .6rem calc(.55rem + env(safe-area-inset-bottom));background:rgba(4,22,27,.92);backdrop-filter:blur(24px);border-top:1px solid rgba(255,255,255,.08);}
.mv2-tabbar button{flex:1;height:40px;display:flex;align-items:center;justify-content:center;background:none;border:none;color:rgba(232,241,242,.5);font-size:1rem;}
.mv2-tabbar button.active{color:#E6C65A;}
.mv2-tabbar__fab{width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#E6C65A,#D4AF37) !important;color:#1a1205 !important;border:3px solid #04161b !important;box-shadow:0 10px 24px rgba(212,175,55,.5);font-size:1.05rem !important;flex:initial !important;transform:translateY(-14px);}
</style>
`;

  document.getElementById('canvas').insertAdjacentHTML('beforeend', v1m + v2m);
  document.head.insertAdjacentHTML('beforeend', styles);

  // Module toggle
  document.querySelectorAll('#frame-v1-m .mv1-mod__hd').forEach(hd=>{
    hd.addEventListener('click',()=>hd.parentElement.classList.toggle('open'));
  });
})();
