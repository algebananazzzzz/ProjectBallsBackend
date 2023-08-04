const path = require('path');
const { DefinePlugin } = require('webpack');
const nodeExternals = require('webpack-node-externals');
const { readFileSync } = require('fs');

const appConfig = JSON.parse(readFileSync('./src/app_config.json'));
module.exports = async () => {
    await import('./src/generator.js').then(module => module.generateServerArgsFile(['./src/schema', './src/resolvers']));
    // console.log(serverArgs)
    return {
        mode: 'production',
        entry: './src/server.js',
        output: {
            filename: 'server.js',
            path: path.resolve(__dirname, 'dist'),
            libraryTarget: 'commonjs',
        },
        target: 'node',
        plugins: [
            new DefinePlugin({
                CONFIG: JSON.stringify(appConfig)
            }),
        ],
        externalsPresets: { node: true },
        externals: [nodeExternals()],
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/preset-env'],
                        },
                    },
                },
            ],
        },
    };
};
