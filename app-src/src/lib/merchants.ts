// Guess a category from a note or merchant name. Learned choices override the built-in list.

const RULES: [string, string[]][] = [
  ['food', ['שופרסל', 'רמי לוי', 'ויקטורי', 'יוחננוף', 'אושר עד', 'מגה', 'יינות ביתן', 'חצי חינם', 'טיב טעם', 'קרפור', 'carrefour', 'am:pm', 'ampm', 'סופר', 'מכולת', 'קצביה', 'ירקן', 'מאפיה', 'פירות', 'יוחננוף', 'קשת טעמים', 'פרש מרקט', 'זול ובגדול', 'סטופ מרקט', 'shufersal', 'rami levy', 'grocery']],
  ['dining', ['ארומה', 'קפה', 'cafe', 'coffee', 'מסעדה', 'פיצה', 'בורגר', 'מקדונלד', 'mcdonald', 'בורגראנץ', 'וולט', 'wolt', 'תן ביס', '10bis', 'סושי', 'שווארמה', 'פלאפל', 'גרג', 'לנדוור', 'רולדין', 'ביסטרו', 'בר ', 'פאב', 'starbucks', 'דומינו', 'פאפא ג׳ונס', 'kfc']],
  ['transport', ['פז', 'דלק', 'סונול', 'דור אלון', 'ten', 'טן ', 'yellow', 'רב קו', 'רב-קו', 'רכבת', 'אגד', 'דן ', 'מטרופולין', 'גט ', 'gett', 'יאנגו', 'yango', 'uber', 'מונית', 'חניה', 'פנגו', 'pango', 'סלופארק', 'cellopark', 'כביש 6', 'מוסך', 'טסט', 'צמיגים', 'אוטובוס', 'bird', 'lime']],
  ['housing', ['שכירות', 'שכר דירה', 'משכנתא', 'ועד בית', 'שכ"ד']],
  ['bills', ['חברת החשמל', 'חשמל', 'מים', 'תאגיד', 'ארנונה', 'עירייה', 'עיריית', 'גז', 'סופרגז', 'אמישראגז', 'פזגז', 'cellcom energy']],
  ['comms', ['פרטנר', 'partner', 'סלקום', 'cellcom', 'פלאפון', 'pelephone', 'הוט', 'hot ', 'בזק', 'bezeq', 'גולן טלקום', '012', '019', 'we4g', 'רמי לוי תקשורת', 'אינטרנט', 'סלולר']],
  ['subs', ['netflix', 'נטפליקס', 'spotify', 'ספוטיפיי', 'apple', 'icloud', 'google', 'youtube', 'disney', 'amazon prime', 'yes ', 'סלקום tv', 'chatgpt', 'openai', 'claude', 'anthropic', 'microsoft', 'adobe', 'canva', 'dropbox', 'מנוי']],
  ['health', ['סופר-פארם', 'סופר פארם', 'superpharm', 'גוד פארם', 'be ', 'מכבי', 'כללית', 'מאוחדת', 'לאומית', 'רופא', 'שיניים', 'אופטיקה', 'בית מרקחת', 'פארם', 'תרופות', 'פיזיותרפיה', 'פסיכולוג']],
  ['insurance', ['ביטוח', 'הראל', 'מגדל', 'הפניקס', 'כלל ביטוח', 'מנורה', 'איילון', 'ביטוח ישיר', 'aig', 'שומרה', 'הכשרה']],
  ['kids', ['גן ', 'צהרון', 'בית ספר', 'חוג', 'בייביסיטר', 'שמרטף', 'טויס', 'toys', 'שילב', 'מוצצים', 'חיתולים']],
  ['clothing', ['זארה', 'zara', 'h&m', 'קסטרו', 'castro', 'פוקס', 'fox', 'גולף', 'רנואר', 'אמריקן איגל', 'נייקי', 'nike', 'adidas', 'אדידס', 'טרמינל x', 'terminal x', 'shein', 'שיין', 'נעליים', 'הוניגמן', 'mango']],
  ['home', ['איקאה', 'ikea', 'ace', 'הום סנטר', 'home center', 'טמבור', 'כתר', 'max stock', 'מקס סטוק', 'ניצת הדובדבן', 'עזריאלי', 'amazon', 'אמזון', 'aliexpress', 'עלי אקספרס', 'ksp', 'באג', 'bug', 'מחסני חשמל', 'שקם אלקטריק', 'ivory', 'איבורי']],
  ['fun', ['סינמה', 'יס פלאנט', 'yes planet', 'קולנוע', 'הופעה', 'כרטיס', 'לאן', 'eventim', 'תיאטרון', 'מוזיאון', 'לונה פארק', 'בריכה', 'steam', 'playstation', 'xbox', 'nintendo']],
  ['care', ['מספרה', 'ציפורניים', 'קוסמטיקה', 'ספא', 'מניקור', 'סבון', 'מקס פקטור', 'mac ', 'sephora']],
  ['sport', ['הולמס פלייס', 'holmes', 'גו אקטיב', 'go active', 'חדר כושר', 'פילאטיס', 'יוגה', 'דקטלון', 'decathlon', 'מגה ספורט']],
  ['growth', ['קורס', 'udemy', 'coursera', 'סדנה', 'ספר', 'סטימצקי', 'צומת ספרים', 'אוניברסיטה', 'מכללה', 'שכר לימוד']],
  ['gifts', ['מתנה', 'תרומה', 'צדקה', 'חתונה', 'בר מצווה', 'בת מצווה', 'יום הולדת']],
  ['travel', ['אל על', 'el al', 'ישראייר', 'ארקיע', 'wizz', 'ryanair', 'booking', 'airbnb', 'מלון', 'hotel', 'טיסה', 'expedia', 'אגודה', 'agoda']],
  ['pets', ['וטרינר', 'פט שופ', 'pet', 'מזון לכלב', 'חתול']],
  ['debt', ['הלוואה', 'החזר הלוואה', 'ריבית', 'עמלה']],
];

const INCOME_RULES: [string, string[]][] = [
  ['salary', ['משכורת', 'שכר', 'salary', 'payroll']],
  ['bonus', ['בונוס', 'bonus', 'מענק']],
  ['refund', ['החזר', 'זיכוי', 'refund']],
  ['allowance', ['ביטוח לאומי', 'קצבה', 'קצבת', 'דמי אבטלה', 'מילואים']],
  ['invest_inc', ['דיבידנד', 'ריבית זכות', 'dividend']],
  ['rent_inc', ['שכירות', 'שכר דירה']],
  ['freelance', ['חשבונית', 'לקוח', 'תשלום עבור', 'paypal', 'bit ', 'ביט', 'פייבוקס', 'paybox']],
];

export const merchantKey = (note: string) => note.trim().toLowerCase().replace(/\s+/g, ' ').split(' ').slice(0, 2).join(' ');

export function guessCategory(note: string, type: 'expense' | 'income', learned: Record<string, string>): string | null {
  if (!note.trim()) return null;
  const key = merchantKey(note);
  if (learned[`${type}:${key}`]) return learned[`${type}:${key}`];
  const s = ' ' + note.toLowerCase() + ' ';
  for (const [cat, words] of type === 'expense' ? RULES : INCOME_RULES) {
    if (words.some(w => s.includes(w.toLowerCase()))) return cat;
  }
  return null;
}
