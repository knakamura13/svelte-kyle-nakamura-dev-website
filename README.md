# Svelte Kyle Nakamura Dev Website

This SvelteKit project contains the frontend and backend of my personal website, https://kylenakamura.dev.

The website is hosted and automatically deployed with [Railway.app](https://railway.app?referralCode=QCz9lp), which I highly recommend for deploying any of your projects.

## Development

```bash
# Install dependencies
yarn install

# Start development server
yarn dev
```

The app will be available at `http://localhost:5173`.

The rendered pages read content checked into the repo. The homepage reads `src/lib/content/portfolio.ts`.

## `GET /api/repositories`

`src/routes/api/repositories/+server.ts` calls `loadHomeProjects()` in `src/lib/server/github.ts`. That function requests the public repositories of `knakamura13` from GitHub and returns them as JSON. It is the only code that reads `GITHUB_TOKEN`.

Public reads succeed without a token, within GitHub's unauthenticated rate limit. When GitHub rejects the request, the route returns HTTP 500 and `{ "success": false, "error": "Failed to fetch repositories", "repositories": [] }`. To authenticate the request, create a `.env` file in the root directory:

```
# Read by GET /api/repositories only.
# Create a token at: https://github.com/settings/tokens
GITHUB_TOKEN=your_github_token_here
```
