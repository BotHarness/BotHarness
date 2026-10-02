from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit, parse_qs
import json
queries = []
first = 0
class Fixture(BaseHTTPRequestHandler):
 def do_GET(self):
  global first
  u = urlsplit(self.path)
  self.send_response(200)
  self.send_header('Content-Type', 'application/json' if u.path == '/state' else 'text/html; charset=utf-8')
  self.end_headers()
  if u.path == '/state':
   return self.wfile.write(json.dumps({'queries': queries, 'firstResultOpens': first}).encode())
  title = 'Browser interaction QA'
  body = '<form action="/results"><label>Search <input name="q" aria-label="Search" style="font:24px sans-serif"></label><button>Search</button></form>'
  if u.path == '/results':
   queries.append(parse_qs(u.query).get('q',[''])[0])
   title = 'Search results'
   body = '<p>Results for the synthetic search</p><p><a href="/article/first">Aurora field notes</a></p><p><a href="/article/second">Aurora archive</a></p>'
  elif u.path == '/article/first':
   first += 1
   title = 'Aurora field notes'
   body = '<p>INTERACTION-FIRST-RESULT</p><p>The first result was opened.</p>'
  self.wfile.write(('<!doctype html><title>'+title+'</title><body style="font:24px sans-serif;padding:32px;background:white;color:#111"><h1>'+title+'</h1>'+body+'</body>').encode())
ThreadingHTTPServer(('127.0.0.1', 32019), Fixture).serve_forever()
