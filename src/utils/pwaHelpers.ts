export interface PlatformCapabilities {
  isAndroid: boolean;
  isIOS: boolean;
  isMobile: boolean;
  isStandalone: boolean;
  installMode: 'installed' | 'native_prompt' | 'android_guide' | 'ios_guide' | 'browser_guide';
}

export function detectPlatformCapabilities(
  userAgent: string,
  isStandalone: boolean,
  hasDeferredPrompt: boolean
): PlatformCapabilities {
  const ua = (userAgent || '').toLowerCase();
  const isAndroid = /android/.test(ua);
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isMobile = isAndroid || isIOS || /mobile/.test(ua);

  let installMode: PlatformCapabilities['installMode'] = 'browser_guide';
  if (isStandalone) {
    installMode = 'installed';
  } else if (hasDeferredPrompt) {
    installMode = 'native_prompt';
  } else if (isIOS) {
    installMode = 'ios_guide';
  } else if (isAndroid) {
    installMode = 'android_guide';
  }

  return {
    isAndroid,
    isIOS,
    isMobile,
    isStandalone,
    installMode,
  };
}

export function isShortNameCompliant(shortName: string): boolean {
  return shortName.trim().length > 0 && shortName.trim().length <= 12;
}
