from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == "/signin":
            self.send_response(303)
            self.send_header("Set-Cookie", "qa_session=reader; HttpOnly; SameSite=Lax")
            self.send_header("Location", "/page")
            self.end_headers()
            return

        signed = "qa_session=reader" in self.headers.get("Cookie", "")
        body = "<h1>Daily Browser account QA</h1>"
        if signed:
            body += (
                "<p>Signed in as QA Reader</p>"
                "<p>DAILY-BROWSER-SESSION-REUSED</p>"
                "<p>Account balance: 42 synthetic credits</p>"
                '<a href="/other">Open another page</a>'
            )
        else:
            body += (
                "<p>Sign in in this browser first.</p>"
                '<a href="/signin">Sign in as QA Reader</a>'
            )
        page = (
            "<!doctype html><html><head><title>Daily Browser account QA</title>"
            "</head><body>" + body + "</body></html>"
        )
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(page.encode())


HTTPServer(("127.0.0.1", 32020), Handler).serve_forever()
