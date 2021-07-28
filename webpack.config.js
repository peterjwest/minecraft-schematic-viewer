const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = [
  {
    mode: 'production',
    target: 'web',
    devtool: 'source-map',
    entry: ['./src/index.tsx'],
    output: {
      path: path.resolve(__dirname, 'build'),
      publicPath: '/',
      filename: 'index.js',
    },

    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
      fallback: {
        zlib: require.resolve('browserify-zlib'),
        assert: require.resolve('assert'),
        buffer: require.resolve('buffer'),
        stream: require.resolve('stream-browserify'),
        util: require.resolve('util'),
      },
    },

    node: {
      global: true,
    },

    externals : {
      nodegit: 'require("nodegit")'
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: 'ts-loader',
          options: {
            configFile: "tsconfig-build.json",
          },
          exclude: /node_modules/,
        },
        {
          test: /\.(jpe?g|png|gif|svg)$/i,
          use: [
            {
              loader: 'file-loader',
              options: {
                context: 'src',
                name: '[path][name].[ext]'
              },
            },
            {
              loader: 'image-webpack-loader'
            },
          ],
        },
        {
          test: /\.(woff|woff2|ttf|eot)$/i,
          loader: 'file-loader',
          options: {
            context: 'src',
            name: '[path][name].[ext]'
          },
        },
      ],
    },

    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production'),
        'process.env.NODE_DEBUG': JSON.stringify(false),
      }),
      new CopyWebpackPlugin({ patterns: [
        { from: 'src/index.html', to: 'index.html' },
        { from: 'default.zip', to: 'default.zip' },
      ]}),
    ],
  }
];
