import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Simple memory cache to prevent regenerating the same sentence
const audioCache = new Map<string, string>();

/**
 * Generates speech using Gemini and returns raw Base64 PCM data (24kHz, Mono, S16LE).
 */
export const generateGeminiTTS = async (text: string): Promise<string | null> => {
  if (!text) return null;

  // Check cache first
  const cacheKey = text.trim();
  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey) || null;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, 
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (base64Audio) {
      audioCache.set(cacheKey, base64Audio);
      return base64Audio;
    }

    console.warn("Gemini TTS: No audio data returned");
    return null;

  } catch (error: any) {
    if (error.status === 429 || (error.message && error.message.includes('429'))) {
        console.warn("Gemini TTS Rate Limit (429) hit. Falling back to system voice.");
        return null;
    }
    console.error("Gemini TTS Error:", error);
    return null;
  }
};