# Clerk OAuth CLI Demo

A monorepo demonstrating how to use Clerk as an OAuth identity provider with a CLI application and API backend.

## What's inside?

This project includes two packages:

- **`packages/cli`** - A command-line tool that authenticates with Clerk using OAuth flows
- **`packages/api`** - A lightweight API server that validates Clerk access tokens for task management

## Prerequisites

- Node.js >= 22.0.0
- pnpm >= 10.0.0
- A Clerk account with OAuth credentials

## Getting started

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Set up your environment variables in `.env` (see `.env.example` for required values)

3. Run both services:
   ```bash
   pnpm dev
   ```

   Or run them separately:
   ```bash
   pnpm dev:api  # Start the API server
   pnpm dev:cli  # Start the CLI in watch mode
   ```

## How it works

The CLI authenticates users through Clerk's OAuth flow, stores the access token locally, and uses it to interact with the API. The API validates these tokens using Clerk's backend SDK before processing any requests.

## Scripts

- `pnpm build` - Build all packages
- `pnpm clean` - Remove all build artifacts and dependencies
- `pnpm dev:cli` - Run the CLI in development mode
- `pnpm dev:api` - Run the API server in development mode