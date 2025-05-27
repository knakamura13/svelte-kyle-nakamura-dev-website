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
		try {
			repositories.set(JSON.parse(cachedData)); // Populate store with cached data
		} catch (error) {
			console.warn('Failed to parse cached repository data:', error);
			// Clear the corrupted cache
			sessionStorage.removeItem('repositories');
		}
	}
}

let fetched = false; // Track if repositories have been fetched during this session

export async function fetchRepositories() {
	if (!fetched) {
		try {
			const response = await fetch('/api/repositories');

			// Check if the response is ok
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			// Get the response text first to check if it's valid
			const responseText = await response.text();

			// Check if response is empty or undefined
			if (!responseText || responseText === 'undefined') {
				throw new Error('Empty or undefined response from server');
			}

			// Parse the JSON
			const data = JSON.parse(responseText);

			// Ensure we have a valid data structure
			if (data && data.repositories && Array.isArray(data.repositories)) {
				repositories.set(data.repositories);

				// Save to session storage for persistence across reloads
				if (isBrowser()) {
					sessionStorage.setItem('repositories', JSON.stringify(data.repositories));
				}
			} else {
				// Set empty array if the data structure is invalid
				repositories.set([]);
				console.warn('Invalid repository data structure received:', data);
			}

			fetched = true;
		} catch (error) {
			console.error('Error fetching repositories:', error);
			// Set empty array on error so the UI doesn't break
			repositories.set([]);
			fetched = true; // Still mark as fetched to prevent retries
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
