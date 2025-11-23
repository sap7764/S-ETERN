
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

// Audio configuration constants
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

export class LiveSessionService {
  private ai: GoogleGenAI;
  private inputContext: AudioContext | null = null;
  private outputContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private currentStream: MediaStream | null = null;
  private nextStartTime: number = 0;
  private isConnected: boolean = false;
  private sessionPromise: Promise<any> | null = null;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async startSession(
    topic: string, 
    onAudioActivity: (active: boolean) => void,
    onError?: (error: any) => void
  ) {
    if (this.isConnected) return;

    try {
      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      this.inputContext = new AudioContextClass({ sampleRate: INPUT_SAMPLE_RATE });
      this.outputContext = new AudioContextClass({ sampleRate: OUTPUT_SAMPLE_RATE });

      // CRITICAL: Ensure contexts are running (browsers often suspend them)
      if (this.inputContext.state === 'suspended') {
        await this.inputContext.resume();
      }
      if (this.outputContext.state === 'suspended') {
        await this.outputContext.resume();
      }

      this.currentStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: INPUT_SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      // Connect with Retry Logic
      this.sessionPromise = this.connectWithRetry(topic, onAudioActivity, onError);
      
      await this.sessionPromise;

    } catch (error) {
      console.error("Failed to start live session after retries:", error);
      if (onError) onError(error);
      this.stopSession();
    }
  }

  private async connectWithRetry(
    topic: string, 
    onAudioActivity: (active: boolean) => void, 
    onError?: (error: any) => void,
    retries = 3, 
    delay = 1000
  ): Promise<any> {
    try {
      return await this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Session Opened");
            this.isConnected = true;
            this.startAudioInput();
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle audio output from model
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
               onAudioActivity(true);
               await this.playAudioChunk(base64Audio);
               // Simple timeout to reset visual activity
               setTimeout(() => onAudioActivity(false), 500);
            }
          },
          onclose: () => {
            console.log("Gemini Live Session Closed");
            this.isConnected = false;
          },
          onerror: (err) => {
            console.error("Gemini Live Socket Error:", err);
            if (onError) onError(err);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: `You are an expert tutor. The user is currently learning about "${topic}". 
          You are now in a live voice conversation. 
          1. Answer the user's questions concisely and strictly related to ${topic}. 
          2. Do not deviate to other topics. 
          3. Keep responses short and conversational suitable for voice.`,
        },
      });
    } catch (error) {
      if (retries > 0) {
        console.warn(`Connection failed, retrying in ${delay}ms... (${retries} attempts left)`);
        await new Promise(res => setTimeout(res, delay));
        return this.connectWithRetry(topic, onAudioActivity, onError, retries - 1, delay * 2);
      } else {
        throw error;
      }
    }
  }

  private startAudioInput() {
    if (!this.inputContext || !this.currentStream || !this.sessionPromise) return;

    // Create source from microphone
    this.inputSource = this.inputContext.createMediaStreamSource(this.currentStream);
    
    // Create processor: bufferSize 4096, 1 input, 1 output
    this.processor = this.inputContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (!this.isConnected) return;

      const inputData = e.inputBuffer.getChannelData(0);
      
      // Convert Float32 to Int16 PCM Base64
      const b64Data = this.pcmToB64(inputData);
      
      this.sessionPromise?.then((session) => {
          session.sendRealtimeInput({
            media: {
              mimeType: 'audio/pcm;rate=16000',
              data: b64Data
            }
          });
      }).catch(err => {
          // Silent catch for stream send errors to avoid console spam
      });
    };

    // Connect graph: Source -> Processor -> Destination (Destination needed for Chrome to fire events)
    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputContext.destination);
  }

  private async playAudioChunk(base64Audio: string) {
    if (!this.outputContext) return;

    // Resume output context if it suspended (user inactivity)
    if (this.outputContext.state === 'suspended') {
      await this.outputContext.resume();
    }

    const audioData = this.b64ToPcm(base64Audio);
    const audioBuffer = this.outputContext.createBuffer(1, audioData.length, OUTPUT_SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(audioData);

    const source = this.outputContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputContext.destination);

    // Schedule playback ensuring no overlap/gaps
    const currentTime = this.outputContext.currentTime;
    if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
    }
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  stopSession() {
    this.isConnected = false;
    
    // Cleanup input
    if (this.inputSource) {
      try { this.inputSource.disconnect(); } catch (e) {}
      this.inputSource = null;
    }
    if (this.processor) {
      try { this.processor.disconnect(); } catch (e) {}
      this.processor = null;
    }

    // Stop tracks
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }

    // Close contexts
    if (this.inputContext) {
      try { this.inputContext.close(); } catch (e) {}
      this.inputContext = null;
    }
    if (this.outputContext) {
      try { this.outputContext.close(); } catch (e) {}
      this.outputContext = null;
    }
    
    this.nextStartTime = 0;
  }

  // --- Helpers ---

  private pcmToB64(float32Array: Float32Array): string {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    let binary = '';
    const bytes = new Uint8Array(int16Array.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private b64ToPcm(base64: string): Float32Array {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    return float32;
  }
}
