
import React from 'react';
import { SavedSession } from '../types';
import { X, MessageSquare, Clock, Trash2, ChevronRight, PlusCircle } from 'lucide-react';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SavedSession[];
  onSelectSession: (session: SavedSession) => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  onNewChat: () => void;
}

const SideMenu: React.FC<SideMenuProps> = ({ 
  isOpen, 
  onClose, 
  sessions, 
  onSelectSession, 
  onDeleteSession,
  onNewChat
}) => {
  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Sliding Panel */}
      <div 
        className={`fixed top-0 left-0 h-full w-80 bg-black border-r border-white/10 shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
          <h2 className="text-xl font-black text-white tracking-tight">LIBRARY</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
            <button 
                onClick={() => { onNewChat(); onClose(); }}
                className="w-full flex items-center justify-center gap-3 bg-white text-black font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors shadow-lg shadow-white/5"
            >
                <PlusCircle size={18} />
                NEW SESSION
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sessions.length === 0 ? (
            <div className="text-center text-gray-500 mt-10">
                <p className="text-xs uppercase tracking-widest">No saved sessions</p>
            </div>
          ) : (
            sessions.map((session) => (
              <div 
                key={session.id}
                onClick={() => { onSelectSession(session); onClose(); }}
                className="group relative bg-white/5 border border-white/10 hover:border-white/40 rounded-xl p-4 cursor-pointer transition-all hover:bg-white/10"
              >
                <div className="flex justify-between items-start mb-2">
                    <h3 className="text-sm font-bold text-white line-clamp-1">{session.topic}</h3>
                    <button 
                        onClick={(e) => onDeleteSession(session.id, e)}
                        className="text-gray-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-wider">
                    <Clock size={10} />
                    {new Date(session.lastActive).toLocaleDateString()}
                </div>
                <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight size={16} className="text-white" />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-white/10 text-center">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest">ETERN AI TUTOR v2.0</p>
        </div>
      </div>
    </>
  );
};

export default SideMenu;
