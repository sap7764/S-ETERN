
import React, { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import VisualPlayer from './components/VisualPlayer';
import ChatInterface from './components/ChatInterface';
import SideMenu from './components/SideMenu';
import { LessonPlan, ChatMessage, PlayerState, SavedSession } from './types';
import { generateLesson, generateFollowUp } from './services/geminiService';
import { saveSessionToStorage, getSessionsFromStorage, deleteSessionFromStorage } from './services/storageService';
import { Menu } from 'lucide-react';

// Provided API Key for web scraping (SerpApi)
const SCRAPER_API_KEY = 'c2d96985f10e88dd7a7115643319a938d26a0104fb6e417b9c8d8a7c863cfd83';

const App: React.FC = () => {
  const [sessionId, setSessionId] = useState<string>(uuidv4());
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [playerState, setPlayerState] = useState<PlayerState>(PlayerState.IDLE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  
  // Default audio language (Hi = Hindi, En = English)
  const [audioLanguage, setAudioLanguage] = useState<'en' | 'hi'>('hi');

  // Load saved sessions on mount
  useEffect(() => {
    setSavedSessions(getSessionsFromStorage());
  }, []);

  // Auto-save session effect
  useEffect(() => {
    if (lessonPlan && messages.length > 0) {
      const sessionData: SavedSession = {
        id: sessionId,
        topic: lessonPlan.topic,
        lastActive: new Date().toISOString(),
        lessonPlan,
        messages,
        currentStepIndex
      };
      
      const timeoutId = setTimeout(() => {
        saveSessionToStorage(sessionData);
        setSavedSessions(getSessionsFromStorage()); // Refresh list
      }, 2000); // Debounce save

      return () => clearTimeout(timeoutId);
    }
  }, [lessonPlan, messages, currentStepIndex, sessionId]);

  // Helper for timestamp
  const getTimestamp = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper to fetch real image from SerpApi with CORS proxy
  const fetchRealImageUrl = async (query: string): Promise<string | null> => {
    try {
      const baseUrl = "https://serpapi.com/search.json";
      const params = new URLSearchParams({
        engine: "google_images",
        q: query + " labelled diagram educational HD",
        api_key: SCRAPER_API_KEY,
        num: "1",
        tbs: "isz:l"
      });
      
      const targetUrl = `${baseUrl}?${params.toString()}`;
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
      
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      
      const data = await response.json();
      if (data.images_results && data.images_results.length > 0) {
        return data.images_results[0].original;
      }
    } catch (error) {
      console.warn("Error fetching real image (CORS/API limit), falling back to generated:", error);
    }
    return null;
  };

  // Enrich plan with URLs and Preload
  const prepareLessonAssets = async (plan: LessonPlan) => {
    const promises = plan.steps.map(async (step, i) => {
      // If URL already exists (from loaded session), preload it but don't re-fetch
      if (step.imageUrl) {
         return new Promise((resolve) => {
            const img = new Image();
            img.src = step.imageUrl!;
            img.onload = resolve;
            img.onerror = resolve;
         });
      }

      let url = await fetchRealImageUrl(step.diagram_scrape_query);

      if (!url) {
        const encodedQuery = encodeURIComponent(`${step.diagram_scrape_query} clean minimalist educational diagram schematic, white background, no text, no labels, bold lines`);
        url = `https://image.pollinations.ai/prompt/${encodedQuery}?width=1280&height=720&nologo=true&seed=${i + 200}`;
      }

      step.imageUrl = url;

      return new Promise((resolve) => {
        const img = new Image();
        img.src = url!;
        img.onload = resolve;
        img.onerror = resolve;
      });
    });

    await Promise.all(promises);
  };

  // Core logic to handle new messages
  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = { 
      id: uuidv4(), 
      role: 'user', 
      text,
      timestamp: getTimestamp()
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      if (!lessonPlan) {
        // SCENARIO 1: New Lesson
        setPlayerState(PlayerState.LOADING);
        
        const plan = await generateLesson(text);
        
        await prepareLessonAssets(plan);

        setLessonPlan(plan);
        setCurrentStepIndex(0);

        const tutorMsg: ChatMessage = {
          id: uuidv4(),
          role: 'tutor',
          text: `Great! I've prepared a visual lesson about "${plan.topic}". Watch the screen above.`,
          timestamp: getTimestamp()
        };
        setMessages(prev => [...prev, tutorMsg]);
        
        setPlayerState(PlayerState.PLAYING);
      
      } else {
        // SCENARIO 2: Follow-up Question
        setPlayerState(PlayerState.PAUSED);

        const response = await generateFollowUp(text, lessonPlan);
        
        if (response.targetStepIndex >= 0 && response.targetStepIndex < lessonPlan.steps.length) {
            setCurrentStepIndex(response.targetStepIndex);
        }
        
        const answerText = audioLanguage === 'hi' && response.answer_hindi 
            ? response.answer_hindi 
            : response.answer;

        const tutorMsg: ChatMessage = {
          id: uuidv4(),
          role: 'tutor',
          text: answerText,
          timestamp: getTimestamp()
        };
        setMessages(prev => [...prev, tutorMsg]);

        const utterance = new SpeechSynthesisUtterance(answerText);
        const voices = window.speechSynthesis.getVoices();
        let preferredVoice = null;
        if (audioLanguage === 'hi') {
             preferredVoice = voices.find(v => v.lang.includes('hi') || v.name.includes('Hindi'));
        } else {
             preferredVoice = voices.find(v => v.lang.includes('en-US') && v.name.includes('Google')) || voices.find(v => v.lang.includes('en'));
        }
        
        if (preferredVoice) utterance.voice = preferredVoice;

        if (!isMuted) {
             window.speechSynthesis.cancel();
             window.speechSynthesis.speak(utterance);
        }
      }
    } catch (error) {
      console.error(error);
      const errorMsg: ChatMessage = {
        id: uuidv4(),
        role: 'tutor',
        text: "I'm having trouble connecting to my knowledge base. Please check your API key or try again.",
        timestamp: getTimestamp()
      };
      setMessages(prev => [...prev, errorMsg]);
      setPlayerState(PlayerState.IDLE);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextStep = useCallback(() => {
    if (!lessonPlan) return;

    if (currentStepIndex < lessonPlan.steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
      if (playerState !== PlayerState.PLAYING) {
        setPlayerState(PlayerState.PLAYING);
      }
    } else {
      setPlayerState(PlayerState.COMPLETED);
    }
  }, [lessonPlan, currentStepIndex, playerState]);

  const handlePrevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
      setPlayerState(PlayerState.PLAYING);
    }
  }, [currentStepIndex]);

  const handlePlay = () => setPlayerState(PlayerState.PLAYING);
  const handlePause = () => setPlayerState(PlayerState.PAUSED);
  const handleRestart = () => {
    setCurrentStepIndex(0);
    setPlayerState(PlayerState.PLAYING);
  };

  const handleSelectSession = async (session: SavedSession) => {
      // Reset state first
      setIsLoading(true);
      setPlayerState(PlayerState.LOADING);
      
      // Load saved data
      setSessionId(session.id);
      setMessages(session.messages);
      
      // Re-prepare assets (check cache)
      if (session.lessonPlan) {
          await prepareLessonAssets(session.lessonPlan);
          setLessonPlan(session.lessonPlan);
          setCurrentStepIndex(session.currentStepIndex);
          setPlayerState(PlayerState.PAUSED); // Start paused so user is ready
      }
      
      setIsLoading(false);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setSavedSessions(deleteSessionFromStorage(id));
      if (id === sessionId) {
          handleNewChat();
      }
  };

  const handleNewChat = () => {
      setSessionId(uuidv4());
      setLessonPlan(null);
      setMessages([]);
      setCurrentStepIndex(0);
      setPlayerState(PlayerState.IDLE);
  };

  return (
    <div className="h-screen w-full flex flex-col md:flex-row bg-black text-white overflow-hidden font-sans selection:bg-white/30 selection:text-white">
      
      <SideMenu 
        isOpen={isMenuOpen} 
        onClose={() => setIsMenuOpen(false)} 
        sessions={savedSessions}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onNewChat={handleNewChat}
      />

      {/* Main Menu Trigger */}
      <button 
        onClick={() => setIsMenuOpen(true)}
        className="absolute top-6 left-6 z-50 p-2.5 bg-black/60 backdrop-blur-xl border border-white/20 rounded-full text-white hover:bg-white hover:text-black transition-all shadow-lg"
      >
        <Menu size={20} />
      </button>

      {/* Left / Top: Visual Area */}
      <div className="w-full md:w-2/3 h-[45vh] md:h-full p-0 md:p-6 flex flex-col items-center justify-center relative border-b md:border-b-0 md:border-r border-white/10 bg-black">
        <div className="absolute inset-0 bg-cyber-grid bg-[length:40px_40px] opacity-10 pointer-events-none"></div>
        <div className="w-full max-w-5xl px-2 md:px-0 z-10 pt-10 md:pt-0"> {/* Added padding top for mobile menu clearance */}
          <VisualPlayer 
            step={lessonPlan ? lessonPlan.steps[currentStepIndex] : null}
            totalSteps={lessonPlan?.steps.length || 0}
            currentStepIndex={currentStepIndex}
            playerState={playerState}
            onNextStep={handleNextStep}
            onPrevStep={handlePrevStep}
            onPlay={handlePlay}
            onPause={handlePause}
            onRestart={handleRestart}
            isMuted={isMuted}
            toggleMute={() => setIsMuted(!isMuted)}
            audioLanguage={audioLanguage}
            setAudioLanguage={setAudioLanguage}
          />
        </div>
      </div>

      {/* Right / Bottom: Chat Area (White Theme) */}
      <div className="w-full md:w-1/3 h-[55vh] md:h-full flex flex-col bg-white border-l border-gray-200 shadow-2xl relative">
        <ChatInterface 
          messages={messages} 
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
        />
      </div>

    </div>
  );
};

export default App;
