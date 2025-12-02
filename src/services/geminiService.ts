import { GoogleGenerativeAI, Content, Part, GenerationConfig, GenerativeModel } from "@google/generative-ai";
import { Teacher, LessonOutput, GroundingSource, TeacherPersonality, ChatMessage, LessonLength } from "../types";

// Initialize Gemini
// Ensure you have GEMINI_API_KEY in your environment
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const model: GenerativeModel = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-latest",
});


const LessonOutputSchema = {
  type: "OBJECT",
  properties: {
    explanation: {
      type: "STRING",
      description: "A detailed and engaging explanation of the topic in Markdown format. This should be written in the teacher's voice and personality, in Arabic."
    },
    summary: {
      type: "STRING",
      description: "A brief summary of the main points (TL;DR) in Arabic."
    },
    visualDiagram: {
      type: "STRING",
      description: "A complete, well-styled SVG code for a flowchart or concept map. It must be colorful, visually appealing, and support Arabic text correctly (e.g., direction='rtl'). Use a viewBox='0 0 800 500'. It should include <style> tags for animations like fade-in."
    },
    interactiveElement: {
      type: "STRING",
      description: "Self-contained HTML and JavaScript code (without markdown tags) for a simple interactive element that demonstrates the lesson's concept. It must be functional inside a div and should be styled with Tailwind CSS classes."
    },
    infographicData: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "A list of 3-5 key visual facts or steps suitable for a text-based infographic, in Arabic."
    },
    slides: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          points: { 
            type: "ARRAY",
            items: { type: "STRING" }
          }
        },
        required: ["title", "points"]
      }
    },
    quiz: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          options: {
            type: "ARRAY",
            items: { type: "STRING" }
          },
          correctAnswer: { type: "STRING", description: "The exact text of the correct answer." }
        },
        required: ["question", "options", "correctAnswer"]
      }
    }
  },
  required: ["explanation", "summary", "visualDiagram", "infographicData", "slides", "quiz"]
};

const generationConfig: GenerationConfig = {
    responseMimeType: "application/json",
    responseSchema: LessonOutputSchema,
};

const PERSONALITY_PROMPTS: Record<string, string> = {
  [TeacherPersonality.Formal]: `
    - Tone: Authoritative, academic, strict, and objective.
    - Vocabulary: Use precise terminology, complex sentence structures, and strong formal Arabic. Avoid slang.
    - Style: Structure the explanation like a university lecture. Focus on accuracy and historical context.
  `,
  [TeacherPersonality.Friendly]: `
    - Tone: Warm, conversational, approachable, and empathetic.
    - Vocabulary: Use friendly pronouns. Language should be simple and clear.
    - Style: Use analogies from everyday life. Act like a helpful study partner.
  `,
  [TeacherPersonality.Sarcastic]: `
    - Tone: Dry, witty, slightly cynical, and down-to-earth.
    - Vocabulary: Use irony, rhetorical questions, and playful sarcasm.
    - Style: You can poke fun at the absurdity of facts, but ensure the content is accurate.
  `,
  [TeacherPersonality.Encouraging]: `
    - Tone: High-energy, motivational, enthusiastic, and positive.
    - Vocabulary: Use exclamation marks, positive reinforcement, and empowering language.
    - Style: Focus on a growth mindset and the student's ability to master the topic.
  `,
  [TeacherPersonality.Socratic]: `
    - Tone: Philosophical, inquisitive, and thought-provoking.
    - Vocabulary: Clear, logical, and questioning.
    - Style: Don't just lecture; guide the student to the answer through a series of questions (Why? How?).
  `,
  [TeacherPersonality.Simplistic]: `
    - Tone: Gentle, very simple, and extremely clear (ELI5).
    - Vocabulary: Use very simple words. Avoid technical jargon.
    - Style: Focus on the "big picture." Use short sentences.
  `
};

const CHAT_INSTRUCTIONS: Record<string, string> = {
  [TeacherPersonality.Formal]: `In conversation, answer concisely and with utmost accuracy. Correct any linguistic or scientific errors the student makes immediately.`,
  [TeacherPersonality.Friendly]: `In conversation, start your reply with a warm greeting. Use emojis (😊).`,
  [TeacherPersonality.Sarcastic]: `In conversation, add a witty or sarcastic comment at the beginning of your reply.`,
  [TeacherPersonality.Encouraging]: `In conversation, celebrate every question the student asks!`,
  [TeacherPersonality.Socratic]: `In conversation, try to answer a question with another guiding question.`,
  [TeacherPersonality.Simplistic]: `In conversation, use concrete analogies (like pizza, video games, etc.).`
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
    lengthInstruction = "Make the explanation very concise and to the point, not exceeding 300 words.";
  } else if (length === 'detailed') {
    lengthInstruction = "Make the explanation long, detailed, and comprehensive. Dive deep into every aspect. Use at least 1000 words in the 'explanation' field.";
  } else {
    lengthInstruction = "Keep the explanation at a standard, balanced length (around 600 words).";
  }

  const systemInstruction = `You are ${teacher.name}, a world-class teacher specializing in ${teacher.subject}.
Your teaching style is: "${teacher.personality}".
${specificPersonalityInstruction}

Your task is to create a complete, interactive educational lesson in formal Arabic.
${lengthInstruction}

Additional Instructions:
- explanation: Must be beautifully formatted Markdown.
- visualDiagram: Must be an attractive, colorful SVG code that correctly supports Arabic.
- interactiveElement: Ensure this provides real educational value and is fun for the student. It should be self-contained HTML/JS using TailwindCSS classes.
`;

  const prompt = `
    Topic: ${topic}
    Raw Content/Context: ${content ? content.substring(0, 20000) : "No raw content provided, rely on your internal knowledge."} 
  `;

  const tools = useSearch ? [{ 'googleSearch': {} }] : [];
  
  const contents: Content[] = [{
      role: 'user',
      parts: [{ text: systemInstruction }, { text: prompt }]
  }];

  const result = await model.generateContent({
      contents: contents,
      generationConfig: useSearch ? undefined : generationConfig, // Use JSON mode only when not searching
      tools: tools
  });
  
  const response = result.response;
  const responseText = response.text();

  if (!responseText) {
    throw new Error("Failed to generate content. The model returned an empty response.");
  }

  try {
    const data = JSON.parse(responseText) as LessonOutput;

    // Process grounding sources if they exist
    if (useSearch && response.candidates?.[0]?.groundingMetadata?.groundingAttributions) {
      const sources: GroundingSource[] = response.candidates[0].groundingMetadata.groundingAttributions
        .map((attr: any) => ({
          uri: attr.sourceId.web.uri,
          title: attr.sourceId.web.title
        }))
        .filter((s: GroundingSource) => s.uri && s.title);
      
      // Deduplicate sources
      data.groundingUrls = Array.from(new Map(sources.map(s => [s.uri, s])).values());
    }

    return data;
  } catch (error) {
    console.error("JSON Parse Error:", error, "Raw Text:", responseText);
    throw new Error("An error occurred while processing the AI's response. The format was invalid.");
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

  const systemInstruction = `You are ${teacher.name}, a ${teacher.subject} teacher. Your style is: ${teacher.personality}.
${specificPersonalityInstruction}
${chatSpecificInstruction}
You are chatting with a student about a lesson. The lesson context is: ${lessonContext.substring(0, 1000)}...
Respond directly and conversationally in Arabic.`;

  const chatHistory: Part[] = history.slice(-10).map(msg => ({
      text: msg.text,
      role: msg.sender === 'user' ? 'user' : 'model'
  }));

  const chat = model.startChat({
      history: [
          { role: 'user', parts: [{ text: systemInstruction }] },
          { role: 'model', parts: [{ text: "تمام، أنا مستعد للإجابة على أسئلة الطالب."}] }
      ]
  });

  const result = await chat.sendMessage(newMessage);
  
  return result.response.text() || "عذراً، لا أستطيع الرد الآن.";
};
