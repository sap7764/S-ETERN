import { GoogleGenAI, Type, Schema } from "@google/genai";
import { LessonPlan, FollowUpResponse } from "../types";

// Initialize Google GenAI Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// LATENCY OPTIMIZATION: Use Flash model for text generation (much faster than Pro)
const MODEL_NAME = "gemini-2.5-flash"; 
const IMAGE_MODEL_NAME = "gemini-2.5-flash-image"; 

// --- Schemas for Structured Output ---

const lessonStepSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    index: { type: Type.INTEGER },
    title: { 
      type: Type.STRING,
      description: "Short title."
    },
    narration: { 
      type: Type.STRING, 
      description: "Spoken explanation. Adjust complexity based on user intent." 
    },
    narration_hindi: { 
      type: Type.STRING, 
      description: "Hindi translation." 
    },
    narration_3d: {
      type: Type.STRING, 
      description: "3D guide."
    },
    narration_3d_hindi: {
      type: Type.STRING,
      description: "3D guide Hindi."
    },
    diagram_scrape_query: { 
      type: Type.STRING, 
      description: "Detailed prompt for a visual object (e.g. 'cross section of a leaf'). Avoid abstract concepts." 
    },
    diagram_role: { type: Type.STRING, description: "Diagram role." },
    overlay_description: { 
      type: Type.STRING, 
      description: "Highlight area description." 
    },
    coordinates: {
      type: Type.OBJECT,
      properties: {
        top: { type: Type.INTEGER },
        left: { type: Type.INTEGER }
      },
      required: ["top", "left"]
    },
    suggested_duration_ms: { 
      type: Type.INTEGER 
    },
    sketchfab_model_id: {
      type: Type.STRING
    }
  },
  required: ["index", "title", "narration", "narration_hindi", "diagram_scrape_query", "diagram_role", "overlay_description", "coordinates", "suggested_duration_ms"]
};

const lessonPlanSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING },
    steps: { 
      type: Type.ARRAY, 
      items: lessonStepSchema 
    }
  },
  required: ["topic", "steps"]
};

const followUpSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    answer: { 
      type: Type.STRING 
    },
    answer_hindi: { 
      type: Type.STRING 
    },
    targetStepIndex: { 
      type: Type.INTEGER,
      description: "The index of the step that best helps explain the answer."
    },
    is_off_topic: {
      type: Type.BOOLEAN,
      description: "Set to true if the user's question is completely unrelated to the current lesson context (e.g. asking about cars in a biology lesson)."
    },
    new_topic_query: {
      type: Type.STRING,
      description: "If is_off_topic is true, extract the new subject the user wants to learn about."
    }
  },
  required: ["answer", "answer_hindi", "targetStepIndex"]
};

// --- API Functions ---

export const generateLesson = async (prompt: string): Promise<LessonPlan> => {
  const systemInstruction = `You are ETERN, an advanced Adaptive Visual AI Tutor.
  
  **CORE OBJECTIVE:**
  Analyze the user's input to determine the Learning Depth.
  
  1. **Simple Queries** (e.g., "What is an atom?", "Define gravity"):
     - Create a **3-4 step** overview.
     - Keep narration simple, concise, and beginner-friendly.
  
  2. **Complex/Deep Queries** (e.g., "How does a car engine work?", "Explain the Krebs cycle details", "Quantum entanglement"):
     - Create a **6-9 step** deep-dive presentation.
     - Break down the process minutely.
     - Use more technical narration suitable for a student wanting mastery.
  
  **VISUAL GUIDELINES:**
  - One distinct visual concept per step.
  - 'diagram_scrape_query': Must be a highly descriptive image prompt (e.g., "cutaway view of a V8 engine piston cycle", "microscopic view of mitochondria inner membrane").
  
  Output: JSON only.`;

  const userPrompt = `Create a specialized lesson for: "${prompt}"`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: lessonPlanSchema,
        temperature: 0.2, 
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    return JSON.parse(text) as LessonPlan;
    
  } catch (error) {
    console.error("Error generating lesson:", error);
    throw error;
  }
};

export const generateDiagram = async (prompt: string): Promise<string | null> => {
  try {
    const finalPrompt = `high quality educational textbook illustration of ${prompt}, white background, clear scientific diagram, flat vector style, no text labels, accurate`;
    
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL_NAME,
      contents: {
        parts: [{ text: finalPrompt }],
      },
      config: {
        imageConfig: { aspectRatio: "16:9" } 
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Diagram generation error:", error);
    return null;
  }
};

export const generateFollowUp = async (
  question: string, 
  currentLesson: LessonPlan
): Promise<FollowUpResponse> => {
  try {
    const contextStr = JSON.stringify(currentLesson.steps.map(s => ({ 
      index: s.index, 
      title: s.title, 
      label: s.overlay_description,
    })));

    const systemInstruction = `You are ETERN. 
    Lesson paused. Student question.
    1. Check if the question fits the current topic context: ${currentLesson.topic}.
    2. If it fits, pick the best existing diagram step to show and provide a short answer (1-3 sentences).
    3. If the question is completely UNRELATED (e.g. asking about Space during a Human Anatomy lesson), set 'is_off_topic' to true and extract the new topic into 'new_topic_query'.`;

    const userPrompt = `Q: "${question}". Context: ${contextStr}.`;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: followUpSchema,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    return JSON.parse(text) as FollowUpResponse;

  } catch (error) {
    console.error("Error generating follow-up:", error);
    throw error;
  }
};