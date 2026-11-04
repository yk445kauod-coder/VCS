/**
 * Reply language for the deterministic brain.
 *
 * Duty answers customers in the language they wrote in. The strings live here
 * rather than inline in `draft()` so a new language is one entry in `TABLES`,
 * not a second copy of the whole switch.
 */

export type Locale = 'en' | 'ar';

/** Arabic block, Arabic Supplement and Arabic Extended-A. */
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function detectLocale(text: string): Locale {
  return ARABIC.test(text) ? 'ar' : 'en';
}

export interface BrainStrings {
  /** Shown when the tenant has no name configured. */
  ourBusiness: string;
  greeting(business: string, list: string): string;
  greetingNoProducts(business: string): string;
  price(product: string, amount: string): string;
  catalogueIntro(list: string): string;
  catalogueUnavailable(): string;
  orderStarted(product: string, amount: string): string;
  orderWhich(list: string): string;
  orderEscalate(): string;
  confirmed(order: string, items: string, total: string): string;
  noOpenOrder(): string;
  upsellAdded(product: string): string;
  upsellAnythingElse(): string;
  upsellDeclined(): string;
  status(order: string, status: string, total: string): string;
  statusNotFound(): string;
  refund(): string;
  complaint(): string;
  human(): string;
  logistics(): string;
  support(): string;
  goodbye(business: string, tone: string): string;
  fallback(): string;
  anythingElse(): string;
}

const TABLES: Record<Locale, BrainStrings> = {
  en: {
    ourBusiness: 'us',
    greeting: (business, list) =>
      `Hi! 👋 Thanks for reaching out to ${business}. ` +
      `I can help you order, check prices, or track something. Popular right now:\n${list}`,
    greetingNoProducts: (business) =>
      `Hi! 👋 Thanks for reaching out to ${business}. How can I help you today?`,
    price: (product, amount) => `${product} is ${amount}.`,
    catalogueIntro: (list) =>
      `Here's what we currently offer:\n${list}\n\nTell me which one you're interested in and I'll set it up.`,
    catalogueUnavailable: () =>
      `I don't have the full catalogue loaded yet. Let me get a teammate to help you with that right away.`,
    orderStarted: (product, amount) =>
      `Great choice — ${product} is ${amount}. ` +
      `I've started an order for you. Reply *confirm* and I'll finalise it, or tell me the quantity you need.`,
    orderWhich: (list) => `Happy to help you order. Which of these would you like?\n${list}`,
    orderEscalate: () => `I'd love to get that ordered for you. A teammate will confirm the details shortly.`,
    confirmed: (order, items, total) =>
      `Confirmed ✅ Order *${order}* — ${items} totalling ${total}. I'll let you know the moment it ships.`,
    noOpenOrder: () => `I don't have an open order for you yet — tell me what you'd like and I'll start one right away.`,
    upsellAdded: (product) => `Added ${product} to your order — you're all set. Anything else?`,
    upsellAnythingElse: () => `Great — anything else you'd like me to add?`,
    upsellDeclined: () => `No problem at all — I'll leave it as is. Anything else I can help with?`,
    status: (order, status, total) =>
      `Your order ${order} is currently *${status}* — total ${total}. Want me to notify you the moment it changes?`,
    statusNotFound: () =>
      `I couldn't find an order under that reference. Could you share the order number (it looks like DTY-…) or the phone number you used?`,
    refund: () =>
      `I'm sorry about that. I've flagged this for a refund review and a teammate will confirm the next step with you today.`,
    complaint: () =>
      `I'm really sorry for the trouble. I've escalated this to a human teammate who can fix it — they'll reply here shortly.`,
    human: () => `Of course — connecting you to a human teammate now. 🙋`,
    logistics: () => `Let me check the details on shipping and pickup for you — a teammate will confirm shortly.`,
    support: () =>
      `Let's sort that out. Could you tell me a bit more about what's happening so I can point you to the right fix?`,
    goodbye: (business, tone) => `Thanks for chatting with ${business} — ${tone} as always. Talk soon! 🙌`,
    fallback: () =>
      `Thanks for your message! I've noted it down. Could you tell me a little more about what you need?`,
    anythingElse: () => `Is there anything else I can help you with?`,
  },

  ar: {
    ourBusiness: 'متجرنا',
    greeting: (business, list) =>
      `مرحباً! 👋 شكراً لتواصلك مع ${business}. ` +
      `يمكنني مساعدتك في الطلب أو معرفة الأسعار أو تتبّع شحنة. الأكثر طلباً الآن:\n${list}`,
    greetingNoProducts: (business) => `مرحباً! 👋 شكراً لتواصلك مع ${business}. كيف يمكنني مساعدتك اليوم؟`,
    price: (product, amount) => `${product} بسعر ${amount}.`,
    catalogueIntro: (list) => `هذا ما نوفّره حالياً:\n${list}\n\nأخبرني ما الذي يعجبك وسأجهّزه لك.`,
    catalogueUnavailable: () => `لم أحمّل الكتالوج كاملاً بعد. سأطلب من أحد الزملاء مساعدتك فوراً.`,
    orderStarted: (product, amount) =>
      `اختيار ممتاز — ${product} بسعر ${amount}. ` +
      `بدأت لك طلباً. رد بكلمة *تأكيد* وسأتمّه، أو أخبرني بالكمية المطلوبة.`,
    orderWhich: (list) => `يسعدني مساعدتك في الطلب. أي من هذه تريد؟\n${list}`,
    orderEscalate: () => `يسعدني تجهيز طلبك. سيتواصل معك أحد الزملاء لتأكيد التفاصيل قريباً.`,
    confirmed: (order, items, total) =>
      `تم التأكيد ✅ طلب *${order}* — ${items} بإجمالي ${total}. سأخبرك بمجرد الشحن.`,
    noOpenOrder: () => `لا يوجد لديك طلب مفتوح بعد — أخبرني بما تريد وسأبدأ به فوراً.`,
    upsellAdded: (product) => `أضفت ${product} إلى طلبك — كل شيء جاهز. هل تحتاج شيئاً آخر؟`,
    upsellAnythingElse: () => `تمام — هل تريد إضافة شيء آخر؟`,
    upsellDeclined: () => `لا مشكلة إطلاقاً — سأتركه كما هو. هل أساعدك في شيء آخر؟`,
    status: (order, status, total) =>
      `طلبك ${order} حالته حالياً *${status}* — الإجمالي ${total}. أريد أن أخبرك بمجرد تغيّر الحالة؟`,
    statusNotFound: () =>
      `لم أجد طلباً بهذا الرقم. هل يمكنك مشاركة رقم الطلب (يبدأ بـ DTY-…) أو رقم الهاتف المستخدم؟`,
    refund: () =>
      `أعتذر عن ذلك. سجّلت طلب مراجعة الاسترجاع وسيؤكد لك أحد الزملاء الخطوة التالية اليوم.`,
    complaint: () => `أعتذر بصدق عن الإزعاج. صعّدت الأمر إلى أحد الزملاء لحلّه — سيرد عليك هنا قريباً.`,
    human: () => `بالطبع — سأوصلك بأحد الزملاء الآن. 🙋`,
    logistics: () => `دعني أتحقق من تفاصيل الشحن والاستلام — سيؤكد لك أحد الزملاء قريباً.`,
    support: () => `لنحلّ هذا معاً. هل يمكنك إخباري بمزيد من التفاصيل عمّا يحدث لأوجّهك للحل الصحيح؟`,
    // The tenant `tone` is free-form English config, so it is deliberately not
    // interpolated into the Arabic reply.
    goodbye: (business) => `شكراً لتواصلك مع ${business} — في خدمتك دائماً. إلى اللقاء! 🙌`,
    fallback: () => `شكراً لرسالتك! سجّلتها. هل يمكنك إخباري بمزيد من التفاصيل عمّا تحتاجه؟`,
    anythingElse: () => `هل أساعدك في شيء آخر؟`,
  },
};

export function strings(locale: Locale): BrainStrings {
  return TABLES[locale] ?? TABLES.en;
}
