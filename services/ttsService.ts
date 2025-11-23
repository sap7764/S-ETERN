
export const generateOpenAITTS = async (
  text: string, 
  apiKey: string | undefined,
  speed: number = 1.0,
  voice: string = "alloy"
): Promise<string | null> => {
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: voice,
        speed: speed,
        response_format: "mp3"
      }),
    });

    if (!response.ok) {
       console.warn("OpenAI TTS API Error:", await response.text());
       return null;
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.warn("OpenAI TTS Fetch Error:", error);
    return null;
  }
};
