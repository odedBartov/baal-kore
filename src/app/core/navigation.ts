import type { RouterExtensions } from '@nativescript/angular';

/**
 * Back button behaviour shared by every screen: go back in the history when there is one, otherwise (the screen was
 * opened with replaceUrl / after a redirect) go to the screen's logical parent so the student is never stuck.
 */
export function goBack(nav: RouterExtensions, fallback: string[], queryParams?: Record<string, unknown>): void {
  if (nav.canGoBack()) nav.back();
  else nav.navigate(fallback, { queryParams, clearHistory: false });
}
