import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import cors from 'cors';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = 3000;
app.use(cors());
app.use(express.json());

// Initialize SQLite Database
// Use DB_PATH env var if provided (for Render Persistent Disk), otherwise default to local file
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'lottery_stats.db');
const dbDir = path.dirname(DB_PATH);

// Ensure directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// GitHub Backup Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_REPO = process.env.GITHUB_REPO;
const DB_FILENAME = 'lottery_stats.db';

async function downloadDbFromGithub() {
  if (!GITHUB_TOKEN || !GITHUB_USERNAME || !GITHUB_REPO) {
    console.log('GitHub sync skipped: Missing credentials (GITHUB_TOKEN, GITHUB_USERNAME, GITHUB_REPO)');
    return;
  }
  
  try {
    console.log(`Checking for ${DB_FILENAME} in ${GITHUB_USERNAME}/${GITHUB_REPO}...`);
    const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${DB_FILENAME}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Lottery-Monitor-App'
      }
    });
    
    if (response.status === 404) {
      console.log('Database not found in repo. Starting with new database.');
      return;
    }
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    const data: any = await response.json();
    if (data.content) {
      const buffer = Buffer.from(data.content, 'base64');
      fs.writeFileSync(DB_PATH, buffer);
      console.log('Database successfully restored from GitHub!');
    }
  } catch (error) {
    console.error('Failed to download database from GitHub:', error);
  }
}

// Try to restore DB before initializing
await downloadDbFromGithub();

console.log(`Using database at: ${DB_PATH}`);
const db = new Database(DB_PATH);

// GitHub Backup Function
async function uploadDbToGithub() {
  if (!GITHUB_TOKEN || !GITHUB_USERNAME || !GITHUB_REPO) return;

  try {
    console.log('Starting scheduled database backup to GitHub...');
    const backupPath = `${DB_PATH}.backup`;
    
    // Create backup to ensure consistency
    await db.backup(backupPath);
    
    const content = fs.readFileSync(backupPath);
    const contentBase64 = content.toString('base64');
    
    // Get current SHA to allow update
    const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${DB_FILENAME}`;
    let sha: string | undefined;
    
    try {
      const getResponse = await fetch(url, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Lottery-Monitor-App'
        }
      });
      if (getResponse.ok) {
        const getData: any = await getResponse.json();
        sha = getData.sha;
      }
    } catch (e) {
      // Ignore error, assume file doesn't exist
    }

    // Upload (PUT)
    const putResponse = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Lottery-Monitor-App'
      },
      body: JSON.stringify({
        message: `Database backup ${new Date().toISOString()}`,
        content: contentBase64,
        sha: sha
      })
    });

    if (!putResponse.ok) {
      const err = await putResponse.text();
      throw new Error(`GitHub API error: ${putResponse.status} ${err}`);
    }

    console.log('Database successfully backed up to GitHub.');
    
    // Cleanup backup file
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  } catch (error) {
    console.error('Failed to backup database to GitHub:', error);
  }
}

// Schedule backup every 5 minutes
if (GITHUB_TOKEN && GITHUB_USERNAME && GITHUB_REPO) {
  setInterval(uploadDbToGithub, 5 * 60 * 1000);
  console.log('GitHub backup scheduled (every 5 min).');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS rounds (
    round_id INTEGER PRIMARY KEY,
    start_at TEXT,
    finish_at TEXT,
    ticket INTEGER,
    users_count INTEGER,
    user_id INTEGER,
    user_name TEXT,
    user_avatar TEXT,
    created_at TEXT
  )
`);

const insertRound = db.prepare(`
  INSERT OR IGNORE INTO rounds (round_id, start_at, finish_at, ticket, users_count, user_id, user_name, user_avatar, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const LOTTERY_ID = 169;
const API_URL = 'https://cs2run.app/lottery/state?mode=1';

async function fetchApiData() {
  try {
    const response = await fetch(API_URL, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ru'
      }
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('API fetch error:', error);
    return null;
  }
}

let currentRoundFinishAt: string | null = null;
let lastKnownUsersCount = 0;

async function processInitialData() {
  const data = await fetchApiData();
  if (!data?.success) return;

  const raffle = data.data.raffles.find((r: any) => r.id === LOTTERY_ID);
  if (!raffle) return;

  const round = raffle.round;
  currentRoundFinishAt = round?.finishAt || null;
  lastKnownUsersCount = round?.usersCount || 0;

  // Save initial winners
  const lastWinners = raffle.lastWinners || [];
  for (const winner of lastWinners) {
    const userName = winner.user?.name ? String(winner.user.name) : 'Unknown';
    
    insertRound.run(
      winner.lotteryRoundId,
      winner.lotteryRound.startAt,
      winner.lotteryRound.finishAt,
      winner.ticket,
      lastKnownUsersCount, 
      winner.userId,
      userName,
      winner.user?.avatar || '',
      winner.createdAt
    );
  }
}

async function pollLoop() {
  await processInitialData();

  while (true) {
    if (!currentRoundFinishAt) {
      await new Promise(r => setTimeout(r, 10000));
      await processInitialData();
      continue;
    }

    const finishTime = new Date(currentRoundFinishAt).getTime();
    const now = Date.now();
    const timeToWait = finishTime - now;

    // If finish time is in the future, wait until it's close (5s before)
    if (timeToWait > 5000) {
      console.log(`Waiting ${Math.round(timeToWait / 1000)}s for round to finish...`);
      await new Promise(r => setTimeout(r, timeToWait - 2000));
    }

    console.log('Polling every second for new round...');
    while (true) {
      const data = await fetchApiData();
      if (data?.success) {
        const raffle = data.data.raffles.find((r: any) => r.id === LOTTERY_ID);
        if (raffle) {
          const newFinishAt = raffle.round?.finishAt;
          
          if (newFinishAt && newFinishAt !== currentRoundFinishAt) {
            console.log('New round detected!');
            const lastWinners = raffle.lastWinners || [];
            if (lastWinners.length > 0) {
              const winner = lastWinners[0];
              const userName = winner.user?.name ? String(winner.user.name) : 'Unknown';
              
              insertRound.run(
                winner.lotteryRoundId,
                winner.lotteryRound.startAt,
                winner.lotteryRound.finishAt,
                winner.ticket,
                lastKnownUsersCount, 
                winner.userId,
                userName,
                winner.user?.avatar || '',
                winner.createdAt
              );
            }
            currentRoundFinishAt = newFinishAt;
            if (raffle.round?.usersCount) {
              lastKnownUsersCount = raffle.round.usersCount;
            }
            break; // Exit 1s polling loop
          } else {
            if (raffle.round?.usersCount) {
              lastKnownUsersCount = raffle.round.usersCount;
            }
          }
        }
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Start polling in background
pollLoop().catch(console.error);

// API Routes
app.get('/api/stats', (req, res) => {
  try {
    const rounds = db.prepare('SELECT * FROM rounds ORDER BY start_at DESC').all();
    
    const topWinners = db.prepare(`
      SELECT user_id, user_name, user_avatar, COUNT(*) as wins
      FROM rounds
      GROUP BY user_id
      ORDER BY wins DESC
      LIMIT 10
    `).all();

    let startWins = 0, midWins = 0, endWins = 0;
    
    const hourlyStats: Record<number, { count: number, totalUsers: number, totalTickets: number }> = {};

    rounds.forEach((r: any) => {
      if (r.users_count > 0) {
        const ratio = r.ticket / r.users_count;
        if (ratio <= 0.33) startWins++;
        else if (ratio <= 0.66) midWins++;
        else endWins++;
        
        const date = new Date(r.start_at);
        const hour = date.getUTCHours();
        
        if (!hourlyStats[hour]) {
          hourlyStats[hour] = { count: 0, totalUsers: 0, totalTickets: 0 };
        }
        
        hourlyStats[hour].count++;
        hourlyStats[hour].totalUsers += r.users_count;
        hourlyStats[hour].totalTickets += r.ticket;
      }
    });

    const intervalStats = Array.from({ length: 24 }, (_, i) => i).map(hour => {
      const data = hourlyStats[hour];
      
      if (!data) return { hour, avgUsers: 0, avgTicket: 0, count: 0 };
      
      return {
        hour,
        avgUsers: Math.round(data.totalUsers / data.count),
        avgTicket: Math.round(data.totalTickets / data.count),
        count: data.count
      };
    });

    res.json({
      totalRounds: rounds.length,
      winDistribution: {
        start: startWins,
        mid: midWins,
        end: endWins
      },
      intervalStats,
      recentRounds: rounds.slice(0, 10),
      topWinners,
      currentRoundFinishAt
    });
  } catch (error) {
    console.error('Error in /api/stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/download', (req, res) => {
  try {
    const zip = new AdmZip();
    
    // Add specific files
    const files = ['server.ts', 'server.py', 'requirements.txt', 'package.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'README.md', 'DEPLOY.md', 'start.sh'];
    files.forEach(file => {
      if (fs.existsSync(file)) {
        zip.addLocalFile(file);
      }
    });

    // Add src folder
    if (fs.existsSync('src')) {
      zip.addLocalFolder('src', 'src');
    }
    
    // Add public folder if exists
    if (fs.existsSync('public')) {
      zip.addLocalFolder('public', 'public');
    }

    const downloadName = `lottery-monitor-${Date.now()}.zip`;
    const data = zip.toBuffer();

    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename=${downloadName}`);
    res.set('Content-Length', data.length.toString());
    res.send(data);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to create zip' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
