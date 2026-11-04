import type { Order, Product, Tenant } from '../core/types.js';
import { formatMoney } from '../core/money.js';
import { clamp01 } from '../core/money.js';
import { detectLocale, strings } from './locale.js';

export type Intent =
  | 'greeting'
  | 'product_question'
  | 'price_inquiry'
  | 'order_intent'
  | 'order_status'
  | 'confirm_order'
  | 'upsell_accept'
  | 'upsell_decline'
  | 'complaint'
  | 'support'
  | 'refund'
  | 'logistics'
  | 'human_request'
  | 'goodbye'
  | 'other';

export interface IntentSignal {
  intent: Intent;
  confidence: number;
  sentiment: number;
  matched: string[];
}

const PATTERNS: Array<{ intent: Intent; weight: number; patterns: RegExp[] }> = [
  {
    intent: 'upsell_accept',
    weight: 0.9,
    patterns: [/\b(yes|yeah|sure|ok(ay)?|go ahead|add it|add that|why not|sounds good|do it)\b/i, /(تمام|نعم|أضف|اضف|اوك|موافق|يلا|حسنا)/u],
  },
  {
    intent: 'upsell_decline',
    weight: 0.8,
    patterns: [/\b(no thanks|no thank you|not now|maybe later|skip|no)\b(?!\s*(problem|worries))/i, /(لا شكرا|ليس الآن|ليس الان|تخطى|تخطي)/u],
  },
  {
    intent: 'confirm_order',
    weight: 0.92,
    patterns: [
      /\b(confirm|confirmed|place (the )?order|finali[sz]e|checkout|place it|submit|go ahead with (the )?order)\b/i,
      /(تأكيد|تاكيد|أكد|اكد|اتمم|أتمم|إتمام|اتمام)/u,
    ],
  },
  {
    intent: 'order_status',
    weight: 0.85,
    patterns: [
      /where('| i)?s my order/i,
      /\b(order|shipment|parcel|package|delivery)\b.*\b(status|track|tracking|where|arriv)/i,
      /track(ing)?\s*(number|id|code)?/i,
      /(حالة|تتبع|وين|أين|اين).*(طلبي|الطلب|الشحنة|الشحنه)/u,
    ],
  },
  {
    intent: 'order_intent',
    weight: 0.8,
    patterns: [
      /\b(i want|i'd like|i would like|i need|buy|purchase|order|checkout|book|reserve|subscribe|sign me up)\b/i,
      /(أريد|اريد|ابغى|أبغى|أحتاج|احتاج|اشتري|اطلب|احجز|اشترك)/u,
      /\b(how much for|can i get)\b/i,
    ],
  },
  {
    intent: 'price_inquiry',
    weight: 0.7,
    patterns: [ /\b(price|pricing|cost|how much|rate|fee|charge|quote)\b/iu, /(سعر|أسعار|اسعار|تكلفة|تكلفه|بكم|كم سعر|كم ثمن)/u ],
  },
  {
    intent: 'refund',
    weight: 0.9,
    patterns: [ /\b(refund|money back|return|reimburse)\b/iu, /(استرجاع|استرداد|إرجاع|ارجاع|أرجع فلوسي)/u ],
  },
  {
    intent: 'complaint',
    weight: 0.85,
    patterns: [
      /\b(broken|damaged|wrong|late|terrible|awful|disappointed|angry|unacceptable|useless|worst)\b/i,
      /(سيء|سيئة|سيئه|تأخر|تاخر|خطأ|خطا|غاضب|مشكلة كبيرة|مشكله كبيره)/u,
    ],
  },
  {
    intent: 'human_request',
    weight: 0.95,
    patterns: [
      /\b(human|agent|representative|real person|manager|supervisor|speak to someone)\b/i,
      /(موظف|إنسان|انسان|شخص حقيقي|مدير|مسؤول|مسئول)/u,
    ],
  },
  {
    intent: 'logistics',
    weight: 0.6,
    patterns: [ /\b(ship|shipping|deliver|delivery|address|pickup|store hours|open|close|location)\b/iu, /(توصيل|شحن|عنوان|موقع|ساعات|مفتوح|دوام)/u ],
  },
  {
    intent: 'support',
    weight: 0.55,
    patterns: [ /\b(how do i|how to|help|install|setup|set up|config|error|not working|issue|problem)\b/iu, /(كيف|مساعدة|مساعده|دعم|مشكلة|مشكله|خطأ|خطا|لا يعمل)/u ],
  },
  {
    intent: 'product_question',
    weight: 0.6,
    patterns: [
      /\b(do you (have|sell|offer)|is there|tell me about|what is|difference between|which .* best)\b/i,
      /(عندكم|هل يوجد|ما هو|الفرق|أفضل|افضل)/u,
    ],
  },
  {
    intent: 'greeting',
    weight: 0.5,
    patterns: [ /^\s*(hi|hey|hello|good (morning|evening|afternoon)|salam|hola)\b/i, /^\s*(مرحبا|أهلا|اهلا|السلام عليكم|هاي|صباح الخير|صباح النور)/u ],
  },
  {
    intent: 'goodbye',
    weight: 0.5,
    patterns: [ /\b(bye|goodbye|thanks|thank you|see you|cheers)\b/iu, /(شكرا|شكراً|مع السلامة|مع السلامه|وداعا|وداعاً)/u ],
  },
];

const NEGATIVE = /\b(bad|terrible|awful|angry|hate|broken|late|worst|disappointed|refund)\b|(سيء|سيئة|سيئه|غاضب|مشكلة|مشكله|تأخر|تاخر)/iu;
const POSITIVE = /\b(great|love|excellent|perfect|thanks|thank you|awesome|amazing)\b|(ممتاز|رائع|شكرا|شكراً|أحب|احب)/iu;

/** Rule-based intent classifier. Fast, deterministic and always available. */
export function classify(text: string): IntentSignal {
  const matched: string[] = [];
  let best: { intent: Intent; score: number } = { intent: 'other', score: 0 };

  for (const rule of PATTERNS) {
    for (const pattern of rule.patterns) {
      const hit = pattern.exec(text);
      if (hit) {
        matched.push(hit[0]);
        const score = rule.weight + Math.min(0.1, hit[0].length / 200);
        if (score > best.score) best = { intent: rule.intent, score };
        break;
      }
    }
  }

  const negative = NEGATIVE.test(text) ? 1 : 0;
  const positive = POSITIVE.test(text) ? 1 : 0;
  const sentiment = clamp01(0.5 + positive * 0.3 - negative * 0.4);
  const confidence = clamp01(best.score === 0 ? 0.25 : best.score);

  return { intent: best.intent, confidence, sentiment, matched };
}

export interface DraftInput {
  tenant: Tenant;
  intent: IntentSignal;
  text: string;
  products: Product[];
  openOrder?: Order | null;
  lastOrder?: Order | null;
  knowledge: Array<{ text: string; documentTitle: string; url?: string }>;
  currency: string;
  upsell?: { product: Product; pitch?: string; discountPercent?: number } | null;
}

export interface Draft {
  reply: string;
  confidence: number;
  needsHuman: boolean;
}

const priceList = (products: Product[], currency: string): string =>
  products
    .slice(0, 6)
    .map((product) => `• ${product.name} — ${formatMoney(product.price, product.currency || currency)}`)
    .join('\n');

/** Deterministic reply generator. No network, no key, always produces something useful. */
export function draft(input: DraftInput): Draft {
  const { tenant, intent, products, knowledge, currency } = input;
  // Reply in the language the customer actually wrote in. The tenant locale is
  // only a fallback, because a shop can be messaged by a customer who does not
  // share the shop's language.
  const locale = detectLocale(input.text);
  const t = strings(locale);
  const businessName = tenant.name || t.ourBusiness;
  const tone = tenant.tone || 'friendly and concise';

  const fromKnowledge = knowledge.length
    ? knowledge
        .slice(0, 2)
        .map((chunk) => chunk.text.split('\n').slice(0, 3).join(' ').trim())
        .join(' ')
        .slice(0, 420)
    : '';

  switch (intent.intent) {
    case 'greeting':
      return {
        reply: products.length
          ? t.greeting(businessName, priceList(products, currency))
          : t.greetingNoProducts(businessName),
        confidence: 0.7,
        needsHuman: false,
      };

    case 'price_inquiry':
    case 'product_question': {
      const matched = pickProduct(input.text, products);
      if (matched) {
        // The price is the answer; a retrieved policy only adds noise unless the
        // customer also asked something else (handled by other intents).
        return {
          reply: t.price(matched.name, formatMoney(matched.price, matched.currency || currency)),
          confidence: 0.78,
          needsHuman: false,
        };
      }
      if (fromKnowledge) {
        return { reply: fromKnowledge, confidence: 0.55, needsHuman: false };
      }
      if (products.length) {
        return {
          reply: t.catalogueIntro(priceList(products, currency)),
          confidence: 0.62,
          needsHuman: false,
        };
      }
      return {
        reply: t.catalogueUnavailable(),
        confidence: 0.3,
        needsHuman: true,
      };
    }

    case 'order_intent': {
      const product = pickProduct(input.text, products);
      if (product) {
        return {
          reply: t.orderStarted(product.name, formatMoney(product.price, product.currency || currency)),
          confidence: 0.75,
          needsHuman: false,
        };
      }
      if (products.length) {
        return {
          reply: t.orderWhich(priceList(products, currency)),
          confidence: 0.55,
          needsHuman: false,
        };
      }
      return {
        reply: t.orderEscalate(),
        confidence: 0.35,
        needsHuman: true,
      };
    }

    case 'confirm_order': {
      const order = input.openOrder ?? input.lastOrder;
      if (order) {
        return {
          reply: t.confirmed(
            order.number,
            order.lines.map((line) => `${line.quantity}x ${line.name}`).join(', '),
            formatMoney(order.total, order.currency),
          ),
          confidence: 0.9,
          needsHuman: false,
        };
      }
      return {
        reply: t.noOpenOrder(),
        confidence: 0.45,
        needsHuman: false,
      };
    }

    case 'upsell_accept': {
      if (input.upsell?.product) {
        return {
          reply: t.upsellAdded(input.upsell.product.name),
          confidence: 0.85,
          needsHuman: false,
        };
      }
      return {
        reply: t.upsellAnythingElse(),
        confidence: 0.5,
        needsHuman: false,
      };
    }

    case 'upsell_decline':
      return { reply: t.upsellDeclined(), confidence: 0.8, needsHuman: false };

    case 'order_status': {
      const order = input.lastOrder;
      if (order) {
        return {
          reply: t.status(order.number, order.status, formatMoney(order.total, order.currency)),
          confidence: 0.8,
          needsHuman: false,
        };
      }
      return { reply: t.statusNotFound(), confidence: 0.4, needsHuman: true };
    }

    case 'refund':
      return { reply: t.refund(), confidence: 0.6, needsHuman: true };

    case 'complaint':
      return { reply: t.complaint(), confidence: 0.55, needsHuman: true };

    case 'human_request':
      return { reply: t.human(), confidence: 0.9, needsHuman: true };

    case 'logistics':
      return {
        reply: fromKnowledge || t.logistics(),
        confidence: fromKnowledge ? 0.6 : 0.4,
        needsHuman: !fromKnowledge,
      };

    case 'support':
      return {
        reply: fromKnowledge || t.support(),
        confidence: fromKnowledge ? 0.6 : 0.45,
        needsHuman: false,
      };

    case 'goodbye':
      return { reply: t.goodbye(businessName, tone), confidence: 0.7, needsHuman: false };

    default:
      return {
        reply: fromKnowledge ? `${fromKnowledge}\n\n${t.anythingElse()}` : t.fallback(),
        confidence: fromKnowledge ? 0.5 : 0.35,
        needsHuman: !fromKnowledge && intent.sentiment < 0.4,
      };
  }
}

/**
 * Match customer wording to a catalogue item. Aliases carry the synonyms and
 * other-language names (e.g. "طاحونة" for a grinder) so a customer can order in
 * their own words without the catalogue being rewritten in every language.
 */
export function pickProduct(text: string, products: Product[]): Product | null {
  const lower = text.toLowerCase();
  let best: { product: Product; score: number } | null = null;
  for (const product of products) {
    let score = 0;
    const name = product.name.toLowerCase();
    if (lower.includes(name)) score += 3;
    if (lower.includes(product.sku.toLowerCase())) score += 3;
    for (const token of name.split(/\s+/)) {
      if (token.length > 3 && lower.includes(token)) score += 1;
    }
    for (const term of [...(product.tags ?? []), ...(product.aliases ?? [])]) {
      const needle = term.toLowerCase();
      // Arabic words are short and dense; two characters already disambiguate.
      if (needle.length >= 2 && lower.includes(needle)) score += 1.5;
    }
    if (score > 0 && (!best || score > best.score)) best = { product, score };
  }
  return best?.product ?? null;
}
