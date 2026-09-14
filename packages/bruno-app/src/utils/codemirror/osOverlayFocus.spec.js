const { describe, it, expect, afterEach } = require('@jest/globals');

import { isOsOverlayBlur, hasInAppBlurTarget } from './osOverlayFocus';

describe('osOverlayFocus', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isOsOverlayBlur', () => {
    // Win+V (Windows clipboard history) cannot be e2e'd on Linux CI.
    it('is true when the document is unfocused (OS overlay / Win+V)', () => {
      jest.spyOn(document, 'hasFocus').mockReturnValue(false);

      expect(isOsOverlayBlur()).toBe(true);
    });

    it('is false when the document still has focus (in-app blur)', () => {
      jest.spyOn(document, 'hasFocus').mockReturnValue(true);

      expect(isOsOverlayBlur()).toBe(false);
    });
  });

  describe('hasInAppBlurTarget', () => {
    it('is true when relatedTarget is another in-app control', () => {
      const input = document.createElement('input');

      expect(hasInAppBlurTarget({ relatedTarget: input })).toBe(true);
    });

    it('is false when relatedTarget is null (OS overlay or unfocusable click)', () => {
      expect(hasInAppBlurTarget({ relatedTarget: null })).toBe(false);
      expect(hasInAppBlurTarget({})).toBe(false);
    });
  });
});
