import { writable } from 'svelte/store';

export const repositories = writable([]);

// Utility function to check if running in the browser
function isBrowser() {
	return typeof window !== 'undefined';
}

// Immediately load cached data from sessionStorage if available
if (isBrowser()) {
	const cachedData = sessionStorage.getItem('repositories');
	if (cachedData) {
		repositories.set(JSON.parse(cachedData)); // Populate store with cached data
	}
}

let fetched = false; // Track if repositories have been fetched during this session

export async function fetchRepositories() {
	if (!fetched) {
		try {
			const response = await fetch('/api/repositories');
			const data = await response.json();
			repositories.set(data.repositories);

			// Save to session storage for persistence across reloads
			if (isBrowser()) {
				sessionStorage.setItem('repositories', JSON.stringify(data.repositories));
			}

			fetched = true;
		} catch (error) {
			console.error('Error fetching repositories:', error);
		}
	}
}

export function resetCache() {
	repositories.set([]); // Clear the store
	if (isBrowser()) {
		sessionStorage.removeItem('repositories'); // Clear session storage in browser
	}
	fetched = false; // Reset fetched flag
}
