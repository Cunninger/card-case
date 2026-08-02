const { withMainActivity } = require('@expo/config-plugins');

/**
 * Keeps the Android screenshot/recent-screen privacy flag after `expo prebuild`
 * regenerates the native project. The hand-edited activity remains in sync too.
 */
module.exports = function withPrivacyProtection(config) {
  return withMainActivity(config, (currentConfig) => {
    let source = currentConfig.modResults.contents;
    if (!source.includes('WindowManager.LayoutParams.FLAG_SECURE')) {
      source = source.replace(
        'import android.os.Bundle',
        'import android.os.Bundle\nimport android.view.WindowManager',
      );
      source = source.replace(
        'setTheme(R.style.AppTheme);',
        'setTheme(R.style.AppTheme);\n    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)',
      );
    }
    currentConfig.modResults.contents = source;
    return currentConfig;
  });
};
