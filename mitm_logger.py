import os
import subprocess
from mitmproxy import http

LOG_PATH = "logs/mitm.log"
FILES_DIR = "captured_files"


def save_and_commit(path):
    subprocess.run(["git", "add", path])
    subprocess.run(["git", "commit", "-m", f"update: {path}"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    subprocess.run(["git", "push"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def request(flow: http.HTTPFlow):
    with open(LOG_PATH, "a") as f:
        f.write(f"[REQUEST] {flow.request.method} {flow.request.pretty_url}\n")

    save_and_commit(LOG_PATH)


def response(flow: http.HTTPFlow):
    with open(LOG_PATH, "a") as f:
        f.write(f"[RESPONSE] {flow.request.pretty_url} → {flow.response.status_code}\n")

    save_and_commit(LOG_PATH)

    content_type = flow.response.headers.get("Content-Type", "")

    if "application" in content_type or "image" in content_type or "octet-stream" in content_type:
        filename = flow.request.path.replace("/", "_")
        if len(filename) > 120:
            filename = filename[-120:]

        file_path = os.path.join(FILES_DIR, filename)

        with open(file_path, "wb") as f:
            f.write(flow.response.raw_content)

        save_and_commit(file_path)