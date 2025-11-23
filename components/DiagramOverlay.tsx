
import React, { useEffect, useRef } from 'react';

// Access global anime.js
declare const anime: any;

interface DiagramOverlayProps {
  label: string;
  topPercent: number;
  leftPercent: number;
  isActive: boolean;
  isZoomed: boolean;
}

const DiagramOverlay: React.FC<DiagramOverlayProps> = ({ label, topPercent, leftPercent, isActive, isZoomed }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const bracketTL = useRef<HTMLDivElement>(null);
  const bracketTR = useRef<HTMLDivElement>(null);
  const bracketBL = useRef<HTMLDivElement>(null);
  const bracketBR = useRef<HTMLDivElement>(null);
  const circleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive) return;

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    const originalText = label;
    const labelElement = labelRef.current;

    // Reset initial states
    if (labelElement) labelElement.innerText = "";
    
    const timeline = anime.timeline({
      easing: 'easeOutExpo',
    });

    // 1. Target Lock Sequence (Brackets closing in)
    timeline
    .add({
      targets: [bracketTL.current, bracketTR.current, bracketBL.current, bracketBR.current],
      opacity: [0, 1],
      scale: [2, 1],
      duration: 600,
      easing: 'easeOutBack'
    })
    .add({
      targets: circleRef.current,
      opacity: [0, 1],
      scale: [0, 1],
      duration: 400,
      offset: '-=400'
    })
    // 2. Line extension
    .add({
      targets: lineRef.current,
      strokeDashoffset: [anime.setDashoffset, 0],
      duration: 600,
      easing: 'easeInOutQuad',
      offset: '-=200'
    })
    // 3. Text Decoding Effect
    .add({
      targets: labelElement,
      opacity: [0, 1],
      duration: 800,
      offset: '-=400',
      update: function(anim: any) {
        if (!labelElement) return;
        // Calculate progress to reveal real characters
        const progress = Math.round(anim.progress / 100 * originalText.length);
        
        let output = "";
        for (let i = 0; i < originalText.length; i++) {
            if (i < progress) {
                output += originalText[i];
            } else {
                // Scramble remaining characters
                output += chars[Math.floor(Math.random() * chars.length)];
            }
        }
        labelElement.innerText = output;
        
        // Ensure final state is clean
        if (anim.progress === 100) {
            labelElement.innerText = originalText;
        }
      }
    });

    // 4. Ongoing "Pulse" loop for the target
    const pulseAnim = anime({
      targets: [bracketTL.current, bracketTR.current, bracketBL.current, bracketBR.current],
      boxShadow: [
        '0 0 0px rgba(255, 255, 255, 0)',
        '0 0 10px rgba(255, 255, 255, 0.8)',
        '0 0 0px rgba(255, 255, 255, 0)'
      ],
      loop: true,
      easing: 'easeInOutSine',
      duration: 2000
    });
    
    const circlePulse = anime({
       targets: circleRef.current,
       opacity: [0.5, 1],
       scale: [0.8, 1],
       direction: 'alternate',
       loop: true,
       easing: 'easeInOutSine',
       duration: 800
    });

    return () => {
      anime.remove([
          bracketTL.current, bracketTR.current, bracketBL.current, bracketBR.current,
          circleRef.current, lineRef.current, labelElement
      ]);
      pulseAnim.pause();
      circlePulse.pause();
    };
  }, [isActive, label, topPercent, leftPercent]);

  // Inverse scale logic to keep UI elements readable when parent zooms
  const inverseScale = isZoomed ? 0.4 : 1;

  if (!isActive) return null;

  return (
    <div 
      ref={containerRef}
      className="absolute pointer-events-none z-30"
      style={{ 
        top: `${topPercent}%`, 
        left: `${leftPercent}%`,
        transform: `translate(-50%, -50%) scale(${inverseScale})`
      }}
    >
      <div className="relative flex flex-col items-center" style={{ transformOrigin: 'bottom center' }}>
        
        {/* Floating Label with HUD style */}
        <div className="mb-2 bg-black/80 backdrop-blur-md px-4 py-2 border border-white rounded-sm shadow-[0_0_15px_rgba(255,255,255,0.4)]">
             <p 
                ref={labelRef} 
                className="font-mono font-bold text-xl uppercase tracking-widest text-white whitespace-nowrap drop-shadow-md"
             >
                {/* Text injected by Anime.js */}
             </p>
        </div>

        {/* Connecting Line (SVG) */}
        <svg className="w-8 h-20 overflow-visible mb-1">
           <defs>
               <filter id="glow">
                   <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                   <feMerge>
                       <feMergeNode in="coloredBlur"/>
                       <feMergeNode in="SourceGraphic"/>
                   </feMerge>
               </filter>
           </defs>
           <line 
             ref={lineRef}
             x1="16" y1="80" 
             x2="16" y2="0" 
             stroke="#ffffff" 
             strokeWidth="2" 
             strokeLinecap="square"
             strokeDasharray="80"
             filter="url(#glow)"
           />
           <circle cx="16" cy="0" r="3" fill="#ffffff" className="animate-pulse" />
        </svg>

        {/* Target Lock Reticle */}
        <div className="relative w-12 h-12 flex items-center justify-center">
            {/* Inner Circle */}
            <div ref={circleRef} className="w-2 h-2 bg-white rounded-full shadow-[0_0_10px_#ffffff]"></div>
            
            {/* Corner Brackets */}
            <div ref={bracketTL} className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-white rounded-tl-sm drop-shadow-[0_0_5px_#ffffff]"></div>
            <div ref={bracketTR} className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-white rounded-tr-sm drop-shadow-[0_0_5px_#ffffff]"></div>
            <div ref={bracketBL} className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-white rounded-bl-sm drop-shadow-[0_0_5px_#ffffff]"></div>
            <div ref={bracketBR} className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-white rounded-br-sm drop-shadow-[0_0_5px_#ffffff]"></div>
        </div>

      </div>
    </div>
  );
};

export default DiagramOverlay;
