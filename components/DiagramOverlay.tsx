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
  const lineRef = useRef<SVGLineElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!isActive) return;

    if (labelRef.current) labelRef.current.innerText = label;

    const timeline = anime.timeline({
      easing: 'easeOutExpo',
    });

    // Animation Sequence
    timeline
    .add({
      targets: nodeRef.current,
      scale: [0, 1],
      opacity: [0, 1],
      duration: 500,
      easing: 'spring(1, 80, 10, 0)'
    })
    .add({
      targets: lineRef.current,
      strokeDashoffset: [anime.setDashoffset, 0],
      duration: 600,
      easing: 'easeInOutQuad',
      offset: '-=300'
    })
    .add({
      targets: labelRef.current,
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 500,
      offset: '-=400'
    });

    // Continuous pulse for the node point
    const pulse = anime({
      targets: nodeRef.current,
      boxShadow: [
        '0 0 0 0 rgba(255, 255, 255, 0.8)',
        '0 0 0 20px rgba(255, 255, 255, 0)'
      ],
      loop: true,
      easing: 'easeOutSine',
      duration: 1500
    });

    return () => {
      timeline.pause();
      pulse.pause();
    };
  }, [isActive, label]);

  // Adjust scale to keep label readable when zoomed, but unobtrusive
  const scale = isZoomed ? 0.6 : 1;

  if (!isActive) return null;

  return (
    <div 
      className="absolute pointer-events-none z-40 flex flex-col items-center"
      style={{ 
        top: `${topPercent}%`, 
        left: `${leftPercent}%`,
        // Pivot from bottom center (the node location) so it points exactly to the coord
        transform: `translate(-50%, -100%) scale(${scale})`, 
        transformOrigin: 'bottom center'
      }}
    >
      {/* Glassmorphism Label */}
      <div 
        ref={labelRef}
        className="mb-2 px-5 py-2.5 bg-black/60 backdrop-blur-xl border border-white/20 rounded-full shadow-2xl opacity-0 flex items-center gap-2"
      >
        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></div>
        <span className="text-white font-bold text-lg whitespace-nowrap font-sans tracking-wide leading-none">
          {label}
        </span>
      </div>

      {/* Connecting Line */}
      <svg width="2" height="60" className="overflow-visible block">
        <line 
          ref={lineRef}
          x1="1" y1="0" 
          x2="1" y2="60" 
          stroke="white" 
          strokeWidth="2" 
          strokeLinecap="round"
          strokeDasharray="60"
        />
        {/* Decorative small dot at line start */}
         <circle cx="1" cy="0" r="2" fill="white" />
      </svg>

      {/* Node Point (Target on the object) */}
      <div className="relative -mt-1">
         <div 
           ref={nodeRef}
           className="w-5 h-5 bg-white rounded-full border-[3px] border-black/30 shadow-[0_0_10px_rgba(255,255,255,0.5)] opacity-0"
         ></div>
      </div>
    </div>
  );
};

export default DiagramOverlay;