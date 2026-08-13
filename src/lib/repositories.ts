export interface Repository {
	name: string;
	html_url: string;
	description: string | null;
	stargazers_count: number;
}

export interface HomeProjects {
	repositories: Repository[];
	error: string | null;
}
