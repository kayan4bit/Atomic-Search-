/**
 * Advanced Settings Manager - 30+ Settings
 */

class AdvancedSettingsManager {
  constructor() {
    this.SETTINGS_KEY = 'atomic.advanced-settings';
    this.defaultSettings = {
      // Appearance (10)
      theme: 'auto',
      fontSize: 'base',
      fontFamily: 'system',
      compactMode: false,
      animationsEnabled: true,
      highContrast: false,
      dyslexiaFont: false,
      colorBlindMode: 'none',
      customAccentColor: '#ff6b6b',
      sidebarPosition: 'left',
      
      // Search (10)
      resultsPerPage: 50,
      autoFocus: true,
      instantAnswers: true,
      searchHistory: true,
      searchSuggestions: true,
      resultsSorting: 'relevance',
      groupResults: false,
      showFavicons: true,
      showMetadata: true,
      searchTimeout: 30,
      
      // Privacy & Security (15)
      safeSearch: true,
      blockTrackers: true,
      blockAds: true,
      blockMalware: true,
      blockPhishing: true,
      stripReferrer: true,
      stripQueryParams: false,
      nsfwFilter: true,
      encryptionEnabled: true,
      vpnDetection: false,
      proxyLinks: true,
      deleteHistoryOnExit: false,
      anonymousMode: false,
      dnsOverHttps: true,
      certificatePinning: true,
      
      // AI Features (8)
      aiChatEnabled: true,
      aiSummarization: true,
      aiTranslation: true,
      aiCodeGeneration: true,
      aiFactChecking: true,
      aiSentimentAnalysis: true,
      aiEntityExtraction: true,
      aiConceptExplanation: true,
      
      // Performance (8)
      cacheEnabled: true,
      compressionEnabled: true,
      lazyLoadImages: true,
      preloadResults: false,
      indexingSpeed: 'normal',
      maxCacheSize: 100,
      connectionTimeout: 10,
      retryAttempts: 3,
      
      // Notifications (5)
      soundEnabled: false,
      desktopNotifications: false,
      notificationPosition: 'bottom-right',
      notificationDuration: 5,
      showNotificationBadge: true,
      
      // Accessibility (8)
      screenReaderMode: false,
      magnifierEnabled: false,
      magnificationLevel: 1,
      keyboardNavigationEnabled: true,
      focusIndicatorSize: 'normal',
      reduceMotion: false,
      largeClickTargets: false,
      textSpacing: 'normal',
      
      // Data & Privacy (7)
      dataCollection: 'minimal',
      analyticsEnabled: false,
      crashReporting: false,
      usageTracking: false,
      behavioralAnalytics: false,
      personalizedResults: false,
      dataRetention: 'none',
      
      // Advanced (10)
      apiEnabled: false,
      proxyUrl: '',
      customDnsServer: '',
      debugMode: false,
      logLevel: 'error',
      experimentalFeatures: false,
      betaFeatures: false,
      customUserAgent: '',
      requestTimeout: 30,
      maxConnections: 10,
    };
    
    this.settings = this.loadSettings();
  }

  /**
   * Load settings from localStorage
   */
  loadSettings() {
    try {
      const raw = localStorage.getItem(this.SETTINGS_KEY);
      if (!raw) return { ...this.defaultSettings };
      const parsed = JSON.parse(raw);
      return { ...this.defaultSettings, ...parsed };
    } catch (e) {
      console.error('Failed to load settings:', e);
      return { ...this.defaultSettings };
    }
  }

  /**
   * Save settings to localStorage
   */
  saveSettings(settings) {
    try {
      this.settings = { ...this.defaultSettings, ...settings };
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(this.settings));
      this.applySettings();
      return true;
    } catch (e) {
      console.error('Failed to save settings:', e);
      return false;
    }
  }

  /**
   * Get a specific setting
   */
  getSetting(key) {
    return this.settings[key] ?? this.defaultSettings[key];
  }

  /**
   * Update a specific setting
   */
  updateSetting(key, value) {
    this.settings[key] = value;
    this.saveSettings(this.settings);
    return true;
  }

  /**
   * Apply settings to the UI
   */
  applySettings() {
    // Apply theme
    this.applyTheme();
    
    // Apply appearance
    this.applyAppearance();
    
    // Apply accessibility
    this.applyAccessibility();
    
    // Apply performance
    this.applyPerformance();
    
    // Dispatch event
    window.dispatchEvent(new CustomEvent('settingsChanged', { detail: this.settings }));
  }

  /**
   * Apply theme
   */
  applyTheme() {
    const theme = this.getSetting('theme');
    const accentColor = this.getSetting('customAccentColor');
    
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--color-primary', accentColor);
    
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  }

  /**
   * Apply appearance settings
   */
  applyAppearance() {
    const fontSize = this.getSetting('fontSize');
    const compactMode = this.getSetting('compactMode');
    const highContrast = this.getSetting('highContrast');
    const dyslexiaFont = this.getSetting('dyslexiaFont');
    const animationsEnabled = this.getSetting('animationsEnabled');
    
    // Font size
    const fontSizeMap = {
      'small': '14px',
      'base': '16px',
      'large': '18px',
      'xlarge': '20px',
    };
    document.documentElement.style.fontSize = fontSizeMap[fontSize] || '16px';
    
    // Compact mode
    document.documentElement.classList.toggle('compact-mode', compactMode);
    
    // High contrast
    document.documentElement.classList.toggle('high-contrast', highContrast);
    
    // Dyslexia font
    if (dyslexiaFont) {
      const link = document.createElement('link');
      link.href = 'https://fonts.googleapis.com/css2?family=OpenDyslexic:wght@400;700&display=swap';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      document.documentElement.style.fontFamily = 'OpenDyslexic, sans-serif';
    }
    
    // Animations
    if (!animationsEnabled) {
      document.documentElement.style.setProperty('--transition-fast', '0ms');
      document.documentElement.style.setProperty('--transition-base', '0ms');
      document.documentElement.style.setProperty('--transition-slow', '0ms');
    }
  }

  /**
   * Apply accessibility settings
   */
  applyAccessibility() {
    const screenReaderMode = this.getSetting('screenReaderMode');
    const magnifierEnabled = this.getSetting('magnifierEnabled');
    const magnificationLevel = this.getSetting('magnificationLevel');
    const reduceMotion = this.getSetting('reduceMotion');
    const largeClickTargets = this.getSetting('largeClickTargets');
    
    // Screen reader mode
    document.documentElement.classList.toggle('screen-reader-mode', screenReaderMode);
    
    // Magnifier
    if (magnifierEnabled) {
      document.documentElement.style.zoom = magnificationLevel;
    }
    
    // Reduce motion
    if (reduceMotion) {
      document.documentElement.style.setProperty('--transition-fast', '0ms');
      document.documentElement.style.setProperty('--transition-base', '0ms');
    }
    
    // Large click targets
    if (largeClickTargets) {
      document.documentElement.style.setProperty('--spacing-md', '20px');
    }
  }

  /**
   * Apply performance settings
   */
  applyPerformance() {
    const lazyLoadImages = this.getSetting('lazyLoadImages');
    const compressionEnabled = this.getSetting('compressionEnabled');
    
    // Lazy load images
    if (lazyLoadImages) {
      document.querySelectorAll('img').forEach(img => {
        img.loading = 'lazy';
      });
    }
  }

  /**
   * Export settings
   */
  exportSettings() {
    const data = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      settings: this.settings,
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atomic-search-settings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Import settings
   */
  importSettings(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data.settings) {
            this.saveSettings(data.settings);
            resolve(true);
          } else {
            reject(new Error('Invalid settings file'));
          }
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Reset to defaults
   */
  resetToDefaults() {
    this.saveSettings(this.defaultSettings);
    return true;
  }

  /**
   * Get all settings
   */
  getAllSettings() {
    return { ...this.settings };
  }

  /**
   * Get settings by category
   */
  getSettingsByCategory(category) {
    const categories = {
      appearance: ['theme', 'fontSize', 'fontFamily', 'compactMode', 'animationsEnabled', 'highContrast', 'dyslexiaFont', 'colorBlindMode', 'customAccentColor', 'sidebarPosition'],
      search: ['resultsPerPage', 'autoFocus', 'instantAnswers', 'searchHistory', 'searchSuggestions', 'resultsSorting', 'groupResults', 'showFavicons', 'showMetadata', 'searchTimeout'],
      privacy: ['safeSearch', 'blockTrackers', 'blockAds', 'blockMalware', 'blockPhishing', 'stripReferrer', 'stripQueryParams', 'nsfwFilter', 'encryptionEnabled', 'vpnDetection', 'proxyLinks', 'deleteHistoryOnExit', 'anonymousMode', 'dnsOverHttps', 'certificatePinning'],
      ai: ['aiChatEnabled', 'aiSummarization', 'aiTranslation', 'aiCodeGeneration', 'aiFactChecking', 'aiSentimentAnalysis', 'aiEntityExtraction', 'aiConceptExplanation'],
      performance: ['cacheEnabled', 'compressionEnabled', 'lazyLoadImages', 'preloadResults', 'indexingSpeed', 'maxCacheSize', 'connectionTimeout', 'retryAttempts'],
      notifications: ['soundEnabled', 'desktopNotifications', 'notificationPosition', 'notificationDuration', 'showNotificationBadge'],
      accessibility: ['screenReaderMode', 'magnifierEnabled', 'magnificationLevel', 'keyboardNavigationEnabled', 'focusIndicatorSize', 'reduceMotion', 'largeClickTargets', 'textSpacing'],
      data: ['dataCollection', 'analyticsEnabled', 'crashReporting', 'usageTracking', 'behavioralAnalytics', 'personalizedResults', 'dataRetention'],
      advanced: ['apiEnabled', 'proxyUrl', 'customDnsServer', 'debugMode', 'logLevel', 'experimentalFeatures', 'betaFeatures', 'customUserAgent', 'requestTimeout', 'maxConnections'],
    };
    
    const keys = categories[category] || [];
    const result = {};
    keys.forEach(key => {
      result[key] = this.settings[key];
    });
    return result;
  }

  /**
   * Validate settings
   */
  validateSettings(settings) {
    const errors = [];
    
    if (settings.fontSize && !['small', 'base', 'large', 'xlarge'].includes(settings.fontSize)) {
      errors.push('Invalid font size');
    }
    
    if (settings.resultsPerPage && (settings.resultsPerPage < 10 || settings.resultsPerPage > 100)) {
      errors.push('Results per page must be between 10 and 100');
    }
    
    if (settings.maxCacheSize && (settings.maxCacheSize < 10 || settings.maxCacheSize > 1000)) {
      errors.push('Cache size must be between 10 and 1000 MB');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton
export default new AdvancedSettingsManager();

