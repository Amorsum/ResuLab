import { useContext } from 'react';
import { AIContext } from '../context/AIContext';

export function useAIContext() {
  const ctx = useContext(AIContext);
  if (!ctx) {
    throw new Error('useAIContext must be used within an AIProvider');
  }
  return ctx;
}
