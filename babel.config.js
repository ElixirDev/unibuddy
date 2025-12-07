module.exports = function(api) {
  const isProduction = api.env('production');
  
  return {
    presets: [
      ['react-app', { runtime: 'automatic' }]
    ],
    plugins: isProduction ? [] : undefined
  };
};
