module.exports = function(api) {
  // Metro bundlerから渡されるdevフラグに基づいてキャッシュを設定します。
  // これにより、開発モードと本番モードの切り替え時にキャッシュが正しく再評価されます。
  const isDev = api.caller(caller => !!caller && caller.name === 'metro' && caller.dev);
  api.cache.using(() => isDev);

  const plugins = [];

  // 開発モードでない場合（本番ビルド時）にconsoleを削除します。
  // console.errorとconsole.warnは、本番でのエラー監視のために意図的に残します。
  if (!isDev) {
    plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }

  return {
    presets: ['babel-preset-expo'],
    plugins: plugins,
  };
};