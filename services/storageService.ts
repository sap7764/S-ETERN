
import { SavedSession } from '../types';

const STORAGE_KEY = 'etern_sessions';

export const saveSessionToStorage = (session: SavedSession) => {
  try {
    const existing = getSessionsFromStorage();
    const index = existing.findIndex(s => s.id === session.id);
    
    if (index >= 0) {
      existing[index] = session;
    } else {
      existing.unshift(session);
    }
    
    // Limit to last 20 sessions to prevent overflow
    const trimmed = existing.slice(0, 20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error("Failed to save session", error);
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
