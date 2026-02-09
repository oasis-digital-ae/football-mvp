
/**
 * Leaderboard Info Widget Configuration
 * 
 * Change these settings to customize or disable the info widget
 */

export const LEADERBOARD_WIDGET_CONFIG = {
  /**
   * Master toggle for the info widget
   * Set to false to completely hide the widget
   */
  enabled: true,

  /**
   * Widget variant
   * - 'full': Full featured widget with expandable panel (default)
   * - 'compact': Smaller tooltip-only version
   */
  variant: 'full' as 'full' | 'compact',

  /**
   * Position on screen
   * Only applies to 'full' variant
   */
  position: 'bottom-right' as 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left',

  /**
   * Whether the widget should start open by default
   * Only applies to 'full' variant
   */
  defaultOpen: false,
} as const;

/**
 * Quick disable function
 * Call this from anywhere to disable the widget programmatically
 */
export const disableLeaderboardWidget = () => {
  (LEADERBOARD_WIDGET_CONFIG as any).enabled = false;
};

/**
 * Quick enable function
 * Call this from anywhere to enable the widget programmatically
 */
export const enableLeaderboardWidget = () => {
  (LEADERBOARD_WIDGET_CONFIG as any).enabled = true;
};
