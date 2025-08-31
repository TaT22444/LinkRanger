// metro.config.js（置き換え）
const { getDefaultConfig } = require('expo/metro-config');
const { withShareExtension } = require('expo-share-extension/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [projectRoot, workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.transformer.getTransformOptions = async () => ({
  transform: { experimentalImportSupport: false, inlineRequires: true },
});

module.exports = withShareExtension(config, { isCSSEnabled: true });
