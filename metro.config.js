// metro.config.js（プロジェクト直下）
const { getDefaultConfig } = require("expo/metro-config");
const { withShareExtension } = require("expo-share-extension/metro");

module.exports = withShareExtension(getDefaultConfig(__dirname), {
  // Web 以外では特に気にしなくてOK
  isCSSEnabled: true,
});