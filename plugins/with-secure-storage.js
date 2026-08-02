const { withMainApplication } = require('@expo/config-plugins');

/** Keeps the app-owned Android KeyStore module registered after `expo prebuild`. */
module.exports = function withSecureStorage(config) {
  return withMainApplication(config, (currentConfig) => {
    let source = currentConfig.modResults.contents;
    if (!source.includes('CardCaseSecureStoragePackage')) {
      source = source.replace(
        'val packages = PackageList(this).packages',
        'val packages = PackageList(this).packages\n            packages.add(CardCaseSecureStoragePackage())',
      );
    }
    currentConfig.modResults.contents = source;
    return currentConfig;
  });
};
