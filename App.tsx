import React, { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import VisualPlayer from './components/VisualPlayer';
import ChatInterface from './components/ChatInterface';
import SideMenu from './components/SideMenu';
import { LessonPlan, ChatMessage, PlayerState, SavedSession } from './types';
import { generateLesson, generateFollowUp, generateDiagram } from './services/geminiService';
import { generateGeminiTTS } from './services/ttsService'; // Imported for pre-caching
import { saveSessionToStorage, getSessionsFromStorage, deleteSessionFromStorage } from './services/storageService';
import { Menu } from 'lucide-react';

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
  const [audioLanguage, setAudioLanguage] = useState<'en' | 'hi'>('en');

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

  // SMART AUDIO PRE-CACHING
  // Instead of loading all at once (which causes 429s), we load the *next* step gently.
  useEffect(() => {
    if (!lessonPlan || currentStepIndex >= lessonPlan.steps.length - 1) return;

    const nextStep = lessonPlan.steps[currentStepIndex + 1];
    const textToPreload = audioLanguage === 'hi' ? nextStep.narration_hindi : nextStep.narration;

    // We delay the pre-load to ensure the *current* step's request has priority
    // and to space out requests.
    const timer = setTimeout(() => {
        generateGeminiTTS(textToPreload).catch(err => {
            // Ignore errors here, just a pre-fetch
            console.warn("Background audio pre-fetch skipped");
        });
    }, 4000);

    return () => clearTimeout(timer);
  }, [currentStepIndex, lessonPlan, audioLanguage]);

  // Helper for timestamp
  const getTimestamp = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Enriches the plan with images in the background
  const startBackgroundAssetGeneration = (plan: LessonPlan) => {
    plan.steps.forEach(async (step, index) => {
        
        // 1. Audio Pre-caching - REMOVED to prevent 429 Quota errors
        // We now handle this via the useEffect above (Just-In-Time loading)

        // 2. Image Generation
        if (step.imageUrl) return; // Already has image

        try {
            // Generate visual using Gemini Image Model
            const url = await generateDiagram(step.diagram_scrape_query);
            
            // Optimized Fallback for Valid Diagrams
            const finalUrl = url || `https://image.pollinations.ai/prompt/${encodeURIComponent(step.diagram_scrape_query + " educational textbook diagram white background no text")}?width=960&height=540&nologo=true&seed=${index + 999}`;

            // Preload to ensure smoother transition when state updates
            const img = new Image();
            img.src = finalUrl;
            img.onload = () => {
                setLessonPlan(prev => {
                    if (!prev || prev.topic !== plan.topic) return prev; // Safety check if user switched topic
                    const newSteps = [...prev.steps];
                    newSteps[index] = { ...newSteps[index], imageUrl: finalUrl };
                    return { ...prev, steps: newSteps };
                });
            };
        } catch (e) {
            console.error(`Error generating asset for step ${index}`, e);
        }
    });
  };

  // Helper: Start a new lesson from scratch
  const createNewLesson = async (topic: string, newId: string) => {
      setPlayerState(PlayerState.LOADING);
      setSessionId(newId);
      
      // 1. Generate text structure
      const plan = await generateLesson(topic);
      
      // 2. Set plan IMMEDIATELY
      setLessonPlan(plan);
      setCurrentStepIndex(0);
      
      const tutorMsg: ChatMessage = {
        id: uuidv4(),
        role: 'tutor',
        text: `I've prepared a specialized lesson on "${plan.topic}".`,
        timestamp: getTimestamp()
      };
      setMessages([tutorMsg]);
      
      // 3. Start player
      setPlayerState(PlayerState.PLAYING);

      // 4. Background assets (Images only)
      startBackgroundAssetGeneration(plan);
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
        // SCENARIO 1: New Lesson (Initial)
        await createNewLesson(text, sessionId);
      } else {
        // SCENARIO 2: Follow-up Question
        setPlayerState(PlayerState.PAUSED);

        const response = await generateFollowUp(text, lessonPlan);

        // Check for Context Switch
        if (response.is_off_topic && response.new_topic_query) {
             const switchMsg: ChatMessage = {
                id: uuidv4(),
                role: 'tutor',
                text: `That sounds like a new topic. Let me prepare a specialized lesson on "${response.new_topic_query}" for you.`,
                timestamp: getTimestamp()
             };
             setMessages(prev => [...prev, switchMsg]);
             
             // Wait briefly then switch
             setTimeout(async () => {
                 // Clean restart with new session ID
                 setLessonPlan(null);
                 setMessages([]); 
                 await createNewLesson(response.new_topic_query!, uuidv4());
                 setIsLoading(false);
             }, 1000);
             return; // Exit here, async callback handles the rest
        }
        
        // Normal Follow-up Logic
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

        // Just use WebSpeech for quick textual answers in chat to keep it snappy
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
        text: "I'm having trouble connecting right now. Please try again.",
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
      setLessonPlan(session.lessonPlan);
      setCurrentStepIndex(session.currentStepIndex);
      
      // Check if any images are missing (legacy or incomplete save)
      startBackgroundAssetGeneration(session.lessonPlan);
      
      setPlayerState(PlayerState.PAUSED); 
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
      <div className="w-full md:w-2/3 aspect-video md:aspect-auto md:h-full flex flex-col items-center justify-center relative bg-black border-b md:border-b-0 md:border-r border-white/10 z-10 shadow-2xl">
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

      {/* Right / Bottom: Chat Area */}
      <div className="w-full md:w-1/3 flex-1 flex flex-col shadow-2xl relative z-20 min-h-0">
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