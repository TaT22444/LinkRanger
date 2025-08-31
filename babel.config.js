module.exports = function(api) {
  api.cache(true);

  const plugins = [];

  // 本番環境（リリースビルド）でのみconsole.logを削除するプラグインを追加
  // `api.env('production')`は、Metro bundlerが`dev: false`で実行される際にtrueになる
  if (api.env('production')) {
    plugins.push('transform-remove-console');
  }

  return {
    presets: ['babel-preset-expo'],
    plugins: plugins,
  };
};