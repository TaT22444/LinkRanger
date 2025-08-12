const { withXcodeProject, withInfoPlist } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withShareExtension(config) {
  return withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    
    // Share Extension Target を追加
    const targetName = 'ShareExtension';
    const targetPath = `${targetName}/${targetName}`;
    
    // Share Extension用のInfo.plistを追加
    const shareExtensionInfoPlist = {
      CFBundleDevelopmentRegion: '$(DEVELOPMENT_LANGUAGE)',
      CFBundleDisplayName: 'ShareExtension',
      CFBundleExecutable: '$(EXECUTABLE_NAME)',
      CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
      CFBundleInfoDictionaryVersion: '6.0',
      CFBundleName: '$(PRODUCT_NAME)',
      CFBundlePackageType: '$(PRODUCT_BUNDLE_PACKAGE_TYPE)',
      CFBundleShortVersionString: '1.0',
      CFBundleVersion: '1',
      NSExtension: {
        NSExtensionPointIdentifier: 'com.apple.share-services',
        NSExtensionPrincipalClass: 'ShareViewController',
        NSExtensionAttributes: {
          NSExtensionActivationRule: {
            NSExtensionActivationSupportsWebURLWithMaxCount: 1,
            NSExtensionActivationSupportsText: true,
            NSExtensionActivationSupportsWebPageWithMaxCount: 1
          }
        }
      }
    };
    
    // Target追加ロジック（実装が複雑）
    console.log('Share Extension Config Plugin を設定中...');
    
    return config;
  });
}

module.exports = withShareExtension;