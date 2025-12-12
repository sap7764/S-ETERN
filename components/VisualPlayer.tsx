import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { LessonStep, PlayerState } from '../types';
import { Play, Pause, RotateCcw, Volume2, VolumeX, PlayCircle, Loader2, ZoomIn, Scan, BrainCircuit, Layers, Settings, Globe, Box, Captions, Crosshair, Mic, Maximize } from 'lucide-react';
import DiagramOverlay from './DiagramOverlay';
import LiveAvatar from './LiveAvatar';
import { generateGeminiTTS } from '../services/ttsService';
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
  topic?: string;
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
  // UI State
  const [isZoomed, setIsZoomed] = useState(true); 
  const [is3DMode, setIs3DMode] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [active3DPoint, setActive3DPoint] = useState<number | null>(null);
  
  // Flow State
  const [internalStepIndex, setInternalStepIndex] = useState<number>(-1);
  const [isPreparing, setIsPreparing] = useState(false);
  const [readyAudio, setReadyAudio] = useState<string | null>(null);
  
  // Live Session State
  const [isLiveSession, setIsLiveSession] = useState(false);
  const [isLiveSpeaking, setIsLiveSpeaking] = useState(false);
  const liveServiceRef = useRef<LiveSessionService | null>(null);
  const [workflowPhase, setWorkflowPhase] = useState(0);

  // Audio Context Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(window.speechSynthesis);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  const imgRef = useRef<HTMLImageElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const scanlineRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sketchfabApiRef = useRef<any>(null);

  // Initialize Audio Context (Single instance)
  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
    return () => { audioContextRef.current?.close(); };
  }, []);

  // --- Helpers ---

  const stopAudio = useCallback(() => {
    if (synthRef.current) synthRef.current.cancel();
    if (audioSourceRef.current) {
        try {
            audioSourceRef.current.stop();
            audioSourceRef.current.disconnect();
        } catch (e) { /* Ignore */ }
        audioSourceRef.current = null;
    }
  }, []);

  const currentText = useMemo(() => {
      if (!step) return "";
      if (is3DMode) {
          if (active3DPoint !== null && step.model_interaction_points && step.model_interaction_points[active3DPoint]) {
             const point = step.model_interaction_points[active3DPoint];
             return audioLanguage === 'hi' ? point.narration_hindi : point.narration;
          }
          const en3d = step.narration_3d || "Rotate the model to explore details.";
          const hi3d = step.narration_3d_hindi || "विवरण देखने के लिए मॉडल को घुमाएं।";
          return audioLanguage === 'hi' ? hi3d : en3d;
      }
      return audioLanguage === 'hi' ? step.narration_hindi : step.narration;
  }, [step, is3DMode, audioLanguage, active3DPoint]);

  // Use center-based focus for safer fitting
  const focusPoint = useMemo(() => {
    if (!step) return { top: 50, left: 50 };
    if (step.coordinates) return step.coordinates;
    return { top: 50, left: 50 };
  }, [step]);

  // --- MAIN FLOW CONTROL ---

  useEffect(() => {
      if (!step || isLiveSession) return;
      if (currentStepIndex !== internalStepIndex) {
          console.log(`[Flow] Index Changed: ${internalStepIndex} -> ${currentStepIndex}`);
          stopAudio();
          setIsPreparing(true);
          setInternalStepIndex(currentStepIndex);
          setReadyAudio(null);
      }
  }, [currentStepIndex, step, isLiveSession, internalStepIndex, stopAudio]);

  useEffect(() => {
      if (!isPreparing || !step || isLiveSession) return;

      let isCancelled = false;
      const prepare = async () => {
          try {
            if (!is3DMode && step.imageUrl) {
                await new Promise<void>((resolve) => {
                    const img = new Image();
                    img.src = step.imageUrl!;
                    img.onload = () => resolve();
                    img.onerror = () => resolve();
                    setTimeout(resolve, 5000); 
                });
            }

            let audioData: string | null = null;
            if (!isMuted) {
                audioData = await generateGeminiTTS(currentText);
            }

            if (!isCancelled) {
                setReadyAudio(audioData);
                await new Promise(r => setTimeout(r, 500));
                
                if (!isCancelled) {
                    setIsPreparing(false);
                }
            }
          } catch (e) {
              console.error("Buffering Error", e);
              if (!isCancelled) setIsPreparing(false);
          }
      };
      prepare();
      return () => { isCancelled = true; };
  }, [isPreparing, step, is3DMode, currentText, isMuted, isLiveSession]);

  useEffect(() => {
      if (isPreparing || isLiveSession) return;
      if (internalStepIndex !== currentStepIndex) return; 
      if (playerState !== PlayerState.PLAYING) return;

      stopAudio();

      const handleEnded = () => {
          setTimeout(() => {
              if (playerState === PlayerState.PLAYING && !is3DMode && !isLiveSession && currentStepIndex === internalStepIndex) {
                  onNextStep();
              }
          }, 1000);
      };

      if (readyAudio && !isMuted) {
          playPCM(readyAudio, handleEnded);
      } else if (!isMuted && !readyAudio) {
          fallbackToWebSpeech(currentText, handleEnded);
      } else {
          const duration = Math.max(3000, (currentText.length / 15) * 1000);
          setTimeout(handleEnded, duration);
      }
      
      return () => { stopAudio(); };
  }, [isPreparing, playerState, readyAudio, isMuted, currentText, isLiveSession, internalStepIndex, currentStepIndex, is3DMode, stopAudio, onNextStep]);

  const fallbackToWebSpeech = (text: string, onEnded: () => void) => {
    if (!synthRef.current) { onEnded(); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synthRef.current.getVoices();
    let preferredVoice = null;
    if (audioLanguage === 'hi') {
        preferredVoice = voices.find(v => v.lang.includes('hi') || v.name.includes('Hindi'));
    } else {
        preferredVoice = voices.find(v => v.lang.includes('en-US') && v.name.includes('Google')) || voices.find(v => v.lang.includes('en'));
    }
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.onend = onEnded;
    utterance.onerror = onEnded;
    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  };

  const decodePCM = async (base64Data: string, ctx: AudioContext): Promise<AudioBuffer> => {
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
    const dataInt16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(dataInt16.length);
    for (let i = 0; i < dataInt16.length; i++) { float32[i] = dataInt16[i] / 32768.0; }
    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32, 0);
    return audioBuffer;
  };

  const playPCM = async (base64Data: string, onEnded: () => void) => {
    if (!audioContextRef.current) { onEnded(); return; }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') await ctx.resume();
    try {
        const buffer = await decodePCM(base64Data, ctx);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = onEnded;
        audioSourceRef.current = source;
        source.start(0);
    } catch (error) {
        fallbackToWebSpeech(currentText, onEnded);
    }
  };

  const toggleLiveSession = async () => {
      if (isLiveSession) {
          liveServiceRef.current?.stopSession();
          setIsLiveSession(false);
      } else {
          onPause();
          stopAudio();
          setIsLiveSession(true);
          if (!liveServiceRef.current) liveServiceRef.current = new LiveSessionService(process.env.API_KEY || '');
          const currentTopic = topic || step?.title || "this topic";
          await liveServiceRef.current.startSession(currentTopic, setIsLiveSpeaking, (err) => {
              setIsLiveSession(false);
          });
      }
  };

  useEffect(() => {
    setIs3DMode(false);
    setActive3DPoint(null);
  }, [currentStepIndex]);

  useEffect(() => {
    if (playerState === PlayerState.LOADING) {
        const interval = setInterval(() => setWorkflowPhase(p => (p + 1) % 3), 1500);
        return () => clearInterval(interval);
    } else setWorkflowPhase(0);
  }, [playerState]);

  useEffect(() => {
      if (!isPreparing && scanlineRef.current) {
          anime({ targets: scanlineRef.current, top: ['-10%', '110%'], opacity: [0, 1, 0], easing: 'easeInOutQuad', duration: 1500 });
      }
  }, [isPreparing, step]);

  const toggleFullScreen = async () => {
      if (!playerContainerRef.current) return;
      if (!document.fullscreenElement) await playerContainerRef.current.requestFullscreen();
      else if (document.exitFullscreen) document.exitFullscreen();
  };
  useEffect(() => {
      const handleFullScreenChange = () => setIsFullScreen(!!document.fullscreenElement);
      document.addEventListener('fullscreenchange', handleFullScreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
  }, []);

  const has3DModel = !!step?.sketchfab_model_id;

  if (!step && playerState === PlayerState.IDLE) {
    return (
      <div className="w-full h-full bg-black flex flex-col items-center justify-center border border-white/10 relative overflow-hidden group">
         <div className="absolute inset-0 bg-cyber-grid bg-[length:30px_30px] opacity-10" />
         <div className="z-10 text-center p-8 flex flex-col items-center animate-in fade-in zoom-in duration-700">
            <div className="mb-6 p-6 bg-white/5 backdrop-blur-xl rounded-full border border-white/10 shadow-[0_0_50px_-12px_rgba(255,255,255,0.2)] animate-float">
                <PlayCircle className="w-16 h-16 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
            </div>
            <h1 className="text-5xl font-black text-white mb-3 tracking-tighter drop-shadow-sm">ETERN</h1>
            <p className="text-gray-500 text-xs font-bold tracking-[0.4em] uppercase mb-8">AI Video Tutor</p>
         </div>
      </div>
    );
  }

  if (playerState === PlayerState.LOADING) {
     const phases = [{ text: "Creating Video Lesson...", icon: Scan }, { text: "Generating Visuals...", icon: BrainCircuit }, { text: "Synthesizing Audio...", icon: Layers }];
     const currentPhase = phases[workflowPhase];
     const Icon = currentPhase.icon;
     return (
        <div className="w-full h-full bg-black flex items-center justify-center border border-white/10 relative overflow-hidden">
            <div className="z-10 flex flex-col items-center space-y-8">
                <div className="relative">
                    <div className="absolute inset-0 rounded-full blur-2xl opacity-10 bg-white animate-pulse"></div>
                    <div className="relative bg-black/50 p-6 rounded-2xl border border-white/10 backdrop-blur-md shadow-2xl">
                        <Icon className="w-10 h-10 text-white" />
                    </div>
                </div>
                <div className="text-center space-y-3">
                  <p className="text-white text-xl font-bold tracking-wider uppercase">{currentPhase.text}</p>
                  <div className="flex justify-center gap-2">
                      {phases.map((_, i) => <div key={i} className={`h-1 rounded-full transition-all duration-700 ease-out ${i === workflowPhase ? 'w-10 bg-white' : 'w-2 bg-white/10'}`}></div>)}
                  </div>
                </div>
            </div>
        </div>
     );
  }

  return (
    <div ref={playerContainerRef} className={`w-full h-full flex flex-col relative bg-black overflow-hidden group ${isFullScreen ? 'fixed inset-0 z-50' : ''}`}>
        
        {isLiveSession && <LiveAvatar isSpeaking={isLiveSpeaking} onClick={toggleLiveSession} />}

        {!isLiveSession && step && (
          <div className="absolute top-6 left-6 right-20 z-30 flex items-start gap-3 pointer-events-none">
              <div className="bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-[10px] font-bold border border-white/10 flex items-center gap-2 shadow-sm shrink-0">
                  <span className={`text-white ${isPreparing ? '' : 'animate-pulse'}`}>●</span>
                  <span className="tracking-widest uppercase text-gray-300">{totalSteps > 0 ? `PART ${currentStepIndex + 1}/${totalSteps}` : 'INTRO'}</span>
              </div>
              <div className="bg-black/60 backdrop-blur-md text-white px-4 py-1.5 rounded-lg text-sm font-bold border border-white/10 shadow-sm animate-in fade-in slide-in-from-top-2">
                 {step.title}
              </div>
          </div>
        )}

        <div className="absolute top-6 right-6 z-30 flex items-center gap-2">
            <button onClick={toggleLiveSession} className={`flex items-center gap-2 px-4 py-2 rounded-lg backdrop-blur-md border shadow-lg transition-all ${isLiveSession ? 'bg-red-600/80 border-red-500 text-white animate-pulse' : 'bg-black/60 border-white/10 text-white hover:bg-white/10'}`}>
                <Mic size={14} /><span className="text-[10px] font-bold uppercase tracking-wider">{isLiveSession ? 'LIVE ON' : 'LIVE'}</span>
            </button>
            {!isLiveSession && (
                <>
                <button onClick={() => setShowSettings(!showSettings)} className={`bg-black/60 hover:bg-white/10 text-white p-2 rounded-lg transition-all backdrop-blur-md border border-white/10 shadow-sm`}>
                    <Settings size={16} />
                </button>
                <button onClick={toggleMute} className="bg-black/60 hover:bg-white/10 text-gray-300 hover:text-white p-2 rounded-lg transition-all backdrop-blur-md border border-white/10 shadow-sm flex items-center justify-center relative">
                    {isPreparing ? <Loader2 size={16} className="animate-spin text-white" /> : isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                </>
            )}
        </div>

        {showSettings && !isLiveSession && (
             <div className="absolute top-20 right-6 z-40 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl p-4 w-56 shadow-2xl animate-in fade-in slide-in-from-top-2">
                 <div className="flex flex-col gap-4">
                     <div className="flex items-center justify-between">
                         <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5"><Captions size={12} className="text-white" /> Subtitles</span>
                         <button onClick={() => setShowSubtitles(!showSubtitles)} className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${showSubtitles ? 'bg-white/10 border-white/50 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}>{showSubtitles ? 'ON' : 'OFF'}</button>
                     </div>
                     <div className="h-px bg-white/10"></div>
                     <div className="flex items-center justify-between">
                         <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5"><Globe size={12} className="text-white" /> Audio Lang</span>
                         <button onClick={() => setAudioLanguage(audioLanguage === 'en' ? 'hi' : 'en')} className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${audioLanguage === 'en' ? 'bg-white/10 border-white/50 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}>{audioLanguage === 'en' ? 'ENGLISH' : 'HINDI'}</button>
                     </div>
                 </div>
             </div>
        )}

        {step && (
            <div className={`w-full h-full relative bg-black overflow-hidden transition-all duration-500 ${isLiveSession ? 'blur-sm scale-95 opacity-50' : 'opacity-100'}`}>
                
                {(isPreparing || !step.imageUrl) && !is3DMode && playerState === PlayerState.PLAYING && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black animate-in fade-in duration-200">
                        <Loader2 className="w-8 h-8 text-white animate-spin mb-2" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Loading Next Scene</span>
                    </div>
                )}

                {is3DMode && has3DModel ? (
                    <div className="w-full h-full relative bg-black">
                         <iframe key={step.sketchfab_model_id} ref={iframeRef} title="3D Model" frameBorder="0" allowFullScreen allow="autoplay; fullscreen; xr-spatial-tracking" className="w-full h-full"></iframe>
                    </div>
                ) : (
                    <div className="w-full h-full relative overflow-hidden flex items-center justify-center bg-black">
                        {!isPreparing && step.imageUrl && (
                            <div 
                                className="absolute inset-0 bg-cover bg-center opacity-30 blur-2xl scale-110 transition-all duration-1000"
                                style={{ backgroundImage: `url(${step.imageUrl})` }}
                            />
                        )}

                        <div 
                        className="relative w-full h-full flex items-center justify-center"
                        style={{
                            transition: 'transform 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                            transformOrigin: 'center center',
                            transform: isZoomed && !isPreparing ? 'scale(1.15)' : 'scale(1)'
                        }}
                        >
                            <img 
                                ref={imgRef}
                                src={step.imageUrl} 
                                alt={step.diagram_role}
                                className={`w-full h-full object-contain relative z-10 transition-opacity duration-700 ease-in-out drop-shadow-2xl ${!isPreparing ? 'opacity-100' : 'opacity-0'}`}
                            />
                            
                            <div ref={scanlineRef} className="absolute w-full h-1 bg-white/20 shadow-[0_0_20px_#ffffff] z-20 pointer-events-none opacity-0"></div>
                            <DiagramOverlay label={step.overlay_description} topPercent={focusPoint.top} leftPercent={focusPoint.left} isActive={!isPreparing} isZoomed={isZoomed} />
                        </div>
                    </div>
                )}
                
                {showSubtitles && !isLiveSession && (
                    <div className="absolute bottom-20 left-0 right-0 z-30 text-center px-4 pointer-events-none flex justify-center">
                        <div className="bg-black/85 backdrop-blur-xl text-white px-6 py-4 rounded-xl text-base md:text-lg font-normal shadow-2xl border border-white/10 max-w-[95%] md:max-w-[70%] max-h-[35vh] overflow-y-auto scrollbar-hide pointer-events-auto leading-relaxed animate-in fade-in slide-in-from-bottom-2 selection:bg-white/30 text-shadow-sm">
                            {currentText}
                        </div>
                    </div>
                )}
            </div>
        )}

        {playerState === PlayerState.COMPLETED && !isLiveSession && (
            <div className="absolute inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-40">
                <div className="text-center p-8 animate-in fade-in zoom-in duration-500 border border-white/10 bg-black rounded-2xl shadow-2xl">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-white/20"><Scan className="w-6 h-6 text-black" /></div>
                    <h2 className="text-2xl font-black text-white mb-2 tracking-tight">LESSON COMPLETE</h2>
                    <p className="text-gray-500 mb-6 font-medium text-sm">Review the chat for details or start over.</p>
                    <button onClick={onRestart} className="group flex items-center gap-2 bg-white text-black px-6 py-3 rounded-xl font-bold hover:bg-gray-200 transition-all shadow-lg hover:shadow-white/20 hover:scale-105"><RotateCcw size={16} className="group-hover:-rotate-180 transition-transform duration-500 text-black" /> Replay</button>
                </div>
            </div>
        )}

        {!isLiveSession && (
          <div className="flex items-center justify-between px-6 py-4 bg-black border-t border-white/10 z-20">
             <div className="flex items-center gap-4 w-full">
                <button onClick={playerState === PlayerState.PLAYING ? onPause : onPlay} disabled={!step} className="text-white hover:text-gray-300 transition-colors">{playerState === PlayerState.PLAYING ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button>
                
                 <div className="flex-1 flex gap-1 h-1 bg-white/10 rounded-full overflow-hidden">
                    {Array.from({ length: totalSteps || 0 }).map((_, idx) => (
                        <div key={idx} className={`flex-1 transition-all duration-500 ease-out ${idx < currentStepIndex ? 'bg-white' : idx === currentStepIndex ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'bg-transparent'}`} />
                    ))}
                 </div>
                 
                 <div className="flex items-center gap-3 pl-4 border-l border-white/10">
                    <button onClick={onRestart} className="text-gray-500 hover:text-white transition-colors"><RotateCcw size={16} /></button>
                    <button onClick={toggleFullScreen} className="text-gray-500 hover:text-white transition-colors"><Maximize size={16} /></button>
                 </div>
             </div>
          </div>
        )}
    </div>
  );
};

export default VisualPlayer;