import asyncio
import logging
import sqlite3
import os
import zipfile
import io
from datetime import datetime
from typing import List, Optional, Dict, Any
import random
import httpx
import aiosqlite
from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import HTMLResponse
import aiohttp

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Constants
LOTTERY_ID = 169
API_URL = "https://cs2run.app/lottery/state?mode=1"
# Use DB_PATH env var if provided (for Render Persistent Disk), otherwise default to local file
DB_FILE = os.getenv("DB_PATH", "lottery_stats.db")
SELF_URL = os.environ.get("SELF_URL", "http://localhost:3000")

# Ensure directory exists if DB_PATH is absolute/custom
db_dir = os.path.dirname(DB_FILE)
if db_dir and not os.path.exists(db_dir):
    os.makedirs(db_dir, exist_ok=True)

print(f"Using database at: {DB_FILE}")

# Database Initialization
def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
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
    ''')
    conn.commit()
    conn.close()

init_db()

# Global state
current_round_finish_at: Optional[str] = None
last_known_users_count: int = 0

async def fetch_api_data():
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(API_URL, headers={
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "ru"
            })
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.error(f"API fetch error: {e}")
        return None

async def save_round(winner: Dict[str, Any], users_count: int):
    async with aiosqlite.connect(DB_FILE) as db:
        user_name = winner.get('user', {}).get('name', 'Unknown')
        user_avatar = winner.get('user', {}).get('avatar', '')
        
        await db.execute('''
            INSERT OR IGNORE INTO rounds 
            (round_id, start_at, finish_at, ticket, users_count, user_id, user_name, user_avatar, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            winner['lotteryRoundId'],
            winner['lotteryRound']['startAt'],
            winner['lotteryRound']['finishAt'],
            winner['ticket'],
            users_count,
            winner['userId'],
            user_name,
            user_avatar,
            winner['createdAt']
        ))
        await db.commit()

async def process_initial_data():
    global current_round_finish_at, last_known_users_count
    
    data = await fetch_api_data()
    if not data or not data.get('success'):
        return

    raffle = next((r for r in data['data']['raffles'] if r['id'] == LOTTERY_ID), None)
    if not raffle:
        return

    round_data = raffle.get('round', {})
    current_round_finish_at = round_data.get('finishAt')
    last_known_users_count = round_data.get('usersCount', 0)

    # Save initial winners
    last_winners = raffle.get('lastWinners', [])
    for winner in last_winners:
        await save_round(winner, last_known_users_count)

async def poll_loop():
    global current_round_finish_at, last_known_users_count
    
    await process_initial_data()

    while True:
        if not current_round_finish_at:
            await asyncio.sleep(10)
            await process_initial_data()
            continue

        try:
            finish_time = datetime.fromisoformat(current_round_finish_at.replace('Z', '+00:00'))
            now = datetime.now(finish_time.tzinfo)
            time_to_wait = (finish_time - now).total_seconds()

            if time_to_wait > 5:
                logger.info(f"Waiting {int(time_to_wait)}s for round to finish...")
                await asyncio.sleep(time_to_wait - 2)

            logger.info("Polling every second for new round...")
            while True:
                data = await fetch_api_data()
                if not data:
                    logger.warning("API request failed, retrying in 5 seconds...")
                    await asyncio.sleep(5)
                    continue

                if data.get('success'):
                    raffle = next((r for r in data['data']['raffles'] if r['id'] == LOTTERY_ID), None)
                    if raffle:
                        new_finish_at = raffle.get('round', {}).get('finishAt')
                        
                        if new_finish_at and new_finish_at != current_round_finish_at:
                            logger.info("New round detected!")
                            last_winners = raffle.get('lastWinners', [])
                            if last_winners:
                                await save_round(last_winners[0], last_known_users_count)
                            
                            current_round_finish_at = new_finish_at
                            if raffle.get('round', {}).get('usersCount'):
                                last_known_users_count = raffle['round']['usersCount']
                            break
                        else:
                            if raffle.get('round', {}).get('usersCount'):
                                last_known_users_count = raffle['round']['usersCount']
                
                await asyncio.sleep(1)
        except Exception as e:
            logger.error(f"Error in poll loop: {e}")
            await asyncio.sleep(5)


@app.get("/api/stats")
async def get_stats():
    try:
        async with aiosqlite.connect(DB_FILE) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute('SELECT * FROM rounds ORDER BY start_at DESC') as cursor:
                rounds = await cursor.fetchall()
                rounds = [dict(row) for row in rounds]

            async with db.execute('''
                SELECT user_id, user_name, user_avatar, COUNT(*) as wins
                FROM rounds
                GROUP BY user_id
                ORDER BY wins DESC
                LIMIT 10
            ''') as cursor:
                top_winners = await cursor.fetchall()
                top_winners = [dict(row) for row in top_winners]

        start_wins = 0
        mid_wins = 0
        end_wins = 0
        
        hourly_stats = {}

        for r in rounds:
            if r['users_count'] > 0:
                ratio = r['ticket'] / r['users_count']
                if ratio <= 0.33:
                    start_wins += 1
                elif ratio <= 0.66:
                    mid_wins += 1
                else:
                    end_wins += 1
                
                date = datetime.fromisoformat(r['start_at'].replace('Z', '+00:00'))
                hour = date.hour # UTC hour
                
                if hour not in hourly_stats:
                    hourly_stats[hour] = {'count': 0, 'totalUsers': 0, 'totalTickets': 0}
                
                hourly_stats[hour]['count'] += 1
                hourly_stats[hour]['totalUsers'] += r['users_count']
                hourly_stats[hour]['totalTickets'] += r['ticket']

        interval_stats = []
        for hour in range(24):
            data = hourly_stats.get(hour)
            if not data:
                interval_stats.append({'hour': hour, 'avgUsers': 0, 'avgTicket': 0, 'count': 0})
            else:
                interval_stats.append({
                    'hour': hour,
                    'avgUsers': round(data['totalUsers'] / data['count']),
                    'avgTicket': round(data['totalTickets'] / data['count']),
                    'count': data['count']
                })

        return {
            "totalRounds": len(rounds),
            "winDistribution": {
                "start": start_wins,
                "mid": mid_wins,
                "end": end_wins
            },
            "intervalStats": interval_stats,
            "recentRounds": rounds[:10],
            "topWinners": top_winners,
            "currentRoundFinishAt": current_round_finish_at
        }
    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stats")

@app.get("/api/download")
async def download_source():
    try:
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            files_to_add = ['server.py', 'requirements.txt', 'package.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'README.md', 'DEPLOY.md', 'start.sh']
            for file in files_to_add:
                if os.path.exists(file):
                    zip_file.write(file)
            
            for root, dirs, files in os.walk('src'):
                for file in files:
                    file_path = os.path.join(root, file)
                    zip_file.write(file_path)
            
            if os.path.exists('public'):
                for root, dirs, files in os.walk('public'):
                    for file in files:
                        file_path = os.path.join(root, file)
                        zip_file.write(file_path)

        zip_buffer.seek(0)
        filename = f"lottery-monitor-{int(datetime.now().timestamp() * 1000)}.zip"
        
        return Response(
            content=zip_buffer.getvalue(),
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        logger.error(f"Download error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create zip")


@app.get("/healthz", response_class=HTMLResponse)
async def healthcheck():
    return HTMLResponse("OK")
    
# Serve static files
if os.path.exists("dist"):
    app.mount("/", StaticFiles(directory="dist", html=True), name="static")

    
import base64

async def github_backup_loop():
    # репозиторий
    user = os.getenv("GITHUB_USERNAME")
    repo = os.getenv("GITHUB_REPO")
    token = os.getenv("GITHUB_TOKEN")

    if not user or not repo or not token:
        logger.warning("GitHub backup not configured!")
        return

    while True:
        try:
            # читаем файл
            with open(DB_FILE, "rb") as f:
                content = f.read()

            # подготавливаем base64
            b64 = base64.b64encode(content).decode()

            import httpx
            async with httpx.AsyncClient() as client:
                # получаем sha последнего коммита
                url = f"https://api.github.com/repos/{user}/{repo}/contents/lottery_stats.db"
                headers = {"Authorization": f"token {token}"}
                r = await client.get(url, headers=headers)
                
                sha = None
                if r.status_code == 200:
                    sha = r.json()["sha"]

                body = {
                    "message": "Auto backup lottery_stats.db",
                    "content": b64,
                }
                if sha:
                    body["sha"] = sha

                # пушим
                res = await client.put(url, json=body, headers=headers)
                logger.info(f"Backup to GitHub status: {res.status_code}")
        except Exception as e:
            logger.error(f"GitHub backup error: {e}")

        await asyncio.sleep(300)  # 5 минут



logger = logging.getLogger("keep_alive")

async def keep_alive():
    while True:
        await asyncio.sleep(240 + random.random() * 120)  # твой интервал
        try:
            logger.info(f"Keep-alive ping attempt to {SELF_URL}/api/stats at {datetime.utcnow().isoformat()}")
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{SELF_URL}/api/stats") as resp:
                    text_snippet = (await resp.text())[:100]  # первые 100 символов ответа для проверки
                    logger.info(f"Keep-alive ping response: {resp.status}, snippet: {text_snippet}")
        except Exception as e:
            logger.error(f"Keep-alive error: {e}")


@app.on_event("startup")
async def startup_event():
    # Запускаем самопинг в фоне
    asyncio.create_task(keep_alive())
    asyncio.create_task(poll_loop())
    asyncio.create_task(github_backup_loop())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
