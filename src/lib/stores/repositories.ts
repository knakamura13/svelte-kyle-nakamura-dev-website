import { writable } from 'svelte/store';

export interface Repository {
	name: string;
	html_url: string;
	description: string | null;
	stargazers_count: number;
}

export const repositories = writable<Repository[]>([]);

function isBrowser(): boolean {
	return typeof window !== 'undefined';
}

// Immediately load cached data from sessionStorage if available
if (isBrowser()) {
	const cachedData = sessionStorage.getItem('repositories');
	if (cachedData) {
		try {
			repositories.set(JSON.parse(cachedData));
		} catch (error) {
			console.warn('Failed to parse cached repository data:', error);
			sessionStorage.removeItem('repositories');
		}
	}
}

let fetched = false; // Track if repositories have been fetched during this session

export async function fetchRepositories(): Promise<void> {
	if (fetched) return;

	try {
		const response = await fetch('/api/repositories');

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const responseText = await response.text();

		if (!responseText || responseText === 'undefined') {
			throw new Error('Empty or undefined response from server');
		}

		const data = JSON.parse(responseText);

		if (data && data.repositories && Array.isArray(data.repositories)) {
			repositories.set(data.repositories);

			if (isBrowser()) {
				sessionStorage.setItem('repositories', JSON.stringify(data.repositories));
			}
		} else {
			repositories.set([]);
			console.warn('Invalid repository data structure received:', data);
		}

		fetched = true;
	} catch (error) {
		console.error('Error fetching repositories:', error);
		repositories.set([]);
		fetched = true; // Still mark as fetched to prevent retries
	}
}

export function resetCache(): void {
	repositories.set([]);
	if (isBrowser()) {
		sessionStorage.removeItem('repositories');
	}
	fetched = false;
}
