/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'path';
import * as os from 'os';
import { TPromise } from 'vs/base/common/winjs.base';
import * as readline from 'readline';
import { Target } from 'v8-inspect-profiler';
import { isNumber } from 'vs/base/common/types';

async function chooseRendererProcess(targets: Target[]): Promise<number> {
	if (!targets || targets.length === 0) {
		return TPromise.as(-1);
	}
	if (targets.length > 1) {
		let askForChooseTab = '? Which process do you want to profile\n';
		for (let i = 0, len = targets.length; i < len; i++) {
			if (targets[i].title.indexOf('sharedProcess.html') === 0) {
				askForChooseTab += `${i}. shared-process\n`;
			} else {
				askForChooseTab += `${i}. window (${targets[i].title})\n`;
			}
		}

		console.log(askForChooseTab);

		return new TPromise<number>((resolve, reject) => {
			var rl = readline.createInterface(process.stdin, process.stdout);
			rl.setPrompt('> ');
			rl.prompt();
			rl.on('line', function (line) {
				let tabNumber = Number(line);
				if (!isNaN(tabNumber) && tabNumber >= 0 && tabNumber < targets.length) {
					rl.close();
					resolve(tabNumber);
				} else {
					console.log('Please provide valid number ;)');
					rl.prompt();
				}
			});
		});
	} else {
		return TPromise.as(0);
	}
}

export async function cpuProfile(debugPortStr: string): Promise<void> {
	let debugPort = Number(debugPortStr);

	if (!isNumber(debugPort)) {
		console.error('Please provide valid debug port.');
		return;
	}

	const profiler = await import('v8-inspect-profiler');
	const targets = await profiler.listTabs({ port: debugPort });
	if (targets.length < 1) {
		return;
	}

	return chooseRendererProcess(targets).then(async tabNumber => {
		let options;
		if (tabNumber >= 0 && tabNumber < targets.length) {
			options = {
				port: debugPort, chooseTab: (targets) => {
					const target = targets[tabNumber];
					return target;
				}
			};
		} else {
			options = { port: debugPort };
		}

		console.log('Start profiling, press CTRL-C to stop.');
		const targetProcess = await profiler.startProfiling(options);
		const filenamePrefix = paths.join(os.homedir(), Math.random().toString(16).slice(-4));

		return new TPromise(c => {
			process.on('SIGINT', async () => {
				let suffix = '';
				let profileTargetProcess = await targetProcess.stop();

				if (!process.env['VSCODE_DEV']) {
					profileTargetProcess = profiler.rewriteAbsolutePaths(profileTargetProcess, 'piiRemoved');
					suffix = '.txt';
				}

				await profiler.writeProfile(profileTargetProcess, `${filenamePrefix}-main.cpuprofile${suffix}`);
				console.log(`\nCPU Profile written to ${filenamePrefix}.cpuprofile${suffix}`);
				c(null);
				process.exit(0);
			});
		});
	});
}