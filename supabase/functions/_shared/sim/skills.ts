// =============================================================================
// sim / skills.ts — the technique registry.
//
// The engine is generic: gated facts, metrics, terminal conditions. What makes a
// scenario a "reframing" drill rather than a "chunk-down" drill lives here — the
// closed list of moves the judge may assign, what each move does to the world by
// default, the hint it produces, and the coaching line shown in training mode.
//
// A scenario picks a skill with `primary_skill` and may override any of this in
// its spec (`spec.moves`, `spec.scoring_rules`, `spec.target_label`, ...). The
// registry exists so 51 scenarios do not each re-invent the same 8 moves, and so
// a typo in one scenario cannot silently turn every move into `neutral`.
//
// Metric keys stay fixed (rapport · resistance · emotional_depth · specificity).
// `specificity` is the skill's TARGET metric; its Hebrew label comes from here,
// so a reframing scenario shows "פתיחות למשמעות חדשה" while the column keeps its
// name and every existing session still reads correctly.
// =============================================================================

import { DEFAULT_FLAG_ON_MOVE, type Metrics } from './engine.ts'

export type MoveDef = {
  id: string
  def: string                 // for the judge — what separates this move from its neighbours
  hint?: string               // for the 💡 button — what to try next
  coach?: string              // training mode — one line shown after the learner used this move
  polarity: 1 | 0 | -1        // +1 advances the work · -1 damages it · 0 neither
}

export type SkillDef = {
  key: string
  label: string               // Hebrew name of the technique
  target_label: string        // Hebrew label of the `specificity` metric for this skill
  depth_label?: string        // Hebrew label of `emotional_depth`, if it means something else here
  moves: MoveDef[]            // skill-specific moves (universal moves are always added)
  allow_directives?: boolean  // guided-process skills: "תדמייני", "תיזכר" are the technique, not advice
  jargon_exempt?: string[]    // terms the learner may say in this drill without being flagged
  score_key: string           // debrief score key for "did the technique land"
  score_label: string
}

// ── Universal moves: present in every drill ──────────────────────────────────

export const UNIVERSAL_MOVES: MoveDef[] = [
  { id: 'reflect_back', polarity: 1,
    def: 'משתמש במילים של המטופל/ת מילה במילה, בלי לפרש.',
    hint: 'קח מילה שלו/ה והחזר אותה מילה במילה.',
    coach: 'שיקוף מדויק. המטופל/ת מרגיש/ה שמקשיבים לו/ה.' },
  { id: 'pace_emotion', polarity: 1,
    def: 'מתקף את החוויה הרגשית לפני שהוא חוקר.',
    hint: 'לפני שאתה חוקר, תן להרגיש שהבנת מה עובר עליו/ה.',
    coach: 'ליווי רגשי טוב. ככה בונים את הקרקע לשאלה הבאה.' },
  { id: 'give_advice', polarity: -1,
    def: 'מציע פתרון, הנחיה או עצה במקום לחקור.',
    coach: 'זו עצה. המטופל/ת יסכים/תסכים בנימוס ולא ישתנה כלום. חזור לשאלה.' },
  { id: 'why_question', polarity: -1,
    def: 'שואל "למה" או "מדוע". מזמין הצדקה במקום מידע.',
    coach: '"למה" מזמין הצדקה. נסה "מה" או "איך" במקום.' },
  { id: 'jargon', polarity: -1,
    def: 'משתמש במונח מקצועי של NLP או טיפול מול המטופל/ת.',
    coach: 'מונח מקצועי מוציא מהחוויה. דבר בשפה של המטופל/ת.' },
  { id: 'closed_question', polarity: -1,
    def: 'שאלת כן/לא שלא מקדמת את העבודה.',
    coach: 'שאלה סגורה מקבלת "כן" או "לא". פתח אותה ב"מה" או "איך".' },
  { id: 'cold_technique', polarity: -1,
    def: 'מהלך נכון טכנית, בניסוח קר, שיפוטי או מאשים.',
    coach: 'הכיוון נכון, הטון קר. אותה שאלה ברכות תעבוד אחרת.' },
  { id: 'neutral', polarity: 0,
    def: 'לא קידם ולא הזיק.' },
]

// Canonical consequences by move, applied when a scenario does not set its own.
// Universal moves have fixed effects. Skill moves get the polarity default.
const UNIVERSAL_RULES: Record<string, Partial<Metrics>> = {
  reflect_back:   { rapport: 10, resistance: -6, emotional_depth: 4 },
  pace_emotion:   { rapport: 12, resistance: -8, emotional_depth: 8 },
  give_advice:    { rapport: -6, resistance: 14, specificity: -4 },
  why_question:   { rapport: -4, resistance: 12 },
  jargon:         { rapport: -12, resistance: 10 },
  closed_question:{ specificity: -2 },
  cold_technique: { rapport: -8, resistance: 10, specificity: 4 },
  neutral:        {},
}
const SKILL_MOVE_DEFAULT: Partial<Metrics> = { rapport: 3, resistance: -3, specificity: 14 }

// ── The techniques ───────────────────────────────────────────────────────────

const m = (id: string, def: string, hint: string, coach: string): MoveDef =>
  ({ id, def, hint, coach, polarity: 1 })

export const SKILLS: Record<string, SkillDef> = {
  chunk_down: {
    key: 'chunk_down', label: 'פירוק הכללה', target_label: 'פירוט',
    score_key: 'chunk_down', score_label: 'פירוק הכללה',
    moves: [
      m('challenge_universal', 'מחזיר כמת כולל ("אף אחד", "תמיד", "כולם") כשאלה.',
        'נאמרה מילה שמכסה את כולם. החזר אותה כשאלה.', 'אתגרת את ההכללה. עכשיו יש מקום לפרט.'),
      m('specify_time', 'מבקש מתי.', 'שאל מתי זה קרה בפעם האחרונה.', 'שאלת מתי. זה מוריד את הסיפור לקרקע.'),
      m('specify_context', 'מבקש איפה או באיזה מצב.', 'שאל איפה, או באיזה מצב בדיוק, זה קורה.', 'שאלת על ההקשר. עוד פרט אמיתי.'),
      m('specify_behavior', 'מבקש התנהגות נצפית. "מה היא עשתה", לא "איך הרגשת".',
        'שאל מה בדיוק נעשה שם. התנהגות שאפשר לראות, לא רגש.', 'ביקשת התנהגות נצפית. כאן מתחיל השינוי.'),
      { id: 'challenge_no_rapport', polarity: -1, def: 'פירוק נכון בניסוח קר, שיפוטי או מאשים.',
        coach: 'השאלה נכונה, הטון קר. אותה שאלה ברכות תעבוד אחרת.' },
    ],
  },

  meta_generalizations: {
    key: 'meta_generalizations', label: 'אתגור הכללות', target_label: 'גמישות במפה',
    score_key: 'meta_model', score_label: 'מטא-מודל',
    moves: [
      m('challenge_universal', 'מחזיר כמת כולל ("תמיד", "אף פעם", "כולם") כשאלה.',
        'נאמר "תמיד" או "אף פעם". החזר את המילה כשאלה.', 'אתגרת את ההכללה בעדינות.'),
      m('counter_example', 'מבקש דוגמה נגדית: "הייתה פעם אחת ש...?"',
        'שאל אם הייתה פעם אחת שזה לא קרה.', 'דוגמה נגדית סודקת את ההכללה מבפנים.'),
      m('challenge_modal', 'מאתגר "אני לא יכול/חייב": "מה מונע ממך?" או "מה יקרה אם...?"',
        'נאמר "אני לא יכול/ה" או "חייב/ת". שאל מה מונע, או מה יקרה אם כן.', 'פתחת את גבול ה"לא יכול".'),
    ],
  },

  meta_deletions: {
    key: 'meta_deletions', label: 'שחזור השמטות', target_label: 'מידע שהוחזר',
    score_key: 'meta_model', score_label: 'מטא-מודל',
    moves: [
      m('recover_deletion', 'מבקש את מה שהושמט: "מה בדיוק?", "לגבי מה?"',
        'משהו חסר במשפט. שאל "מה בדיוק?"', 'החזרת את מה שהושמט.'),
      m('specify_referent', 'מבקש מי בדיוק: "מי זה הם?"', 'נאמר "הם" או "אנשים". שאל מי בדיוק.', 'עכשיו יש שם במקום "הם".'),
      m('specify_verb', 'מבקש איך בדיוק נעשה הפועל: "איך בדיוק הוא פוגע בך?"',
        'הפועל כללי מדי. שאל איך בדיוק זה נעשה.', 'פירקת את הפועל לפעולה נצפית.'),
      m('compare_reference', 'בהשוואה בלי בסיס ("יותר גרוע", "הכי") שואל "ביחס למה?"',
        'נאמרה השוואה בלי בסיס. שאל ביחס למה.', 'חשפת את קנה המידה הסמוי.'),
    ],
  },

  meta_distortions: {
    key: 'meta_distortions', label: 'אתגור עיוותים', target_label: 'גמישות במפה',
    score_key: 'meta_model', score_label: 'מטא-מודל',
    moves: [
      m('challenge_mind_reading', 'קריאת מחשבות: "איך את/ה יודע/ת שהוא חושב ש...?"',
        'הוא/היא יודע/ת מה אחרים חושבים. שאל איך הוא/היא יודע/ת.', 'אתגרת קריאת מחשבות.'),
      m('challenge_cause_effect', 'סיבה-תוצאה: "איך בדיוק X גורם לך להרגיש Y?"',
        'נאמר "הוא גורם לי". שאל איך בדיוק זה גורם.', 'פירקת את הקשר הסיבתי.'),
      m('challenge_complex_equivalence', 'שוויון מורכב: "איך זה ש-X אומר ש-Y?"',
        'נאמר ש-X אומר Y. שאל איך זה אומר את זה.', 'הפרדת בין המעשה למשמעות שהודבקה לו.'),
      m('denominalize', 'הופך שם-עצם מופשט ("הקשר", "הפחד") בחזרה לתהליך: "איך את/ה מפחד/ת?"',
        'נאמרה מילה מופשטת כמו "הקשר" או "הלחץ". הפוך אותה לפועל.', 'החזרת תנועה למה שנשמע קפוא.'),
    ],
  },

  meta_model: {
    key: 'meta_model', label: 'מטא-מודל', target_label: 'גמישות במפה',
    score_key: 'meta_model', score_label: 'מטא-מודל',
    moves: [] as MoveDef[],   // filled below: union of the three meta families
  },

  rapport_calibration: {
    key: 'rapport_calibration', label: 'ראפור וקליברציה', target_label: 'חיבור',
    jargon_exempt: [],
    score_key: 'rapport_calibration', score_label: 'ראפור וכיול',
    moves: [
      m('match_language', 'משתמש בקצב, במילים ובמשלב של המטופל/ת.',
        'דבר בקצב ובמילים שלו/ה, לא בשלך.', 'התאמת את השפה. זה ראפור.'),
      m('calibrate_check', 'מציין סימן לא מילולי שזיהה ובודק אותו: "שמתי לב ש... זה נכון?"',
        'שים לב לשינוי בטון או בקצב, ובדוק אותו בקול.', 'כיול טוב. בדקת במקום לנחש.'),
      m('pace_and_lead', 'מלווה את המצב הקיים ואז מוביל צעד קטן קדימה.',
        'קודם לווה את מה שיש, ורק אז הצע צעד אחד קטן.', 'ליווי והובלה בסדר הנכון.'),
    ],
  },

  perceptual_positions: {
    key: 'perceptual_positions', label: 'עמדות תפיסה', target_label: 'נקודות מבט',
    allow_directives: true,
    score_key: 'perceptual_positions', score_label: 'עמדות תפיסה',
    moves: [
      m('invite_first_position', 'מזמין לעמדה ראשונה: מה אני רואה, מרגיש/ה, רוצה.',
        'התחל מהעמדה שלו/ה: מה הוא/היא רוצה בתוך זה.', 'ביססת את העמדה הראשונה.'),
      m('invite_second_position', 'מזמין להיכנס לנעליים של האחר: "אם היית הוא, מה היית מרגיש/ה?"',
        'הזמן להיכנס לנעליים של האדם השני.', 'פתחת את העמדה השנייה.'),
      m('invite_third_position', 'מזמין לצפות מהצד כצופה ניטרלי: "מבחוץ, מה רואים?"',
        'הזמן להסתכל על שניהם מהצד, כמו צופה.', 'עמדה שלישית. מכאן רואים דפוס.'),
      m('integrate_positions', 'מחבר את מה שנלמד בעמדות לתובנה או לצעד.',
        'שאל מה הוא/היא לוקח/ת מהמעבר בין העמדות.', 'חיברת את העמדות לתובנה.'),
    ],
  },

  logical_levels: {
    key: 'logical_levels', label: 'רמות לוגיות', target_label: 'בהירות הרמה',
    score_key: 'logical_levels', score_label: 'רמות לוגיות',
    moves: [
      m('identify_level', 'שאלה שמזהה באיזו רמה יושב הקושי: סביבה, התנהגות, יכולת, אמונה, זהות.',
        'נסה לזהות: זה עניין של מקום, של מעשה, של יכולת, של אמונה או של זהות?', 'זיהית את הרמה.'),
      m('shift_level', 'מעביר את השיחה לרמה גבוהה או נמוכה יותר: "מה זה אומר עליך?" / "מה בדיוק עשית?"',
        'עלה רמה: מה זה אומר עליו/ה כאדם? או רד: מה בדיוק קרה?', 'הזזת את השיחה לרמה שבה השינוי קורה.'),
      m('align_levels', 'בודק התאמה בין הרמות: האם המעשה מתיישב עם הערך והזהות.',
        'שאל אם מה שהוא/היא עושה מתאים למה שחשוב לו/ה.', 'בדקת יישור בין הרמות.'),
    ],
  },

  goal_setting: {
    key: 'goal_setting', label: 'הצבת מטרה', target_label: 'בהירות המטרה',
    score_key: 'goal_setting', score_label: 'הצבת מטרה',
    moves: [
      m('positive_frame', 'הופך "מה לא רוצה" ל"מה כן רוצה".', 'נאמר מה לא רוצים. שאל מה כן.', 'ניסוח חיובי של המטרה.'),
      m('sensory_evidence', 'מבקש ראיה חושית: "איך תדע/י שהשגת? מה תראה/י?"',
        'שאל איך הוא/היא ידע/תדע שהגיע/ה. מה יראה, ישמע, ירגיש.', 'יש עכשיו ראיה חושית למטרה.'),
      m('ownership_check', 'בודק שהמטרה בשליטת המטופל/ת ולא תלויה באחרים.',
        'בדוק כמה מזה בשליטה שלו/ה.', 'החזרת את המטרה לשליטתו/ה.'),
      m('ecology_check', 'בודק אקולוגיה: מה יקרה לשאר החיים, מה עלול להיפגע.',
        'שאל מה עלול להשתנות או להיפגע בדרך.', 'בדיקת אקולוגיה. מטרה שלא תחבל בעצמה.'),
      m('specify_goal_detail', 'מבקש מדיד וזמן: כמה, עד מתי, צעד ראשון.',
        'שאל עד מתי, וכמה בדיוק.', 'המטרה נעשתה מדידה.'),
    ],
  },

  rep_systems: {
    key: 'rep_systems', label: 'מערכות ייצוג', target_label: 'התאמה חושית',
    allow_directives: true,
    score_key: 'rep_systems', score_label: 'מערכות ייצוג',
    moves: [
      m('match_predicates', 'עונה במילים מאותה מערכת חושית של המטופל/ת (רואה/שומע/מרגיש).',
        'שים לב: הוא/היא רואה, שומע/ת או מרגיש/ה? דבר באותה שפה.', 'דיברת באותו ערוץ חושי.'),
      m('elicit_rep_system', 'שואל איך החוויה מיוצגת: "איך את/ה רואה/שומע/ת/מרגיש/ה את זה?"',
        'שאל איך זה נראה, נשמע או מורגש מבפנים.', 'הוצאת את המבנה החושי של החוויה.'),
      m('submodality_shift', 'מזמין לשנות תכונה חושית: גודל, מרחק, בהירות, עוצמה.',
        'הזמן לשנות משהו בתמונה: להרחיק, להקטין, להחשיך.', 'שינית את המבנה, לא את התוכן.'),
    ],
  },

  state_anchoring: {
    key: 'state_anchoring', label: 'מצבים ועוגנים', target_label: 'עוצמת המשאב',
    allow_directives: true, jargon_exempt: ['עוגן', 'עיגון'],
    score_key: 'anchoring', score_label: 'ניהול מצב ועיגון',
    moves: [
      m('elicit_resource_state', 'מזמין להיזכר ברגע ספציפי של משאב (ביטחון, רוגע, כוח).',
        'הזמן להיזכר ברגע אחד מסוים שבו הרגיש/ה את המשאב.', 'הזמנת את המשאב.'),
      m('intensify_state', 'מעצים את המצב דרך פרטים חושיים: מה רואים, שומעים, מרגישים שם.',
        'בקש פרטים: מה רואים שם? מה שומעים?', 'העצמת את המצב דרך החושים.'),
      m('set_anchor', 'מצמיד גירוש ייחודי (מגע, מילה, תנועה) בשיא המצב.',
        'כשהמצב בשיא, הצמד אליו מגע או מילה.', 'עיגנת בשיא. התזמון נכון.'),
      m('test_anchor', 'בודק את העוגן: מפעיל אותו אחרי הפסקה ושואל מה קורה.',
        'נקה את המצב ובדוק אם העוגן מחזיר אותו.', 'בדקת את העוגן. ככה יודעים שהוא עובד.'),
      m('shift_state_triangle', 'משנה מצב דרך פיזיולוגיה, מיקוד או שפה.',
        'הצע לשנות יציבה, מיקוד או את המילים שבהן הוא/היא מתאר/ת.', 'שינית מצב דרך משולש הסטייט.'),
    ],
  },

  reframing: {
    key: 'reframing', label: 'מסגור מחדש', target_label: 'פתיחות למשמעות חדשה',
    jargon_exempt: [],
    score_key: 'reframing', score_label: 'מסגור מחדש',
    moves: [
      m('context_reframe', 'מציע או מזמין הקשר שבו אותה התנהגות דווקא מועילה: "איפה זה עוזר לך?"',
        'שאל באיזה מצב אותה תכונה דווקא עוזרת.', 'מסגור הקשר. אותה התנהגות, מקום אחר.'),
      m('meaning_reframe', 'מזמין משמעות אחרת לאותה עובדה: "מה עוד זה יכול להגיד?"',
        'שאל מה עוד זה יכול להגיד, מלבד מה שנאמר.', 'מסגור משמעות. אותה עובדה, פירוש אחר.'),
      m('positive_intent', 'מחפש את הכוונה החיובית: "מה החלק הזה מנסה להשיג בשבילך?"',
        'שאל מה ההתנהגות הזו מנסה להשיג עבורו/ה.', 'מצאת את הכוונה החיובית.'),
      m('preframe', 'ממסגר מראש את מה שעומד לקרות, כדי שיתקבל אחרת.',
        'הכן את הקרקע לפני ההצעה: איך כדאי להקשיב לה.', 'פרי-פריים טוב.'),
    ],
  },

  needs_model: {
    key: 'needs_model', label: 'מודל הצרכים', target_label: 'זיהוי הצורך',
    score_key: 'needs_model', score_label: 'מודל הצרכים',
    moves: [
      m('identify_need', 'שואל מה ההתנהגות נותנת: "מה זה נותן לך?"',
        'שאל מה ההתנהגות הזו נותנת לו/ה.', 'הגעת לצורך שמאחורי ההתנהגות.'),
      m('name_need_category', 'ממפה את התשובה לצורך: ודאות, גיוון, משמעות, חיבור, צמיחה, תרומה.',
        'נסה לזהות איזה צורך זה: ודאות? חיבור? משמעות?', 'מיפית את הצורך.'),
      m('alternative_need_path', 'מזמין דרך אחרת לספק את אותו צורך.',
        'שאל איך עוד אפשר לקבל את אותו דבר.', 'פתחת דרך חלופית לאותו צורך.'),
    ],
  },

  parts: {
    key: 'parts', label: 'עבודה עם חלקים', target_label: 'הסכמה בין החלקים',
    allow_directives: true,
    score_key: 'parts', score_label: 'עבודה עם חלקים',
    moves: [
      m('separate_parts', 'מפריד את הקונפליקט לשני חלקים: "יש חלק בך ש... וחלק ש..."',
        'נשמע קונפליקט. הפרד אותו לשני חלקים.', 'הפרדת את הקונפליקט לחלקים.'),
      m('positive_intent', 'שואל מה הכוונה החיובית של כל חלק.',
        'שאל מה החלק הזה רוצה בשבילו/ה.', 'מצאת את הכוונה החיובית של החלק.'),
      m('negotiate_parts', 'מזמין את החלקים למצוא דרך שמכבדת את שתי הכוונות.',
        'שאל אם יש דרך ששני החלקים יקבלו מה שהם רוצים.', 'משא ומתן בין החלקים.'),
    ],
  },

  beliefs: {
    key: 'beliefs', label: 'עבודה עם אמונות', target_label: 'גמישות האמונה',
    score_key: 'beliefs', score_label: 'עבודה עם אמונות',
    moves: [
      m('elicit_belief', 'מוציא את האמונה במילים: "מה את/ה מאמין/ה על...?"',
        'שאל מה הוא/היא מאמין/ה על עצמו/ה בתוך זה.', 'האמונה נאמרה בקול. עכשיו אפשר לעבוד איתה.'),
      m('question_evidence', 'בודק את הראיות: "איך את/ה יודע/ת שזה נכון?"',
        'שאל איך הוא/היא יודע/ת שזה נכון.', 'בדקת את הבסיס של האמונה.'),
      m('counter_example', 'מבקש דוגמה נגדית לאמונה.', 'שאל על פעם אחת שזה לא היה נכון.', 'דוגמה נגדית מערערת את האמונה.'),
      m('belief_origin', 'שואל מתי ואיך האמונה נוצרה.', 'שאל מתי התחיל/ה להאמין בזה.', 'חזרת למקור האמונה.'),
      m('new_belief_frame', 'מזמין לנסח אמונה מעצימה חלופית במילים של המטופל/ת.',
        'שאל מה היה רוצה להאמין במקום.', 'נוסחה אמונה חדשה.'),
    ],
  },

  timeline: {
    key: 'timeline', label: 'ציר הזמן', target_label: 'שינוי בחוויה',
    allow_directives: true,
    score_key: 'timeline', score_label: 'ציר הזמן',
    moves: [
      m('elicit_timeline', 'מברר איך העבר והעתיד מסודרים: "איפה העבר אצלך? איפה העתיד?"',
        'שאל איפה העבר ואיפה העתיד, אם היה צריך להצביע.', 'מיפית את ציר הזמן.'),
      m('float_to_event', 'מזמין לרחף מעל הציר לאירוע או לרגע שלפניו.',
        'הזמן לרחף מעל הציר, לרגע שלפני האירוע.', 'ריחוף מעל הציר. מבט חדש על אירוע ישן.'),
      m('extract_learning', 'שואל מה הלמידה מהאירוע, מה ניתן לקחת הלאה.',
        'שאל מה הוא/היא לומד/ת מזה, שיכול לשרת אותו/ה היום.', 'הוצאת למידה מהעבר.'),
      m('future_pace', 'מזמין לדמיין את עצמו/ה בעתיד עם השינוי.',
        'הזמן לדמיין את עצמו/ה בעוד חודש, עם השינוי.', 'גישור לעתיד.'),
    ],
  },

  integrative: {
    key: 'integrative', label: 'יישום עיקרון השיעור', target_label: 'יישום העיקרון',
    score_key: 'lesson_principle', score_label: 'יישום עיקרון השיעור',
    moves: [
      m('open_question', 'שאלה פתוחה ("מה", "איך") שמקדמת את השיחה.',
        'שאל שאלה פתוחה שמתחילה ב"מה" או "איך".', 'שאלה פתוחה. השיחה זזה.'),
      m('calibrate_check', 'מציין סימן לא מילולי ובודק אותו.',
        'שים לב לשינוי בטון ובדוק אותו בקול.', 'כיול טוב.'),
      m('apply_principle', 'מיישם את העיקרון המרכזי של השיעור, כפי שהוגדר במשימה.',
        'חזור למשימה: איך העיקרון של השיעור נראה במשפט אחד?', 'יישמת את עיקרון השיעור.'),
    ],
  },
}

SKILLS.meta_model.moves = dedupe([
  ...SKILLS.meta_generalizations.moves,
  ...SKILLS.meta_deletions.moves,
  ...SKILLS.meta_distortions.moves,
])

function dedupe(moves: MoveDef[]): MoveDef[] {
  const seen = new Set<string>()
  return moves.filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)))
}

// ── Resolution: registry + scenario overrides → what the turn loop uses ─────

export type ResolvedSkill = {
  skill: SkillDef
  moves: MoveDef[]                                   // universal + skill (+ spec extras)
  moveIds: string[]
  scoring_rules: Record<string, Partial<Metrics>>
  flag_on_move: Record<string, string>
  jargon_exempt: string[]
  allow_directives: boolean
  labels: { rapport: string; resistance: string; emotional_depth: string; specificity: string }
  score_keys: Array<{ key: string; label: string }>
}

// deno-lint-ignore no-explicit-any
export function resolveSkill(primarySkill: string | null | undefined, spec: any): ResolvedSkill {
  const skill = SKILLS[String(primarySkill || '')] || SKILLS.integrative

  const extra: MoveDef[] = Array.isArray(spec?.moves)
    ? spec.moves
        .filter((x: unknown) => x && typeof (x as MoveDef).id === 'string')
        .map((x: Partial<MoveDef>) => ({ ...x, polarity: (x.polarity ?? 1) as MoveDef['polarity'] }) as MoveDef)
    : []
  const moves = dedupe([...UNIVERSAL_MOVES, ...skill.moves, ...extra])

  const scoring_rules: Record<string, Partial<Metrics>> = {}
  for (const mv of moves) {
    scoring_rules[mv.id] = UNIVERSAL_RULES[mv.id]
      ?? (mv.polarity > 0 ? SKILL_MOVE_DEFAULT : mv.polarity < 0 ? UNIVERSAL_RULES.cold_technique : {})
  }
  // The scenario author has the last word on numbers.
  Object.assign(scoring_rules, spec?.scoring_rules || {})

  const jargon_exempt = [...(skill.jargon_exempt || []), ...((spec?.jargon_exempt as string[]) || [])]

  return {
    skill,
    moves,
    moveIds: moves.map(x => x.id),
    scoring_rules,
    flag_on_move: { ...DEFAULT_FLAG_ON_MOVE, ...(spec?.flag_on_move || {}) },
    jargon_exempt,
    allow_directives: spec?.allow_directives ?? !!skill.allow_directives,
    labels: {
      rapport: 'ראפור',
      resistance: 'התנגדות',
      emotional_depth: String(spec?.depth_label || skill.depth_label || 'עומק רגשי'),
      specificity: String(spec?.target_label || skill.target_label),
    },
    score_keys: [
      { key: 'rapport_building', label: 'בניית ראפור' },
      { key: skill.score_key, label: skill.score_label },
      { key: 'language_discipline', label: 'משמעת שפה' },
      { key: 'pacing', label: 'קצב' },
    ],
  }
}

// ── Learner level ─────────────────────────────────────────────────────────────
// Deliberately a rule of thumb, not a model: the research on ZPD-adaptive
// feedback is early, and a transparent rule is something Ram can reason about.

export function learnerDifficulty(
  base: number,
  experienceLevel: string | null | undefined,
  recentScores: number[],
): number {
  let d = Number(base) || 1
  if (experienceLevel === 'advanced') d += 1
  if (experienceLevel === 'beginner') d -= 1
  const recent = recentScores.filter(n => Number.isFinite(n)).slice(0, 5)
  if (recent.length >= 2) {
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length
    if (avg >= 85) d += 1
    else if (avg < 55) d -= 1
  }
  return Math.max(1, Math.min(3, Math.round(d)))
}

// The same patient, harder to reach: a guarded opening and less goodwill.
export function adjustInitialMetrics(init: Metrics, scenarioDifficulty: number, sessionDifficulty: number): Metrics {
  const step = sessionDifficulty - (Number(scenarioDifficulty) || 1)
  const clampN = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
  return {
    rapport: clampN(init.rapport - 6 * step),
    resistance: clampN(init.resistance + 10 * step),
    emotional_depth: clampN(init.emotional_depth),
    specificity: clampN(init.specificity),
  }
}

// ── Training mode: one line, no extra model call ─────────────────────────────

export function coachNote(resolved: ResolvedSkill, move: string, judgeNote: string): string {
  const def = resolved.moves.find(x => x.id === move)
  if (def?.coach) return def.coach
  if (move === 'neutral') return judgeNote || 'התור לא קידם ולא הזיק. חזור למשימה.'
  return judgeNote || ''
}
