import { useCallback, useEffect, useState } from 'react';
import {
  isIosDevice,
  isStandaloneDisplay,
  type InstallPromptEvent,
} from './install';

/**
 * Captures the browser install prompt so the welcome screen can offer it.
 *
 * @returns Install availability, an iOS hint flag, and a user-gesture installer.
 */
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(() => isStandaloneDisplay());

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
      setPromptEvent(null);
    }
  }, [promptEvent]);

  return {
    canInstall: Boolean(promptEvent) && !installed,
    installed,
    install,
    showIosHint: isIosDevice() && !installed,
  };
}
