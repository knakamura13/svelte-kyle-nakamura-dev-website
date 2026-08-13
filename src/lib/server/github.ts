import { Octokit } from '@octokit/rest';
import { env } from '$env/dynamic/private';
import type { HomeProjects, Repository } from '$lib/repositories';

const USERNAME = 'knakamura13';

export async function getRecentRepositories(limit = 6): Promise<Repository[]> {
	const octokit = new Octokit({
		auth: env.GITHUB_TOKEN || ''
	});

	const response = await octokit.request('GET /users/{username}/repos', {
		username: USERNAME,
		sort: 'updated'
	});

	return response.data.slice(0, limit).map((repo) => ({
		name: repo.name,
		html_url: repo.html_url,
		description: repo.description ?? null,
		stargazers_count: repo.stargazers_count ?? 0
	}));
}

export async function loadHomeProjects(): Promise<HomeProjects> {
	try {
		const repositories = await getRecentRepositories();
		return { repositories, error: null };
	} catch (error) {
		console.error('Error fetching repositories from GitHub:', error);
		return { repositories: [], error: 'Failed to fetch repositories' };
	}
}
