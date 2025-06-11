import { useCallback } from 'react';

export default function useI18n() {
  return useCallback((key: string, substitutions?: string | string[]) => {
    if (typeof chrome !== 'undefined' && chrome.i18n) {
      return chrome.i18n.getMessage(key, substitutions) || key;
    }
    return key;
  }, []);
} 