import React, { useState, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';

interface OrderTimerProps {
  createdAt: string;
  className?: string;
  showIcon?: boolean;
}

function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Shared tick mechanism: a single interval drives all OrderTimer instances
// so they stay perfectly in sync with each other.
const listeners = new Set<() => void>();
let sharedInterval: ReturnType<typeof setInterval> | null = null;

function subscribeTick(fn: () => void): () => void {
  if (listeners.size === 0) {
    sharedInterval = setInterval(() => {
      listeners.forEach((l) => l());
    }, 1000);
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && sharedInterval) {
      clearInterval(sharedInterval);
      sharedInterval = null;
    }
  };
}

const OrderTimer: React.FC<OrderTimerProps> = ({ createdAt, className = '', showIcon = true }) => {
  const createdAtMs = useRef(new Date(createdAt).getTime());
  const [elapsed, setElapsed] = useState(() => Date.now() - createdAtMs.current);

  useEffect(() => {
    createdAtMs.current = new Date(createdAt).getTime();
    setElapsed(Date.now() - createdAtMs.current);
  }, [createdAt]);

  useEffect(() => {
    const update = () => setElapsed(Date.now() - createdAtMs.current);
    return subscribeTick(update);
  }, []);

  return (
    <span className={`order-timer ${className}`}>
      {showIcon && <Clock size={12} className="order-timer-icon" />}
      <span className="order-timer-text">{formatElapsed(elapsed)}</span>
    </span>
  );
};

export default OrderTimer;
