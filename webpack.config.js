// const path = require("path");
// const webpack = require("webpack");

// module.exports = {
//   entry: "./src/index.js", // Your entry point
//   output: {
//     path: path.resolve(__dirname, "dist"),
//     filename: "bundle.js",
//   },
//   module: {
//     rules: [
//       {
//         test: /\.jsx?$/,
//         exclude: /node_modules/,
//         use: {
//           loader: "babel-loader?cacheDirectory=true",
//         },
//       },
//     ],
//   },
//   // plugins: [new webpack.IgnorePlugin({ resourceRegExp: /^(fs|net)$/ })],
//   resolve: {
//     fallback: {
//       //   buffer: false,
//       //   util: require.resolve("util/"),
//       //   string_decoder: require.resolve("string_decoder/"),
//       //   events: require.resolve("events/"),
//     },
//   },
//   mode: "development", // or 'production'
// };

const path = require("path");
const webpack = require("webpack");

const appDirectory = path.resolve(__dirname, "../");

const babelLoaderConfiguration = {
  test: /\.js$/,
  include: [
    // path.resolve(appDirectory, "index.web.js"),
    path.resolve(appDirectory, "warpspeed/src/index.js"),
    path.resolve(appDirectory, "src"),
    path.resolve(appDirectory, "node_modules/react-native-uncompiled"),
  ],
  use: {
    loader: "babel-loader",
    options: {
      cacheDirectory: true,
      presets: ["babel-preset-expo"],
      plugins: ["react-native-web"],
    },
  },
};

const imageLoaderConfiguration = {
  test: /\.(gif|jpe?g|png|svg)$/,
  use: {
    loader: "url-loader",
    options: {
      name: "[name].[ext]",
      esModule: false,
    },
  },
};

module.exports = {
  // entry: path.join(appDirectory, "index.web.js"),
  entry: path.join(appDirectory, "warpspeed/src/index.js"),
  output: {
    path: path.resolve(appDirectory, "dist"),
    filename: "bundle.js",
  },
  devtool: "source-map",
  module: {
    rules: [babelLoaderConfiguration, imageLoaderConfiguration],
  },
  resolve: {
    extensions: [".web.js", ".js", ".json"],
    alias: {
      "react-native$": "react-native-web",
    },
  },
  plugins: [
    new webpack.DefinePlugin({
      __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
    }),
  ],
  devServer: {
    contentBase: path.join(appDirectory, "public"),
    port: 3000,
  },
};
