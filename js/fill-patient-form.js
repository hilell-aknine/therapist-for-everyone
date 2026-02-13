const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

  // שלב 1 - פרטים אישיים
  console.log('שלב 1 - מילוי פרטים אישיים...');
  await page.goto('https://hilell-aknine.github.io/therapist-for-everyone/pages/patient-step1.html');
  await page.waitForSelector('#full_name');

  await page.type('#full_name', 'ישראל ישראלי');
  await page.type('#phone', '0501234567');
  await page.type('#email', 'test@example.com');
  await page.type('#main_reason', 'רוצה לעבור תהליך של צמיחה אישית וריפוי');

  // שדות אופציונליים
  await page.type('#city', 'תל אביב');
  await page.select('#gender', 'male');

  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0' });

  // שלב 2 - דינמיקה משפחתית
  console.log('שלב 2 - מילוי דינמיקה משפחתית...');
  await page.waitForSelector('#mother_relationship');

  await page.type('#mother_name', 'שרה');
  await page.type('#mother_relationship', 'קשר טוב וחם, תמיד תומכת');
  await page.type('#father_name', 'יעקב');
  await page.type('#father_relationship', 'קשר מורכב אך אוהב ומכיל');

  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0' });

  // שלב 3 - ציפיות ורפואי
  console.log('שלב 3 - מילוי ציפיות...');
  await page.waitForSelector('#expectations');

  await page.type('#expectations', 'לקבל כלים להתמודדות עם אתגרים יומיומיים');
  await page.type('#why_now', 'מרגיש שזה הזמן הנכון לעשות שינוי');

  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0' });

  // שלב 4 - כאן נעצרים
  console.log('✅ הגענו לשלב 4! הדפדפן יישאר פתוח.');

  // לא סוגרים את הדפדפן כדי שתוכל לראות
  // await browser.close();
})();
