import os
import json
import base64
from mitmproxy import http
from datetime import datetime

LOG_DIR = "Logs"
FILES_DIR = "captured_files"

os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(FILES_DIR, exist_ok=True)

def save_log(entry):
    """Сохраняет строку лога в дневной файл"""
    log_file = os.path.join(LOG_DIR, f"log_{datetime.now().date()}.txt")
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(entry + "\n")

def save_response_content(flow: http.HTTPFlow, content: bytes):
    """Сохраняет любые файлы, которые возвращает сервер"""
    if not content:
        return

    # Имя файла = timestamp + путь
    safe_path = flow.request.path.replace("/", "_").replace("?", "_")
    filename = f"{datetime.now().timestamp()}_{safe_path}"

    full_path = os.path.join(FILES_DIR, filename)

    with open(full_path, "wb") as f:
        f.write(content)

    save_log(f"[FILE SAVED] {filename} ({len(content)} bytes)")

def response(flow: http.HTTPFlow):
    """Логирование ответов сервера и сохранение файлов"""
    try:
        req = flow.request
        res = flow.response

        entry = {
            "time": str(datetime.now()),
            "url": req.pretty_url,
            "method": req.method,
            "status": res.status_code,
            "request_headers": dict(req.headers),
            "response_headers": dict(res.headers),
            "request_body": req.get_text(strict=False) if req.raw_content else "",
            "response_body": res.get_text(strict=False) if res.raw_content else "",
        }

        save_log(json.dumps(entry, ensure_ascii=False))

        # Сохранение бинарных данных (картинки, zip, видео, и т.п.)
        content_type = res.headers.get("content-type", "")
        if "application" in content_type or \
           "image" in content_type or \
           "video" in content_type or \
           "octet-stream" in content_type:
            save_response_content(flow, res.raw_content)

    except Exception as e:
        save_log(f"[ERROR] {str(e)}")