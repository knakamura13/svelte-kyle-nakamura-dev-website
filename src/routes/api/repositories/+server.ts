import { Octokit } from '@octokit/rest';
import { env } from '$env/dynamic/private';

export async function GET(): Promise<Response> {
	const octokit = new Octokit({
		auth: env.GITHUB_TOKEN
	});

	const response = await octokit.request('GET /users/{username}/repos', {
		username: 'knakamura13',
		sort: 'updated'
	});

	// Get the 6 most recent repositories
	const repositories = response.data.slice(0, 6);

	const jsonData = {
		success: true,
		repositories
	};

	return new Response(JSON.stringify(jsonData), {
		headers: {
			'Content-Type': 'application/json'
		}
	});
}
