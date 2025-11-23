
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { LessonPlan, FollowUpResponse } from "../types";

// Initialize Google GenAI Client
// The API key is obtained exclusively from the environment variable process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = "gemini-3-pro-preview";

// --- Schemas for Structured Output ---

const lessonStepSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    index: { type: Type.INTEGER },
    title: { type: Type.STRING },
    narration: { 
      type: Type.STRING, 
      description: "The spoken narration script for this step in ENGLISH." 
    },
    narration_hindi: { 
      type: Type.STRING, 
      description: "The spoken narration script for this step in HINDI (Devanagari script)." 
    },
    narration_3d: {
      type: Type.STRING,
      description: "A short guide in ENGLISH explaining what to explore in the 3D model (e.g., 'Rotate the model to see...'). Only required if sketchfab_model_id is present."
    },
    narration_3d_hindi: {
      type: Type.STRING,
      description: "A short guide in HINDI explaining what to explore in the 3D model. Only required if sketchfab_model_id is present."
    },
    diagram_scrape_query: { 
      type: Type.STRING, 
      description: "Search query for finding the diagram. MUST be in ENGLISH, optimized for Google Images (e.g., 'labeled diagram of heart high resolution')." 
    },
    diagram_role: { type: Type.STRING },
    overlay_description: { 
      type: Type.STRING, 
      description: "Short visual label (1-3 words) for the overlay. MUST be in ENGLISH." 
    },
    suggested_duration_ms: { 
      type: Type.INTEGER, 
      description: "Duration in milliseconds, approx 4000-8000." 
    },
    sketchfab_model_id: {
      type: Type.STRING,
      description: "If the step matches a 3D model context, return one of these IDs: '447ba8d6d1b74668853fd6096ec89435' (General Photosynthesis), 'f258c65762e5435c9d58c1aa136b557a' (Plant Cell), '9a244f04a73d46cd8801fd3d9d40726b' (Chloroplast). Return null if no 3D model applies."
    }
  },
  required: ["index", "title", "narration", "narration_hindi", "diagram_scrape_query", "diagram_role", "overlay_description", "suggested_duration_ms"]
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
      type: Type.STRING, 
      description: "Conversational answer in ENGLISH, 2-3 sentences." 
    },
    answer_hindi: { 
      type: Type.STRING, 
      description: "Conversational answer in HINDI (Devanagari script), 2-3 sentences." 
    },
    targetStepIndex: { 
      type: Type.INTEGER, 
      description: "The index of the existing lesson step that best visually explains this answer." 
    }
  },
  required: ["answer", "answer_hindi", "targetStepIndex"]
};

// --- API Functions ---

export const generateLesson = async (prompt: string): Promise<LessonPlan> => {
  const systemInstruction = `You are ETERN, an advanced visual AI tutor. 
  Your goal is to create a visual video-style lesson plan.
  
  AVAILABLE 3D ASSETS:
  You have access to 3 specific interactive 3D models. If the lesson topic relates to Photosynthesis, you MUST incorporate these into relevant steps by returning their IDs in the 'sketchfab_model_id' field.
  
  1. ID: "447ba8d6d1b74668853fd6096ec89435"
     - Content: General Photosynthesis process, sunlight hitting leaves.
     - Usage: Use this for introduction steps, sunlight absorption, or general process overview.
     
  2. ID: "f258c65762e5435c9d58c1aa136b557a"
     - Content: Eukaryotic Plant Cell (Whole Cell).
     - Usage: Use this when explaining where photosynthesis happens in the cell, cell walls, or vacuoles.
     
  3. ID: "9a244f04a73d46cd8801fd3d9d40726b"
     - Content: Chloroplast (Detailed Organelle).
     - Usage: Use this for deep dives into thylakoids, stroma, light-dependent reactions, or the chlorophyll pigment.

  RULES:
  1. Generate content in both ENGLISH and HINDI.
  2. Diagram search queries MUST be in ENGLISH.
  3. Overlay descriptions MUST be in ENGLISH (1-3 words max).
  4. Create 3-6 steps.
  5. If using a 3D model, provide 'narration_3d' and 'narration_3d_hindi' which guides the user to interact (e.g., "Use your finger to rotate the chloroplast and find the green thylakoid stacks...").
  `;

  const userPrompt = `Create a visual video-style lesson plan for a 14-year-old student about: "${prompt}".`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: lessonPlanSchema,
        temperature: 0.4, 
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

export const generateFollowUp = async (
  question: string, 
  currentLesson: LessonPlan
): Promise<FollowUpResponse> => {
  try {
    // Create a simplified context string
    const contextStr = JSON.stringify(currentLesson.steps.map(s => ({ 
      index: s.index, 
      title: s.title, 
      label: s.overlay_description,
      has3DModel: !!s.sketchfab_model_id
    })));

    const systemInstruction = `You are ETERN. Answer the student's follow-up question based on the visual lesson context.
    
    RULES:
    1. Provide answer in both ENGLISH and HINDI.
    2. Keep answer conversational and short (2-3 sentences).
    3. Choose the best step index to show visually while answering.
    `;

    const userPrompt = `Question: "${question}".
    Lesson Context: ${contextStr}.`;

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
