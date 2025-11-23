
import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../types';
import { Send, Bot, User, MessageSquare, Mic, MicOff } from 'lucide-react';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

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

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      window.location.reload(); 
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support voice input.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'hi-IN'; 
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        setIsListening(false);
        return;
      }
      if (event.error === 'aborted') {
        setIsListening(false);
        return;
      }
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    try {
        recognition.start();
    } catch (err) {
        console.error("Failed to start recognition:", err);
        setIsListening(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white relative overflow-hidden">
        {/* Header - White Glassmorphism */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200 bg-white/80 backdrop-blur-md z-10 sticky top-0">
            <div className="p-2 bg-black text-white rounded-lg shadow-md">
                <MessageSquare size={16} />
            </div>
            <span className="text-xs font-black text-black uppercase tracking-[0.2em]">Live Discussion</span>
        </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
        {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 select-none animate-in fade-in duration-1000">
                <div className="w-16 h-16 bg-gray-50 rounded-full mb-4 flex items-center justify-center border border-gray-200 shadow-xl">
                    <Bot className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-sm font-medium tracking-wide text-gray-500">AI TUTOR READY</p>
                <p className="text-[10px] uppercase tracking-widest text-gray-400 mt-2">Voice or text input available</p>
            </div>
        )}
        
        {messages.map((msg) => {
           const isTutor = msg.role === 'tutor';
           
           return (
               <div key={msg.id} className={`flex items-start gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 ${isTutor ? '' : 'flex-row-reverse'}`}>
                   {/* Avatar */}
                   <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center shadow-md ${isTutor ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                       {isTutor ? <Bot size={18} strokeWidth={2.5} /> : <User size={18} />}
                   </div>

                   {/* Message Bubble */}
                   <div className={`flex flex-col max-w-[85%] ${isTutor ? 'items-start' : 'items-end'}`}>
                       <div className="flex items-baseline gap-2 mb-1.5 opacity-60">
                           <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                               {isTutor ? 'ETERN AI' : 'You'}
                           </span>
                           <span className="text-[9px] font-mono text-gray-400">{msg.timestamp}</span>
                       </div>
                       
                       <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm border ${
                           isTutor 
                           ? 'bg-black text-white rounded-tl-none border-black' 
                           : 'bg-gray-100 text-gray-900 rounded-tr-none border-gray-200 font-medium'
                       }`}>
                           {msg.text}
                       </div>
                   </div>
               </div>
           );
        })}

        {isLoading && (
             <div className="flex items-center gap-4 opacity-60 pl-2">
                 <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse"></div>
                 <div className="flex gap-1.5">
                     <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                     <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                     <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce"></span>
                 </div>
             </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-200 bg-white/90 backdrop-blur-md">
        <form onSubmit={handleSubmit} className="relative flex items-center gap-3">
            <div className="relative flex-1 group">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask a question..."
                    disabled={isLoading}
                    className="w-full bg-gray-50 text-black pl-6 pr-12 py-4 rounded-2xl focus:outline-none focus:ring-1 focus:ring-black/20 focus:bg-white border border-gray-200 placeholder-gray-400 text-sm transition-all shadow-inner"
                />
                <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-xl disabled:opacity-30 transition-all"
                >
                    <Send size={18} fill="currentColor" />
                </button>
            </div>
            
            {/* Mic Button - Floating */}
            <button
                type="button"
                onClick={toggleListening}
                disabled={isLoading}
                className={`p-4 rounded-2xl transition-all shadow-md border ${
                    isListening 
                    ? 'bg-red-500 text-white border-red-500 animate-pulse' 
                    : 'bg-white text-gray-400 hover:text-black hover:bg-gray-50 border-gray-200'
                }`}
                title="Voice Input (Hindi/English)"
            >
                {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
        </form>
        <div className="flex justify-center mt-3 gap-4 opacity-40 text-[9px] uppercase tracking-widest text-gray-500">
            <span>Ask</span> &bull; <span>Scrape</span> &bull; <span>Analyze</span> &bull; <span>Teach</span>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
