import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatformCapabilities, isShortNameCompliant } from './pwaHelpers.ts';

describe('PWA Platform Capabilities & Manifest Rules', () => {
  it('returns installed mode when running in standalone mode', () => {
    const res = detectPlatformCapabilities('Mozilla/5.0 (Linux; Android 14; Pixel 8)', true, false);
    assert.equal(res.isAndroid, true);
    assert.equal(res.isStandalone, true);
    assert.equal(res.installMode, 'installed');
  });

  it('prefers native_prompt when beforeinstallprompt is captured on Android', () => {
    const res = detectPlatformCapabilities('Mozilla/5.0 (Linux; Android 14; Pixel 8)', false, true);
    assert.equal(res.isAndroid, true);
    assert.equal(res.isIOS, false);
    assert.equal(res.installMode, 'native_prompt');
  });

  it('falls back to android_guide on Android when prompt has not fired yet', () => {
    const res = detectPlatformCapabilities('Mozilla/5.0 (Linux; Android 14; SM-S918B)', false, false);
    assert.equal(res.isAndroid, true);
    assert.equal(res.isMobile, true);
    assert.equal(res.installMode, 'android_guide');
  });

  it('falls back to ios_guide on iPhone/iPad Safari', () => {
    const res = detectPlatformCapabilities('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', false, false);
    assert.equal(res.isIOS, true);
    assert.equal(res.isAndroid, false);
    assert.equal(res.installMode, 'ios_guide');
  });

  it('validates manifest short_name length <= 12 characters', () => {
    assert.equal(isShortNameCompliant('RouteMate'), true);
    assert.equal(isShortNameCompliant(''), false);
    assert.equal(isShortNameCompliant('RouteMateAppTooLong'), false);
  });
});
