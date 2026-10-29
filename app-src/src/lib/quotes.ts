// Quotes from investors, behavioral economists and thinkers, with the original wording.
// Only quotes whose wording and source were checked against the original (letters, books, talks).
// Popular misattributions (Buffett's "Rule No. 1", Franklin's "investment in knowledge", etc.) are left out on purpose.

export interface Quote { he: string; en: string; who: string; src?: string; tag: string }

export const QUOTES: Quote[] = [
  { he: 'המחיר הוא מה שאתה משלם. הערך הוא מה שאתה מקבל.', en: 'Price is what you pay; value is what you get.', who: 'וורן באפט, בעקבות בנג׳מין גרהם', src: 'מכתב לבעלי המניות, 2008', tag: 'השקעות' },
  { he: 'אנחנו פשוט מנסים לפחד כשאחרים חמדנים, ולהיות חמדנים רק כשאחרים מפחדים.', en: 'We simply attempt to be fearful when others are greedy and to be greedy only when others are fearful.', who: 'וורן באפט', src: 'מכתב לבעלי המניות, 1986', tag: 'השקעות' },
  { he: 'תקופת ההחזקה האהובה עלינו היא לנצח.', en: 'Our favorite holding period is forever.', who: 'וורן באפט', src: 'מכתב לבעלי המניות, 1988', tag: 'סבלנות' },
  { he: 'עצלות שגובלת בבטלנות נשארת אבן הפינה של סגנון ההשקעה שלנו.', en: 'Lethargy bordering on sloth remains the cornerstone of our investment style.', who: 'וורן באפט', src: 'מכתב לבעלי המניות, 1990', tag: 'סבלנות' },
  { he: 'חוסר מעש נראה לנו כהתנהגות נבונה.', en: 'Inactivity strikes us as intelligent behavior.', who: 'וורן באפט', src: 'מכתב לבעלי המניות, 1996', tag: 'סבלנות' },
  { he: 'משקיעים צריכים לזכור שהתרגשות והוצאות הן האויבים שלהם.', en: 'Investors should remember that excitement and expenses are their enemies.', who: 'וורן באפט', src: 'מכתב לבעלי המניות, 2004', tag: 'משמעת' },
  { he: '90% בקרן מדד S&P 500 בעלות נמוכה מאוד, ו-10% באג״ח ממשלתיות קצרות.', en: 'Put 10% of the cash in short-term government bonds and 90% in a very low-cost S&P 500 index fund.', who: 'וורן באפט, על הצוואה שלו', src: 'מכתב לבעלי המניות, 2013', tag: 'מדדים' },
  { he: 'הם הולכים לישון כל לילה קצת יותר חכמים מכשקמו בבוקר.', en: 'They go to bed every night a little wiser than when they got up.', who: 'צ׳רלי מאנגר', src: 'נאום סיום, USC Law, 2007', tag: 'צמיחה' },
  { he: 'אל תחפש את המחט בערימת השחת. פשוט תקנה את כל הערימה.', en: "Don't look for the needle in the haystack. Just buy the haystack!", who: 'ג׳ון בוגל', src: 'The Little Book of Common Sense Investing, 2007', tag: 'מדדים' },
  { he: 'הזמן הוא החבר שלך. הדחף הוא האויב שלך.', en: 'Time is your friend; impulse is your enemy.', who: 'ג׳ון בוגל', tag: 'סבלנות' },
  { he: 'אל תתנו לרודנות של עלויות מצטברות לבלוע את הקסם של תשואות מצטברות.', en: 'Do not allow the tyranny of compounding costs to overwhelm the magic of compounding returns.', who: 'ג׳ון בוגל', src: 'Financial Analysts Journal, 2014', tag: 'דמי ניהול' },
  { he: 'הבעיה העיקרית של המשקיע, ואפילו האויב הגדול ביותר שלו, היא כנראה הוא עצמו.', en: "The investor's chief problem—and even his worst enemy—is likely to be himself.", who: 'בנג׳מין גרהם', src: 'המשקיע הנבון', tag: 'פסיכולוגיה' },
  { he: 'דע מה אתה מחזיק, ודע למה אתה מחזיק את זה.', en: 'Know what you own, and know why you own it.', who: 'פיטר לינץ׳', tag: 'השקעות' },
  { he: 'שום דבר בחיים אינו חשוב כמו שנדמה לך, בזמן שאתה חושב עליו.', en: 'Nothing in life is as important as you think it is, while you are thinking about it.', who: 'דניאל כהנמן', src: 'לחשוב מהר, לחשוב לאט, 2011', tag: 'כלכלה התנהגותית' },
  { he: 'הפסדים נראים גדולים יותר מרווחים.', en: 'Losses loom larger than gains.', who: 'דניאל כהנמן ועמוס טברסקי', src: 'תורת הערך, Econometrica, 1979', tag: 'כלכלה התנהגותית' },
  { he: 'להצליח עם כסף קשור מעט למידת החוכמה שלך, והרבה להתנהגות שלך.', en: 'Doing well with money has a little to do with how smart you are and a lot to do with how you behave.', who: 'מורגן האוסל', src: 'הפסיכולוגיה של הכסף, 2020', tag: 'פסיכולוגיה' },
  { he: 'עושר הוא מה שלא רואים.', en: "Wealth is what you don't see.", who: 'מורגן האוסל', src: 'הפסיכולוגיה של הכסף, 2020', tag: 'הון שקט' },
  { he: 'השליטה בזמן שלך היא הדיבידנד הגבוה ביותר שכסף משלם.', en: 'Controlling your time is the highest dividend money pays.', who: 'מורגן האוסל', src: 'הפסיכולוגיה של הכסף, 2020', tag: 'חירות' },
  { he: 'להוציא כסף כדי להראות לאנשים כמה כסף יש לך, זו הדרך המהירה ביותר שיהיה לך פחות.', en: 'Spending money to show people how much money you have is the fastest way to have less money.', who: 'מורגן האוסל', src: 'הפסיכולוגיה של הכסף, 2020', tag: 'הון שקט' },
  { he: 'עושר אינו אותו דבר כמו הכנסה. מי שמרוויח יפה ומוציא הכול, לא נעשה עשיר יותר. הוא פשוט חי ברמה גבוהה.', en: 'Wealth is not the same as income. If you make a good income each year and spend it all, you are not getting wealthier. You are just living high.', who: 'תומס סטנלי וויליאם דנקו', src: 'המיליונר השכן, 1996', tag: 'הון שקט' },
  { he: 'היזהר מהוצאות קטנות. דליפה קטנה תטביע ספינה גדולה.', en: 'Beware of little expenses; a small leak will sink a great ship.', who: 'בנג׳מין פרנקלין', src: 'הדרך לעושר, 1758', tag: 'הוצאות' },
  { he: 'משמעת היא הגשר בין מחשבות להישגים.', en: 'Discipline is the bridge between thoughts and accomplishments.', who: 'ג׳ים רון', src: '7 Strategies for Wealth & Happiness, 1985', tag: 'משמעת' },
  { he: 'אתה לא עולה לרמה של המטרות שלך. אתה יורד לרמה של המערכות שלך.', en: 'You do not rise to the level of your goals. You fall to the level of your systems.', who: 'ג׳יימס קליר', src: 'הרגלים אטומיים, 2018', tag: 'הרגלים' },
  { he: 'שלשלאות ההרגל הקטנות כמעט אף פעם אינן כבדות מספיק כדי שנרגיש אותן, עד שהן חזקות מכדי שנשבור אותן.', en: 'The diminutive chains of habit are seldom heavy enough to be felt, till they are too strong to be broken.', who: 'סמואל ג׳ונסון', src: 'The Vision of Theodore, 1748 · באפט מצטט זאת לעיתים קרובות', tag: 'הרגלים' },
  { he: 'לא מי שיש לו מעט הוא העני, אלא מי שמשתוקק ליותר.', en: 'It is not the man who has too little, but the man who craves more, that is poor.', who: 'סנקה', src: 'מכתבים ללוקיליוס, מכתב 2', tag: 'הסתפקות' },
  { he: 'שווקים עולים נולדים בפסימיות, גדלים בספקנות, מתבגרים באופטימיות ומתים באופוריה.', en: 'Bull markets are born on pessimism, grow on skepticism, mature on optimism, and die on euphoria.', who: 'ג׳ון טמפלטון', tag: 'שווקים' },
  { he: 'מי שאומר "הפעם זה שונה" אמר את ארבע המילים היקרות ביותר בתולדות ההשקעות.', en: '"This time is different" — among the four most costly words in the annals of investing.', who: 'ג׳ון טמפלטון', src: '16 הכללים של טמפלטון', tag: 'שווקים' },
  { he: 'כאב ועוד רפלקציה שווים התקדמות.', en: 'Pain + Reflection = Progress.', who: 'ריי דאליו', src: 'עקרונות, 2017', tag: 'צמיחה' },
  { he: 'אי אפשר לחזות. אפשר להתכונן.', en: "You can't predict. You can prepare.", who: 'הווארד מרקס', src: 'מזכר Oaktree, 2001', tag: 'סיכון' },
  { he: 'לא משנה כמה כסף אתה מרוויח, אלא כמה אתה שומר.', en: "It's not how much money you make, but how much money you keep.", who: 'רוברט קיוסקי', src: 'אבא עשיר, אבא עני, 1997', tag: 'חיסכון' },
  { he: 'כסף הוא משהו שאנחנו בוחרים להחליף תמורתו את אנרגיית החיים שלנו.', en: 'Money is something we choose to trade our life energy for.', who: 'ויקי רובין וג׳ו דומינגז', src: 'הכסף או החיים, 1992', tag: 'זמן' },
  { he: 'הרוויחו עם הראש, לא עם הזמן.', en: 'Earn with your mind, not your time.', who: 'נבאל רביקאנט', src: 'The Almanack of Naval Ravikant, 2020', tag: 'הכנסה' },
  { he: 'הרוח מכבה נר ומלבה אש.', en: 'Wind extinguishes a candle and energizes fire.', who: 'נסים ניקולס טאלב', src: 'אנטי-שביר, 2012', tag: 'חוסן' },
];

export function quoteOfDay(offset = 0, d = new Date()): Quote {
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
  const i = ((day + offset) % QUOTES.length + QUOTES.length) % QUOTES.length;
  return QUOTES[i];
}
