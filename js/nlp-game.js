// nlp-game.js — NLP Game Engine for Beit HaMetaplim Portal
// Based on StoryGame — uses Auth from supabase-client.js

const HEART_RECOVERY_MINUTES = 20;

// ═══════════════════════════════════════
// Sound Manager (Web Audio API)
// ═══════════════════════════════════════
class SoundManager {
    constructor() {
        this.enabled = localStorage.getItem('nlpGameSound') !== 'off';
        this.ctx = null;
    }

    getContext() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.ctx;
    }

    play(type) {
        if (!this.enabled) return;
        try {
            const ctx = this.getContext();
            if (ctx.state === 'suspended') ctx.resume();
            switch (type) {
                case 'correct': this._playCorrect(ctx); break;
                case 'wrong': this._playWrong(ctx); break;
                case 'levelUp': this._playLevelUp(ctx); break;
                case 'achievement': this._playAchievement(ctx); break;
                case 'click': this._playClick(ctx); break;
            }
        } catch (e) { /* audio not supported */ }
    }

    _playTone(ctx, freq, duration, type = 'sine', gain = 0.3) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.value = gain;
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    }

    _playCorrect(ctx) {
        this._playTone(ctx, 523, 0.15, 'sine', 0.2);
        setTimeout(() => this._playTone(ctx, 659, 0.15, 'sine', 0.2), 100);
        setTimeout(() => this._playTone(ctx, 784, 0.2, 'sine', 0.25), 200);
    }

    _playWrong(ctx) {
        this._playTone(ctx, 200, 0.3, 'triangle', 0.2);
    }

    _playLevelUp(ctx) {
        [523, 587, 659, 784, 880].forEach((f, i) => {
            setTimeout(() => this._playTone(ctx, f, 0.2, 'sine', 0.2), i * 100);
        });
    }

    _playAchievement(ctx) {
        [784, 988, 1175].forEach((f, i) => {
            setTimeout(() => this._playTone(ctx, f, 0.25, 'sine', 0.15), i * 150);
        });
    }

    _playClick(ctx) {
        this._playTone(ctx, 600, 0.05, 'sine', 0.1);
    }

    toggle() {
        this.enabled = !this.enabled;
        localStorage.setItem('nlpGameSound', this.enabled ? 'on' : 'off');
        return this.enabled;
    }
}

// ═══════════════════════════════════════
// Main Game Class
// ═══════════════════════════════════════
class NlpGame {
    constructor() {
        this.currentScreen = 'home';
        this.currentModule = null;
        this.currentLesson = null;
        this.currentExerciseIndex = 0;
        this.selectedAnswer = null;
        this.exerciseAnswered = false;
        this.isDailyChallenge = false;
        this.lessonMistakes = 0;
        this.onboardingStep = 0;
        this.saveDebounceTimer = null;
        this.heartTimerInterval = null;
        this.userMenuOpen = false;
        this.user = null;

        // Managers
        this.sound = new SoundManager();

        // Player data
        this.playerData = this.getDefaultPlayerData();

        // Story builder
        this.storyBuilderData = { currentStep: 0, answers: {} };

        // Story steps
        this.storySteps = [
            { id: 'target', title: 'שלב 1: קהל היעד', question: 'למי הסיפור הזה מיועד? תארו את הלקוח האידיאלי שלכם.', hint: 'חשבו: מה הכאב שלהם? מה הם מחפשים?', example: 'מאמנות עסקיות בתחילת הדרך שיודעות שהן טובות אבל מתקשות למכור את עצמן.', mentorMessage: 'הכרת קהל היעד היא הבסיס לכל סיפור טוב.' },
            { id: 'before', title: 'שלב 2: הלפני - הכאב', question: 'תארו את המצב של הלקוח לפני שפגש אתכם.', hint: 'השתמשו בתיאורים רגשיים וספציפיים.', example: 'היא הייתה יושבת מול המחשב שעות, כל מילה הרגישה מזויפת.', mentorMessage: 'ככל שתתארו את הכאב בצורה מדויקת, הקהל ירגיש "היא מבינה אותי".' },
            { id: 'turning', title: 'שלב 3: נקודת המפנה', question: 'מה היה הרגע שבו משהו השתנה?', hint: 'פגישה, תובנה, או אירוע מסוים.', example: 'בפגישה השלישית שאלתי אותה: "מה היית אומרת לחברה הכי טובה שלך?"', mentorMessage: 'נקודת המפנה היא הלב של הסיפור.' },
            { id: 'after', title: 'שלב 4: האחרי - השינוי', question: 'מה השתנה? איך נראים החיים היום?', hint: 'מספרים, הרגשות, שינויים קונקרטיים.', example: 'היום יש לה 12 לקוחות קבועים וכותבת פוסטים בהנאה.', mentorMessage: 'ה"אחרי" צריך להיות ספציפי ומדיד.' },
            { id: 'message', title: 'שלב 5: המסר והקריאה לפעולה', question: 'מה המסר המרכזי? ומה הצעד הבא?', hint: 'משפט אחד חזק + קריאה לפעולה ספציפית.', example: 'אם גם את מרגישה ככה - את לא לבד. אני מזמינה אותך לשיחת היכרות.', mentorMessage: 'סיום חזק = לקוחות שפועלים!' }
        ];

        // Mentor messages
        this.mentorMessages = {
            welcome: [
                "היי! אני גל, ואני כאן ללוות אותך בדרך להפוך לסטוריטלר מעולה!",
                "ברוכים הבאים! אני גל, המנטור שלך לסיפורים שמושכים לקוחות.",
                "שמח לראות אותך! יחד נלמד ליצור סיפורים שמשנים עסקים."
            ],
            moduleIntro: {
                1: "פתיחה טובה היא חצי מהדרך! בואו נלמד איך לגרום לקהל לרצות לשמוע עוד.",
                2: "סיפורי טרנספורמציה של לקוחות הם הכלי השיווקי החזק ביותר. מוכנים?",
                3: "פגיעות היא לא חולשה - היא סופר-פאוור! בואו נלמד להשתמש בה.",
                4: "נקודת המפנה היא הרגע הקסום שבו הקהל מבין שהשינוי אפשרי.",
                5: "סיום חזק = לקוחות שפועלים. זה השיעור האחרון והוא קריטי!"
            },
            lessonStart: ["מעולה! בואו נתחיל.", "אני לצידך בכל שלב. בהצלחה!", "כל תשובה נכונה מקרבת אתכם!"],
            correctAnswer: ["מדהים! בדיוק ככה!", "וואו, את/ה תופס/ת את זה!", "נכון מאוד!", "יופי! את/ה בדרך הנכונה!", "מצוין!"],
            wrongAnswer: ["לא נורא! טעויות הן חלק מהלמידה.", "קרוב! בפעם הבאה חשבו מה היה מושך אתכם.", "לא בדיוק, אבל הזדמנות ללמוד!", "אל דאגה, גם אני טעיתי בהתחלה!"],
            encouragement: ["את/ה עושה עבודה נהדרת!", "כל תרגיל מקרב אותך!", "אני גאה בך!", "המשיכו ככה!"],
            lessonComplete: ["איזה כיף! סיימת שיעור נוסף!", "מעולה! עוד צעד לקראת סיפורים מעולים!", "אלופים! הידע הזה ישנה לכם את השיווק!"]
        };

        // Achievements
        this.achievements = [
            { id: 'first_lesson', title: 'צעד ראשון', desc: 'סיימת את השיעור הראשון', icon: '🎯', condition: (d) => Object.keys(d.completedLessons).length >= 1 },
            { id: 'five_lessons', title: 'בדרך הנכונה', desc: 'סיימת 5 שיעורים', icon: '📚', condition: (d) => Object.keys(d.completedLessons).length >= 5 },
            { id: 'all_lessons', title: 'מאסטר', desc: 'סיימת את כל השיעורים', icon: '👑', condition: (d) => Object.keys(d.completedLessons).length >= 15 },
            { id: 'streak_3', title: 'התמדה', desc: '3 ימים ברצף', icon: '🔥', condition: (d) => d.streak >= 3 },
            { id: 'streak_7', title: 'שבוע של הצלחה', desc: '7 ימים ברצף', icon: '⭐', condition: (d) => d.streak >= 7 },
            { id: 'xp_500', title: 'צובר נקודות', desc: 'צברת 500 XP', icon: '🏅', condition: (d) => d.xp >= 500 },
            { id: 'xp_1000', title: 'אלוף XP', desc: 'צברת 1000 XP', icon: '🏆', condition: (d) => d.xp >= 1000 },
            { id: 'first_story', title: 'סיפור ראשון', desc: 'יצרת סיפור בתרגול חופשי', icon: '✍️', condition: (d) => d.storiesCreated >= 1 },
            { id: 'perfect_lesson', title: 'מושלם!', desc: 'סיימת שיעור בלי טעויות', icon: '💯', condition: (d) => d.perfectLessons >= 1 },
            { id: 'accuracy_80', title: 'דיוק גבוה', desc: 'דיוק של 80% ומעלה', icon: '🎯', condition: (d) => d.totalCorrectAnswers > 0 && (d.totalCorrectAnswers / (d.totalCorrectAnswers + d.totalWrongAnswers)) >= 0.8 }
        ];

        this.initRipple();
        this.initAuth();
    }

    // ═══════════════════════════════════════
    // Ripple Effect
    // ═══════════════════════════════════════
    initRipple() {
        document.addEventListener('click', (e) => {
            const target = e.target.closest('.btn, .option-btn, .word-chip, .compare-card, .home-path-node:not(.locked), .path-node:not(.locked)');
            if (!target) return;
            const ripple = document.createElement('span');
            ripple.className = 'ripple-effect';
            const rect = target.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
            ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
            target.style.position = target.style.position || 'relative';
            target.style.overflow = 'hidden';
            target.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    }

    // ═══════════════════════════════════════
    // Auth Flow (uses portal's Auth module)
    // ═══════════════════════════════════════
    async initAuth() {
        document.getElementById('game-loading-screen').style.display = 'flex';

        try {
            const session = await Auth.getSession();
            if (session && session.user) {
                this.user = session.user;
                await this.onAuthSuccess(session.user);
            } else {
                // Not logged in — redirect to portal with message
                window.location.href = 'free-portal.html?msg=login_required';
                return;
            }
        } catch (e) {
            console.warn('Auth check failed', e);
            window.location.href = 'free-portal.html?msg=login_required';
        }
    }

    async onAuthSuccess(user) {
        await this.loadPlayerData(user);

        document.getElementById('game-loading-screen').style.display = 'none';
        document.getElementById('game-app-header').style.display = 'block';
        document.getElementById('game-main-content').style.display = 'block';
        document.getElementById('game-progress-wrapper').style.display = 'block';

        // Update user email
        const emailEl = document.getElementById('game-user-menu-email');
        if (emailEl) emailEl.textContent = user.email || 'משתמש';

        // Sound toggle
        const soundEl = document.getElementById('game-sound-toggle');
        if (soundEl) soundEl.textContent = this.sound.enabled ? '🔊' : '🔇';

        this.updateStreak();
        this.recoverHearts();
        this.updateStatsDisplay();
        this.startHeartTimer();

        if (!this.playerData.onboardingComplete) {
            this.showOnboarding();
        } else {
            this.renderHomeScreen();
        }
    }

    // ═══════════════════════════════════════
    // Data Persistence (Supabase + localStorage)
    // ═══════════════════════════════════════
    getDefaultPlayerData() {
        return {
            xp: 0, level: 1, hearts: 5, maxHearts: 5, streak: 0,
            lastPlayDate: null, lastHeartLost: null,
            completedLessons: {}, moduleProgress: {},
            achievements: [], totalCorrectAnswers: 0, totalWrongAnswers: 0,
            storiesCreated: 0, perfectLessons: 0,
            dailyChallengeCompleted: null, reviewQueue: [], lastReviewDate: null,
            onboardingComplete: false, longestStreak: 0,
            weeklyActivity: {}, moduleAccuracy: {}, perfectLessonsList: []
        };
    }

    async loadPlayerData(user) {
        if (user) {
            try {
                const { data, error } = await window.supabaseClient
                    .from('story_game_players')
                    .select('*')
                    .eq('user_id', user.id)
                    .single();

                if (data && !error) {
                    this.playerData = {
                        xp: data.xp || 0, level: data.level || 1,
                        hearts: data.hearts || 5, maxHearts: data.max_hearts || 5,
                        streak: data.streak || 0,
                        lastPlayDate: data.last_play_date || null,
                        lastHeartLost: data.last_heart_lost || null,
                        completedLessons: data.completed_lessons || {},
                        moduleProgress: {},
                        achievements: data.achievements || [],
                        totalCorrectAnswers: data.total_correct || 0,
                        totalWrongAnswers: data.total_wrong || 0,
                        storiesCreated: data.stories_created || 0,
                        perfectLessons: data.perfect_lessons || 0,
                        dailyChallengeCompleted: data.daily_challenge_completed || null,
                        reviewQueue: [], lastReviewDate: null,
                        onboardingComplete: true,
                        longestStreak: 0, weeklyActivity: {}, moduleAccuracy: {},
                        perfectLessonsList: []
                    };
                    localStorage.setItem('nlpGameData', JSON.stringify(this.playerData));
                    return;
                }

                // No DB row — check localStorage
                const local = this.loadFromLocalStorage();
                if (local && Object.keys(local.completedLessons).length > 0) {
                    this.playerData = local;
                    await this.createSupabaseRow(user);
                    return;
                }

                // Brand new user
                this.playerData = this.getDefaultPlayerData();
                await this.createSupabaseRow(user);
            } catch (e) {
                console.warn('Supabase load failed, using localStorage', e);
                this.playerData = this.loadFromLocalStorage() || this.getDefaultPlayerData();
            }
        }
    }

    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('nlpGameData');
            if (saved) return JSON.parse(saved);
        } catch (e) { /* ignore */ }
        return null;
    }

    async createSupabaseRow(user) {
        if (!user) return;
        try {
            await window.supabaseClient.from('story_game_players').upsert({
                user_id: user.id,
                xp: this.playerData.xp, level: this.playerData.level,
                hearts: this.playerData.hearts, max_hearts: this.playerData.maxHearts,
                streak: this.playerData.streak,
                last_play_date: this.playerData.lastPlayDate,
                last_heart_lost: this.playerData.lastHeartLost,
                completed_lessons: this.playerData.completedLessons,
                achievements: this.playerData.achievements,
                total_correct: this.playerData.totalCorrectAnswers,
                total_wrong: this.playerData.totalWrongAnswers,
                stories_created: this.playerData.storiesCreated,
                perfect_lessons: this.playerData.perfectLessons,
                daily_challenge_completed: this.playerData.dailyChallengeCompleted
            }, { onConflict: 'user_id' });
        } catch (e) { console.warn('Failed to create Supabase row', e); }
    }

    savePlayerData() {
        localStorage.setItem('nlpGameData', JSON.stringify(this.playerData));
        if (this.user) {
            clearTimeout(this.saveDebounceTimer);
            this.saveDebounceTimer = setTimeout(() => this.saveToSupabase(), 1000);
        }
    }

    async saveToSupabase() {
        if (!this.user) return;
        try {
            await window.supabaseClient.from('story_game_players').update({
                xp: this.playerData.xp, level: this.playerData.level,
                hearts: this.playerData.hearts, max_hearts: this.playerData.maxHearts,
                streak: this.playerData.streak,
                last_play_date: this.playerData.lastPlayDate,
                last_heart_lost: this.playerData.lastHeartLost,
                completed_lessons: this.playerData.completedLessons,
                achievements: this.playerData.achievements,
                total_correct: this.playerData.totalCorrectAnswers,
                total_wrong: this.playerData.totalWrongAnswers,
                stories_created: this.playerData.storiesCreated,
                perfect_lessons: this.playerData.perfectLessons,
                daily_challenge_completed: this.playerData.dailyChallengeCompleted,
                updated_at: new Date().toISOString()
            }).eq('user_id', this.user.id);
        } catch (e) { console.warn('Supabase save failed', e); }
    }

    // ═══════════════════════════════════════
    // Heart Recovery
    // ═══════════════════════════════════════
    recoverHearts() {
        if (this.playerData.hearts >= this.playerData.maxHearts) {
            this.playerData.lastHeartLost = null;
            return;
        }
        if (!this.playerData.lastHeartLost) return;
        const lostTime = new Date(this.playerData.lastHeartLost).getTime();
        const elapsed = Date.now() - lostTime;
        const recovered = Math.floor(elapsed / (HEART_RECOVERY_MINUTES * 60 * 1000));
        if (recovered > 0) {
            this.playerData.hearts = Math.min(this.playerData.maxHearts, this.playerData.hearts + recovered);
            if (this.playerData.hearts >= this.playerData.maxHearts) {
                this.playerData.lastHeartLost = null;
            } else {
                this.playerData.lastHeartLost = new Date(lostTime + recovered * HEART_RECOVERY_MINUTES * 60 * 1000).toISOString();
            }
            this.savePlayerData();
        }
    }

    startHeartTimer() {
        if (this.heartTimerInterval) clearInterval(this.heartTimerInterval);
        this.heartTimerInterval = setInterval(() => this.updateHeartTimer(), 1000);
        this.updateHeartTimer();
    }

    updateHeartTimer() {
        const bar = document.getElementById('game-heart-timer-bar');
        if (this.playerData.hearts >= this.playerData.maxHearts || !this.playerData.lastHeartLost) {
            bar.style.display = 'none';
            return;
        }
        bar.style.display = 'block';
        const lostTime = new Date(this.playerData.lastHeartLost).getTime();
        const elapsed = Date.now() - lostTime;
        const totalMs = HEART_RECOVERY_MINUTES * 60 * 1000;
        const remaining = totalMs - (elapsed % totalMs);
        const progress = ((totalMs - remaining) / totalMs) * 100;
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        document.getElementById('game-heart-timer-text').textContent = `❤️ +1 בעוד ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        document.getElementById('game-heart-timer-fill').style.width = progress + '%';
        if (elapsed >= totalMs) { this.recoverHearts(); this.updateStatsDisplay(); }
    }

    // ═══════════════════════════════════════
    // Onboarding
    // ═══════════════════════════════════════
    showOnboarding() {
        this.onboardingStep = 0;
        document.getElementById('game-onboarding-overlay').style.display = 'flex';
        this.renderOnboardingStep();
    }

    renderOnboardingStep() {
        const steps = [
            { icon: '🎯', title: 'ברוכים הבאים למשחק NLP!', text: 'כאן תלמדו ליצור סיפורים שמושכים לקוחות - צעד אחרי צעד, בדרך כיפית ואינטראקטיבית.' },
            { icon: '👨‍🏫', title: 'הכירו את גל, המנטור שלכם', text: 'גל ילווה אתכם בכל שלב — ייתן טיפים, עידוד, ויעזור לכם להבין מה הופך סיפור לכלי שיווקי חזק.' },
            { icon: '🚀', title: 'בואו נתחיל!', text: 'תרגלו תרגילים, צברו XP, שמרו על סטריק יומי ופתחו הישגים. מוכנים?' }
        ];
        const step = steps[this.onboardingStep];
        document.getElementById('game-onboarding-step-content').innerHTML = `<span class="onboarding-icon">${step.icon}</span><h2>${step.title}</h2><p>${step.text}</p>`;
        document.getElementById('game-onboarding-dots').innerHTML = steps.map((_, i) => `<div class="onboarding-dot ${i < this.onboardingStep ? 'done' : ''} ${i === this.onboardingStep ? 'active' : ''}"></div>`).join('');
        document.getElementById('game-onboarding-btn').textContent = this.onboardingStep === steps.length - 1 ? 'בואו נתחיל! 🎉' : 'הבא';
    }

    nextOnboardingStep() {
        this.sound.play('click');
        this.onboardingStep++;
        if (this.onboardingStep >= 3) {
            document.getElementById('game-onboarding-overlay').style.display = 'none';
            this.playerData.onboardingComplete = true;
            this.savePlayerData();
            this.renderHomeScreen();
        } else {
            this.renderOnboardingStep();
        }
    }

    // ═══════════════════════════════════════
    // Screen Transitions
    // ═══════════════════════════════════════
    transitionTo(renderFn) {
        const container = document.getElementById('game-container');
        container.classList.add('fade-out');
        setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'instant' });
            renderFn.call(this);
            container.classList.remove('fade-out');
        }, 200);
    }

    toggleSound() {
        const enabled = this.sound.toggle();
        document.getElementById('game-sound-toggle').textContent = enabled ? '🔊' : '🔇';
        if (enabled) this.sound.play('click');
    }

    toggleUserMenu() {
        this.userMenuOpen = !this.userMenuOpen;
        document.getElementById('game-user-menu').style.display = this.userMenuOpen ? 'block' : 'none';
        if (this.userMenuOpen) {
            setTimeout(() => {
                const handler = (e) => {
                    if (!e.target.closest('.game-user-menu') && !e.target.closest('.game-user-menu-btn')) {
                        this.hideUserMenu();
                        document.removeEventListener('click', handler);
                    }
                };
                document.addEventListener('click', handler);
            }, 10);
        }
    }

    hideUserMenu() {
        this.userMenuOpen = false;
        document.getElementById('game-user-menu').style.display = 'none';
    }

    async logout() {
        try { await Auth.signOut(); } catch (e) { /* ignore */ }
        window.location.href = 'free-portal.html';
    }

    // ═══════════════════════════════════════
    // Mentor HTML
    // ═══════════════════════════════════════
    createMentorHTML(message, showName = true, mood = 'idle') {
        return `
            <div class="mentor-container">
                <div class="mentor-avatar mentor-${mood}">
                    <img src="../assets/mentor-gal.png" alt="גל" />
                </div>
                <div class="mentor-bubble">
                    ${showName ? '<div class="mentor-name">גל - המנטור שלך</div>' : ''}
                    <div class="mentor-message">${message}</div>
                </div>
            </div>
        `;
    }

    animateMentor(mood) {
        const avatar = document.querySelector('.mentor-avatar');
        if (!avatar) return;
        avatar.className = 'mentor-avatar';
        void avatar.offsetWidth;
        avatar.classList.add(`mentor-${mood}`);
    }

    getRandomMessage(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // ═══════════════════════════════════════
    // Streak
    // ═══════════════════════════════════════
    updateStreak() {
        const today = new Date().toDateString();
        const lastPlay = this.playerData.lastPlayDate;
        if (lastPlay) {
            const lastDate = new Date(lastPlay);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            if (lastPlay === today) { /* already played */ }
            else if (lastDate.toDateString() === yesterday.toDateString()) {
                this.playerData.streak++;
                this.playerData.lastPlayDate = today;
                this.savePlayerData();
            } else {
                this.playerData.streak = 1;
                this.playerData.lastPlayDate = today;
                this.savePlayerData();
            }
        } else {
            this.playerData.streak = 1;
            this.playerData.lastPlayDate = today;
            this.savePlayerData();
        }
        if (this.playerData.streak > (this.playerData.longestStreak || 0)) {
            this.playerData.longestStreak = this.playerData.streak;
            this.savePlayerData();
        }
    }

    // ═══════════════════════════════════════
    // Stats Display
    // ═══════════════════════════════════════
    updateStatsDisplay() {
        document.getElementById('game-xp-value').textContent = this.playerData.xp;
        document.getElementById('game-streak-value').textContent = this.playerData.streak;
        this.renderHearts();
    }

    renderHearts() {
        const container = document.getElementById('game-hearts-container');
        let html = '';
        for (let i = 0; i < this.playerData.maxHearts; i++) {
            html += `<span class="heart ${i >= this.playerData.hearts ? 'empty' : ''}">❤️</span>`;
        }
        container.innerHTML = html;
    }

    calculateLevel() {
        const thresholds = [0, 100, 250, 500, 1000, 2000, 4000, 8000];
        for (let i = thresholds.length - 1; i >= 0; i--) {
            if (this.playerData.xp >= thresholds[i]) return i + 1;
        }
        return 1;
    }

    getLevelName(level) {
        return ['מתחיל', 'מספר סיפורים', 'מעורר השראה', 'מחבר קהל', 'מומחה שיווק', 'אמן סטוריטלינג', 'מגנט לקוחות', 'אגדה'][level - 1] || 'אגדה';
    }

    getLevelProgressInfo() {
        const thresholds = [0, 100, 250, 500, 1000, 2000, 4000, 8000];
        const cur = this.playerData.level;
        const xp = this.playerData.xp;
        const curT = thresholds[cur - 1] || 0;
        const nextT = thresholds[cur] || thresholds[thresholds.length - 1];
        const progress = Math.min(100, ((xp - curT) / (nextT - curT)) * 100);
        return { progress, xpToNext: Math.max(0, nextT - xp), currentXP: xp, nextThreshold: nextT };
    }

    // ═══════════════════════════════════════
    // Achievements
    // ═══════════════════════════════════════
    renderAchievementsGrid() {
        return this.achievements.slice(0, 8).map(a => {
            const unlocked = this.playerData.achievements.includes(a.id);
            return `<div class="achievement-item ${unlocked ? 'unlocked' : 'locked'}"><div class="achievement-icon">${a.icon}</div><div class="achievement-name">${a.title}</div></div>`;
        }).join('');
    }

    checkAchievements() {
        let newOnes = [];
        this.achievements.forEach(a => {
            if (!this.playerData.achievements.includes(a.id) && a.condition(this.playerData)) {
                this.playerData.achievements.push(a.id);
                newOnes.push(a);
            }
        });
        if (newOnes.length > 0) {
            this.savePlayerData();
            this.showAchievementPopup(newOnes[0]);
        }
    }

    showAchievementPopup(achievement) {
        this.sound.play('achievement');
        const popup = document.createElement('div');
        popup.className = 'achievement-popup';
        popup.innerHTML = `<div class="achievement-popup-icon">${achievement.icon}</div><div><div class="achievement-popup-title">הישג חדש!</div><div class="achievement-popup-name">${achievement.title}</div><div class="achievement-popup-desc">${achievement.desc}</div></div>`;
        document.body.appendChild(popup);
        setTimeout(() => popup.classList.add('show'), 100);
        setTimeout(() => { popup.classList.remove('show'); setTimeout(() => popup.remove(), 500); }, 3000);
    }

    // ═══════════════════════════════════════
    // Daily Challenge
    // ═══════════════════════════════════════
    startDailyChallenge() {
        const today = new Date().toDateString();
        if (this.playerData.dailyChallengeCompleted === today) return;
        const available = MODULES.filter((m, i) => i === 0 || this.getModuleProgress(MODULES[i - 1].id) >= 50);
        if (available.length === 0) { this.transitionTo(() => this.openModule(1)); return; }
        this.isDailyChallenge = true;
        this.dailyChallengeExercisesLeft = 3;
        const mod = available[Math.floor(Math.random() * available.length)];
        this.transitionTo(() => this.openModule(mod.id));
    }

    completeDailyChallenge() {
        this.playerData.dailyChallengeCompleted = new Date().toDateString();
        this.addXP(50);
        this.savePlayerData();
        this.isDailyChallenge = false;
        const modal = document.getElementById('game-modal-overlay');
        document.getElementById('game-modal-icon').textContent = '🎯';
        document.getElementById('game-modal-title').textContent = 'אתגר יומי הושלם!';
        document.getElementById('game-modal-text').textContent = 'קיבלת +50 XP בונוס! חזרו מחר לאתגר חדש.';
        document.getElementById('game-modal-buttons').innerHTML = `<button class="btn btn-primary" onclick="game.closeModal()">מעולה!</button>`;
        modal.classList.add('show');
    }

    // ═══════════════════════════════════════
    // Home Screen
    // ═══════════════════════════════════════
    renderHomeScreen() {
        this.currentScreen = 'home';
        const container = document.getElementById('game-container');
        const welcomeMsg = this.getRandomMessage(this.mentorMessages.welcome);
        const levelInfo = this.getLevelProgressInfo();
        const dcDone = this.playerData.dailyChallengeCompleted === new Date().toDateString();

        let pathNodesHtml = '';
        // Daily challenge
        pathNodesHtml += `<div class="home-path-node special" onclick="game.startDailyChallenge()"><div class="home-path-icon">${dcDone ? '✅' : '🎯'}</div><div class="home-path-info"><div class="home-path-label">אתגר יומי</div><div class="home-path-title">${dcDone ? 'הושלם היום!' : 'השלימו 3 תרגילים'}</div><div class="home-path-desc">${dcDone ? 'כל הכבוד! חזרו מחר' : 'קבלו בונוס XP!'}</div></div><div class="home-path-arrow">${dcDone ? '' : '←'}</div></div>`;
        // Story builder
        pathNodesHtml += `<div class="home-path-node special" onclick="game.transitionTo(function(){game.startStoryBuilder()})"><div class="home-path-icon">✍️</div><div class="home-path-info"><div class="home-path-label">תרגול חופשי</div><div class="home-path-title">בנה סיפור</div><div class="home-path-desc">צרו סיפור שלם עם ליווי של גל</div></div><div class="home-path-arrow">←</div></div>`;

        const prevLocked = this._prevLocked || [];
        const curLocked = [];

        MODULES.forEach((mod, i) => {
            const progress = this.getModuleProgress(mod.id);
            const done = progress === 100;
            const locked = i > 0 && this.getModuleProgress(MODULES[i - 1].id) < 50;
            const perfect = this.playerData.perfectLessonsList && mod.lessons && mod.lessons.every(l => this.playerData.perfectLessonsList.includes(`${mod.id}-${l.id}`));
            if (locked) curLocked.push(mod.id);
            const justUnlocked = prevLocked.includes(mod.id) && !locked;
            let cls = 'available', icon = mod.icon;
            if (locked) { cls = 'locked'; icon = '🔒'; }
            else if (perfect) { cls = 'completed'; icon = '⭐'; }
            else if (done) { cls = 'completed'; icon = '✅'; }
            if (justUnlocked) cls += ' just-unlocked';
            pathNodesHtml += `<div class="home-path-node ${cls}" onclick="${locked ? '' : `game.transitionTo(function(){game.openModule(${mod.id})})`}"><div class="home-path-icon">${icon}</div><div class="home-path-info"><div class="home-path-label">מודול ${i + 1}</div><div class="home-path-title">${mod.title}</div><div class="home-path-desc">${mod.description}</div><div class="home-path-progress"><div class="home-path-progress-bar"><div class="home-path-progress-fill" style="width:${progress}%"></div></div><span class="home-path-progress-text">${progress}%</span></div></div><div class="home-path-arrow">${locked ? '' : '←'}</div></div>`;
        });

        const totalProg = MODULES.reduce((s, m) => s + this.getModuleProgress(m.id), 0);
        const overallProg = Math.round(totalProg / MODULES.length);
        pathNodesHtml += `<div class="home-path-node goal" style="cursor:default"><div class="home-path-icon">🏆</div><div class="home-path-info"><div class="home-path-label">יעד</div><div class="home-path-title">מאסטר הסטוריטלינג</div><div class="home-path-desc">השלימו את כל המודולים</div><div class="home-path-progress"><div class="home-path-progress-bar"><div class="home-path-progress-fill" style="width:${overallProg}%"></div></div><span class="home-path-progress-text">${overallProg}%</span></div></div></div>`;

        container.innerHTML = `
            ${this.createMentorHTML(welcomeMsg, true, 'wave')}
            <div class="level-progress-container">
                <div class="level-info"><div class="level-current"><span class="level-badge">רמה ${this.playerData.level}</span><span class="level-name">${this.getLevelName(this.playerData.level)}</span></div><span class="level-next">${levelInfo.xpToNext} XP לרמה הבאה</span></div>
                <div class="level-progress-bar"><div class="level-progress-fill" style="width:${levelInfo.progress}%"></div></div>
                <div class="level-xp-text"><span>${levelInfo.currentXP} XP</span><span>${levelInfo.nextThreshold} XP</span></div>
            </div>
            <div class="home-journey"><div class="home-path-container">${pathNodesHtml}</div></div>
            <div class="achievements-section"><div class="achievements-title">🏆 הישגים</div><div class="achievements-grid">${this.renderAchievementsGrid()}</div></div>
        `;
        this._prevLocked = curLocked;
        this.hideProgressBar();
        this.hideFooter();
    }

    // ═══════════════════════════════════════
    // Story Builder
    // ═══════════════════════════════════════
    startStoryBuilder() {
        this.currentScreen = 'storyBuilder';
        this.storyBuilderData = { currentStep: 0, answers: {} };
        this.renderStoryBuilderStep();
    }

    renderStoryBuilderStep() {
        const container = document.getElementById('game-container');
        const step = this.storySteps[this.storyBuilderData.currentStep];
        const total = this.storySteps.length;
        const cur = this.storyBuilderData.currentStep;
        let dots = '';
        for (let i = 0; i < total; i++) dots += `<div class="story-step-dot ${i < cur ? 'completed' : ''} ${i === cur ? 'active' : ''}"></div>`;
        const saved = this.storyBuilderData.answers[step.id] || '';
        container.innerHTML = `<div class="story-builder"><button class="back-btn" onclick="game.exitStoryBuilder()">✕</button><div class="story-steps">${dots}</div>${this.createMentorHTML(step.mentorMessage)}<div class="story-step-content"><div class="story-step-title">${step.title}</div><div class="story-step-question">${step.question}</div><textarea class="story-textarea" id="story-answer" placeholder="${step.hint}" oninput="game.updateStoryAnswer('${step.id}')">${saved}</textarea><div class="story-example"><div class="story-example-label">💡 דוגמה:</div><div class="story-example-text">${step.example}</div></div></div><div class="story-nav"><div class="container">${cur > 0 ? '<button class="btn btn-secondary" onclick="game.prevStoryStep()">← הקודם</button>' : '<div></div>'}${cur < total - 1 ? '<button class="btn btn-primary" onclick="game.nextStoryStep()">הבא →</button>' : '<button class="btn btn-primary" onclick="game.showStoryPreview()">סיום ותצוגה מקדימה</button>'}</div></div></div>`;
        this.hideProgressBar();
    }

    updateStoryAnswer(stepId) { this.storyBuilderData.answers[stepId] = document.getElementById('story-answer').value; }

    nextStoryStep() {
        this.sound.play('click');
        this.updateStoryAnswer(this.storySteps[this.storyBuilderData.currentStep].id);
        if (this.storyBuilderData.currentStep < this.storySteps.length - 1) {
            this.storyBuilderData.currentStep++;
            this.transitionTo(() => this.renderStoryBuilderStep());
        }
    }

    prevStoryStep() {
        this.sound.play('click');
        this.updateStoryAnswer(this.storySteps[this.storyBuilderData.currentStep].id);
        if (this.storyBuilderData.currentStep > 0) {
            this.storyBuilderData.currentStep--;
            this.transitionTo(() => this.renderStoryBuilderStep());
        }
    }

    showStoryPreview() {
        this.updateStoryAnswer(this.storySteps[this.storyBuilderData.currentStep].id);
        const container = document.getElementById('game-container');
        const a = this.storyBuilderData.answers;
        container.innerHTML = `<div class="story-builder"><button class="back-btn" onclick="game.transitionTo(function(){game.renderStoryBuilderStep()})">← חזרה לעריכה</button>${this.createMentorHTML('וואו! יצרת סיפור שלם! העתיקו אותו והשתמשו בשיווק שלכם.')}<div class="story-preview"><div class="story-preview-title">🎯 הסיפור שלך</div><div class="story-preview-section"><div class="story-preview-label">קהל היעד</div><div class="story-preview-text">${a.target || ''}</div></div><div class="story-preview-section"><div class="story-preview-label">הלפני - הכאב</div><div class="story-preview-text">${a.before || ''}</div></div><div class="story-preview-section"><div class="story-preview-label">נקודת המפנה</div><div class="story-preview-text">${a.turning || ''}</div></div><div class="story-preview-section"><div class="story-preview-label">האחרי - השינוי</div><div class="story-preview-text">${a.after || ''}</div></div><div class="story-preview-section"><div class="story-preview-label">המסר וקריאה לפעולה</div><div class="story-preview-text">${a.message || ''}</div></div></div><div class="story-complete-actions"><button class="btn btn-primary copy-btn btn-full" onclick="game.copyStory()">📋 העתק את הסיפור</button><button class="btn btn-secondary btn-full" onclick="game.transitionTo(function(){game.startStoryBuilder()})">✍️ התחל סיפור חדש</button><button class="btn btn-secondary btn-full" onclick="game.transitionTo(function(){game.renderHomeScreen()})">🏠 חזרה לתפריט</button></div></div>`;
        this.playerData.storiesCreated = (this.playerData.storiesCreated || 0) + 1;
        this.savePlayerData();
        this.addXP(100);
        this.checkAchievements();
    }

    copyStory() {
        const a = this.storyBuilderData.answers;
        const text = `📌 קהל היעד:\n${a.target || ''}\n\n😔 הלפני - הכאב:\n${a.before || ''}\n\n⚡ נקודת המפנה:\n${a.turning || ''}\n\n🌟 האחרי - השינוי:\n${a.after || ''}\n\n🎯 המסר וקריאה לפעולה:\n${a.message || ''}`;
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.querySelector('.copy-btn');
            const orig = btn.innerHTML;
            btn.innerHTML = '✅ הועתק!';
            setTimeout(() => { btn.innerHTML = orig; }, 2000);
        });
    }

    exitStoryBuilder() {
        const modal = document.getElementById('game-modal-overlay');
        document.getElementById('game-modal-icon').textContent = '✍️';
        document.getElementById('game-modal-title').textContent = 'לצאת מבניית הסיפור?';
        document.getElementById('game-modal-text').textContent = 'הסיפור שלך יישמר.';
        document.getElementById('game-modal-buttons').innerHTML = `<button class="btn btn-secondary" onclick="game.closeModalAndStay()">להישאר</button><button class="btn btn-danger" onclick="game.confirmExitStoryBuilder()">לצאת</button>`;
        modal.classList.add('show');
    }

    confirmExitStoryBuilder() {
        document.getElementById('game-modal-overlay').classList.remove('show');
        this.transitionTo(() => this.renderHomeScreen());
    }

    // ═══════════════════════════════════════
    // Module Progress & Screen
    // ═══════════════════════════════════════
    getModuleProgress(moduleId) {
        const mod = MODULES.find(m => m.id === moduleId);
        if (!mod) return 0;
        const total = mod.lessons.length;
        let done = 0;
        mod.lessons.forEach(l => { if (this.playerData.completedLessons[`${moduleId}-${l.id}`]) done++; });
        return Math.round((done / total) * 100);
    }

    openModule(moduleId) {
        this.currentModule = MODULES.find(m => m.id === moduleId);
        if (!this.currentModule) return;
        this.currentScreen = 'module';
        const container = document.getElementById('game-container');
        const introMsg = this.mentorMessages.moduleIntro[moduleId] || "בואו נתחיל!";
        const perfectList = this.playerData.perfectLessonsList || [];
        const completedCount = this.currentModule.lessons.filter(l => this.playerData.completedLessons[`${moduleId}-${l.id}`]).length;
        const totalCount = this.currentModule.lessons.length;
        const pct = Math.round((completedCount / totalCount) * 100);

        let pathHtml = this.currentModule.lessons.map((lesson, index) => {
            const key = `${moduleId}-${lesson.id}`;
            const isDone = this.playerData.completedLessons[key];
            const isPerfect = perfectList.includes(key);
            const isLocked = index > 0 && !this.playerData.completedLessons[`${moduleId}-${this.currentModule.lessons[index - 1].id}`];
            let cls = 'locked', icon = '🔒', onclick = '';
            if (isPerfect) { cls = 'perfect'; icon = '⭐'; onclick = `onclick="game.startLesson(${lesson.id})"`; }
            else if (isDone) { cls = 'completed'; icon = '✅'; onclick = `onclick="game.startLesson(${lesson.id})"`; }
            else if (!isLocked) { cls = 'available'; icon = '▶️'; onclick = `onclick="game.startLesson(${lesson.id})"`; }
            return `<div class="path-node-row">${index < this.currentModule.lessons.length - 1 ? '<div class="path-connector"></div>' : ''}<div class="path-node ${cls}" ${onclick}><div class="path-node-icon">${icon}</div><div class="path-node-info"><div class="path-node-number">שיעור ${index + 1}</div><div class="path-node-title">${lesson.title}</div></div></div></div>`;
        }).join('');

        container.innerHTML = `
            <button class="back-btn" onclick="game.transitionTo(function(){game.renderHomeScreen()})">→ חזרה</button>
            <div class="learning-path-header"><h2>${this.currentModule.icon} ${this.currentModule.title}</h2><div class="learning-path-progress"><span>${completedCount}/${totalCount} שיעורים</span><div class="learning-path-progress-bar"><div class="learning-path-progress-fill" style="width:${pct}%"></div></div></div></div>
            <div class="module-intro">${this.createMentorHTML(introMsg)}</div>
            <div class="learning-path">${pathHtml}</div>
        `;
        this.hideProgressBar();
        this.hideFooter();
    }

    // ═══════════════════════════════════════
    // Lesson & Exercise
    // ═══════════════════════════════════════
    startLesson(lessonId) {
        this.currentLesson = this.currentModule.lessons.find(l => l.id === lessonId);
        if (!this.currentLesson) return;
        if (this.playerData.hearts <= 0) { this.showNoHeartsModal(); return; }
        this.currentScreen = 'exercise';
        this.currentExerciseIndex = 0;
        this.lessonMistakes = 0;
        this.showProgressBar();
        this.renderExercise();
    }

    renderExercise() {
        const exercise = this.currentLesson.exercises[this.currentExerciseIndex];
        if (!exercise) { this.completeLesson(); return; }
        this.selectedAnswer = null;
        this.exerciseAnswered = false;
        this.updateProgressBar();
        const container = document.getElementById('game-container');
        switch (exercise.type) {
            case 'multiple-choice': this.renderMultipleChoice(container, exercise); break;
            case 'fill-blank': this.renderFillBlank(container, exercise); break;
            case 'order': this.renderOrder(container, exercise); break;
            case 'identify': this.renderIdentify(container, exercise); break;
            case 'compare': this.renderCompare(container, exercise); break;
            case 'improve': this.renderImprove(container, exercise); break;
            case 'match': this.renderMatch(container, exercise); break;
        }
        this.showFooter();
        if (exercise.type === 'order') this.enableCheckButton();
    }

    createExerciseTip(type) {
        const tips = {
            'multiple-choice': "💡 חשבו מה היה מושך אתכם כלקוחות",
            'fill-blank': "💡 המילה הנכונה יוצרת את הרגש החזק ביותר",
            'order': "💡 חשבו על המסע של הקהל",
            'identify': "💡 חפשו את החלק שגורם להרגיש משהו",
            'compare': "💡 דמיינו את עצמכם כלקוח",
            'improve': "💡 חפשו רגש, ספציפיות או חיבור אישי",
            'match': "💡 חפשו את הקשר הלוגי"
        };
        return tips[type] || "";
    }

    renderMultipleChoice(container, exercise) {
        const letters = ['א', 'ב', 'ג', 'ד'];
        const tip = this.createExerciseTip('multiple-choice');
        container.innerHTML = `<button class="back-btn" onclick="game.exitLesson()">✕</button><div class="exercise-container"><div class="exercise-type">בחירה מרובה</div><div class="exercise-question">${exercise.question}</div><div class="options-list">${exercise.options.map((o, i) => `<button class="option-btn" onclick="game.selectOption(${i})"><span class="option-letter">${letters[i]}</span><span>${o}</span></button>`).join('')}</div><div class="mentor-tip"><img class="mentor-tip-icon" src="../assets/mentor-gal.png" alt="גל" /><span class="mentor-tip-text">${tip}</span></div></div>`;
    }

    selectOption(index) {
        if (this.exerciseAnswered) return;
        this.sound.play('click');
        this.selectedAnswer = index;
        document.querySelectorAll('.option-btn').forEach((btn, i) => btn.classList.toggle('selected', i === index));
        this.enableCheckButton();
    }

    renderFillBlank(container, exercise) {
        const tmpl = exercise.template.replace('___', '<span class="blank-slot" id="blank-slot">___</span>');
        const tip = this.createExerciseTip('fill-blank');
        const words = this.shuffleArray([...exercise.options]).map((w) => `<button class="word-chip" data-word-index="${exercise.options.indexOf(w)}" onclick="game.selectWord(this)">${w}</button>`).join('');
        container.innerHTML = `<button class="back-btn" onclick="game.exitLesson()">✕</button><div class="exercise-container"><div class="exercise-type">השלמת משפט</div><div class="exercise-question">${exercise.question}</div><div class="fill-blank-container"><div class="template-text">${tmpl}</div><div class="word-bank">${words}</div></div><div class="mentor-tip"><img class="mentor-tip-icon" src="../assets/mentor-gal.png" alt="גל" /><span class="mentor-tip-text">${tip}</span></div></div>`;
    }

    selectWord(el) {
        if (this.exerciseAnswered) return;
        this.sound.play('click');
        this.selectedAnswer = parseInt(el.dataset.wordIndex);
        document.getElementById('blank-slot').textContent = el.textContent;
        document.getElementById('blank-slot').classList.add('filled');
        document.querySelectorAll('.word-chip').forEach(c => c.classList.toggle('selected', c === el));
        this.enableCheckButton();
    }

    renderOrder(container, exercise) {
        const shuffled = this.shuffleArray([...exercise.items].map((item, i) => ({ item, originalIndex: i })));
        const tip = this.createExerciseTip('order');
        container.innerHTML = `<button class="back-btn" onclick="game.exitLesson()">✕</button><div class="exercise-container"><div class="exercise-type">סידור לפי סדר</div><div class="exercise-question">${exercise.question}</div><div class="order-container" id="order-container">${shuffled.map((o, i) => `<div class="order-item" draggable="true" data-index="${i}" data-original="${o.originalIndex}" ondragstart="game.dragStart(event)" ondragover="game.dragOver(event)" ondrop="game.drop(event)" ondragend="game.dragEnd(event)" ontouchstart="game.touchStart(event)" ontouchmove="game.touchMove(event)" ontouchend="game.touchEnd(event)"><span class="order-number">${i + 1}</span><span>${o.item}</span><span class="drag-handle">⋮⋮</span></div>`).join('')}</div><div class="mentor-tip"><img class="mentor-tip-icon" src="../assets/mentor-gal.png" alt="גל" /><span class="mentor-tip-text">${tip}</span></div></div>`;
        this.enableCheckButton();
    }

    dragStart(e) { e.target.classList.add('dragging'); e.dataTransfer.setData('text/plain', e.target.dataset.index); }
    dragOver(e) { e.preventDefault(); const item = e.target.closest('.order-item'); if (item && !item.classList.contains('dragging')) item.classList.add('drag-over'); }
    drop(e) {
        e.preventDefault();
        const container = document.getElementById('order-container');
        const dragging = container.querySelector('.dragging');
        const target = e.target.closest('.order-item');
        if (target && dragging && target !== dragging) {
            const items = [...container.children];
            if (items.indexOf(dragging) < items.indexOf(target)) target.after(dragging);
            else target.before(dragging);
            this.updateOrderNumbers();
        }
        document.querySelectorAll('.order-item').forEach(i => i.classList.remove('drag-over'));
    }
    dragEnd(e) { e.target.classList.remove('dragging'); document.querySelectorAll('.order-item').forEach(i => i.classList.remove('drag-over')); }
    touchStart(e) { const item = e.target.closest('.order-item'); if (!item) return; this.touchDragItem = item; this.touchStartY = e.touches[0].clientY; item.classList.add('dragging'); }
    touchMove(e) {
        if (!this.touchDragItem) return;
        e.preventDefault();
        const y = e.touches[0].clientY;
        const container = document.getElementById('order-container');
        const items = [...container.querySelectorAll('.order-item:not(.dragging)')];
        for (const item of items) {
            const rect = item.getBoundingClientRect();
            if (y < rect.top + rect.height / 2) { container.insertBefore(this.touchDragItem, item); this.updateOrderNumbers(); break; }
            if (item === items[items.length - 1] && y >= rect.top + rect.height / 2) { container.appendChild(this.touchDragItem); this.updateOrderNumbers(); }
        }
    }
    touchEnd() { if (this.touchDragItem) { this.touchDragItem.classList.remove('dragging'); this.touchDragItem = null; } }
    updateOrderNumbers() { document.querySelectorAll('.order-item').forEach((item, i) => item.querySelector('.order-number').textContent = i + 1); }

    renderIdentify(container, exercise) {
        const tip = this.createExerciseTip('identify');
        container.innerHTML = `<button class="back-btn" onclick="game.exitLesson()">✕</button><div class="exercise-container"><div class="exercise-type">זיהוי בטקסט</div><div class="exercise-question">${exercise.question}</div><div class="identify-instructions">סמנו את החלק הרלוונטי בטקסט</div><div class="identify-text" id="identify-text" onmouseup="game.handleTextSelection()" ontouchend="setTimeout(function(){game.handleTextSelection()},100)">${exercise.text}</div><div class="mentor-tip"><img class="mentor-tip-icon" src="../assets/mentor-gal.png" alt="גל" /><span class="mentor-tip-text">${tip}</span></div></div>`;
        this.enableCheckButton();
    }

    handleTextSelection() {
        if (this.exerciseAnswered) return;
        const sel = window.getSelection();
        const text = sel.toString().trim();
        if (text.length > 0) {
            const container = document.getElementById('identify-text');
            const range = sel.getRangeAt(0);
            const start = this.getTextOffset(container, range.startContainer, range.startOffset);
            const end = start + text.length;
            this.selectedAnswer = { start, end, text };
            const full = container.textContent;
            container.innerHTML = `${full.substring(0, start)}<span class="highlight">${full.substring(start, end)}</span>${full.substring(end)}`;
            this.enableCheckButton();
        }
    }

    getTextOffset(container, node, offset) {
        let total = 0;
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        while (walker.nextNode()) { if (walker.currentNode === node) return total + offset; total += walker.currentNode.textContent.length; }
        return total + offset;
    }

    renderCompare(container, exercise) {
        const tip = this.createExerciseTip('compare');
        container.innerHTML = `<button class="back-btn" onclick="game.exitLesson()">✕</button><div class="exercise-container"><div class="exercise-type">איזה חזק יותר?</div><div class="exercise-question">${exercise.question}</div><div class="compare-cards"><div class="compare-card" onclick="game.selectCompare(0)"><div class="compare-label">${exercise.optionA.label}</div><div class="compare-text">${exercise.optionA.text}</div></div><div class="compare-vs">VS</div><div class="compare-card" onclick="game.selectCompare(1)"><div class="compare-label">${exercise.optionB.label}</div><div class="compare-text">${exercise.optionB.text}</div></div></div><div class="mentor-tip"><img class="mentor-tip-icon" src="../assets/mentor-gal.png" alt="גל" /><span class="mentor-tip-text">${tip}</span></div></div>`;
    }

    selectCompare(index) {
        if (this.exerciseAnswered) return;
        this.sound.play('click');
        this.selectedAnswer = index;
        document.querySelectorAll('.compare-card').forEach((c, i) => c.classList.toggle('selected', i === index));
        this.enableCheckButton();
    }

    renderImprove(container, exercise) {
        const tip = this.createExerciseTip('improve');
        const letters = ['א', 'ב', 'ג', 'ד'];
        container.innerHTML = `<button class="back-btn" onclick="game.exitLesson()">✕</button><div class="exercise-container"><div class="exercise-type">שפר את הסיפור</div><div class="exercise-question">${exercise.question}</div><div class="improve-original"><div class="improve-original-label">המשפט המקורי:</div><div class="improve-original-text">${exercise.original}</div></div><div class="options-list">${exercise.options.map((o, i) => `<button class="option-btn" onclick="game.selectOption(${i})"><span class="option-letter">${letters[i]}</span><span>${o}</span></button>`).join('')}</div><div class="mentor-tip"><img class="mentor-tip-icon" src="../assets/mentor-gal.png" alt="גל" /><span class="mentor-tip-text">${tip}</span></div></div>`;
    }

    renderMatch(container, exercise) {
        const tip = this.createExerciseTip('match');
        this.matchState = { selectedLeft: null, selectedRight: null, matches: [], pairs: exercise.pairs };
        const shuffledRight = this.shuffleArray(exercise.pairs.map((p, i) => ({ text: p.right, originalIndex: i })));
        const leftHtml = exercise.pairs.map((p, i) => `<div class="match-item match-left" data-index="${i}" onclick="game.selectMatchItem('left',${i})">${p.left}</div>`).join('');
        const rightHtml = shuffledRight.map(item => `<div class="match-item match-right" data-index="${item.originalIndex}" onclick="game.selectMatchItem('right',${item.originalIndex})">${item.text}</div>`).join('');
        container.innerHTML = `<button class="back-btn" onclick="game.exitLesson()">✕</button><div class="exercise-container"><div class="exercise-type">התאמה</div><div class="exercise-question">${exercise.question}</div><div class="match-instructions">לחצו על פריט משמאל ואז על המתאים מימין</div><div class="match-container"><div class="match-column">${leftHtml}</div><div class="match-column">${rightHtml}</div></div><div class="mentor-tip"><img class="mentor-tip-icon" src="../assets/mentor-gal.png" alt="גל" /><span class="mentor-tip-text">${tip}</span></div></div>`;
    }

    selectMatchItem(side, index) {
        if (this.exerciseAnswered) return;
        if (this.matchState.matches.some(m => m[side === 'left' ? 0 : 1] === index)) return;
        this.sound.play('click');
        if (side === 'left') {
            document.querySelectorAll('.match-left').forEach(el => el.classList.remove('selected'));
            this.matchState.selectedLeft = index;
            document.querySelector(`.match-left[data-index="${index}"]`).classList.add('selected');
        } else {
            document.querySelectorAll('.match-right').forEach(el => el.classList.remove('selected'));
            this.matchState.selectedRight = index;
            document.querySelector(`.match-right[data-index="${index}"]`).classList.add('selected');
        }
        if (this.matchState.selectedLeft !== null && this.matchState.selectedRight !== null) {
            const colors = ['#D4AF37', '#2F8592', '#00606B', '#003B46', '#E65100'];
            const color = colors[this.matchState.matches.length % colors.length];
            this.matchState.matches.push([this.matchState.selectedLeft, this.matchState.selectedRight]);
            const leftEl = document.querySelector(`.match-left[data-index="${this.matchState.selectedLeft}"]`);
            const rightEl = document.querySelector(`.match-right[data-index="${this.matchState.selectedRight}"]`);
            leftEl.classList.remove('selected'); rightEl.classList.remove('selected');
            leftEl.classList.add('matched'); rightEl.classList.add('matched');
            leftEl.style.borderColor = color; rightEl.style.borderColor = color;
            leftEl.style.background = color + '15'; rightEl.style.background = color + '15';
            this.matchState.selectedLeft = null; this.matchState.selectedRight = null;
            if (this.matchState.matches.length === this.matchState.pairs.length) this.enableCheckButton();
        }
    }

    // ═══════════════════════════════════════
    // Answer Checking
    // ═══════════════════════════════════════
    checkAnswer() {
        if (this.exerciseAnswered) return;
        const exercise = this.currentLesson.exercises[this.currentExerciseIndex];
        let isCorrect = false;
        switch (exercise.type) {
            case 'multiple-choice': isCorrect = this.selectedAnswer === exercise.correct; this.showMultipleChoiceFeedback(isCorrect, exercise); break;
            case 'fill-blank': isCorrect = this.selectedAnswer === exercise.correct; this.showFillBlankFeedback(isCorrect, exercise); break;
            case 'order': isCorrect = this.checkOrderAnswer(exercise); this.showOrderFeedback(isCorrect); break;
            case 'identify': isCorrect = this.checkIdentifyAnswer(exercise); this.showIdentifyFeedback(isCorrect, exercise); break;
            case 'compare': isCorrect = this.selectedAnswer === exercise.correct; this.showCompareFeedback(isCorrect, exercise); break;
            case 'improve': isCorrect = this.selectedAnswer === exercise.correct; this.showMultipleChoiceFeedback(isCorrect, exercise); break;
            case 'match': isCorrect = this.matchState.matches.every(([l, r]) => l === r); this.showMatchFeedback(isCorrect); break;
        }
        this.exerciseAnswered = true;
        if (isCorrect) {
            this.sound.play('correct');
            this.playerData.totalCorrectAnswers = (this.playerData.totalCorrectAnswers || 0) + 1;
            this.addXP(10);
            this.createStarBurst();
            if (navigator.vibrate) navigator.vibrate(50);
        } else {
            this.sound.play('wrong');
            this.playerData.totalWrongAnswers = (this.playerData.totalWrongAnswers || 0) + 1;
            this.lessonMistakes++;
            this.loseHeart();
            if (navigator.vibrate) navigator.vibrate([100, 30, 100]);
        }
        this.updateExerciseStats(isCorrect, this.currentModule.id);
        this.showFeedback(isCorrect, exercise.explanation);
        this.savePlayerData();
    }

    checkOrderAnswer(exercise) { return JSON.stringify([...document.querySelectorAll('.order-item')].map(i => parseInt(i.dataset.original))) === JSON.stringify(exercise.correctOrder); }
    checkIdentifyAnswer(exercise) {
        if (!this.selectedAnswer) return false;
        const [cs, ce] = exercise.correctRange;
        const { start, end } = this.selectedAnswer;
        const overlap = Math.max(0, Math.min(end, ce) - Math.max(start, cs));
        return overlap / (end - start) >= 0.6 && overlap / (ce - cs) >= 0.4;
    }

    showMultipleChoiceFeedback(isCorrect, exercise) {
        document.querySelectorAll('.option-btn').forEach((btn, i) => {
            if (i === exercise.correct) btn.classList.add('correct');
            else if (i === this.selectedAnswer && !isCorrect) btn.classList.add('incorrect');
        });
    }

    showFillBlankFeedback(isCorrect, exercise) {
        const slot = document.getElementById('blank-slot');
        if (slot) slot.classList.add(isCorrect ? 'correct' : 'incorrect');
        const correctWord = exercise.options[exercise.correct];
        document.querySelectorAll('.word-chip').forEach(c => {
            if (c.textContent === correctWord) c.classList.add('correct');
            else if (c.classList.contains('selected') && !isCorrect) c.classList.add('incorrect');
        });
        if (!isCorrect && slot) setTimeout(() => { slot.textContent = correctWord; slot.classList.remove('incorrect'); slot.classList.add('correct'); }, 800);
    }

    showOrderFeedback(isCorrect) { document.querySelectorAll('.order-item').forEach(i => i.style.borderColor = isCorrect ? 'var(--t-success)' : 'var(--t-danger)'); }
    showIdentifyFeedback(isCorrect, exercise) {
        const container = document.getElementById('identify-text');
        if (isCorrect) { container.querySelector('.highlight')?.classList.add('correct-highlight'); }
        else {
            container.querySelector('.highlight')?.classList.add('incorrect-highlight');
            const [cs, ce] = exercise.correctRange;
            setTimeout(() => { container.innerHTML = `${exercise.text.substring(0, cs)}<span class="highlight correct-highlight">${exercise.text.substring(cs, ce)}</span>${exercise.text.substring(ce)}`; }, 500);
        }
    }
    showCompareFeedback(isCorrect, exercise) {
        document.querySelectorAll('.compare-card').forEach((c, i) => {
            if (i === exercise.correct) c.classList.add('correct');
            else if (i === this.selectedAnswer && !isCorrect) c.classList.add('incorrect');
        });
    }
    showMatchFeedback(isCorrect) {
        document.querySelectorAll('.match-item').forEach(i => {
            i.style.borderColor = isCorrect ? 'var(--t-success)' : 'var(--t-danger)';
            i.style.background = isCorrect ? 'rgba(0,184,148,0.08)' : 'rgba(248,81,73,0.08)';
        });
    }

    showFeedback(isCorrect, explanation) {
        const panel = document.getElementById('game-feedback-panel');
        panel.className = `game-feedback-panel show ${isCorrect ? 'correct' : 'incorrect'}`;
        const mentorMsg = isCorrect ? this.getRandomMessage(this.mentorMessages.correctAnswer) : this.getRandomMessage(this.mentorMessages.wrongAnswer);
        document.getElementById('game-feedback-icon').textContent = isCorrect ? '🎉' : '😅';
        document.getElementById('game-feedback-title').textContent = mentorMsg;
        this.animateMentor(isCorrect ? 'happy' : 'sad');

        const exercise = this.currentLesson.exercises[this.currentExerciseIndex];
        let html = '';
        if (!isCorrect && exercise.wrongExplanations && this.selectedAnswer !== null) {
            const wrongExp = exercise.wrongExplanations[this.selectedAnswer];
            const selText = this.getSelectedAnswerText(exercise);
            const corText = this.getCorrectAnswerText(exercise);
            html += `<div class="wrong-answer-detail"><div class="feedback-answer-label">❌ בחרת:</div><div class="feedback-answer-text">${selText}</div>${wrongExp ? `<div class="feedback-answer-reason">${wrongExp}</div>` : ''}</div>`;
            html += `<div class="correct-answer-detail"><div class="feedback-answer-label">✅ התשובה הנכונה:</div><div class="feedback-answer-text">${corText}</div></div>`;
            if (explanation) html += `<div style="margin-top:8px">${explanation}</div>`;
        } else { html = explanation; }
        document.getElementById('game-feedback-explanation').innerHTML = html;
        document.getElementById('game-feedback-btn').textContent = 'המשך';
        this.hideFooter();
    }

    getSelectedAnswerText(exercise) {
        if (exercise.type === 'compare') return this.selectedAnswer === 0 ? exercise.optionA.text : exercise.optionB.text;
        if (exercise.options) return exercise.options[this.selectedAnswer];
        return '';
    }

    getCorrectAnswerText(exercise) {
        if (exercise.type === 'compare') return exercise.correct === 0 ? exercise.optionA.text : exercise.optionB.text;
        if (exercise.options) return exercise.options[exercise.correct];
        return '';
    }

    continueToNext() {
        document.getElementById('game-feedback-panel').classList.remove('show');
        if (this.playerData.hearts <= 0) { this.showNoHeartsModal(); return; }
        this.currentExerciseIndex++;
        setTimeout(() => this.renderExercise(), 300);
    }

    // ═══════════════════════════════════════
    // Lesson Completion
    // ═══════════════════════════════════════
    completeLesson() {
        const key = `${this.currentModule.id}-${this.currentLesson.id}`;
        if (!this.playerData.completedLessons[key]) {
            this.playerData.completedLessons[key] = true;
            this.addXP(50);
            if (this.lessonMistakes === 0) {
                this.playerData.perfectLessons = (this.playerData.perfectLessons || 0) + 1;
                if (!this.playerData.perfectLessonsList) this.playerData.perfectLessonsList = [];
                if (!this.playerData.perfectLessonsList.includes(key)) this.playerData.perfectLessonsList.push(key);
            }
            this.savePlayerData();
        }
        if (this.isDailyChallenge) this.completeDailyChallenge();
        this.checkAchievements();
        this.showCompletionScreen();
    }

    showCompletionScreen() {
        this.hideProgressBar(); this.hideFooter();
        this.createConfetti(); this.sound.play('levelUp');
        const msg = this.getRandomMessage(this.mentorMessages.lessonComplete);
        document.getElementById('game-container').innerHTML = `<div class="completion-screen"><div class="completion-icon">🏆</div><div class="completion-title">כל הכבוד!</div><div class="completion-subtitle">סיימת את השיעור "${this.currentLesson.title}"</div>${this.createMentorHTML(msg, true, 'happy')}<div class="completion-stats"><div class="completion-stat"><div class="completion-stat-value">+50</div><div class="completion-stat-label">XP</div></div><div class="completion-stat"><div class="completion-stat-value">${this.playerData.streak}</div><div class="completion-stat-label">ימים ברצף</div></div></div><button class="btn btn-primary btn-full" onclick="game.transitionTo(function(){game.openModule(${this.currentModule.id})})">המשך ללמוד</button><button class="btn btn-secondary btn-full" style="margin-top:10px" onclick="game.transitionTo(function(){game.renderHomeScreen()})">חזרה לתפריט</button></div>`;
    }

    createConfetti() {
        const container = document.createElement('div');
        container.className = 'confetti-container';
        document.body.appendChild(container);
        const colors = ['#D4AF37', '#2F8592', '#00606B', '#003B46', '#E6C65A', '#00b894'];
        for (let i = 0; i < 60; i++) {
            const c = document.createElement('div');
            c.className = Math.random() > 0.5 ? 'confetti-circle' : 'confetti';
            const size = 6 + Math.random() * 8;
            c.style.cssText = `position:absolute;left:${Math.random()*100}%;width:${size}px;height:${size}px;background:${colors[Math.floor(Math.random()*colors.length)]};animation:confettiSway ${2+Math.random()*2}s ease-out forwards;animation-delay:${Math.random()*1.5}s`;
            if (c.className === 'confetti-circle') c.style.borderRadius = '50%';
            container.appendChild(c);
        }
        setTimeout(() => container.remove(), 5000);
    }

    // ═══════════════════════════════════════
    // XP, Hearts, Modals
    // ═══════════════════════════════════════
    addXP(amount) {
        const oldXP = this.playerData.xp;
        const oldLvl = this.playerData.level;
        this.playerData.xp += amount;
        this.playerData.level = this.calculateLevel();
        this.savePlayerData();
        this.showXPPopup(amount);
        const xpEl = document.getElementById('game-xp-value');
        if (xpEl) this.animateCountUp(xpEl, oldXP, this.playerData.xp, 500);
        document.getElementById('game-streak-value').textContent = this.playerData.streak;
        this.renderHearts();
        if (this.playerData.level > oldLvl) this.showLevelUpCelebration(this.playerData.level);
        this.checkAchievements();
    }

    showXPPopup(amount) {
        const popup = document.createElement('div');
        popup.className = 'xp-popup';
        popup.textContent = `+${amount} XP`;
        document.body.appendChild(popup);
        setTimeout(() => popup.remove(), 1000);
    }

    loseHeart() {
        if (this.playerData.hearts > 0) {
            this.playerData.hearts--;
            if (!this.playerData.lastHeartLost || this.playerData.hearts === this.playerData.maxHearts - 1) this.playerData.lastHeartLost = new Date().toISOString();
            this.savePlayerData();
            this.updateStatsDisplay();
        }
    }

    showNoHeartsModal() {
        const modal = document.getElementById('game-modal-overlay');
        document.getElementById('game-modal-icon').textContent = '💔';
        document.getElementById('game-modal-title').textContent = 'נגמרו הלבבות!';
        document.getElementById('game-modal-text').textContent = `לב חדש יתחדש בעוד ${HEART_RECOVERY_MINUTES} דקות. חזרו מאוחר יותר.`;
        document.getElementById('game-modal-buttons').innerHTML = `<button class="btn btn-secondary" onclick="game.closeModal()">חזרה</button><button class="btn btn-primary" onclick="game.refillHearts()">מילוי לבבות</button>`;
        modal.classList.add('show');
    }

    closeModal() { document.getElementById('game-modal-overlay').classList.remove('show'); this.transitionTo(() => this.renderHomeScreen()); }
    refillHearts() { this.playerData.hearts = this.playerData.maxHearts; this.playerData.lastHeartLost = null; this.savePlayerData(); this.updateStatsDisplay(); document.getElementById('game-modal-overlay').classList.remove('show'); }
    exitLesson() {
        const modal = document.getElementById('game-modal-overlay');
        document.getElementById('game-modal-icon').textContent = '🚪';
        document.getElementById('game-modal-title').textContent = 'לצאת מהשיעור?';
        document.getElementById('game-modal-text').textContent = 'ההתקדמות בשיעור הזה לא תישמר.';
        document.getElementById('game-modal-buttons').innerHTML = `<button class="btn btn-secondary" onclick="game.closeModalAndStay()">להישאר</button><button class="btn btn-danger" onclick="game.confirmExit()">לצאת</button>`;
        modal.classList.add('show');
    }
    closeModalAndStay() { document.getElementById('game-modal-overlay').classList.remove('show'); }
    confirmExit() { document.getElementById('game-modal-overlay').classList.remove('show'); document.getElementById('game-feedback-panel').classList.remove('show'); this.transitionTo(() => this.openModule(this.currentModule.id)); }

    // ═══════════════════════════════════════
    // Stats Tracking
    // ═══════════════════════════════════════
    updateExerciseStats(isCorrect, moduleId) {
        const today = new Date().toISOString().split('T')[0];
        if (!this.playerData.weeklyActivity) this.playerData.weeklyActivity = {};
        this.playerData.weeklyActivity[today] = (this.playerData.weeklyActivity[today] || 0) + 1;
        if (!this.playerData.moduleAccuracy) this.playerData.moduleAccuracy = {};
        if (!this.playerData.moduleAccuracy[moduleId]) this.playerData.moduleAccuracy[moduleId] = { correct: 0, total: 0 };
        this.playerData.moduleAccuracy[moduleId].total++;
        if (isCorrect) this.playerData.moduleAccuracy[moduleId].correct++;
    }

    showStats() {
        this.hideUserMenu();
        this.transitionTo(() => this.renderStatsScreen());
    }

    renderStatsScreen() {
        this.currentScreen = 'stats';
        const container = document.getElementById('game-container');
        const pd = this.playerData;
        const totalLessons = Object.keys(pd.completedLessons).length;
        const longestStreak = pd.longestStreak || pd.streak || 0;
        const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        const weekData = [];
        let maxAct = 1;
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            const count = (pd.weeklyActivity && pd.weeklyActivity[key]) || 0;
            if (count > maxAct) maxAct = count;
            weekData.push({ day: dayNames[d.getDay()], count, key });
        }
        const bars = weekData.map(w => {
            const h = Math.max(4, (w.count / maxAct) * 100);
            const isToday = w.key === new Date().toISOString().split('T')[0];
            return `<div class="weekly-bar-wrapper"><div class="weekly-bar ${isToday ? 'today' : ''}" style="height:${h}%"><span class="weekly-bar-count">${w.count || ''}</span></div><div class="weekly-label">${w.day}</div></div>`;
        }).join('');

        const modAcc = MODULES.map(m => {
            const acc = pd.moduleAccuracy && pd.moduleAccuracy[m.id];
            if (!acc || acc.total === 0) return `<div class="accuracy-row"><span class="accuracy-module-name">${m.icon} ${m.title}</span><div class="accuracy-bar-wrapper"><div class="accuracy-bar" style="width:0%"></div></div><span class="accuracy-percent">--</span></div>`;
            const pct = Math.round((acc.correct / acc.total) * 100);
            const color = pct >= 80 ? 'var(--t-success)' : pct >= 50 ? 'var(--t-warning)' : 'var(--t-danger)';
            return `<div class="accuracy-row"><span class="accuracy-module-name">${m.icon} ${m.title}</span><div class="accuracy-bar-wrapper"><div class="accuracy-bar" style="width:${pct}%;background:${color}"></div></div><span class="accuracy-percent">${pct}%</span></div>`;
        }).join('');

        const totalAns = (pd.totalCorrectAnswers || 0) + (pd.totalWrongAnswers || 0);
        const accPct = totalAns > 0 ? Math.round((pd.totalCorrectAnswers / totalAns) * 100) : 0;

        container.innerHTML = `<div class="stats-screen"><button class="back-btn" onclick="game.transitionTo(function(){game.renderHomeScreen()})">→ חזרה</button><h2 class="stats-title">📊 הסטטיסטיקות שלי</h2><div class="stats-cards"><div class="stats-card"><div class="stats-card-value">${pd.xp}</div><div class="stats-card-label">⭐ סה"כ XP</div></div><div class="stats-card"><div class="stats-card-value">${pd.streak}</div><div class="stats-card-label">🔥 סטריק</div></div><div class="stats-card"><div class="stats-card-value">${longestStreak}</div><div class="stats-card-label">🏆 שיא</div></div><div class="stats-card"><div class="stats-card-value">${totalLessons}</div><div class="stats-card-label">📚 שיעורים</div></div></div><div class="stats-section"><div class="stats-section-title">📅 פעילות השבוע</div><div class="weekly-chart">${bars}</div></div><div class="stats-section"><div class="stats-section-title">🎯 דיוק כללי: ${accPct}%</div></div><div class="stats-section"><div class="stats-section-title">📊 דיוק לפי מודול</div><div class="module-accuracy">${modAcc}</div></div></div>`;
        this.hideProgressBar(); this.hideFooter();
    }

    showLevelUpCelebration(level) {
        const overlay = document.getElementById('game-level-up-overlay');
        document.getElementById('game-level-up-text').innerHTML = `<div class="level-up-icon">🎉</div><div class="level-up-heading">!עלית לרמה ${level}</div><div class="level-up-name">${this.getLevelName(level)}</div>`;
        overlay.style.display = 'flex';
        this.sound.play('levelUp');
        const dismiss = () => { overlay.style.display = 'none'; overlay.removeEventListener('click', dismiss); };
        overlay.addEventListener('click', dismiss);
        setTimeout(dismiss, 3500);
    }

    createStarBurst() {
        const container = document.createElement('div');
        container.className = 'star-burst-container';
        document.body.appendChild(container);
        for (let i = 0; i < 10; i++) {
            const star = document.createElement('div');
            star.className = 'star-particle'; star.textContent = '⭐';
            star.style.setProperty('--angle', (i / 10) * 360 + 'deg');
            star.style.setProperty('--distance', (60 + Math.random() * 80) + 'px');
            container.appendChild(star);
        }
        setTimeout(() => container.remove(), 800);
    }

    animateCountUp(el, from, to, dur = 500) {
        const start = performance.now();
        const diff = to - from;
        const anim = (now) => {
            const p = Math.min((now - start) / dur, 1);
            el.textContent = Math.round(from + diff * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(anim);
        };
        requestAnimationFrame(anim);
    }

    // ═══════════════════════════════════════
    // Utilities
    // ═══════════════════════════════════════
    shuffleArray(array) {
        const a = [...array];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    showProgressBar() { document.getElementById('game-progress-container').style.display = 'block'; }
    hideProgressBar() { document.getElementById('game-progress-container').style.display = 'none'; }
    updateProgressBar() {
        const total = this.currentLesson.exercises.length;
        document.getElementById('game-progress-bar').style.width = (this.currentExerciseIndex / total) * 100 + '%';
    }
    showFooter() { document.getElementById('game-footer-actions').style.display = 'block'; this.disableCheckButton(); }
    hideFooter() { document.getElementById('game-footer-actions').style.display = 'none'; }
    enableCheckButton() { document.getElementById('game-check-btn').disabled = false; }
    disableCheckButton() { document.getElementById('game-check-btn').disabled = true; }
}

// ═══════════════════════════════════════
// Initialize
// ═══════════════════════════════════════
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new NlpGame();
});
