const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const http = require('node:http');

const repositories = JSON.parse(readFileSync(join(__dirname, 'github-repositories.json'), 'utf8'));
const originalFetch = globalThis.fetch.bind(globalThis);

// Playwright reuses a listener on 4173 only when this path returns a status below 404.
// A preview that did not load this file answers 404, so the suite replaces it instead of
// calling GitHub. Keep the path in sync with webServer.url in playwright.config.ts.
const READY_PATH = '/__github_stub_ready__';

function requestUrl(input) {
	if (typeof input === 'string') return input;
	if (input instanceof URL) return input.href;
	return input.url;
}

if (!globalThis[Symbol.for('githubFetchStub')]) {
	globalThis[Symbol.for('githubFetchStub')] = true;

	const originalEmit = http.Server.prototype.emit;
	http.Server.prototype.emit = function (event, ...args) {
		if (event !== 'request') return originalEmit.call(this, event, ...args);
		const request = args[0];
		const response = args[1];
		const path = typeof request?.url === 'string' ? request.url.split('?')[0] : '';
		if (path !== READY_PATH) return originalEmit.call(this, event, ...args);
		response.writeHead(200, {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'no-store'
		});
		response.end('ok');
		return true;
	};

	// Preview inherits this file through NODE_OPTIONS. The repositories route is the only caller of
	// api.github.com; answering it here keeps the suite off GitHub's unauthenticated rate limit.
	globalThis.fetch = async (input, init) => {
		let url;
		try {
			url = new URL(requestUrl(input));
		} catch {
			return originalFetch(input, init);
		}
		if (url.hostname !== 'api.github.com' || url.pathname !== '/users/knakamura13/repos') {
			return originalFetch(input, init);
		}
		return new Response(JSON.stringify(repositories), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	};
}
