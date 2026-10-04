"""Bounded synthetic Browser comparison pages with independent save readback."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
import json
import os
import re

state = {}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/state":
            self.respond(json.dumps(state), "application/json")
            return
        match = re.fullmatch(r"/run/([a-zA-Z0-9-]+)/(one|two)", path)
        if not match:
            self.send_error(404)
            return
        run, page = match.groups()
        current = state.setdefault(run, {"saves": [], "reads": 0})
        current["reads"] += 1
        self.respond('''<!doctype html><html><head><title>Local Browser driver QA</title>
<style>body{font:18px system-ui;max-width:800px;margin:60px auto}input,button{font:inherit;padding:12px;margin:8px}a{display:block;margin-top:24px}</style>
</head><body><h1>Local Browser driver QA — ''' + page + '''</h1>
<p>Signed in as QA Reader</p><p>Balance: 42 synthetic credits</p>
<label for="note">Account note</label><input id="note" aria-label="Account note" value="Human initial note">
<button id="save">Save note</button><p id="result">Nothing saved</p>
<script>document.querySelector('#save').onclick=async()=>{
const note=document.querySelector('#note').value;
const r=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({note})});
document.querySelector('#result').textContent=await r.text();};</script>
</body></html>''', "text/html; charset=utf-8")

    def do_POST(self):
        match = re.fullmatch(r"/run/([a-zA-Z0-9-]+)/(one|two)", urlparse(self.path).path)
        if not match:
            self.send_error(404)
            return
        run, page = match.groups()
        note = parse_qs(self.rfile.read(int(self.headers.get("Content-Length", "0"))).decode()).get("note", [""])[0]
        state.setdefault(run, {"saves": [], "reads": 0})["saves"].append({"page": page, "note": note})
        self.respond("Saved: " + note, "text/plain")

    def respond(self, body, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(body.encode())


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("BH_E2E_FIXTURE_PORT", "32023"))), Handler).serve_forever()
