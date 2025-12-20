import React, { useState } from 'react';
import splashImage from '../assets/splash.png';

interface SplashScreenProps {
  onEnter: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onEnter }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      data-tauri-drag-region
      style={{
        position: 'relative',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#0B0E14',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
      {/* Background Image */}
      <img
        src={splashImage}
        alt="BioViz Local"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.9
        }}
      />

      {/* Overlay Content */}
      <div style={{
        position: 'absolute',
        bottom: '10%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: 2
      }}>
        <div style={{
          marginBottom: '12px',
          color: '#cbd5e1',
          fontSize: '14px',
          letterSpacing: '0.5px'
        }}>
          WeChat: bioviz
        </div>
        <button
          onClick={onEnter}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          data-tauri-drag-region="no-drag"
          style={{
            background: isHovered
              ? 'rgba(16, 185, 129, 0.3)'
              : 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(16, 185, 129, 0.6)',
            color: '#10b981',
            padding: '16px 48px',
            fontSize: '18px',
            letterSpacing: '2px',
            borderRadius: '30px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            backdropFilter: 'blur(12px)',
            textTransform: 'uppercase',
            fontWeight: 700,
            boxShadow: isHovered
              ? '0 0 30px rgba(16, 185, 129, 0.5)'
              : '0 0 10px rgba(0,0,0,0.5)',
            outline: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <span>Initialize Workspace</span>
          <span style={{ fontSize: '20px' }}>➜</span>
        </button>
      </div>
    </div>
  );
};

export default SplashScreen;
