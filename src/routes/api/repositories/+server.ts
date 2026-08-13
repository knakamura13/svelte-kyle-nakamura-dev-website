import { loadHomeProjects } from '$lib/server/github';

export async function GET(): Promise<Response> {
	const { repositories, error } = await loadHomeProjects();

	if (error) {
		return new Response(JSON.stringify({ success: false, error, repositories }), {
			status: 500,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}

	return new Response(JSON.stringify({ success: true, repositories }), {
		headers: {
			'Content-Type': 'application/json'
		}
	});
}
