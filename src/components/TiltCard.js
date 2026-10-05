import React, { useRef, useCallback } from 'react';
import './TiltCard.css';

/**
 * Wraps any content in a card that tilts in 3D following the mouse/touch
 * position, with a colorful glow that follows the pointer too.
 *
 * Usage: <TiltCard><YourContent /></TiltCard>
 */
const TiltCard = ({ children, className = '', maxTilt = 14, glow = true, style = {} }) => {
    const cardRef = useRef(null);
    const frameRef = useRef(null);

    const updateTilt = useCallback((clientX, clientY) => {
        const el = cardRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const px = (clientX - rect.left) / rect.width;   // 0 -> 1
        const py = (clientY - rect.top) / rect.height;    // 0 -> 1

        const rotateY = (px - 0.5) * 2 * maxTilt;
        const rotateX = -(py - 0.5) * 2 * maxTilt;

        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => {
            el.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03,1.03,1.03)`;
            el.style.setProperty('--glow-x', `${px * 100}%`);
            el.style.setProperty('--glow-y', `${py * 100}%`);
            const hue = 260 + px * 140 - py * 40; // sweeps purple -> teal -> pink
            el.style.setProperty('--glow-hue', hue.toFixed(0));
            el.style.setProperty('--glow-opacity', glow ? 1 : 0);
        });
    }, [maxTilt, glow]);

    const reset = useCallback(() => {
        const el = cardRef.current;
        if (!el) return;
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
        el.style.setProperty('--glow-opacity', 0);
    }, []);

    const handleMouseMove = (e) => updateTilt(e.clientX, e.clientY);
    const handleTouchMove = (e) => {
        if (e.touches && e.touches[0]) {
            updateTilt(e.touches[0].clientX, e.touches[0].clientY);
        }
    };

    return (
        <div
            ref={cardRef}
            className={`tilt-card ${className}`}
            style={style}
            onMouseMove={handleMouseMove}
            onMouseLeave={reset}
            onTouchMove={handleTouchMove}
            onTouchStart={handleTouchMove}
            onTouchEnd={reset}
        >
            <div className="tilt-card-glow" />
            <div className="tilt-card-content">{children}</div>
        </div>
    );
};

export default TiltCard;
