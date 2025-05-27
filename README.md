# Svelte Kyle Nakamura Dev Website

This SvelteKit project contains the frontend and backend of my personal website, https://kylenakamura.dev.

The website is hosted and automatically deployed with [Railway.app](https://railway.app?referralCode=QCz9lp), which I highly recommend for deploying any of your projects.

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```
# GitHub Personal Access Token
# Create one at: https://github.com/settings/tokens
# Only needs 'public_repo' scope for reading public repositories
GITHUB_TOKEN=your_github_token_here
```

## Development

```bash
# Install dependencies
yarn install

# Start development server
yarn dev
```

The app will be available at `http://localhost:5173`
