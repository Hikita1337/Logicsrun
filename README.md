# Lottery Monitor

## Setup & Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm run dev
   ```

3. Open your browser at `http://localhost:3000`

## Deployment (Render.com)

This project is configured to run on Render.com as a Web Service.

### 1. Build & Start Commands

*   **Build Command:** `npm install && npm run build`
*   **Start Command:** `npm run start`

### 2. Environment Variables (Required for Backup)

To enable automatic database backup to your GitHub repository (every 5 minutes) and restore on startup, you **MUST** add these environment variables in your Render dashboard:

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `GITHUB_USERNAME` | Your GitHub username | `hicman34` |
| `GITHUB_REPO` | The name of this repository | `lottery-monitor` |
| `GITHUB_TOKEN` | A Personal Access Token with `repo` scope | `ghp_xxxxxxxxxxxx` |
| `NODE_ENV` | Set to production | `production` |

### How to get a GitHub Token:
1. Go to GitHub Settings -> **Developer settings** -> **Personal access tokens** -> **Tokens (classic)**.
2. Click **Generate new token (classic)**.
3. Select the **`repo`** scope (Full control of private repositories).
4. Copy the token and paste it into Render.

### How it works:
*   **On Startup:** The server checks your GitHub repo for `lottery_stats.db`. If found, it downloads and restores it.
*   **Every 5 Minutes:** The server uploads the current `lottery_stats.db` to your GitHub repo, overwriting the previous version.

## Local Development

To run locally with GitHub sync enabled, create a `.env` file in the root directory:

```env
GITHUB_USERNAME=your_username
GITHUB_REPO=your_repo_name
GITHUB_TOKEN=your_token
```
