
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { LessonStep, PlayerState } from '../types';
import { Play, Pause, RotateCcw, Volume2, VolumeX, PlayCircle, Loader2, SkipBack, SkipForward, ZoomIn, ZoomOut, Scan, BrainCircuit, Layers, Settings, Globe, Gauge, Box, Image as ImageIcon, Hand, Maximize, Minimize, Captions, Crosshair, Mic } from 'lucide-react';
import DiagramOverlay from './DiagramOverlay';
import LiveAvatar from './LiveAvatar';
import { generateOpenAITTS } from '../services/ttsService';
import { LiveSessionService } from '../services/liveSessionService';

// Access global anime
declare const anime: any;
// Access global Sketchfab API
declare const Sketchfab: any;

interface VisualPlayerProps {
  step: LessonStep | null;
  playerState: PlayerState;
  onNextStep: () => void;
  onPrevStep: () => void;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  isMuted: boolean;
  toggleMute: () => void;
  totalSteps: number;
  currentStepIndex: number;
  audioLanguage: 'en' | 'hi';
  setAudioLanguage: (lang: 'en' | 'hi') => void;
  topic?: string; // Passed from parent for live context
}

const VisualPlayer: React.FC<VisualPlayerProps> = ({
  step,
  playerState,
  onNextStep,
  onPrevStep,
  onPlay,
  onPause,
  onRestart,
  isMuted,
  toggleMute,
  totalSteps,
  currentStepIndex,
  audioLanguage,
  setAudioLanguage,
  topic
}) => {
  // Image loading state for fade-in effect
  const [imgLoaded, setImgLoaded] = useState(false);
  
  // Default to false so it does NOT zoom automatically. Manual control only.
  const [isZoomed, setIsZoomed] = useState(false); 
  const [is3DMode, setIs3DMode] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [active3DPoint, setActive3DPoint] = useState<number | null>(null);
  
  // Audio settings
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [showSettings, setShowSettings] = useState(false);

  // Live Session State
  const [isLiveSession, setIsLiveSession] = useState(false);
  const [isLiveSpeaking, setIsLiveSpeaking] = useState(false);
  const liveServiceRef = useRef<LiveSessionService | null>(null);

  // ETERN Workflow Phase state
  const [workflowPhase, setWorkflowPhase] = useState(0);

  // Audio References
  const synthRef = useRef<SpeechSynthesis | null>(window.speechSynthesis);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const scanlineRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  
  // 3D API Refs
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sketchfabApiRef = useRef<any>(null);

  // Calculate the focus point based on the label (Deterministic Hashing or AI coords)
  const focusPoint = useMemo(() => {
    if (!step) return { top: 50, left: 50 };
    
    // Use AI-analyzed coordinates if available
    if (step.coordinates) {
        return step.coordinates;
    }

    // Fallback to deterministic hashing if no AI coords
    if (!step.overlay_description) return { top: 50, left: 50 };
    const label = step.overlay_description;
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
      hash = label.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Top: 20% - 70%
    // Left: 20% - 80%
    const topVal = Math.abs(hash % 50) + 20; 
    const leftVal = Math.abs((hash >> 2) % 60) + 20;

    return { top: topVal, left: leftVal };
  }, [step]);

  // Derive current text for subtitles and audio
  const currentText = useMemo(() => {
      if (!step) return "";
      if (is3DMode) {
          // If a specific interactive point is active, use its narration
          if (active3DPoint !== null && step.model_interaction_points && step.model_interaction_points[active3DPoint]) {
             const point = step.model_interaction_points[active3DPoint];
             return audioLanguage === 'hi' ? point.narration_hindi : point.narration;
          }
          // Default 3D narration
          const en3d = step.narration_3d || "Use your finger to rotate the model and explore its details.";
          const hi3d = step.narration_3d_hindi || "मॉडल को घुमाने और इसके विवरणों को देखने के लिए अपनी उंगली का उपयोग करें।";
          return audioLanguage === 'hi' ? hi3d : en3d;
      }
      return audioLanguage === 'hi' ? step.narration_hindi : step.narration;
  }, [step, is3DMode, audioLanguage, active3DPoint]);

  const stopAudio = useCallback(() => {
    // Stop Web Speech
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    // Stop OpenAI Audio
    if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
    }
    setIsAudioLoading(false);
  }, []);

  const playAudio = useCallback(async (text: string) => {
    // If live session is active, do not play regular lesson audio
    if (isLiveSession) return;

    stopAudio();

    if (isMuted) {
        const duration = Math.max(3000, (text.length / 15) * 1000);
        if (!is3DMode) {
             setTimeout(() => {
                if (playerState === PlayerState.PLAYING) {
                    onNextStep();
                }
            }, duration);
        }
        return;
    }

    const openAIKey = process.env.OPENAI_API_KEY;
    
    if (openAIKey) {
        setIsAudioLoading(true);
        const voice = audioLanguage === 'hi' ? 'echo' : 'alloy'; 
        const url = await generateOpenAITTS(text, openAIKey, playbackRate, voice);
        
        if (url) {
            if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
            audioUrlRef.current = url;

            const audio = new Audio(url);
            audioPlayerRef.current = audio;
            audio.playbackRate = playbackRate;
            
            audio.oncanplaythrough = () => {
                setIsAudioLoading(false);
                audio.play().catch(e => console.error("Playback failed", e));
            };

            audio.onended = () => {
                if (playerState === PlayerState.PLAYING && !is3DMode) {
                    onNextStep();
                }
            };

            audio.onerror = () => {
                setIsAudioLoading(false);
                fallbackToWebSpeech(text);
            };
            return;
        }
    }
    
    fallbackToWebSpeech(text);

  }, [isMuted, onNextStep, playerState, playbackRate, audioLanguage, is3DMode, stopAudio, isLiveSession]);


  const fallbackToWebSpeech = (text: string) => {
    setIsAudioLoading(false);
    if (!synthRef.current) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = playbackRate;
    utterance.pitch = 1.0;
    
    const voices = synthRef.current.getVoices();
    let preferredVoice = null;

    if (audioLanguage === 'hi') {
        preferredVoice = voices.find(v => v.lang.includes('hi') || v.name.includes('Hindi'));
    } else {
        preferredVoice = voices.find(v => v.lang.includes('en-US') && v.name.includes('Google')) || 
                         voices.find(v => v.lang.includes('en'));
    }
    if (!preferredVoice && audioLanguage === 'hi') {
         preferredVoice = voices.find(v => v.lang.includes('IN')); 
    }

    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => {
      if (playerState === PlayerState.PLAYING && !is3DMode) {
        onNextStep();
      }
    };

    utterance.onerror = (event) => {
      const e = event as SpeechSynthesisErrorEvent; 
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      if (playerState === PlayerState.PLAYING && !is3DMode) {
          onNextStep();
      }
    };

    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  };

  // LIVE SESSION LOGIC
  const toggleLiveSession = async () => {
      if (isLiveSession) {
          // Stop session
          liveServiceRef.current?.stopSession();
          setIsLiveSession(false);
          // Resume lesson context visuals but keep paused until user plays
      } else {
          // Start session
          if (playerState === PlayerState.PLAYING) {
              onPause(); // Pause current lesson
          }
          stopAudio(); // Kill any current narration
          
          setIsLiveSession(true);
          
          if (!liveServiceRef.current) {
              liveServiceRef.current = new LiveSessionService(process.env.API_KEY || '');
          }
          
          const currentTopic = topic || step?.title || "this topic";
          
          // Start session with error handling
          await liveServiceRef.current.startSession(
            currentTopic, 
            (isActive) => {
                setIsLiveSpeaking(isActive);
            },
            (err) => {
                console.error("Live Session failed to start", err);
                setIsLiveSession(false);
                alert("Could not connect to Live Service. Please try again.");
            }
          );
      }
  };


  // 3D MODEL MANIPULATION LOGIC
  const initSketchfab = useCallback(() => {
    if (!iframeRef.current || !step?.sketchfab_model_id || !window.Sketchfab) return;

    try {
        const client = new window.Sketchfab(iframeRef.current);
        client.init(step.sketchfab_model_id, {
            success: (api: any) => {
                sketchfabApiRef.current = api;
                api.start();
                api.addEventListener('viewerready', () => {
                    console.log('Viewer is ready');
                });
            },
            error: () => {
                console.error('Sketchfab API error');
            },
            autostart: 1,
            ui_controls: 0, 
            ui_infos: 0,
            ui_watermark: 0,
            transparent: 0,
            api_version: '1.12.1'
        });
    } catch (e) {
        console.error("Sketchfab Init Exception", e);
    }
  }, [step?.sketchfab_model_id]);

  useEffect(() => {
      if (is3DMode && step?.sketchfab_model_id && !isLiveSession) {
          const timer = setTimeout(initSketchfab, 100);
          return () => clearTimeout(timer);
      } else {
          sketchfabApiRef.current = null;
      }
  }, [is3DMode, step?.sketchfab_model_id, initSketchfab, isLiveSession]);

  const handle3DInteraction = (index: number) => {
      setActive3DPoint(index);
      if (sketchfabApiRef.current) {
          sketchfabApiRef.current.gotoAnnotation(index, (err: any) => {
              if (err) console.log("Error moving to annotation", err);
          });
      }
      if (step?.model_interaction_points && step.model_interaction_points[index]) {
          const point = step.model_interaction_points[index];
          const text = audioLanguage === 'hi' ? point.narration_hindi : point.narration;
          playAudio(text);
      }
  };

  useEffect(() => {
    setImgLoaded(false);
    if (imgRef.current && imgRef.current.complete) {
        setImgLoaded(true);
    }
    setIs3DMode(false);
    setActive3DPoint(null);
  }, [currentStepIndex]);

  useEffect(() => {
    if (!step || isLiveSession) return;

    if (playerState === PlayerState.PLAYING) {
        if (!is3DMode) {
             playAudio(currentText); 
        } else if (active3DPoint === null) {
            playAudio(currentText);
        }
    } else {
      stopAudio();
    }
    return () => {
      stopAudio();
    };
  }, [step, playerState, playAudio, stopAudio, currentText, is3DMode, active3DPoint, isLiveSession]);

  useEffect(() => {
    if (playerState === PlayerState.LOADING) {
        const interval = setInterval(() => {
            setWorkflowPhase(p => (p + 1) % 3);
        }, 1500);
        return () => clearInterval(interval);
    } else {
        setWorkflowPhase(0);
    }
  }, [playerState]);

  useEffect(() => {
      if (imgLoaded && scanlineRef.current) {
          anime({
              targets: scanlineRef.current,
              top: ['-10%', '110%'],
              opacity: [0, 1, 0],
              easing: 'easeInOutQuad',
              duration: 1500,
          });
      }
  }, [imgLoaded, step]);

  useEffect(() => {
      if (controlsRef.current) {
          anime({
              targets: controlsRef.current.children,
              translateY: [20, 0],
              opacity: [0, 1],
              delay: anime.stagger(50),
              easing: 'spring(1, 80, 10, 0)'
          });
      }
  }, []);

  useEffect(() => {
      const handleFullScreenChange = () => {
          setIsFullScreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFullScreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
  }, []);

  const handleImageLoad = () => {
    setImgLoaded(true);
  };

  const togglePlaybackSpeed = () => {
    const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
    const currentIndex = speeds.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % speeds.length;
    setPlaybackRate(speeds[nextIndex]);
    if (audioPlayerRef.current) {
        audioPlayerRef.current.playbackRate = speeds[nextIndex];
    }
  };

  const toggleFullScreen = async () => {
      if (!playerContainerRef.current) return;
      if (!document.fullscreenElement) {
          try {
              await playerContainerRef.current.requestFullscreen();
          } catch (err) {
              console.error("Error attempting to enable fullscreen:", err);
          }
      } else {
          if (document.exitFullscreen) {
              document.exitFullscreen();
          }
      }
  };

  const has3DModel = !!step?.sketchfab_model_id;

  // RENDER IDLE / LOADING STATES (Same as before)
  if (!step && playerState === PlayerState.IDLE) {
    return (
      <div className="w-full aspect-video bg-black rounded-3xl flex flex-col items-center justify-center border border-white/20 shadow-2xl relative overflow-hidden group">
         <div className="absolute inset-0 bg-cyber-grid bg-[length:30px_30px] opacity-10" />
         <div className="z-10 text-center p-8 flex flex-col items-center animate-in fade-in zoom-in duration-700">
            <div className="mb-6 p-6 bg-white/5 backdrop-blur-xl rounded-full border border-white/20 shadow-[0_0_50px_-12px_rgba(255,255,255,0.3)] animate-float">
                <PlayCircle className="w-16 h-16 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
            </div>
            <h1 className="text-5xl font-black text-white mb-3 tracking-tighter drop-shadow-sm">ETERN TUTOR</h1>
            <p className="text-gray-400 text-sm font-bold tracking-[0.3em] uppercase mb-8">Next-Gen Visual Intelligence</p>
            <div className="flex items-center gap-3 text-white text-xs font-mono bg-white/10 px-4 py-2 rounded-full border border-white/20 shadow-[0_0_20px_-5px_rgba(255,255,255,0.1)]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                </span>
                SYSTEM ONLINE
            </div>
         </div>
      </div>
    );
  }

  if (playerState === PlayerState.LOADING) {
     const phases = [
         { text: "Scraping Diagrams & Models...", icon: Scan },
         { text: "Analyzing Teaching Points...", icon: BrainCircuit },
         { text: "Assembling Storyboard...", icon: Layers }
     ];
     const currentPhase = phases[workflowPhase];
     const Icon = currentPhase.icon;
     return (
        <div className="w-full aspect-video bg-black rounded-3xl flex items-center justify-center border border-white/20 relative overflow-hidden shadow-2xl">
             <div className="absolute inset-0 opacity-10 flex justify-center gap-4">
                 <div className="w-px h-full bg-white animate-scan blur-sm"></div>
             </div>
            <div className="z-10 flex flex-col items-center space-y-8">
                <div className="relative">
                    <div className="absolute inset-0 rounded-full blur-2xl opacity-20 bg-white animate-pulse"></div>
                    <div className="relative bg-black/50 p-6 rounded-2xl border border-white/20 backdrop-blur-md shadow-2xl shadow-white/10">
                        <Icon className="w-12 h-12 text-white" />
                    </div>
                </div>
                <div className="text-center space-y-3">
                  <p className="text-white text-2xl font-black tracking-wide uppercase">
                      {currentPhase.text}
                  </p>
                  <div className="flex justify-center gap-2">
                      {phases.map((_, i) => (
                          <div key={i} className={`h-1.5 rounded-full transition-all duration-700 ease-out ${i === workflowPhase ? 'w-12 bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'w-2 bg-white/10'}`}></div>
                      ))}
                  </div>
                </div>
            </div>
        </div>
     );
  }

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Main Video Area */}
      <div 
        ref={playerContainerRef}
        className={`relative w-full bg-black rounded-3xl overflow-hidden shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] border border-white/10 group ring-1 ring-white/10 transition-all duration-500 ${isFullScreen ? 'fixed inset-0 z-50 rounded-none border-none aspect-auto' : 'aspect-video'}`}
      >
        
        {/* LIVE AVATAR OVERLAY */}
        {isLiveSession && (
            <LiveAvatar isSpeaking={isLiveSpeaking} onClick={toggleLiveSession} />
        )}

        {/* Step Counter Overlay (Hide in Live Mode) */}
        {!isLiveSession && (
          <div className="absolute top-6 left-6 z-30 flex items-center gap-3">
              <div className="bg-black/80 backdrop-blur-xl text-white px-4 py-2 rounded-full text-xs font-bold border border-white/20 flex items-center gap-2 shadow-lg">
                  <span className="text-white animate-pulse">●</span>
                  <span className="tracking-wider uppercase text-gray-300">
                      {totalSteps > 0 ? `Step ${currentStepIndex + 1} / ${totalSteps}` : 'Intro'}
                  </span>
              </div>
          </div>
        )}

        {/* Controls Top Right */}
        <div className="absolute top-6 right-6 z-30 flex items-center gap-2">
            
            {/* LIVE BUTTON */}
            <button
                onClick={toggleLiveSession}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full backdrop-blur-md border shadow-lg transition-all ${
                    isLiveSession 
                    ? 'bg-red-600 border-red-500 text-white animate-pulse' 
                    : 'bg-black/60 border-white/20 text-white hover:bg-white/10'
                }`}
            >
                <Mic size={16} />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                    {isLiveSession ? 'LIVE ON' : 'LIVE CONVERSATION'}
                </span>
            </button>

            {!isLiveSession && (
                <>
                <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className={`bg-black/60 hover:bg-white/10 text-white p-2.5 rounded-full transition-all backdrop-blur-md border border-white/20 shadow-lg ${showSettings ? 'text-white border-white bg-white/10' : 'text-gray-300'}`}
                >
                    <Settings size={18} />
                </button>
                <button 
                    onClick={toggleMute}
                    className="bg-black/60 hover:bg-white/10 text-gray-300 hover:text-white p-2.5 rounded-full transition-all backdrop-blur-md border border-white/20 shadow-lg flex items-center justify-center relative"
                >
                    {isAudioLoading ? (
                        <Loader2 size={18} className="animate-spin text-white" />
                    ) : (
                        isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />
                    )}
                </button>
                </>
            )}
        </div>

        {/* Settings Popover (Omitted in Live Mode) */}
        {showSettings && !isLiveSession && (
             <div className="absolute top-20 right-6 z-40 bg-black/90 backdrop-blur-xl border border-white/20 rounded-2xl p-4 w-56 shadow-2xl animate-in fade-in slide-in-from-top-2 ring-1 ring-white/10">
                 {/* ... Existing Settings Code ... */}
                 <div className="flex flex-col gap-4">
                     {has3DModel && (
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5"><Box size={12} className="text-white" /> 3D Mode</span>
                            <button onClick={() => setIs3DMode(!is3DMode)} className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${is3DMode ? 'bg-white/10 border-white/50 text-white' : 'bg-white/5 border-white/20 text-gray-400'}`}>{is3DMode ? 'ON' : 'OFF'}</button>
                        </div>
                     )}
                     {!is3DMode && (
                        <div className="flex items-center justify-between">
                             <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5"><ZoomIn size={12} className="text-white" /> Focus Zoom</span>
                             <button onClick={() => setIsZoomed(!isZoomed)} className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${isZoomed ? 'bg-white/10 border-white/50 text-white' : 'bg-white/5 border-white/20 text-gray-400'}`}>{isZoomed ? 'ON' : 'OFF'}</button>
                         </div>
                     )}
                     <div className="flex items-center justify-between">
                         <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5"><Captions size={12} className="text-white" /> Subtitles</span>
                         <button onClick={() => setShowSubtitles(!showSubtitles)} className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${showSubtitles ? 'bg-white/10 border-white/50 text-white' : 'bg-white/5 border-white/20 text-gray-400'}`}>{showSubtitles ? 'ON' : 'OFF'}</button>
                     </div>
                     <div className="h-px bg-white/10"></div>
                     <div className="flex items-center justify-between">
                         <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5"><Globe size={12} className="text-white" /> Audio Lang</span>
                         <button onClick={() => setAudioLanguage(audioLanguage === 'en' ? 'hi' : 'en')} className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${audioLanguage === 'en' ? 'bg-white/10 border-white/50 text-white' : 'bg-white/5 border-white/20 text-gray-400'}`}>{audioLanguage === 'en' ? 'ENGLISH' : 'HINDI'}</button>
                     </div>
                     <div className="flex items-center justify-between">
                         <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5"><Gauge size={12} className="text-white" /> Speed</span>
                         <button onClick={togglePlaybackSpeed} className="text-[10px] font-bold bg-white/5 px-3 py-1.5 rounded-lg border border-white/20 hover:border-white hover:text-white hover:bg-white/10 transition-all w-16 text-center text-gray-300">{playbackRate}x</button>
                     </div>
                 </div>
             </div>
        )}

        {/* Main Display Container */}
        {step && (
            <div className={`w-full h-full relative bg-white overflow-hidden transition-all duration-500 ${isLiveSession ? 'blur-sm scale-95 opacity-50' : 'opacity-100'}`}>
                {is3DMode && has3DModel ? (
                    <div className="w-full h-full relative bg-black">
                        <iframe 
                            key={step.sketchfab_model_id}
                            ref={iframeRef}
                            title="3D Model" 
                            frameBorder="0" 
                            allowFullScreen 
                            allow="autoplay; fullscreen; xr-spatial-tracking" 
                            className="w-full h-full" 
                        ></iframe>
                        
                         {step.model_interaction_points && step.model_interaction_points.length > 0 && (
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
                                <div className="bg-black/90 backdrop-blur-xl p-1.5 rounded-2xl border border-white/20 shadow-2xl flex items-center gap-2">
                                     <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 border-r border-white/10 flex items-center gap-2">
                                         <Crosshair size={12} className="text-white" />
                                         TEACH ME
                                     </div>
                                     {step.model_interaction_points.map((point, idx) => (
                                         <button
                                            key={idx}
                                            onClick={() => handle3DInteraction(idx)}
                                            className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${active3DPoint === idx ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.6)] scale-110' : 'bg-white/10 text-white hover:bg-white/20'}`}
                                         >
                                             {idx + 1}
                                         </button>
                                     ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div 
                      className="w-full h-full relative transition-transform duration-[1200ms] cubic-bezier(0.25, 1, 0.5, 1)"
                      style={{
                        transformOrigin: `${focusPoint.left}% ${focusPoint.top}%`,
                        transform: isZoomed && imgLoaded ? 'scale(2.5)' : 'scale(1)'
                      }}
                    >
                        <div className="absolute inset-0 bg-white"></div> 
                        <img 
                            ref={imgRef}
                            src={step.imageUrl} 
                            alt={step.diagram_role}
                            className={`w-full h-full object-contain relative z-10 transition-opacity duration-700 ease-in-out ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                            onLoad={handleImageLoad}
                        />
                        <div ref={scanlineRef} className="absolute w-full h-1 bg-white/50 shadow-[0_0_20px_#ffffff] z-20 pointer-events-none opacity-0"></div>
                        <DiagramOverlay label={step.overlay_description} topPercent={focusPoint.top} leftPercent={focusPoint.left} isActive={imgLoaded} isZoomed={isZoomed} />
                    </div>
                )}
                
                {showSubtitles && !isLiveSession && (
                    <div className="absolute bottom-20 left-0 right-0 z-30 text-center px-4 pointer-events-none">
                        <div className="inline-block bg-black/90 backdrop-blur-xl text-white px-6 py-3 rounded-2xl text-lg font-medium shadow-[0_4px_30px_rgba(0,0,0,0.5)] border border-white/10 max-w-[85%] leading-relaxed animate-in fade-in slide-in-from-bottom-4">
                            {currentText}
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* Completed State Overlay */}
        {playerState === PlayerState.COMPLETED && !isLiveSession && (
            <div className="absolute inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-40">
                <div className="text-center p-8 animate-in fade-in zoom-in duration-500 border border-white/20 bg-black rounded-3xl shadow-2xl">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-white/20">
                        <Scan className="w-8 h-8 text-black" />
                    </div>
                    <h2 className="text-3xl font-black text-white mb-2 tracking-tight">LESSON COMPLETE</h2>
                    <p className="text-gray-400 mb-8 font-medium">Ask a follow-up or replay the lesson.</p>
                    <button onClick={onRestart} className="group flex items-center gap-3 bg-white text-black px-8 py-3.5 rounded-full font-bold hover:bg-gray-200 transition-all shadow-lg hover:shadow-white/20 hover:scale-105">
                        <RotateCcw size={18} className="group-hover:-rotate-180 transition-transform duration-500 text-black" /> 
                        Replay Session
                    </button>
                </div>
            </div>
        )}

        {/* Fullscreen Controls */}
        {isFullScreen && !isLiveSession && (
            <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black via-black/80 to-transparent z-50 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    {playerState === PlayerState.PLAYING ? (
                        <button onClick={onPause} className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all"><Pause size={24} fill="currentColor" /></button>
                    ) : (
                        <button onClick={onPlay} disabled={!step} className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all disabled:opacity-50"><Play size={24} fill="currentColor" /></button>
                    )}
                    <div className="flex gap-1.5 h-2 bg-white/10 rounded-full overflow-hidden w-96 backdrop-blur-sm">
                        {Array.from({ length: totalSteps || 0 }).map((_, idx) => (
                            <div key={idx} className={`flex-1 transition-all duration-700 ${idx < currentStepIndex ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]' : idx === currentStepIndex ? 'bg-white/60' : 'bg-transparent'}`} />
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-4">
                     <button onClick={toggleFullScreen} className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors" title="Exit Full Screen">
                         <Minimize size={20} />
                     </button>
                </div>
            </div>
        )}
      </div>

      {/* Standard Video Controls Bar */}
      {!isFullScreen && !isLiveSession && (
          <div ref={controlsRef} className="flex items-center justify-between px-6 py-4 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 shadow-xl ring-1 ring-white/5 opacity-0 translate-y-4">
             <div className="flex items-center gap-5 w-full">
                {playerState === PlayerState.PLAYING ? (
                     <button onClick={onPause} className="text-white hover:text-gray-300 transition-colors drop-shadow-md"><Pause size={28} fill="currentColor" /></button>
                 ) : (
                     <button onClick={onPlay} disabled={!step} className="text-white hover:text-gray-300 disabled:opacity-30 transition-colors drop-shadow-md"><Play size={28} fill="currentColor" /></button>
                 )}
                <button onClick={onPrevStep} disabled={currentStepIndex === 0 || !step} className="text-gray-400 hover:text-white disabled:opacity-30 transition-colors" title="Previous Step"><SkipBack size={22} fill="currentColor" /></button>
                 <button onClick={onNextStep} disabled={!step || (currentStepIndex === totalSteps - 1 && playerState !== PlayerState.COMPLETED)} className="text-gray-400 hover:text-white disabled:opacity-30 transition-colors" title="Next Step"><SkipForward size={22} fill="currentColor" /></button>
                 <div className="flex-1 flex gap-1.5 h-1.5 bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/10">
                    {Array.from({ length: totalSteps || 0 }).map((_, idx) => (
                        <div key={idx} className={`flex-1 rounded-full transition-all duration-500 ease-out ${idx < currentStepIndex ? 'bg-white' : idx === currentStepIndex ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'bg-white/5'}`} />
                    ))}
                 </div>
             </div>
             <div className="flex items-center gap-4 ml-6 pl-6 border-l border-white/10">
                 <button onClick={onRestart} className="text-gray-500 hover:text-white transition-colors" title="Restart Video"><RotateCcw size={20} /></button>
                 <button onClick={toggleFullScreen} className="text-gray-400 hover:text-white transition-colors" title="Full Screen"><Maximize size={20} /></button>
             </div>
          </div>
      )}
    </div>
  );
};

export default VisualPlayer;
