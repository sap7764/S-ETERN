import { SavedSession } from '../types';

const STORAGE_KEY = 'etern_sessions';

// Helper to remove large base64 strings to stay within localStorage limits
const sanitizeSession = (session: SavedSession): SavedSession => {
  // Create a deep copy to avoid mutating the active state
  const copy = JSON.parse(JSON.stringify(session));
  
  if (copy.lessonPlan?.steps) {
    copy.lessonPlan.steps.forEach((step: any) => {
      // Remove Base64 images (usually start with 'data:') as they exceed storage quotas
      // We keep standard URLs (http/https) if they exist
      if (step.imageUrl && step.imageUrl.startsWith('data:')) {
        delete step.imageUrl;
      }
    });
  }
  return copy;
};

export const saveSessionToStorage = (session: SavedSession) => {
  try {
    const cleanSession = sanitizeSession(session);
    const existing = getSessionsFromStorage();
    
    // Remove existing version of this session
    const filtered = existing.filter(s => s.id !== cleanSession.id);
    
    // Add updated version to the top
    filtered.unshift(cleanSession);
    
    // Limit to last 10 sessions to be safe with quota
    const trimmed = filtered.slice(0, 10);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error("Failed to save session", error);
    
    // Fallback: Try saving ONLY the current session if the array is too large
    try {
        const currentOnly = [sanitizeSession(session)];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentOnly));
    } catch (criticalError) {
        console.error("Critical: Storage completely full or blocked", criticalError);
    }
  }
};

export const getSessionsFromStorage = (): SavedSession[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Failed to load sessions", error);
    return [];
  }
};

export const deleteSessionFromStorage = (id: string) => {
  try {
    const existing = getSessionsFromStorage();
    const filtered = existing.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (error) {
    console.error("Failed to delete session", error);
    return [];
  }
};