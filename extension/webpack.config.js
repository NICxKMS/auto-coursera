import { resolve as _resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import CopyPlugin from 'copy-webpack-plugin';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default (env, argv) => {
	const isProduction = argv.mode === 'production';
	return {
		mode: argv.mode || 'development',
		entry: {
			background: './src/background/background.ts',
			content: './src/content/content.ts',
			popup: './src/popup/popup.ts',
		},
		output: {
			path: _resolve(__dirname, 'dist'),
			filename: '[name].js',
			clean: true,
		},
		module: {
			rules: [
				{
					test: /\.ts$/,
					use: 'ts-loader',
					exclude: /node_modules/,
				},
			],
		},
		resolve: {
			extensions: ['.ts', '.js'],
		},
		plugins: [
			new CopyPlugin({
				patterns: [
					{ from: 'manifest.json', to: 'manifest.json' },
					{ from: 'assets', to: 'assets' },
					{ from: 'src/popup/popup.html', to: 'popup.html' },
					{ from: 'src/popup/popup.css', to: 'popup.css' },
				],
			}),
		],
		devtool: isProduction ? false : 'source-map',
		optimization: {
			minimize: isProduction,
			splitChunks: false,
		},
	};
};
