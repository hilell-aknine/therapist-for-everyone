// V3 Bold — Mobile (timeline as a drawer, full-bleed video, huge title)
(function(){
  const v3m = `
<div class="mobile-frame" id="frame-v3-m">
  <div class="device-wrap">
    <div class="device">
      <div class="device__inner">
        <div class="mv3">

          <!-- Status -->
          <div class="mv3-stat"><span>9:41</span><span><i class="fa-solid fa-signal"></i> <i class="fa-solid fa-wifi"></i> <i class="fa-solid fa-battery-three-quarters"></i></span></div>

          <!-- Full bleed video stage -->
          <div class="mv3-stage">
            <img src="https://img.youtube.com/vi/I4r3oERlZpc/maxresdefault.jpg" alt="">
            <div class="mv3-stage__scrim"></div>

            <header class="mv3-hd">
              <button class="mv3-hd__ic"><i class="fa-solid fa-arrow-right"></i></button>
              <div class="mv3-crumbs">
                <span>NLP Practitioner</span>
                <small>מודול 1 · שיעור 2 / 51</small>
              </div>
              <button class="mv3-hd__ic"><i class="fa-solid fa-ellipsis-vertical"></i></button>
            </header>

            <button class="mv3-stage__play"><i class="fa-solid fa-play"></i></button>

            <div class="mv3-stage__bar">
              <span>00:02</span>
              <div class="mv3-stage__track"><span style="width:2%"></span></div>
              <span>21:40</span>
            </div>
          </div>

          <!-- Giant title block -->
          <section class="mv3-titlewrap">
            <div class="mv3-eyebrow"><span class="mv3-eyebrow__dot"></span> שיעור פעיל</div>
            <h1 class="mv3-title">האמונות<br><em>שמסתתרות</em><br>בתת המודע</h1>
            <div class="mv3-author">
              <img src="https://i.pravatar.cc/60?img=12" alt="">
              <div>
                <strong>רם אלוס</strong>
                <small>NLP Master · 21:40 דק</small>
              </div>
            </div>
            <button class="mv3-cta">
              <i class="fa-solid fa-play"></i>
              <span><strong>המשך מ-00:02</strong><small>נעצר לפני 2 שניות</small></span>
              <i class="fa-solid fa-arrow-left"></i>
            </button>

            <div class="mv3-quick">
              <button><i class="fa-regular fa-bookmark"></i> סמן</button>
              <button><i class="fa-solid fa-share-nodes"></i> שתף</button>
              <button><i class="fa-solid fa-download"></i> הורד</button>
            </div>
          </section>

          <!-- Doors strip (horizontal scroll) -->
          <section class="mv3-sec">
            <div class="mv3-sec__head">
              <span class="mv3-eyebrow2">אחרי שצפית</span>
              <h2>העמק ב-5 דרכים</h2>
            </div>
            <div class="mv3-doors">
              <a class="mv3-door">
                <div class="mv3-door__num">01</div>
                <div class="mv3-door__ic"><i class="fa-solid fa-robot"></i></div>
                <strong>המורה האישי</strong>
                <small>100 הודעות/יום</small>
              </a>
              <a class="mv3-door mv3-door--pink">
                <div class="mv3-door__num">02</div>
                <div class="mv3-door__ic">🧠</div>
                <strong>משחק תרגול</strong>
                <small>80+ תרגילים</small>
              </a>
              <a class="mv3-door">
                <div class="mv3-door__num">03</div>
                <div class="mv3-door__ic"><i class="fa-regular fa-pen-to-square"></i></div>
                <strong>הערות</strong>
                <small>נשמר אוטו'</small>
              </a>
              <a class="mv3-door mv3-door--gold">
                <span class="mv3-door__new">חדש</span>
                <div class="mv3-door__num">+</div>
                <div class="mv3-door__ic"><i class="fa-solid fa-heart"></i></div>
                <strong>שותפים</strong>
                <small>הזמן חברים</small>
              </a>
            </div>
          </section>

          <!-- Vertical timeline preview -->
          <section class="mv3-sec">
            <div class="mv3-sec__head mv3-sec__head--row">
              <div>
                <span class="mv3-eyebrow2">ציר הקורס</span>
                <h2>איפה אתה בציר הזמן</h2>
              </div>
              <button class="mv3-open-tl">הכל <i class="fa-solid fa-arrow-left"></i></button>
            </div>

            <div class="mv3-tl">
              <div class="mv3-tl__line"></div>
              <a class="mv3-tn done">
                <span class="mv3-tn__dot done"><i class="fa-solid fa-check"></i></span>
                <div class="mv3-tn__txt"><strong>איך NLP יכול לשנות את חייך?</strong><small>מודול 1 · 20:20</small></div>
              </a>
              <a class="mv3-tn active">
                <span class="mv3-tn__dot active"><i class="fa-solid fa-play"></i></span>
                <div class="mv3-tn__txt"><strong>מהן האמונות שמסתתרות בתת המודע?</strong><small class="live">משודר עכשיו · 21:40</small></div>
              </a>
              <a class="mv3-tn">
                <span class="mv3-tn__dot">3</span>
                <div class="mv3-tn__txt"><strong>מה זה (בכלל) NLP?</strong><small>מודול 1 · 22:10</small></div>
              </a>
              <a class="mv3-tn">
                <span class="mv3-tn__dot">4</span>
                <div class="mv3-tn__txt"><strong>שלוש הנחות יסוד משנות חיים</strong><small>מודול 1 · 27:23</small></div>
              </a>
              <a class="mv3-tn">
                <span class="mv3-tn__dot">5</span>
                <div class="mv3-tn__txt"><strong>מודע, תת מודע ומודל התקשורת</strong><small>מודול 1 · 24:28</small></div>
              </a>
            </div>
          </section>

          <div class="mv1-spacer"></div>

          <nav class="mv3-tabbar">
            <button class="active"><i class="fa-solid fa-play"></i></button>
            <button><i class="fa-solid fa-list-ul"></i></button>
            <button class="mv3-tabbar__fab"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
            <button><i class="fa-solid fa-gamepad"></i></button>
            <button><i class="fa-regular fa-user"></i></button>
          </nav>
        </div>
      </div>
    </div>
  </div>
</div>
`;

  const styles = `
<style>
.mv3{position:relative;width:100%;height:100%;background:#04161b;font-family:'Heebo',sans-serif;direction:rtl;overflow-y:auto;overflow-x:hidden;color:#fff;}

.mv3-stat{display:flex;align-items:center;justify-content:space-between;padding:.5rem 1.5rem .25rem;font-size:.72rem;font-weight:600;color:#fff;font-variant-numeric:tabular-nums;direction:ltr;position:absolute;top:0;inset-inline:0;z-index:10;}

/* Stage */
.mv3-stage{position:relative;aspect-ratio:9/14;max-height:560px;overflow:hidden;}
.mv3-stage > img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.9);}
.mv3-stage__scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,transparent 30%,transparent 55%,rgba(4,22,27,.92) 100%);}

.mv3-hd{position:relative;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:.6rem;padding:2rem 1rem 0;}
.mv3-hd__ic{width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.15);color:#fff;backdrop-filter:blur(12px);font-size:.82rem;flex-shrink:0;}
.mv3-crumbs{flex:1;text-align:center;line-height:1.2;}
.mv3-crumbs span{display:block;font-size:.82rem;font-weight:600;color:#fff;}
.mv3-crumbs small{font-size:.64rem;color:rgba(232,241,242,.65);}

.mv3-stage__play{position:absolute;top:42%;left:50%;transform:translate(-50%,-50%);width:78px;height:78px;border-radius:50%;background:linear-gradient(135deg,rgba(230,198,90,.95),rgba(212,175,55,.82));border:2px solid rgba(255,255,255,.3);color:#1a1205;font-size:1.4rem;padding-inline-start:4px;display:flex;align-items:center;justify-content:center;box-shadow:0 16px 38px rgba(212,175,55,.5);z-index:3;}
.mv3-stage__bar{position:absolute;bottom:0;inset-inline:0;z-index:3;padding:0 1rem 1rem;display:flex;align-items:center;gap:.55rem;color:#fff;font-size:.68rem;font-variant-numeric:tabular-nums;}
.mv3-stage__track{flex:1;height:4px;background:rgba(255,255,255,.22);border-radius:3px;overflow:hidden;}
.mv3-stage__track span{display:block;height:100%;background:linear-gradient(90deg,#D4AF37,#E6C65A);box-shadow:0 0 8px rgba(230,198,90,.6);}

/* Title */
.mv3-titlewrap{padding:1.25rem 1.1rem .25rem;}
.mv3-eyebrow{display:inline-flex;align-items:center;gap:.4rem;padding:.3rem .7rem;border-radius:50px;background:rgba(230,198,90,.14);border:1px solid rgba(230,198,90,.3);color:#E6C65A;font-size:.62rem;font-weight:700;letter-spacing:.06em;margin-bottom:.85rem;}
.mv3-eyebrow__dot{width:6px;height:6px;border-radius:50%;background:#E6C65A;box-shadow:0 0 0 3px rgba(230,198,90,.25);animation:pulse 2s infinite;}
.mv3-title{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:2.3rem;line-height:.98;letter-spacing:-.02em;margin:0 0 1.1rem;text-wrap:balance;}
.mv3-title em{font-style:italic;background:linear-gradient(135deg,#E6C65A,#D4AF37);-webkit-background-clip:text;background-clip:text;color:transparent;}

.mv3-author{display:flex;align-items:center;gap:.55rem;margin-bottom:.9rem;padding-bottom:.9rem;border-bottom:1px solid rgba(255,255,255,.08);}
.mv3-author img{width:36px;height:36px;border-radius:50%;border:2px solid rgba(230,198,90,.35);}
.mv3-author strong{display:block;font-size:.82rem;}
.mv3-author small{font-size:.66rem;color:rgba(232,241,242,.6);}

.mv3-cta{
  width:100%;display:flex;align-items:center;gap:.6rem;padding:.6rem 1rem .6rem .6rem;
  border-radius:14px;background:linear-gradient(135deg,rgba(230,198,90,.95),rgba(212,175,55,.82));
  color:#1a1205;border:1px solid rgba(255,255,255,.3);font-family:inherit;
  box-shadow:0 14px 32px rgba(212,175,55,.4);
}
.mv3-cta > i:first-child{width:36px;height:36px;border-radius:50%;background:rgba(26,18,5,.15);display:flex;align-items:center;justify-content:center;font-size:.85rem;padding-inline-start:2px;}
.mv3-cta > span{flex:1;display:flex;flex-direction:column;align-items:flex-start;line-height:1.15;text-align:start;}
.mv3-cta strong{font-size:.88rem;font-weight:700;}
.mv3-cta small{font-size:.66rem;opacity:.8;}
.mv3-cta > i:last-child{font-size:.75rem;opacity:.7;}

.mv3-quick{display:flex;gap:.4rem;margin-top:.7rem;}
.mv3-quick button{flex:1;padding:.5rem;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff;font-family:inherit;font-size:.72rem;display:inline-flex;align-items:center;justify-content:center;gap:.3rem;}

/* Section scaffolding */
.mv3-sec{padding:1.4rem 1.1rem .4rem;}
.mv3-sec__head{margin-bottom:.85rem;}
.mv3-sec__head--row{display:flex;align-items:flex-end;justify-content:space-between;gap:.6rem;}
.mv3-eyebrow2{display:inline-block;font-size:.6rem;font-weight:700;color:#E6C65A;letter-spacing:.14em;text-transform:uppercase;margin-bottom:.3rem;}
.mv3-sec__head h2{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1.35rem;line-height:1.2;letter-spacing:-.015em;margin:0;}

.mv3-open-tl{padding:.35rem .7rem;border-radius:50px;background:rgba(230,198,90,.12);border:1px solid rgba(230,198,90,.3);color:#E6C65A;font-family:inherit;font-size:.7rem;font-weight:600;display:inline-flex;align-items:center;gap:.25rem;}

/* Doors — horizontal scroll */
.mv3-doors{display:flex;gap:.6rem;overflow-x:auto;margin-inline:-1.1rem;padding:.25rem 1.1rem;}
.mv3-doors::-webkit-scrollbar{display:none;}
.mv3-door{position:relative;flex-shrink:0;width:160px;padding:.95rem;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#fff;text-decoration:none;display:flex;flex-direction:column;gap:.3rem;}
.mv3-door__num{position:absolute;top:.65rem;inset-inline-end:.85rem;font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:1.35rem;color:rgba(255,255,255,.12);line-height:1;}
.mv3-door__ic{width:34px;height:34px;border-radius:10px;background:rgba(47,133,146,.25);border:1px solid rgba(63,170,187,.35);color:#9FDBE5;display:flex;align-items:center;justify-content:center;font-size:.9rem;margin-bottom:.4rem;}
.mv3-door--pink .mv3-door__ic{background:rgba(255,105,180,.2);border-color:rgba(255,105,180,.35);font-size:1.05rem;}
.mv3-door--gold{background:linear-gradient(135deg,rgba(212,175,55,.2),rgba(230,198,90,.04));border-color:rgba(230,198,90,.3);}
.mv3-door--gold .mv3-door__ic{background:linear-gradient(135deg,rgba(230,198,90,.3),rgba(212,175,55,.15));border-color:rgba(230,198,90,.4);color:#E6C65A;}
.mv3-door__new{position:absolute;top:.65rem;inset-inline-start:.65rem;padding:.1rem .4rem;border-radius:50px;background:#E6C65A;color:#1a1205;font-size:.55rem;font-weight:700;}
.mv3-door strong{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:.9rem;line-height:1.15;margin-top:.15rem;}
.mv3-door small{font-size:.64rem;color:rgba(232,241,242,.6);}

/* Timeline */
.mv3-tl{position:relative;padding-inline-start:24px;}
.mv3-tl__line{position:absolute;top:12px;bottom:12px;inset-inline-start:11px;width:2px;background:linear-gradient(180deg,rgba(230,198,90,.4),rgba(230,198,90,.06));}
.mv3-tn{display:flex;align-items:center;gap:.7rem;padding:.45rem 0;color:#fff;text-decoration:none;position:relative;}
.mv3-tn__dot{position:absolute;inset-inline-start:-24px;width:22px;height:22px;border-radius:50%;background:#0c2f36;border:2px solid rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;color:rgba(232,241,242,.6);}
.mv3-tn__dot.done{background:#00b894;border-color:#00b894;color:#fff;font-size:.52rem;}
.mv3-tn__dot.active{background:linear-gradient(135deg,#E6C65A,#D4AF37);border-color:#04161b;color:#1a1205;font-size:.5rem;padding-inline-start:1px;box-shadow:0 0 0 3px rgba(230,198,90,.25);}
.mv3-tn__txt{flex:1;padding:.55rem .7rem;border-radius:10px;line-height:1.25;}
.mv3-tn.active .mv3-tn__txt{background:linear-gradient(135deg,rgba(230,198,90,.12),rgba(212,175,55,.02));border:1px solid rgba(230,198,90,.25);}
.mv3-tn__txt strong{display:block;font-size:.8rem;font-weight:500;}
.mv3-tn.done .mv3-tn__txt strong{color:rgba(232,241,242,.55);}
.mv3-tn.active .mv3-tn__txt strong{color:#fff;font-weight:600;}
.mv3-tn__txt small{font-size:.64rem;color:rgba(232,241,242,.5);}
.mv3-tn__txt small.live{color:#E6C65A;font-weight:600;}

/* Tabbar */
.mv3-tabbar{position:absolute;bottom:0;inset-inline:0;display:flex;align-items:center;justify-content:space-around;padding:.55rem .6rem calc(.55rem + env(safe-area-inset-bottom));background:rgba(4,22,27,.92);backdrop-filter:blur(24px);border-top:1px solid rgba(255,255,255,.08);}
.mv3-tabbar button{flex:1;height:40px;display:flex;align-items:center;justify-content:center;background:none;border:none;color:rgba(232,241,242,.5);font-size:1rem;}
.mv3-tabbar button.active{color:#E6C65A;}
.mv3-tabbar__fab{width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#E6C65A,#D4AF37) !important;color:#1a1205 !important;border:3px solid #04161b !important;box-shadow:0 10px 24px rgba(212,175,55,.5);font-size:1.05rem !important;flex:initial !important;transform:translateY(-14px);}
</style>
`;

  document.getElementById('canvas').insertAdjacentHTML('beforeend', v3m);
  document.head.insertAdjacentHTML('beforeend', styles);
})();
