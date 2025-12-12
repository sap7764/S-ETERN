import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../types';
import { Send, Bot, User, MessageSquare, Mic, MicOff, Sparkles } from 'lucide-react';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
        try {
            recognitionRef.current.stop();
        } catch (e) {
            // Ignore if already stopped
        }
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support voice input.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US'; 
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        setIsListening(false);
        return;
      }
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
        recognition.start();
    } catch (err) {
        console.error("Failed to start recognition:", err);
        setIsListening(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black/90 relative overflow-hidden font-sans border-l border-white/10">
        {/* Background Ambient Effect */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-[100px] pointer-events-none"></div>

        {/* Header - Dark Glass */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40 backdrop-blur-md z-10 sticky top-0">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-white/5 border border-white/10 rounded-lg shadow-inner">
                    <MessageSquare size={16} className="text-white" />
                </div>
                <div>
                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-0.5">INTERACTIVE</span>
                    <span className="block text-xs font-bold text-white tracking-wide">SESSION CHAT</span>
                </div>
            </div>
            {isLoading && (
                 <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full">
                     <Sparkles size={12} className="text-blue-400 animate-pulse" />
                     <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider animate-pulse">Thinking</span>
                 </div>
            )}
        </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide relative z-0">
        {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 select-none animate-in fade-in duration-1000">
                <div className="w-20 h-20 bg-white/5 rounded-full mb-6 flex items-center justify-center border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)] relative">
                    <div className="absolute inset-0 rounded-full border border-white/5 animate-ping opacity-20"></div>
                    <Bot className="w-10 h-10 text-white/50" />
                </div>
                <p className="text-sm font-medium tracking-widest text-gray-400 uppercase">System Ready</p>
                <p className="text-[10px] text-gray-600 mt-2 max-w-[200px] text-center">Ask any question or use the microphone to start learning.</p>
            </div>
        )}
        
        {messages.map((msg) => {
           const isTutor = msg.role === 'tutor';
           
           return (
               <div key={msg.id} className={`flex items-start gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 ${isTutor ? '' : 'flex-row-reverse'}`}>
                   {/* Avatar */}
                   <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center shadow-lg border ${isTutor ? 'bg-white text-black border-white' : 'bg-black text-white border-white/20'}`}>
                       {isTutor ? <Bot size={16} strokeWidth={2.5} /> : <User size={16} />}
                   </div>

                   {/* Message Bubble */}
                   <div className={`flex flex-col max-w-[85%] ${isTutor ? 'items-start' : 'items-end'}`}>
                       <div className="flex items-baseline gap-2 mb-1.5 opacity-60">
                           <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                               {isTutor ? 'ETERN AI' : 'You'}
                           </span>
                           <span className="text-[9px] font-mono text-gray-600">{msg.timestamp}</span>
                       </div>
                       
                       <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-lg backdrop-blur-sm border ${
                           isTutor 
                           ? 'bg-white/5 text-gray-100 rounded-tl-none border-white/10' 
                           : 'bg-white text-black rounded-tr-none border-white font-medium shadow-white/5'
                       }`}>
                           {msg.text}
                       </div>
                   </div>
               </div>
           );
        })}
        <div ref={endRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/10 bg-black/60 backdrop-blur-xl z-10">
        <form onSubmit={handleSubmit} className="relative flex items-center gap-3">
            <div className="relative flex-1 group">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask a follow-up question..."
                    disabled={isLoading}
                    className="w-full bg-white/5 text-white pl-5 pr-12 py-4 rounded-xl focus:outline-none focus:ring-1 focus:ring-white/30 focus:bg-white/10 border border-white/10 placeholder-gray-600 text-sm transition-all shadow-inner"
                />
                <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg disabled:opacity-30 transition-all"
                >
                    <Send size={18} fill="currentColor" />
                </button>
            </div>
            
            {/* Mic Button */}
            <button
                type="button"
                onClick={toggleListening}
                disabled={isLoading}
                className={`p-4 rounded-xl transition-all shadow-lg border ${
                    isListening 
                    ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse' 
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border-white/10'
                }`}
                title="Voice Input"
            >
                {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
        </form>
        <div className="flex justify-center mt-4 gap-6 opacity-30 text-[9px] uppercase tracking-[0.2em] text-gray-500">
            <span>Learn</span> <span>&bull;</span> <span>Visualize</span> <span>&bull;</span> <span>Master</span>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;