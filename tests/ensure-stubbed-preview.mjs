import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, readlinkSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright runs this only when /__github_stub_ready__ is not already answering.
// That is a preview which never loaded tests/stub-github-fetch.cjs, or a free port.
// Stop a preview from this repo so the stubbed server can bind; leave anything else alone.
const port = 4173;
const repoRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));

function sleep(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function listeningInodes(targetPort) {
	const inodes = new Set();
	for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
		if (!existsSync(file)) continue;
		for (const line of readFileSync(file, 'utf8').trim().split('\n').slice(1)) {
			const parts = line.trim().split(/\s+/);
			const localPort = parts[1]?.split(':')[1];
			if (parts[3] === '0A' && Number.parseInt(localPort, 16) === targetPort) inodes.add(parts[9]);
		}
	}
	return inodes;
}

function pidsForInodes(inodes) {
	const pids = new Set();
	for (const entry of readdirSync('/proc')) {
		if (!/^\d+$/.test(entry)) continue;
		let fds;
		try {
			fds = readdirSync(`/proc/${entry}/fd`);
		} catch {
			continue;
		}
		for (const fd of fds) {
			let target;
			try {
				target = readlinkSync(`/proc/${entry}/fd/${fd}`);
			} catch {
				continue;
			}
			const match = /^socket:\[(\d+)\]$/.exec(target);
			if (match && inodes.has(match[1])) pids.add(Number(entry));
		}
	}
	return [...pids];
}

function lsofPids(targetPort) {
	let output;
	try {
		output = execFileSync('lsof', ['-nP', `-iTCP:${targetPort}`, '-sTCP:LISTEN', '-t'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		});
	} catch (error) {
		if (typeof error === 'object' && error && 'status' in error && error.status === 1) return [];
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Could not inspect port ${targetPort} (${message}).`);
	}
	return [
		...new Set(
			output
				.split('\n')
				.map((line) => line.trim())
				.filter(Boolean)
		)
	].map(Number);
}

function listenerPids(targetPort) {
	if (existsSync('/proc/net/tcp') || existsSync('/proc/net/tcp6')) {
		const inodes = listeningInodes(targetPort);
		if (inodes.size === 0) return [];
		return pidsForInodes(inodes);
	}
	return lsofPids(targetPort);
}

function processCwd(pid) {
	const link = `/proc/${pid}/cwd`;
	if (existsSync(link)) {
		try {
			return readlinkSync(link);
		} catch {
			return '';
		}
	}
	try {
		const output = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		});
		const line = output.split('\n').find((entry) => entry.startsWith('n') && entry.length > 1);
		return line ? line.slice(1) : '';
	} catch {
		return '';
	}
}

function errorCode(error) {
	return typeof error === 'object' && error && 'code' in error ? error.code : undefined;
}

function ownedPreviewPids(targetPort) {
	const pids = listenerPids(targetPort);
	for (const pid of pids) {
		if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) {
			throw new Error(`Port ${targetPort} is in use by pid ${pid}, which this run will not stop.`);
		}
		const cwd = processCwd(pid);
		let sameRepo = false;
		try {
			sameRepo = cwd !== '' && realpathSync(cwd) === repoRoot;
		} catch {
			sameRepo = false;
		}
		if (!sameRepo) {
			throw new Error(
				`Port ${targetPort} is in use by pid ${pid} (${cwd || 'unknown cwd'}). It did not load the GitHub stub, and it is not this repo's preview. Stop it before rerunning.`
			);
		}
	}
	return pids;
}

function signal(pid, name) {
	try {
		process.kill(pid, name);
	} catch (error) {
		if (errorCode(error) !== 'ESRCH') throw error;
	}
}

function stopUnstubbedPreview(targetPort) {
	const pids = ownedPreviewPids(targetPort);
	if (pids.length === 0) return;

	for (const pid of pids) {
		console.error(
			`Stopping pid ${pid} on port ${targetPort} because it did not load the GitHub stub.`
		);
		signal(pid, 'SIGTERM');
	}

	const deadline = Date.now() + 5_000;
	while (listenerPids(targetPort).length > 0 && Date.now() < deadline) sleep(100);
	for (const pid of pids) signal(pid, 'SIGKILL');

	const killDeadline = Date.now() + 2_000;
	while (listenerPids(targetPort).length > 0 && Date.now() < killDeadline) sleep(100);
	if (listenerPids(targetPort).length > 0) {
		throw new Error(`Port ${targetPort} is still in use after stopping the unstubbed preview.`);
	}
}

function run(args) {
	return new Promise((resolve, reject) => {
		const child = spawn('yarn', args, { stdio: 'inherit', env: process.env });
		child.on('error', reject);
		child.on('exit', (code, exitSignal) => {
			if (code === 0) resolve();
			else reject(new Error(`yarn ${args.join(' ')} failed (${exitSignal ?? code}).`));
		});
	});
}

try {
	ownedPreviewPids(port);
	await run(['build']);
	stopUnstubbedPreview(port);
	await run(['preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1']);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
