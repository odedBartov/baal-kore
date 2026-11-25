// Generates 4 high-resolution 1080×1920 (9:16) Play Store phone screenshots for Ba'al Kore.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const fontOpts = {
  font: {
    fontFiles: [join(ROOT, 'src', 'fonts', 'EzraSIL.ttf')],
    loadSystemFonts: true,
    defaultFontFamily: 'Ezra SIL',
  },
};

const rabbiB64 = readFileSync(join(ROOT, 'src', 'assets', 'art', 'rabbi-happy.png')).toString('base64');
const yadB64 = readFileSync(join(ROOT, 'src', 'assets', 'art', 'yad-gold.png')).toString('base64');
const yadSilverB64 = readFileSync(join(ROOT, 'src', 'assets', 'art', 'yad.png')).toString('base64');

function renderPng(svg, file) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 }, ...fontOpts }).render().asPng();
  const outPath = join(OUT, file);
  writeFileSync(outPath, png);
  console.log('Wrote', outPath);
}

function phoneShell({ headerTitle, headerSub, actionTitle, bodySvg }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">
  <defs>
    <linearGradient id="topBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0f2540"/>
      <stop offset="0.22" stop-color="#17375e"/>
      <stop offset="1" stop-color="#112947"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe596"/>
      <stop offset="1" stop-color="#dfa32a"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#061120" flood-opacity="0.45"/>
    </filter>
  </defs>

  <!-- Marketing Backdrop -->
  <rect width="1080" height="1920" fill="url(#topBg)"/>
  <circle cx="540" cy="180" r="420" fill="#29578f" opacity="0.25"/>

  <!-- Top Marketing Headline -->
  <text x="540" y="115" text-anchor="middle" font-family="Ezra SIL" font-size="46" font-weight="bold" fill="#ffd978" direction="rtl">${headerTitle}&#x200F;</text>
  <text x="540" y="175" text-anchor="middle" font-family="Ezra SIL" font-size="27" fill="#e0ecfa" direction="rtl">${headerSub}&#x200F;</text>

  <!-- Phone Frame (920 × 1620) -->
  <g filter="url(#shadow)">
    <rect x="64" y="234" width="952" height="1636" rx="64" fill="#1c2430" stroke="#d6a63e" stroke-width="5"/>
    <rect x="80" y="250" width="920" height="1604" rx="52" fill="#f9f5eb"/>
  </g>

  <clipPath id="screenClip">
    <rect x="80" y="250" width="920" height="1604" rx="52"/>
  </clipPath>

  <g clip-path="url(#screenClip)">
    <!-- Android Status Bar + ActionBar -->
    <rect x="80" y="250" width="920" height="44" fill="#102640"/>
    <text x="955" y="280" text-anchor="end" font-family="Arial" font-size="22" font-weight="bold" fill="#d0dff2">19:45</text>
    <text x="125" y="280" text-anchor="start" font-family="Arial" font-size="22" font-weight="bold" fill="#d0dff2">100%</text>

    <rect x="80" y="294" width="920" height="96" fill="#153152"/>
    <text x="945" y="355" text-anchor="end" font-family="Ezra SIL" font-size="42" font-weight="bold" fill="#ffffff" direction="rtl">${actionTitle}</text>
    <text x="130" y="353" text-anchor="start" font-family="Ezra SIL" font-size="32" font-weight="bold" fill="#ffd978" direction="rtl">הגדרות</text>

    <!-- Persistent Gamification Top HUD -->
    <rect x="116" y="414" width="848" height="122" rx="26" fill="#ffffff" stroke="#e6d7b2" stroke-width="3"/>
    <!-- Shop & Challenges pills -->
    <rect x="138" y="430" width="140" height="50" rx="25" fill="#fff3c4" stroke="#e6be4c" stroke-width="2"/>
    <text x="208" y="464" text-anchor="middle" font-family="Ezra SIL" font-size="26" font-weight="bold" fill="#7c5200" direction="rtl">חנות</text>
    <rect x="290" y="430" width="155" height="50" rx="25" fill="#e2f2ea" stroke="#34a874" stroke-width="2"/>
    <text x="367" y="464" text-anchor="middle" font-family="Ezra SIL" font-size="26" font-weight="bold" fill="#115e3b" direction="rtl">אתגרים</text>
    <!-- Coins & Streak -->
    <rect x="530" y="430" width="165" height="50" rx="20" fill="#fff5d1"/>
    <text x="612" y="464" text-anchor="middle" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#8a5a00" direction="rtl">340 מטבעות</text>
    <rect x="720" y="430" width="218" height="50" rx="20" fill="#ffe8d6"/>
    <text x="829" y="464" text-anchor="middle" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#b83b00" direction="rtl">רצף 12 ימים</text>
    <!-- XP Bar -->
    <text x="935" y="512" text-anchor="end" font-family="Ezra SIL" font-size="25" font-weight="bold" fill="#153152" direction="rtl">מוכן לבר־מצווה · רמה 6</text>
    <text x="142" y="512" text-anchor="start" font-family="Arial" font-size="22" font-weight="bold" fill="#8a5a00">1280 / 1520 XP</text>
    <rect x="140" y="520" width="800" height="10" rx="5" fill="#e8e0cc"/>
    <rect x="300" y="520" width="640" height="10" rx="5" fill="#f0ab18"/>

    ${bodySvg}
  </g>
</svg>`;
}

// ---- Screenshot 1: Home Dashboard & Gamification ----
const screen1 = phoneShell({
  headerTitle: 'בעל קורא – המורה האישי לקריאה בתורה',
  headerSub: 'לימוד חווייתי עם דרגות, אתגרים יומיים ומשוב קולי במכשיר',
  actionTitle: 'בעל קורא',
  bodySvg: `
    <!-- Hero Card -->
    <rect x="116" y="556" width="848" height="190" rx="30" fill="#17375e" stroke="#d6a63e" stroke-width="3.5"/>
    <rect x="142" y="582" width="145" height="136" rx="22" fill="#0e2440" stroke="#f0bc42" stroke-width="3"/>
    <text x="214" y="655" text-anchor="middle" font-family="Arial" font-size="54" font-weight="bold" fill="#ffd978">92</text>
    <text x="214" y="695" text-anchor="middle" font-family="Ezra SIL" font-size="22" fill="#d6e4f7" direction="rtl">ממוצע פרשה</text>

    <text x="932" y="612" text-anchor="end" font-family="Ezra SIL" font-size="36" font-weight="bold" fill="#ffd978" direction="rtl">מוכן לבר־מצווה (רמה 6)</text>
    <text x="932" y="660" text-anchor="end" font-family="Ezra SIL" font-size="26" fill="#eef4fc" direction="rtl">קריאה רהוטה, מדויקת ובטוחה לעלייה לתורה</text>
    <text x="932" y="710" text-anchor="end" font-family="Ezra SIL" font-size="24" fill="#c7d9f0" direction="rtl">פרשת בראשית: 34/146 פסוקים · כתרים: 3/7</text>

    <!-- Rabbi + Speech Bubble -->
    <rect x="116" y="768" width="635" height="175" rx="26" fill="#ffffff" stroke="#decfa8" stroke-width="3"/>
    <text x="722" y="828" text-anchor="end" font-family="Ezra SIL" font-size="30" fill="#24211c" direction="rtl">שלום, איזה יופי שחזרתם לתרגל&#x200F;</text>
    <text x="722" y="874" text-anchor="end" font-family="Ezra SIL" font-size="30" fill="#24211c" direction="rtl">נמשיך בפרשת בראשית פרק א׳ פסוק ד׳&#x200F;</text>
    <text x="722" y="918" text-anchor="end" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#168a53" direction="rtl">המנגינה שלכם משתפרת מיום ליום&#x200F;</text>

    <rect x="768" y="766" width="194" height="194" rx="28" fill="#fff8df" stroke="#e0a92b" stroke-width="4"/>
    <image x="778" y="772" width="174" height="174" href="data:image/png;base64,${rabbiB64}"/>

    <!-- Primary CTA Button -->
    <rect x="116" y="980" width="848" height="96" rx="24" fill="#168a53" stroke="#0d5935" stroke-width="4"/>
    <text x="540" y="1040" text-anchor="middle" font-family="Ezra SIL" font-size="36" font-weight="bold" fill="#ffffff" direction="rtl">להמשיך בקריאה: בראשית פרק א׳ פסוק ד׳</text>

    <!-- Two secondary buttons -->
    <rect x="550" y="1094" width="414" height="82" rx="22" fill="#ece4d2" stroke="#cfc3a8" stroke-width="3"/>
    <text x="757" y="1146" text-anchor="middle" font-family="Ezra SIL" font-size="30" font-weight="bold" fill="#2b2620" direction="rtl">חמשת החומשים ופרשות</text>
    <rect x="116" y="1094" width="414" height="82" rx="22" fill="#ece4d2" stroke="#cfc3a8" stroke-width="3"/>
    <text x="323" y="1146" text-anchor="middle" font-family="Ezra SIL" font-size="30" font-weight="bold" fill="#2b2620" direction="rtl">אתגרים וחנות</text>

    <!-- Daily Quests Section -->
    <text x="955" y="1235" text-anchor="end" font-family="Ezra SIL" font-size="34" font-weight="bold" fill="#153152" direction="rtl">משימות היום</text>

    <!-- Quest 1 -->
    <rect x="116" y="1256" width="848" height="114" rx="22" fill="#f2fbf6" stroke="#219653" stroke-width="3"/>
    <text x="926" y="1308" text-anchor="end" font-family="Ezra SIL" font-size="30" font-weight="bold" fill="#153152" direction="rtl">התמדה יומית: קריאת 3 פסוקים</text>
    <text x="926" y="1348" text-anchor="end" font-family="Ezra SIL" font-size="25" fill="#187a46" direction="rtl">3 מתוך 3 פסוקים הושלמו בהצלחה</text>
    <rect x="142" y="1282" width="165" height="62" rx="18" fill="#f0ab18"/>
    <text x="224" y="1322" text-anchor="middle" font-family="Ezra SIL" font-size="26" font-weight="bold" fill="#1c1608" direction="rtl">איסוף פרס</text>

    <!-- Quest 2 -->
    <rect x="116" y="1386" width="848" height="114" rx="22" fill="#ffffff" stroke="#e3d6b8" stroke-width="2.5"/>
    <text x="926" y="1438" text-anchor="end" font-family="Ezra SIL" font-size="30" font-weight="bold" fill="#153152" direction="rtl">דיוק של בעל קורא: ציון 85 ומעלה</text>
    <text x="926" y="1478" text-anchor="end" font-family="Ezra SIL" font-size="25" fill="#635c50" direction="rtl">השיגו ציון 85 ומעלה בפסוק אחד היום (1/1)</text>
    <rect x="142" y="1412" width="165" height="62" rx="18" fill="#dff2e6"/>
    <text x="224" y="1452" text-anchor="middle" font-family="Ezra SIL" font-size="26" font-weight="bold" fill="#187a46" direction="rtl">נאסף ✓</text>

    <!-- Quest 3 -->
    <rect x="116" y="1516" width="848" height="114" rx="22" fill="#ffffff" stroke="#e3d6b8" stroke-width="2.5"/>
    <text x="926" y="1568" text-anchor="end" font-family="Ezra SIL" font-size="30" font-weight="bold" fill="#153152" direction="rtl">לימוד טעמים: השלמת שיעור טעמים</text>
    <text x="926" y="1608" text-anchor="end" font-family="Ezra SIL" font-size="25" fill="#635c50" direction="rtl">תרגלו שיעור טעמים או פסוק נוסף</text>
    <rect x="142" y="1542" width="165" height="62" rx="18" fill="#fff3c7"/>
    <text x="224" y="1582" text-anchor="middle" font-family="Ezra SIL" font-size="26" font-weight="bold" fill="#9c6700" direction="rtl">+20 מטבעות</text>

    <!-- Footer note -->
    <text x="540" y="1700" text-anchor="middle" font-family="Ezra SIL" font-size="26" fill="#70685a" direction="rtl">כל חמשת חומשי התורה (54 פרשות) זמינים באפליקציה בלי אינטרנט</text>
  `,
});

// ---- Screenshot 2: Interactive Cantillation Practice & Karaoke Melody Chart ----
const screen2 = phoneShell({
  headerTitle: 'הדגמת מנגינה וגרף טעמים חי',
  headerSub: 'היד הקוראת מלווה כל מילה ומציגה את מנגינת הטעמים המדויקת',
  actionTitle: 'בראשית פרק א׳, פסוק א׳',
  bodySvg: `
    <!-- Verse Box with Full Masoretic Text & Active Word Highlight -->
    <rect x="116" y="556" width="848" height="270" rx="26" fill="#fffdf7" stroke="#e3d9c2" stroke-width="3"/>
    <!-- Highlight on active word בָּרָא -->
    <rect x="572" y="582" width="142" height="84" rx="14" fill="#ffe9a8"/>
    <text x="930" y="642" text-anchor="end" font-family="Ezra SIL" font-size="56" fill="#1d1d1d" direction="rtl">בְּרֵאשִׁ֖ית   בָּרָ֣א   אֱלֹהִ֑ים</text>
    <text x="930" y="745" text-anchor="end" font-family="Ezra SIL" font-size="56" fill="#1d1d1d" direction="rtl">אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃</text>
    <!-- Gold Yad pointing at בָּרָא -->
    <image x="615" y="538" width="76" height="76" href="data:image/png;base64,${yadB64}"/>

    <!-- Badges -->
    <rect x="554" y="844" width="410" height="48" rx="20" fill="#fff0bd"/>
    <text x="759" y="876" text-anchor="middle" font-family="Ezra SIL" font-size="22" font-weight="bold" fill="#7a4f00" direction="rtl">פרשת בראשית · עלייה ראשונה חינם</text>
    <rect x="264" y="844" width="274" height="48" rx="20" fill="#dff2e6"/>
    <text x="401" y="876" text-anchor="middle" font-family="Ezra SIL" font-size="22" font-weight="bold" fill="#155e37" direction="rtl">הקלטת קורא מאושרת</text>

    <!-- Listen to Reader Button -->
    <rect x="116" y="910" width="848" height="82" rx="22" fill="#ece4d2" stroke="#cfc3a8" stroke-width="3"/>
    <text x="540" y="962" text-anchor="middle" font-family="Ezra SIL" font-size="34" font-weight="bold" fill="#2b2620" direction="rtl">השמעת הקורא (מנגן כעת)</text>

    <!-- Karaoke Pitch Chart Card -->
    <text x="955" y="1038" text-anchor="end" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#3a3a3a" direction="rtl">המנגינה של הקורא (טעמי המקרא)</text>
    <rect x="116" y="1054" width="848" height="390" rx="22" fill="#ffffff" stroke="#e3d9c2" stroke-width="3"/>

    <!-- Word columns inside chart (RTL) -->
    <rect x="836" y="1057" width="125" height="325" fill="#faf6ee"/>
    <rect x="710" y="1057" width="126" height="325" fill="#fff1c2"/>
    <rect x="584" y="1057" width="126" height="325" fill="#faf6ee"/>
    <rect x="474" y="1057" width="110" height="325" fill="#ffffff"/>
    <rect x="352" y="1057" width="122" height="325" fill="#faf6ee"/>
    <rect x="242" y="1057" width="110" height="325" fill="#ffffff"/>
    <rect x="119" y="1057" width="123" height="325" fill="#faf6ee"/>

    <!-- Horizontal pitch grid lines -->
    <line x1="120" y1="1120" x2="960" y2="1120" stroke="#efe9dc" stroke-width="2"/>
    <line x1="120" y1="1190" x2="960" y2="1190" stroke="#efe9dc" stroke-width="2"/>
    <line x1="120" y1="1260" x2="960" y2="1260" stroke="#efe9dc" stroke-width="2"/>
    <line x1="120" y1="1330" x2="960" y2="1330" stroke="#efe9dc" stroke-width="2"/>

    <!-- Reader Melody Lane (wide soft blue band + crisp center line) -->
    <path d="M 940 1210 C 900 1180, 875 1245, 845 1235 C 805 1220, 775 1270, 725 1240 C 680 1200, 645 1130, 595 1175 C 550 1215, 510 1240, 480 1225 C 435 1200, 395 1165, 360 1220 C 315 1265, 285 1235, 250 1245 C 205 1255, 165 1305, 135 1315"
      fill="none" stroke="#2f6fd0" stroke-width="26" stroke-linecap="round" opacity="0.24"/>
    <path d="M 940 1210 C 900 1180, 875 1245, 845 1235 C 805 1220, 775 1270, 725 1240 C 680 1200, 645 1130, 595 1175 C 550 1215, 510 1240, 480 1225 C 435 1200, 395 1165, 360 1220 C 315 1265, 285 1235, 250 1245 C 205 1255, 165 1305, 135 1315"
      fill="none" stroke="#2f6fd0" stroke-width="5" stroke-linecap="round"/>

    <!-- Red Playhead + Yad on the melody curve -->
    <line x1="765" y1="1057" x2="765" y2="1382" stroke="#b3261e" stroke-width="3.5"/>
    <image x="748" y="1178" width="76" height="76" href="data:image/png;base64,${yadB64}"/>

    <!-- Word labels under the chart -->
    <text x="898" y="1424" text-anchor="middle" font-family="Ezra SIL" font-size="25" fill="#555555" direction="rtl">בראשית</text>
    <text x="773" y="1424" text-anchor="middle" font-family="Ezra SIL" font-size="25" font-weight="bold" fill="#153152" direction="rtl">ברא</text>
    <text x="647" y="1424" text-anchor="middle" font-family="Ezra SIL" font-size="25" fill="#555555" direction="rtl">אלהים</text>
    <text x="529" y="1424" text-anchor="middle" font-family="Ezra SIL" font-size="25" fill="#555555" direction="rtl">את</text>
    <text x="413" y="1424" text-anchor="middle" font-family="Ezra SIL" font-size="25" fill="#555555" direction="rtl">השמים</text>
    <text x="297" y="1424" text-anchor="middle" font-family="Ezra SIL" font-size="25" fill="#555555" direction="rtl">ואת</text>
    <text x="180" y="1424" text-anchor="middle" font-family="Ezra SIL" font-size="25" fill="#555555" direction="rtl">הארץ</text>

    <!-- Record Verse Button -->
    <rect x="116" y="1480" width="848" height="106" rx="24" fill="#c92a22" stroke="#871813" stroke-width="4"/>
    <text x="540" y="1546" text-anchor="middle" font-family="Ezra SIL" font-size="40" font-weight="bold" fill="#ffffff" direction="rtl">קריאת הפסוק והקלטה</text>

    <!-- Rabbi encouragement tip -->
    <rect x="116" y="1615" width="848" height="125" rx="22" fill="#ffffff" stroke="#decfa8" stroke-width="2.5"/>
    <text x="926" y="1668" text-anchor="end" font-family="Ezra SIL" font-size="27" fill="#24211c" direction="rtl">טיפ מהרב: שימו לב לעצירה הגדולה באתנחתא במילה אֱלֹהִ֑ים</text>
    <text x="926" y="1712" text-anchor="end" font-family="Ezra SIL" font-size="26" fill="#635c50" direction="rtl">ולסיום הרגוע והיציב בסוף־פסוק במילה הָאָֽרֶץ</text>
  `,
});

// ---- Screenshot 3: All 5 Books of the Torah & 54 Parashot (Aliyah 1 Free) ----
const screen3 = phoneShell({
  headerTitle: 'כל חמשת חומשי התורה – 54 פרשות',
  headerSub: 'עלייה ראשונה (כהן) פתוחה בחינם בכל פרשה, עם ממוצע ציונים לכל עלייה',
  actionTitle: 'חמשת חומשי התורה',
  bodySvg: `
    <!-- 5 Books Selector Chips -->
    <text x="955" y="582" text-anchor="end" font-family="Ezra SIL" font-size="32" font-weight="bold" fill="#153152" direction="rtl">בחירת חומש</text>
    <rect x="780" y="600" width="184" height="58" rx="29" fill="#17375e"/>
    <text x="872" y="638" text-anchor="middle" font-family="Ezra SIL" font-size="26" font-weight="bold" fill="#ffd978" direction="rtl">בראשית (12)</text>
    <rect x="605" y="600" width="162" height="58" rx="29" fill="#ece3cf"/>
    <text x="686" y="638" text-anchor="middle" font-family="Ezra SIL" font-size="26" font-weight="bold" fill="#2b2620" direction="rtl">שמות (11)</text>
    <rect x="430" y="600" width="162" height="58" rx="29" fill="#ece3cf"/>
    <text x="511" y="638" text-anchor="middle" font-family="Ezra SIL" font-size="26" font-weight="bold" fill="#2b2620" direction="rtl">ויקרא (10)</text>
    <rect x="255" y="600" width="162" height="58" rx="29" fill="#ece3cf"/>
    <text x="336" y="638" text-anchor="middle" font-family="Ezra SIL" font-size="26" font-weight="bold" fill="#2b2620" direction="rtl">במדבר (10)</text>
    <rect x="116" y="600" width="126" height="58" rx="29" fill="#ece3cf"/>
    <text x="179" y="638" text-anchor="middle" font-family="Ezra SIL" font-size="26" font-weight="bold" fill="#2b2620" direction="rtl">דברים</text>

    <!-- Selected Parasha Hero Card -->
    <rect x="116" y="678" width="848" height="238" rx="30" fill="#17375e" stroke="#d6a63e" stroke-width="3.5"/>
    <rect x="142" y="704" width="145" height="126" rx="22" fill="#0e2440" stroke="#f0bc42" stroke-width="3"/>
    <text x="214" y="772" text-anchor="middle" font-family="Arial" font-size="52" font-weight="bold" fill="#ffd978">92</text>
    <text x="214" y="810" text-anchor="middle" font-family="Ezra SIL" font-size="22" fill="#d6e4f7" direction="rtl">ממוצע פרשה</text>

    <text x="932" y="732" text-anchor="end" font-family="Ezra SIL" font-size="36" font-weight="bold" fill="#ffd978" direction="rtl">פרשת בראשית · בעל קורא מוסמך</text>
    <text x="932" y="778" text-anchor="end" font-family="Ezra SIL" font-size="25" fill="#eef4fc" direction="rtl">פרקים א׳–ו׳ · 146 פסוקים · כל 7 העליות</text>

    <rect x="142" y="844" width="796" height="54" rx="18" fill="#1a5ca3"/>
    <text x="540" y="880" text-anchor="middle" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#ffffff" direction="rtl">התחלת עלייה ראשונה בחינם (כל הפסוקים פתוחים)</text>

    <!-- 7 Aliyot Breakdown -->
    <text x="955" y="962" text-anchor="end" font-family="Ezra SIL" font-size="32" font-weight="bold" fill="#153152" direction="rtl">שבע העליות בפרשת בראשית</text>

    <!-- Aliyah 1 (Free) -->
    <rect x="116" y="982" width="848" height="122" rx="22" fill="#ffffff" stroke="#219653" stroke-width="3"/>
    <circle cx="912" cy="1043" r="32" fill="#17375e"/>
    <text x="912" y="1054" text-anchor="middle" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#ffffff" direction="rtl">א׳</text>
    <text x="860" y="1032" text-anchor="end" font-family="Ezra SIL" font-size="30" font-weight="bold" fill="#153152" direction="rtl">עליית ראשון (כהן) · חינם</text>
    <text x="860" y="1074" text-anchor="end" font-family="Ezra SIL" font-size="24" fill="#187a46" direction="rtl">פרק א׳:א׳ – ב׳:ג׳ · 34 פסוקים פתוחים לתרגול מלא</text>
    <rect x="142" y="1004" width="124" height="78" rx="18" fill="#d9f5e4" stroke="#289e5a" stroke-width="2"/>
    <text x="204" y="1044" text-anchor="middle" font-family="Ezra SIL" font-size="26" font-weight="bold" fill="#0f6132" direction="rtl">חינם</text>
    <text x="204" y="1070" text-anchor="middle" font-family="Ezra SIL" font-size="20" fill="#0f6132" direction="rtl">פתוח תמיד</text>

    <!-- Aliyah 2 -->
    <rect x="116" y="1120" width="848" height="122" rx="22" fill="#ffffff" stroke="#e3d8be" stroke-width="2.5"/>
    <circle cx="912" cy="1181" r="32" fill="#17375e"/>
    <text x="912" y="1192" text-anchor="middle" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#ffffff" direction="rtl">ב׳</text>
    <text x="860" y="1170" text-anchor="end" font-family="Ezra SIL" font-size="30" font-weight="bold" fill="#153152" direction="rtl">עליית שני (לוי)</text>
    <text x="860" y="1212" text-anchor="end" font-family="Ezra SIL" font-size="24" fill="#635c50" direction="rtl">פרק ב׳:ד׳ – ב׳:י״ט · 16 פסוקים · רמת בעל קורא</text>
    <rect x="142" y="1142" width="124" height="78" rx="18" fill="#f5efe0" stroke="#decb9e" stroke-width="2"/>
    <text x="204" y="1184" text-anchor="middle" font-family="Arial" font-size="32" font-weight="bold" fill="#153152">94</text>
    <text x="204" y="1210" text-anchor="middle" font-family="Ezra SIL" font-size="20" fill="#6b6252" direction="rtl">ממוצע</text>

    <!-- Aliyah 3 -->
    <rect x="116" y="1258" width="848" height="122" rx="22" fill="#ffffff" stroke="#e3d8be" stroke-width="2.5"/>
    <circle cx="912" cy="1319" r="32" fill="#17375e"/>
    <text x="912" y="1330" text-anchor="middle" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#ffffff" direction="rtl">ג׳</text>
    <text x="860" y="1308" text-anchor="end" font-family="Ezra SIL" font-size="30" font-weight="bold" fill="#153152" direction="rtl">עליית שלישי</text>
    <text x="860" y="1350" text-anchor="end" font-family="Ezra SIL" font-size="24" fill="#635c50" direction="rtl">פרק ב׳:כ׳ – ג׳:כ״א · 27 פסוקים · מוכן לבר־מצווה</text>
    <rect x="142" y="1280" width="124" height="78" rx="18" fill="#f5efe0" stroke="#decb9e" stroke-width="2"/>
    <text x="204" y="1322" text-anchor="middle" font-family="Arial" font-size="32" font-weight="bold" fill="#153152">89</text>
    <text x="204" y="1348" text-anchor="middle" font-family="Ezra SIL" font-size="20" fill="#6b6252" direction="rtl">ממוצע</text>

    <!-- Aliyah 4 -->
    <rect x="116" y="1396" width="848" height="122" rx="22" fill="#ffffff" stroke="#e3d8be" stroke-width="2.5"/>
    <circle cx="912" cy="1457" r="32" fill="#17375e"/>
    <text x="912" y="1468" text-anchor="middle" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#ffffff" direction="rtl">ד׳</text>
    <text x="860" y="1446" text-anchor="end" font-family="Ezra SIL" font-size="30" font-weight="bold" fill="#153152" direction="rtl">עליית רביעי</text>
    <text x="860" y="1488" text-anchor="end" font-family="Ezra SIL" font-size="24" fill="#635c50" direction="rtl">פרק ג׳:כ״ב – ד׳:י״ח · 21 פסוקים · מוכן לבר־מצווה</text>
    <rect x="142" y="1418" width="124" height="78" rx="18" fill="#f5efe0" stroke="#decb9e" stroke-width="2"/>
    <text x="204" y="1460" text-anchor="middle" font-family="Arial" font-size="32" font-weight="bold" fill="#153152">91</text>
    <text x="204" y="1486" text-anchor="middle" font-family="Ezra SIL" font-size="20" fill="#6b6252" direction="rtl">ממוצע</text>

    <!-- More Parashot Preview -->
    <text x="955" y="1572" text-anchor="end" font-family="Ezra SIL" font-size="32" font-weight="bold" fill="#153152" direction="rtl">פרשות נוספות בחומש בראשית</text>
    <rect x="116" y="1592" width="848" height="114" rx="22" fill="#ffffff" stroke="#e3d8be" stroke-width="2.5"/>
    <text x="926" y="1644" text-anchor="end" font-family="Ezra SIL" font-size="32" font-weight="bold" fill="#153152" direction="rtl">פרשת נח · פרשת לך־לך · פרשת וירא · חיי שרה</text>
    <text x="926" y="1686" text-anchor="end" font-family="Ezra SIL" font-size="25" fill="#187a46" direction="rtl">עלייה ראשונה חינם בכל 54 הפרשות בחמשת חומשי התורה</text>
  `,
});

// ---- Screenshot 4: Results, 5-Category Evaluation & Melody Comparison ----
const screen4 = phoneShell({
  headerTitle: 'משוב חכם ומדויק במכשיר ללא אינטרנט',
  headerSub: 'ציון על המילים, האותיות, הניקוד, מנגינת הטעמים והפיסוק',
  actionTitle: 'תוצאות ותגמולים',
  bodySvg: `
    <!-- Passed Hero Status Card -->
    <rect x="116" y="556" width="848" height="172" rx="28" fill="#e2f5e9" stroke="#289e5a" stroke-width="3.5"/>
    <rect x="142" y="578" width="145" height="128" rx="22" fill="#0e2440" stroke="#f0bc42" stroke-width="3"/>
    <text x="214" y="646" text-anchor="middle" font-family="Arial" font-size="52" font-weight="bold" fill="#ffd978">94</text>
    <text x="214" y="684" text-anchor="middle" font-family="Ezra SIL" font-size="22" fill="#d6e4f7" direction="rtl">סף מעבר: 75</text>

    <text x="932" y="608" text-anchor="end" font-family="Ezra SIL" font-size="36" font-weight="bold" fill="#153152" direction="rtl">עבר בהצלחה רבה</text>
    <text x="932" y="654" text-anchor="end" font-family="Ezra SIL" font-size="30" font-weight="bold" fill="#153152" direction="rtl">רמת הביצוע: בעל קורא מוסמך</text>
    <text x="932" y="698" text-anchor="end" font-family="Ezra SIL" font-size="25" fill="#187a46" direction="rtl">ביצוע מופתי · דיוק מעולה במילים, בניקוד ובטעמים</text>

    <!-- Gamified Rewards Card -->
    <rect x="116" y="746" width="848" height="92" rx="24" fill="#fff9e6" stroke="#e6b437" stroke-width="3"/>
    <rect x="705" y="766" width="230" height="52" rx="18" fill="#e3f0ff"/>
    <text x="820" y="801" text-anchor="middle" font-family="Ezra SIL" font-size="26" font-weight="bold" fill="#134a8e" direction="rtl">+65 נקודות XP</text>
    <rect x="425" y="766" width="255" height="52" rx="18" fill="#fff0bd"/>
    <text x="552" y="801" text-anchor="middle" font-family="Ezra SIL" font-size="26" font-weight="bold" fill="#825300" direction="rtl">+38 מטבעות זהב</text>
    <rect x="142" y="766" width="258" height="52" rx="18" fill="#ffe6d1"/>
    <text x="271" y="801" text-anchor="middle" font-family="Ezra SIL" font-size="26" font-weight="bold" fill="#a83800" direction="rtl">רצף 12 ימים</text>

    <!-- 5-Category Score Breakdown -->
    <text x="955" y="886" text-anchor="end" font-family="Ezra SIL" font-size="32" font-weight="bold" fill="#153152" direction="rtl">פירוט הציונים לפי קטגוריה</text>
    <rect x="116" y="904" width="848" height="310" rx="22" fill="#ffffff" stroke="#e3d8be" stroke-width="2.5"/>

    <text x="926" y="952" text-anchor="end" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#153152" direction="rtl">דיוק במילים (זיהוי קולי במכשיר)</text>
    <text x="150" y="952" text-anchor="start" font-family="Arial" font-size="30" font-weight="bold" fill="#187a46">98</text>
    <line x1="145" y1="968" x2="935" y2="968" stroke="#ece4d2" stroke-width="2"/>

    <text x="926" y="1010" text-anchor="end" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#153152" direction="rtl">אותיות והגייה (דגשים ושין/סין)</text>
    <text x="150" y="1010" text-anchor="start" font-family="Arial" font-size="30" font-weight="bold" fill="#187a46">95</text>
    <line x1="145" y1="1026" x2="935" y2="1026" stroke="#ece4d2" stroke-width="2"/>

    <text x="926" y="1068" text-anchor="end" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#153152" direction="rtl">ניקוד ותנועות (קמץ, צירה, חולם, שווא)</text>
    <text x="150" y="1068" text-anchor="start" font-family="Arial" font-size="30" font-weight="bold" fill="#187a46">93</text>
    <line x1="145" y1="1084" x2="935" y2="1084" stroke="#ece4d2" stroke-width="2"/>

    <text x="926" y="1126" text-anchor="end" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#153152" direction="rtl">טעמי המקרא — מנגינה</text>
    <text x="150" y="1126" text-anchor="start" font-family="Arial" font-size="30" font-weight="bold" fill="#187a46">91</text>
    <line x1="145" y1="1142" x2="935" y2="1142" stroke="#ece4d2" stroke-width="2"/>

    <text x="926" y="1186" text-anchor="end" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#153152" direction="rtl">פיסוק וטעמים מפסיקים</text>
    <text x="150" y="1186" text-anchor="start" font-family="Arial" font-size="30" font-weight="bold" fill="#187a46">96</text>

    <!-- Student vs Reader Melody Comparison Chart -->
    <text x="955" y="1262" text-anchor="end" font-family="Ezra SIL" font-size="28" font-weight="bold" fill="#3a3a3a" direction="rtl">המנגינה שלכם (כתום) מול הקורא (כחול)</text>
    <rect x="116" y="1278" width="848" height="310" rx="22" fill="#ffffff" stroke="#e3d9c2" stroke-width="3"/>

    <line x1="120" y1="1340" x2="960" y2="1340" stroke="#efe9dc" stroke-width="2"/>
    <line x1="120" y1="1410" x2="960" y2="1410" stroke="#efe9dc" stroke-width="2"/>
    <line x1="120" y1="1480" x2="960" y2="1480" stroke="#efe9dc" stroke-width="2"/>

    <!-- Reader Blue Lane -->
    <path d="M 940 1420 C 900 1390, 875 1455, 845 1445 C 805 1430, 775 1480, 725 1450 C 680 1410, 645 1340, 595 1385 C 550 1425, 510 1450, 480 1435 C 435 1410, 395 1375, 360 1430 C 315 1475, 285 1445, 250 1455 C 205 1465, 165 1515, 135 1525"
      fill="none" stroke="#2f6fd0" stroke-width="26" stroke-linecap="round" opacity="0.24"/>
    <!-- Student Orange Line following inside the lane -->
    <path d="M 940 1424 C 900 1395, 875 1450, 845 1442 C 805 1434, 775 1474, 725 1446 C 680 1416, 645 1348, 595 1388 C 550 1420, 510 1445, 480 1432 C 435 1414, 395 1380, 360 1426 C 315 1470, 285 1448, 250 1452 C 205 1462, 165 1510, 135 1520"
      fill="none" stroke="#e07b00" stroke-width="6" stroke-linecap="round"/>

    <!-- Next Verse CTA Button -->
    <rect x="116" y="1620" width="848" height="106" rx="24" fill="#168a53" stroke="#0d5935" stroke-width="4"/>
    <text x="540" y="1686" text-anchor="middle" font-family="Ezra SIL" font-size="38" font-weight="bold" fill="#ffffff" direction="rtl">לפסוק הבא</text>
  `,
});

renderPng(screen1, 'phone-1-home.png');
renderPng(screen2, 'phone-2-practice.png');
renderPng(screen3, 'phone-3-parashot.png');
renderPng(screen4, 'phone-4-results.png');
