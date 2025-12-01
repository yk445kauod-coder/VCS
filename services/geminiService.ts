import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Teacher, LessonOutput, GroundingSource, TeacherPersonality, ChatMessage, LessonLength } from "../types";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    explanation: {
      type: Type.STRING,
      description: "شرح مفصل وتفاعلي للموضوع بصيغة Markdown. يجب أن يكون طويلاً وغنياً إذا طلب ذلك. مكتوب بصوت المعلم وشخصيته، باللغة العربية."
    },
    summary: {
      type: Type.STRING,
      description: "ملخص موجز للنقاط الرئيسية (TL;DR) باللغة العربية."
    },
    visualDiagram: {
      type: Type.STRING,
      description: "كود SVG كامل (بدءًا من علامة <svg>) لرسم توضيحي أو مخطط انسيابي للمفهوم. يجب أن يكون ملوناً، جميلاً، ويدعم اللغة العربية (direction='rtl'). استخدم viewBox='0 0 800 500'. أضف <style> داخل الـ SVG لتحريك العناصر (مثل fade-in)."
    },
    interactiveElement: {
      type: Type.STRING,
      description: "كود HTML و JavaScript مدمج (بدون وسوم markdown) لإنشاء عنصر تفاعلي بسيط يوضح الدرس. يجب أن يكون صالحاً للعمل داخل div."
    },
    infographicData: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "قائمة من 3-5 حقائق بصرية رئيسية أو خطوات مناسبة لإنفوجرافيك نصي باللغة العربية."
    },
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          points: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      }
    },
    quiz: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          correctAnswer: { type: Type.STRING, description: "نص الإجابة الصحيحة" }
        }
      }
    }
  },
  required: ["explanation", "summary", "visualDiagram", "interactiveElement", "infographicData", "slides", "quiz"]
};

const PERSONALITY_PROMPTS: Record<string, string> = {
  [TeacherPersonality.Formal]: `
    - النبرة: سلطوية، أكاديمية، صارمة، وموضوعية.
    - المفردات: استخدم مصطلحات دقيقة، تراكيب جمل معقدة، ولغة عربية فصحى قوية. تجنب العامية.
    - الأسلوب: نظّم الشرح كمحاضرة جامعية. ركز على الدقة والسياق التاريخي.
  `,
  [TeacherPersonality.Friendly]: `
    - النبرة: دافئة، حوارية، سهلة الوصول، ومتعاطفة.
    - المفردات: استخدم ضمائر المتكلم والمخاطب بود. لغة سهلة وواضحة.
    - الأسلوب: استخدم تشبيهات من الحياة اليومية. تصرف كزميل دراسة متعاون.
  `,
  [TeacherPersonality.Sarcastic]: `
    - النبرة: جافة، ذكية، ساخرة قليلاً، وواقعية.
    - المفردات: استخدم السخرية، الأسئلة البلاغية، والتهكم المرح.
    - الأسلوب: يمكنك السخرية من غرابة الحقائق، لكن تأكد من دقة المحتوى.
  `,
  [TeacherPersonality.Encouraging]: `
    - النبرة: عالية الطاقة، تحفيزية، حماسية، وإيجابية.
    - المفردات: استخدم علامات التعجب، التعزيز الإيجابي، ولغة التمكين.
    - الأسلوب: ركز على عقلية النمو وأن الطالب قادر على الإتقان.
  `,
  [TeacherPersonality.Socratic]: `
    - النبرة: فلسفية، استقصائية، ومفكرة.
    - المفردات: واضحة، منطقية، وتساؤلية.
    - الأسلوب: لا تلقي محاضرة فقط؛ قُد الطالب للإجابة عبر أسئلة متتالية (لماذا؟ كيف؟).
  `,
  [TeacherPersonality.Simplistic]: `
    - النبرة: لطيفة، بسيطة جداً، وواضحة للغاية (ELI5).
    - المفردات: كلمات بسيطة جداً. تجنب المصطلحات التقنية.
    - الأسلوب: ركز على "الصورة الكبيرة". استخدم جملاً قصيرة.
  `
};

const CHAT_INSTRUCTIONS: Record<string, string> = {
  [TeacherPersonality.Formal]: `
    في المحادثة:
    - أجب باقتضاب ودقة متناهية.
    - صحح أي خطأ لغوي أو علمي يرتكبه الطالب فوراً.
  `,
  [TeacherPersonality.Friendly]: `
    في المحادثة:
    - ابدأ الرد بتحية دافئة.
    - استخدم الرموز التعبيرية (😊).
  `,
  [TeacherPersonality.Sarcastic]: `
    في المحادثة:
    - أضف تعليقاً ساخراً في البداية.
  `,
  [TeacherPersonality.Encouraging]: `
    في المحادثة:
    - احتفل بكل سؤال يطرحه الطالب!
  `,
  [TeacherPersonality.Socratic]: `
    في المحادثة:
    - أجب على السؤال بسؤال آخر.
  `,
  [TeacherPersonality.Simplistic]: `
    في المحادثة:
    - استخدم تشبيهات ملموسة (بيتزا، ألعاب).
  `
};

export const generateLessonContent = async (
  teacher: Teacher,
  content: string,
  topic: string,
  useSearch: boolean,
  length: LessonLength = 'standard'
): Promise<LessonOutput> => {
  
  const specificPersonalityInstruction = PERSONALITY_PROMPTS[teacher.personality] || PERSONALITY_PROMPTS[TeacherPersonality.Friendly];

  let lengthInstruction = "";
  if (length === 'brief') {
    lengthInstruction = "اجعل الشرح مختصراً جداً ومباشراً، لا يتجاوز 300 كلمة.";
  } else if (length === 'detailed') {
    lengthInstruction = "اجعل الشرح طويلاً، مفصلاً، وشاملاً جداً. تعمق في كل جانب من جوانب الموضوع. استخدم ما لا يقل عن 1000 كلمة في الشرح.";
  } else {
    lengthInstruction = "اجعل الشرح متوسط الطول ومتوازناً (حوالي 600 كلمة).";
  }

  const systemInstruction = `
    أنت ${teacher.name}، معلم عالمي متخصص في ${teacher.subject}.
    أسلوب التدريس: "${teacher.personality}"
    ${specificPersonalityInstruction}
    
    المهمة: قم بإنشاء درس تعليمي تفاعلي باللغة العربية الفصحى.
    ${lengthInstruction}
    
    تعليمات إضافية:
    - الشرح (explanation): يجب أن يكون Markdown منسق بشكل جميل.
    - المخطط البصري (visualDiagram): قم بتوليد كود SVG لمخطط مفاهيمي. يجب أن يكون جذاباً، يستخدم الألوان، ويدعم العربية بشكل صحيح.
    - التفاعلية: تأكد أن العنصر التفاعلي (interactiveElement) يضيف قيمة تعليمية حقيقية.
    
    بالنسبة لحقل 'interactiveElement'، قم بتوليد كود HTML و JavaScript مدمج (Self-contained).
    استخدم TailwindCSS للتنسيق. يجب أن يكون ممتعاً للطالب.
  `;

  let prompt = `
    الموضوع: ${topic}
    المحتوى الخام: ${content ? content.substring(0, 20000) : "لا يوجد محتوى خام، اعتمد على معرفتك."} 
  `;

  let config: any = {
    systemInstruction: systemInstruction,
  };

  if (useSearch) {
    config.tools = [{ googleSearch: {} }];
    prompt += `
      استخدم Google Search للعثور على معلومات دقيقة وحديثة.
      يجب إرجاع JSON فقط بالمفاتيح: explanation, summary, visualDiagram, interactiveElement, infographicData, slides, quiz.
    `;
  } else {
    config.responseMimeType = "application/json";
    config.responseSchema = RESPONSE_SCHEMA;
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: config
  });

  if (!response.text) {
    throw new Error("فشل في توليد المحتوى.");
  }

  try {
    let jsonString = response.text.trim();
    if (jsonString.startsWith('```json')) {
      jsonString = jsonString.replace(/^```json/, '').replace(/```$/, '');
    } else if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/^```/, '').replace(/```$/, '');
    }

    const data = JSON.parse(jsonString) as LessonOutput;

    if (useSearch && response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      const chunks = response.candidates[0].groundingMetadata.groundingChunks;
      const sources: GroundingSource[] = [];
      chunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title) {
          sources.push({ title: chunk.web.title, uri: chunk.web.uri });
        }
      });
      data.groundingUrls = Array.from(new Map(sources.map(s => [s.uri, s])).values());
    }

    return data;
  } catch (error) {
    console.error("Parse error:", error);
    throw new Error("حدث خطأ في معالجة استجابة الذكاء الاصطناعي.");
  }
};

export const generateChatResponse = async (
  teacher: Teacher,
  lessonContext: string,
  history: ChatMessage[],
  newMessage: string
): Promise<string> => {
  const specificPersonalityInstruction = PERSONALITY_PROMPTS[teacher.personality];
  const chatSpecificInstruction = CHAT_INSTRUCTIONS[teacher.personality] || "";

  const systemInstruction = `
    أنت ${teacher.name}، معلم ${teacher.subject}. أسلوبك: ${teacher.personality}.
    ${specificPersonalityInstruction}
    ${chatSpecificInstruction}
    
    سياق الدرس: ${lessonContext.substring(0, 1000)}...
    
    أجب على الطالب فوراً وتفاعلياً باللغة العربية.
  `;

  let prompt = "";
  history.slice(-6).forEach(msg => {
    prompt += `${msg.sender === 'user' ? 'الطالب' : 'أنت'}: ${msg.text}\n`;
  });
  prompt += `الطالب: ${newMessage}\nأنت:`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { systemInstruction }
  });

  return response.text || "عذراً، لا أستطيع الرد الآن.";
};