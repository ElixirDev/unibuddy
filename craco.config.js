// craco.config.js
const path = require("path");
require("dotenv").config();

const isProduction = process.env.NODE_ENV === 'production';

// Environment variable overrides
const config = {
  disableHotReload: process.env.DISABLE_HOT_RELOAD === "true" || isProduction,
  enableVisualEdits: process.env.REACT_APP_ENABLE_VISUAL_EDITS === "true" && !isProduction,
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
};

// Conditionally load visual editing modules only if enabled
let babelMetadataPlugin;
let setupDevServer;

if (config.enableVisualEdits) {
  babelMetadataPlugin = require("./plugins/visual-edits/babel-metadata-plugin");
  setupDevServer = require("./plugins/visual-edits/dev-server-setup");
}

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

const webpackConfig = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // Disable hot reload and react-refresh in production
      if (config.disableHotReload || isProduction) {
        // Remove hot reload related plugins
        webpackConfig.plugins = webpackConfig.plugins.filter(plugin => {
          const name = plugin.constructor.name;
          return !(name === 'HotModuleReplacementPlugin' || name === 'ReactRefreshPlugin');
        });

        // Remove react-refresh from babel-loader options in webpack rules
        const removeReactRefresh = (rules) => {
          if (!rules) return;
          rules.forEach(rule => {
            if (rule.oneOf) removeReactRefresh(rule.oneOf);
            if (rule.use) {
              const useArray = Array.isArray(rule.use) ? rule.use : [rule.use];
              useArray.forEach(loader => {
                if (loader.loader && loader.loader.includes('babel-loader') && loader.options && loader.options.plugins) {
                  loader.options.plugins = loader.options.plugins.filter(plugin => {
                    const pluginPath = Array.isArray(plugin) ? plugin[0] : plugin;
                    return !String(pluginPath).includes('react-refresh');
                  });
                }
              });
            }
          });
        };
        removeReactRefresh(webpackConfig.module.rules);

        // Disable watch mode
        webpackConfig.watch = false;
        webpackConfig.watchOptions = {
          ignored: /.*/, // Ignore all files
        };
      } else {
        // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
          ],
        };
      }

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }

      return webpackConfig;
    },
  },
};

// Babel configuration - explicitly disable react-refresh in production
webpackConfig.babel = {
  plugins: [],
  loaderOptions: (babelLoaderOptions, { env }) => {
    if (env === 'production' || isProduction) {
      // Filter out react-refresh from plugins
      if (babelLoaderOptions.plugins) {
        babelLoaderOptions.plugins = babelLoaderOptions.plugins.filter(plugin => {
          if (!plugin) return true;
          const pluginPath = Array.isArray(plugin) ? plugin[0] : plugin;
          const pluginStr = typeof pluginPath === 'string' ? pluginPath : '';
          return !pluginStr.includes('react-refresh');
        });
      }
      // Also check presets for any react-refresh references
      if (babelLoaderOptions.presets) {
        babelLoaderOptions.presets = babelLoaderOptions.presets.map(preset => {
          if (Array.isArray(preset) && preset[1] && preset[1].development !== undefined) {
            preset[1].development = false;
          }
          return preset;
        });
      }
    }
    return babelLoaderOptions;
  }
};

// Only add babel plugin if visual editing is enabled
if (config.enableVisualEdits) {
  webpackConfig.babel.plugins.push(babelMetadataPlugin);
}

// Setup dev server with visual edits and/or health check
if (config.enableVisualEdits || config.enableHealthCheck) {
  webpackConfig.devServer = (devServerConfig) => {
    // Apply visual edits dev server setup if enabled
    if (config.enableVisualEdits && setupDevServer) {
      devServerConfig = setupDevServer(devServerConfig);
    }

    // Add health check endpoints if enabled
    if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
      const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

      devServerConfig.setupMiddlewares = (middlewares, devServer) => {
        // Call original setup if exists
        if (originalSetupMiddlewares) {
          middlewares = originalSetupMiddlewares(middlewares, devServer);
        }

        // Setup health endpoints
        setupHealthEndpoints(devServer, healthPluginInstance);

        return middlewares;
      };
    }

    return devServerConfig;
  };
}

module.exports = webpackConfig;
