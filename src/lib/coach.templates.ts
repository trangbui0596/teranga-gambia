// Fixed runtime copy. No AI is called while rendering coaching messages.
// UNVERIFIED Wolof, machine-translated, needs native review.
export type CoachLanguage = "wo" | "en";

export const COACH_TEMPLATES = {
  header: {
    en: "Teranga coaching (AI-generated summary of public reviews, may be wrong.)",
    wo: "Teranga coaching (summary bu AI defar ci reviews yu ñépp mëna gis, mën na baña dëppoo.)",
  },
  counts: { en: "{places} places, {reviews} reviews analyzed, {from} to {to}.", wo: "{places} barab, {reviews} xalaat yu ñu seetlu, tambale {from} ba {to}." },
  source: { en: "Source: Google Maps public reviews.", wo: "Gongikuwaay: Google Maps reviews yu ñépp mëna gis." },
  topThemes: { en: "Top themes:", wo: "Mbir yi gëna fëss:" },
  actions: { en: "Actions:", wo: "Jëf yu ñu digle:" },
  countPhrase: { en: "{n} of {total} reviews", wo: "{n} ci {total} xalaat" },
  complaintCount: { en: "{n} of {total} reviews complain.", wo: "{n} ci {total} xalaat ñaxtu nañu." },
  praiseCount: { en: "{n} of {total} reviews praise it.", wo: "{n} ci {total} xalaat kañ nañu ko." },
  recordImprove: { en: "Record or improve your \"{topic}\" answer.", wo: "Waxal sa tontu ci \"{topic}\" ci kàddu, walla gënal ko." },
  ensureCovers: { en: "Make sure your \"{topic}\" answer covers it.", wo: "Fexeel ba sa tontu ci \"{topic}\" ëmb lii." },
  talkNoor: { en: "Talk about it with Noor.", wo: "Waxtaanal ak Noor ci loolu." },
  mentionGreeting: { en: "Mention it when you greet visitors.", wo: "Tudd ko boo nuyyoo gan yi." },
  prices: {
    en: "Prices mentioned: {count} times, {min}{range}{max} {currency}. Ask a person: no automatic price changes.",
    wo: "Njekk yi ñu tudd: {count} yoon, {min}{range}{max} {currency}. Laajal nit: njekk yi duñu soppiku boppam.",
  },
  thin: { en: "Not enough real review data to coach reliably ({reviews} reviews from {places} places).", wo: "Xalaat yu dëgg yi néew nañu ngir joxe ndigalu coaching bu wóor ({reviews} xalaat ci {places} barab)." },
  noReviews: { en: "Teranga coaching: Google Maps returned no reviews ({places} places found). Nothing to coach yet.", wo: "Teranga coaching: Google Maps joxewul benn xalaat ({places} barab lañu gis). Amul lu ñu mëna coach léegi." },
  noThemes: { en: "No tour themes found.", wo: "Gisul benn mbir ci tukki bi." },
  limits: { en: "Limits: Google shows only up to 5 reviews per place, so this sample is not complete.", wo: "Àpp: Google day woné ba 5 xalaat rekk ci barab bu ne, kon misaal bii matul sëkk." },
  moreHint: { en: "Send COACH MORE for the rest.", wo: "Yoneel COACH MORE ngir li ci des." },
  englishHint: { en: "Send COACH EN for English.", wo: "Yoneel COACH EN ngir Angale." },
  moreHeader: { en: "Teranga coaching, more (AI-generated summary of public reviews, may be wrong.)", wo: "Teranga coaching, yeneen (summary bu AI defar ci reviews yu ñépp mëna gis, mën na baña dëppoo.)" },
  notReady: { en: "Coaching is not ready yet. A fresh run takes about 30 seconds. Send COACH again later.", wo: "Coaching bi paré gul. Xoolaat bu bees bi day jël lu tollu ci 30 seconds. Yoneel COACH ci kanam tuuti." },
  noRecent: { en: "No recent coaching. Send COACH first.", wo: "Amul coaching bu bees. Yoneel COACH ba mu jëkk." },
  nothingMore: { en: "Nothing more: everything was in the first message.", wo: "Amul leneen: lépp nekk na ci message bu jëkk bi." },
  loadError: { en: "Coaching could not load right now. Send COACH again in a minute.", wo: "Coaching bi mënuñu ko ubbi léegi. Yoneel COACHaat ci benn simili." },
  machineLabel: { en: "Machine-translated Wolof, unverified", wo: "Wolof bu masin tekki, wóoragul" },
  unknownDates: { en: "unknown dates", wo: "bés yu ñu xamul" },
  action: { en: "Action {n}.", wo: "Jëf {n}." },
} as const;

export const THEME_TEMPLATES = {
  price_value: { en: { positive: "Price/value (positive)", negative: "Price/value (complaint)" }, wo: { positive: "Njekk/njariñ (lu neex)", negative: "Njekk/njariñ (ñaxtu)" } },
  guide_quality: { en: { positive: "Guide quality (positive)", negative: "Guide quality (complaint)" }, wo: { positive: "Baaxu guide bi (lu neex)", negative: "Baaxu guide bi (ñaxtu)" } },
  punctuality: { en: { positive: "Punctuality (positive)", negative: "Punctuality (complaint)" }, wo: { positive: "Tegg ci waxtu (lu neex)", negative: "Tegg ci waxtu (ñaxtu)" } },
  safety: { en: { positive: "Safety (positive)", negative: "Safety (complaint)" }, wo: { positive: "Kaarange (lu neex)", negative: "Kaarange (ñaxtu)" } },
  communication_booking: { en: { positive: "Booking/communication (positive)", negative: "Booking/communication (complaint)" }, wo: { positive: "Booking/waxtaan (lu neex)", negative: "Booking/waxtaan (ñaxtu)" } },
  food: { en: { positive: "Food (positive)", negative: "Food (complaint)" }, wo: { positive: "Ñam (lu neex)", negative: "Ñam (ñaxtu)" } },
  boat_equipment: { en: { positive: "Boat/equipment (positive)", negative: "Boat/equipment (complaint)" }, wo: { positive: "Gaal/jumtukaay (lu neex)", negative: "Gaal/jumtukaay (ñaxtu)" } },
  wildlife: { en: { positive: "Wildlife (positive)", negative: "Wildlife (complaint)" }, wo: { positive: "Rab yi ci àll bi (lu neex)", negative: "Rab yi ci àll bi (ñaxtu)" } },
  duration: { en: { positive: "Duration (positive)", negative: "Duration (complaint)" }, wo: { positive: "Waxtu bi mu yàgg (lu neex)", negative: "Waxtu bi mu yàgg (ñaxtu)" } },
  children: { en: { positive: "Children (positive)", negative: "Children (complaint)" }, wo: { positive: "Xale (lu neex)", negative: "Xale (ñaxtu)" } },
} as const;

export const TOPIC_TEMPLATES = {
  price: { en: "price", wo: "njekk" },
  "meeting point": { en: "meeting point", wo: "barabub ndaje" },
  safety: { en: "safety", wo: "kaarange" },
  "how to book": { en: "how to book", wo: "naka lañuy booké" },
  food: { en: "food", wo: "ñam" },
  "what's included": { en: "what's included", wo: "li ci bokk" },
  duration: { en: "duration", wo: "waxtu bi mu yàgg" },
  children: { en: "children", wo: "xale" },
  "start time": { en: "start time", wo: "waxtu tambali" },
  "what to bring": { en: "what to bring", wo: "li ngay indi" },
} as const;

/** Keys whose first back-translation drifted; final wording above was corrected and rechecked. */
export const BACK_TRANSLATION_DRIFT_KEYS = ["header", "source", "recordImprove", "ensureCovers", "notReady", "loadError"] as const;

export function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => key in values ? String(values[key]) : match);
}