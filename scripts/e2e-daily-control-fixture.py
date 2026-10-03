"""Synthetic logged-in page; /state independently verifies actual Bot input/click."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs
import json
import os

state = {"saves": [], "reads": 0}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == "/state":
            self.respond(json.dumps(state), "application/json")
            return
        if self.path == "/signin":
            self.send_response(303)
            self.send_header("Set-Cookie", "qa_session=reader; HttpOnly; SameSite=Lax")
            self.send_header("Location", "/account")
            self.end_headers()
            return
        signed = "qa_session=reader" in self.headers.get("Cookie", "")
        state["reads"] += 1
        content = '''<h1>Daily Chrome control QA</h1>'''
        if signed:
            content += '''<p>Signed in as QA Reader</p><p>Balance: 42 synthetic credits</p>
<label for="note">Account note</label><input id="note" value="Human initial note">
<button id="save">Save note</button><p id="result">Nothing saved</p>
<a href="/other">Navigate to another document</a>
<script>document.querySelector('#save').onclick=async()=>{
const note=document.querySelector('#note').value;
const r=await fetch('/save',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({note})});
document.querySelector('#result').textContent=await r.text();};</script>'''
        else:
            content += '<a href="/signin">Sign in as QA Reader</a>'
        self.respond('''<!doctype html><html><head><title>Daily Chrome control QA</title>
<style>body{font:18px system-ui;max-width:800px;margin:80px auto}input,button{font:inherit;padding:12px;margin:8px}a{display:block;margin-top:24px}</style>
</head><body>''' + content + "</body></html>", "text/html; charset=utf-8")

    def do_POST(self):
        if self.path != "/save" or "qa_session=reader" not in self.headers.get("Cookie", ""):
            self.send_error(403)
            return
        note = parse_qs(self.rfile.read(int(self.headers["Content-Length"])).decode()).get("note", [""])[0]
        state["saves"].append(note)
        self.respond("Saved: " + note, "text/plain")

    def respond(self, body, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(body.encode())


HTTPServer(("127.0.0.1", int(os.environ.get("BH_E2E_FIXTURE_PORT", "32021"))), Handler).serve_forever()
