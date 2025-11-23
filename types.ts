
export interface LessonStep {
  index: number;
  title: string;
  narration: string; // Default English
  narration_hindi: string; // Hindi variant
  narration_3d?: string; // Specific narration when 3D mode is active (English)
  narration_3d_hindi?: string; // Specific narration when 3D mode is active (Hindi)
  diagram_scrape_query: string;
  diagram_role: string;
  overlay_description: string;
  suggested_duration_ms: number;
  imageUrl?: string; // Added to store the real fetched URL
  coordinates?: { top: number; left: number }; // AI-analyzed position
  sketchfab_model_id?: string; // ID for specific 3D models
}

export interface LessonPlan {
  topic: string;
  steps: LessonStep[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'tutor';
  text: string;
  timestamp: string;
  isSystem?: boolean;
}

export enum PlayerState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface FollowUpResponse {
  answer: string; // English
  answer_hindi: string; // Hindi
  targetStepIndex: number; // The step to jump back to for visual context
}

// Web Speech API types
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
    Sketchfab: any;
  }
}
