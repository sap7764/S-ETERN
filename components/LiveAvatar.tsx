
import React, { useEffect, useRef } from 'react';

// Access global anime
declare const anime: any;

interface LiveAvatarProps {
  isSpeaking: boolean;
  onClick: () => void;
}

const LiveAvatar: React.FC<LiveAvatarProps> = ({ isSpeaking, onClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const ring1Ref = useRef<HTMLDivElement>(null);
  const ring2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Continuous float animation
    anime({
      targets: containerRef.current,
      translateY: [-10, 10],
      rotate: [0, 5],
      duration: 3000,
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutSine'
    });

    // Ring rotations
    anime({
      targets: ring1Ref.current,
      rotateX: [0, 360],
      rotateY: [0, 360],
      duration: 8000,
      loop: true,
      easing: 'linear'
    });

    anime({
      targets: ring2Ref.current,
      rotateX: [0, -360],
      rotateZ: [0, 360],
      duration: 10000,
      loop: true,
      easing: 'linear'
    });
  }, []);

  // React to speaking state
  useEffect(() => {
    if (isSpeaking) {
      anime({
        targets: coreRef.current,
        scale: [1, 1.5],
        boxShadow: ['0 0 20px #ffffff', '0 0 60px #ffffff'],
        duration: 400,
        direction: 'alternate',
        loop: true,
        easing: 'easeInOutQuad'
      });
    } else {
      anime.remove(coreRef.current);
      anime({
        targets: coreRef.current,
        scale: 1,
        boxShadow: '0 0 20px #ffffff',
        duration: 500,
        easing: 'easeOutQuad'
      });
    }
  }, [isSpeaking]);

  return (
    <div 
      onClick={onClick}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-500 cursor-pointer group"
      title="Tap to End Live Session"
    >
      <div ref={containerRef} className="relative w-48 h-48 flex items-center justify-center perspective-[1000px] transition-transform group-hover:scale-105">
        
        {/* Outer Ring 1 */}
        <div 
          ref={ring1Ref}
          className="absolute w-full h-full rounded-full border border-white/30 shadow-[0_0_15px_rgba(255,255,255,0.2)]"
          style={{ transformStyle: 'preserve-3d' }}
        ></div>

        {/* Outer Ring 2 */}
        <div 
          ref={ring2Ref}
          className="absolute w-3/4 h-3/4 rounded-full border border-white/50 border-dashed"
          style={{ transformStyle: 'preserve-3d' }}
        ></div>

        {/* Neural Core */}
        <div 
          ref={coreRef}
          className="relative w-16 h-16 bg-white rounded-full shadow-[0_0_30px_#ffffff] flex items-center justify-center group-hover:bg-red-500 group-hover:shadow-[0_0_40px_#ef4444] transition-colors duration-500"
        >
           {/* Inner Pulse */}
           <div className="w-full h-full bg-white rounded-full animate-ping opacity-20"></div>
           <div className="absolute opacity-0 group-hover:opacity-100 font-bold text-[10px] text-white tracking-widest uppercase transition-opacity">END</div>
        </div>

        {/* Label */}
        <div className="absolute -bottom-16 text-center w-64 pointer-events-none">
             <p className="text-white font-black tracking-[0.3em] text-sm animate-pulse">LIVE CONVERSATION</p>
             <p className="text-gray-400 text-[10px] mt-2 uppercase tracking-widest group-hover:text-red-400 transition-colors">Tap icon to disconnect</p>
        </div>
      </div>
    </div>
  );
};

export default LiveAvatar;
