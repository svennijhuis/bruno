/**
 * Windows clipboard history (Win+V) opens an OS overlay that steals focus from
 * Electron. Ctrl+V does not. This overlay cannot be e2e'd on Linux CI.
 *
 * OS overlay blur: document.hasFocus() is false and relatedTarget is null.
 * In-app blur: document still has focus and relatedTarget is another control.
 */

export const isOsOverlayBlur = () => {
  if (typeof document === 'undefined' || !document.hasFocus()) {
    return true;
  }

  return false;
};

export const hasInAppBlurTarget = (event) => {
  return Boolean(event?.relatedTarget);
};
