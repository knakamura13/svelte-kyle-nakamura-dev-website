import { expect, test } from '@playwright/test';

// tests/stub-github-fetch.cjs answers api.github.com with tests/github-repositories.json.
// gamma omits description, epsilon sends a null star count, and eta is the seventh repository.
const repositories = [
	{
		name: 'alpha',
		html_url: 'https://github.com/knakamura13/alpha',
		description: 'A public repository',
		stargazers_count: 4
	},
	{
		name: 'beta',
		html_url: 'https://github.com/knakamura13/beta',
		description: null,
		stargazers_count: 0
	},
	{
		name: 'gamma',
		html_url: 'https://github.com/knakamura13/gamma',
		description: null,
		stargazers_count: 1
	},
	{
		name: 'delta',
		html_url: 'https://github.com/knakamura13/delta',
		description: '',
		stargazers_count: 2
	},
	{
		name: 'epsilon',
		html_url: 'https://github.com/knakamura13/epsilon',
		description: 'Fifth',
		stargazers_count: 0
	},
	{
		name: 'zeta',
		html_url: 'https://github.com/knakamura13/zeta',
		description: 'Sixth',
		stargazers_count: 8
	}
];

test.describe('GET /api/repositories', () => {
	test('returns the six mapped public repositories', async ({ request }) => {
		const response = await request.get('/api/repositories');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('application/json');
		expect(await response.json()).toEqual({ success: true, repositories });
	});
});
