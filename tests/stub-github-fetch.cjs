const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const repositories = JSON.parse(readFileSync(join(__dirname, 'github-repositories.json'), 'utf8'));
const originalFetch = globalThis.fetch.bind(globalThis);

function requestUrl(input) {
	if (typeof input === 'string') return input;
	if (input instanceof URL) return input.href;
	return input.url;
}

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
