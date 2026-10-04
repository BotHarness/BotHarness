from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
import json
import os
import re
import time

state = {}
products = [
    {"sku": "AUR-STD", "name": "Aurora Notebook Standard", "price": 1000},
    {"sku": "AUR-LIMITED", "name": "Aurora Notebook Limited", "price": 1200},
    {"sku": "AUR-DESK", "name": "Aurora Desk Edition", "price": 900},
] + [{"sku": "CAT-" + str(i), "name": "Catalog item " + str(i), "price": 500 + i} for i in range(1, 55)]
cities = [{"id": "tokyo-jp", "name": "Tokyo, Japan", "shipping": 300}, {"id": "tokyo-us", "name": "Tokyo, Texas, USA", "shipping": 700}]

page = r'''<!doctype html><html><head><meta charset="utf-8"><title>Complex Browser QA — order desk</title>
<style>body{font:16px system-ui;max-width:1040px;margin:32px auto;color:#17212f}header{border-bottom:1px solid #ccd4df;padding:16px}main{display:grid;grid-template-columns:1fr 1fr;gap:24px}section{padding:16px;border:1px solid #ccd4df;border-radius:12px;margin-top:20px}input,textarea,button{font:inherit;padding:10px;margin:6px 0}label{display:block}article{border-bottom:1px solid #ddd;padding:8px}button{cursor:pointer}dialog{max-width:580px;border:1px solid #ccd4df;border-radius:16px;padding:28px}dialog::backdrop{background:#17212f88}.error{color:#b42318}#city-options button{display:block}#receipt{white-space:pre-wrap}</style>
</head><body><header><h1>Order desk · synthetic QA</h1><p>Signed in as QA Reader · Test account only · No real purchase</p></header>
<main><section><h2>Catalog</h2><label>Search catalog<input id="search" aria-label="Search catalog" placeholder="Product name"></label><p id="search-status" aria-live="polite">Loading catalog</p><div id="catalog"></div></section>
<section><h2>Configure order</h2><p id="chosen">Choose a catalog product</p><div id="form" hidden>
<label>Quantity<input id="quantity" aria-label="Quantity" type="number" min="1" value="1"></label><p id="quantity-summary">Quantity: 1</p>
<label>Destination city<input id="city" role="combobox" aria-label="Destination city" aria-expanded="false" autocomplete="off"></label><div id="city-options" role="listbox"></div><p id="city-summary">No destination selected</p>
<label><input id="alternate" aria-label="Ship to alternate address" type="checkbox"> Ship to alternate address</label><div id="alternate-fields" hidden><label>Street address<input id="street" aria-label="Street address"></label><label>Delivery note<textarea id="note" aria-label="Delivery note"></textarea></label></div>
<p id="total">Total: select destination</p><button id="review">Review order</button><button disabled>Confirm order</button><div id="errors" class="error" role="alert"></div></div><h3>Saved order</h3><p id="receipt">No order submitted</p><p>Reference information is available in this run's /reference page.</p></section></main>
<dialog id="modal" aria-label="Review order"><h2>Review order</h2><div id="review-details"></div><button id="cancel">Back to editing</button><button id="confirm">Confirm order</button></dialog>
<script>
const base=location.pathname.replace(/\/desk$/,'');let product,city,searchTimer,cityTimer;
const $=s=>document.querySelector(s);
const event=(type,data={})=>fetch(base+'/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type,...data})});
const update=()=>{$('#quantity-summary').textContent='Quantity: '+$('#quantity').value;$('#total').textContent=product&&city?'Total: '+(product.price*Number($('#quantity').value)+city.shipping)+' synthetic units':'Total: select destination';};
async function search(query){$('#search-status').textContent='Searching…';const list=await(await fetch(base+'/search?q='+encodeURIComponent(query))).json();$('#catalog').replaceChildren(...list.map(p=>{const a=document.createElement('article');const text=document.createElement('p');text.textContent=p.name+' · SKU '+p.sku+' · '+p.price+' synthetic units';const b=document.createElement('button');b.textContent='Configure';b.onclick=()=>{product=p;$('#chosen').textContent='Selected: '+p.name+' · SKU '+p.sku;$('#form').hidden=false;$('#errors').textContent='';update();event('product-selected',{sku:p.sku});};a.append(text,b);return a;}));$('#search-status').textContent=list.length+' products found';}
$('#search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>search($('#search').value),350);};
$('#quantity').oninput=update;
$('#city').oninput=()=>{city=undefined;update();clearTimeout(cityTimer);$('#city-options').replaceChildren();$('#city').setAttribute('aria-expanded','true');cityTimer=setTimeout(async()=>{const list=await(await fetch(base+'/cities?q='+encodeURIComponent($('#city').value))).json();$('#city-options').replaceChildren(...list.map(c=>{const b=document.createElement('button');b.role='option';b.textContent=c.name;b.onclick=()=>{city=c;$('#city').value=c.name;$('#city').setAttribute('aria-expanded','false');$('#city-options').replaceChildren();$('#city-summary').textContent='Destination: '+c.name+' · shipping '+c.shipping+' synthetic units';update();event('city-selected',{cityId:c.id});};return b;}));},250);};
$('#alternate').onchange=()=>{$('#alternate-fields').hidden=!$('#alternate').checked;$('#errors').textContent='';event('alternate-address',{enabled:$('#alternate').checked});};
const values=()=>({sku:product?.sku,quantity:Number($('#quantity').value),cityId:city?.id,alternate:$('#alternate').checked,street:$('#street').value,note:$('#note').value,total:product&&city?product.price*Number($('#quantity').value)+city.shipping:0});
$('#review').onclick=()=>{const v=values();const missing=[];if(!v.cityId)missing.push('Destination city required');if(!v.quantity||v.quantity<1)missing.push('Quantity must be positive');if(v.alternate&&!v.street.trim())missing.push('Street address required');if(missing.length){$('#errors').textContent=missing.join('; ');event('review-refused',{missing});return;}$('#errors').textContent='';$('#review-details').replaceChildren(...[['Product',product.name+' · '+v.sku],['Quantity',v.quantity],['Destination',city.name],['Street address',v.street],['Delivery note',v.note],['Total',v.total+' synthetic units']].map(([k,v])=>{const p=document.createElement('p');p.textContent=k+': '+v;return p;}));$('#modal').showModal();event('review-opened',v);};
$('#cancel').onclick=()=>$('#modal').close();
$('#confirm').onclick=async()=>{$('#confirm').disabled=true;$('#confirm').textContent='Submitting…';const r=await(await fetch(base+'/order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(values())})).json();if(r.error){$('#confirm').disabled=false;$('#confirm').textContent='Confirm order';$('#review-details').append(document.createTextNode(r.error));return;}$('#modal').close();$('#receipt').textContent='Order '+r.id+' confirmed · '+r.sku+' · quantity '+r.quantity+' · '+city.name+' · total '+r.total+' synthetic units · '+r.street+' · '+r.note;};
search('');
</script></body></html>'''


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/state":
            self.respond(state, "application/json")
            return
        match = re.fullmatch(r"/complex/([a-zA-Z0-9-]+)/(desk|reference|search|cities)", parsed.path)
        if not match:
            self.send_error(404)
            return
        run, action = match.groups()
        current = state.setdefault(run, {"orders": [], "events": [], "pageReads": [], "searchQueries": [], "cityQueries": []})
        if action == "desk":
            current["pageReads"].append(action)
            self.respond(page, "text/html; charset=utf-8")
        elif action == "reference":
            current["pageReads"].append(action)
            self.respond('<!doctype html><html><head><title>Complex Browser QA — delivery reference</title></head><body><h1>Delivery reference</h1><p>Tokyo, Japan · city id tokyo-jp · shipping 300 synthetic units</p><p>Aurora Notebook Limited · SKU AUR-LIMITED · price 1200 synthetic units each</p><p>Quantity 2: 2400 + 300 = 2700 synthetic units</p><p>Reference only; return to the original order desk tab to verify its retained receipt.</p></body></html>', "text/html; charset=utf-8")
        else:
            query = parse_qs(parsed.query).get("q", [""])[0]
            current["searchQueries" if action == "search" else "cityQueries"].append(query)
            time.sleep(0.45 if action == "search" else 0.25)
            self.respond([p for p in (products if action == "search" else cities) if query.lower() in p["name"].lower()], "application/json")

    def do_POST(self):
        match = re.fullmatch(r"/complex/([a-zA-Z0-9-]+)/(event|order)", urlparse(self.path).path)
        if not match:
            self.send_error(404)
            return
        run, action = match.groups()
        current = state.setdefault(run, {"orders": [], "events": [], "pageReads": [], "searchQueries": [], "cityQueries": []})
        data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
        if action == "event":
            current["events"].append(data)
            self.respond({"ok": True}, "application/json")
            return
        time.sleep(0.75)
        p = next((p for p in products if p["sku"] == data.get("sku")), None)
        c = next((c for c in cities if c["id"] == data.get("cityId")), None)
        valid = p and c and isinstance(data.get("quantity"), int) and data["quantity"] > 0 and (not data.get("alternate") or data.get("street", "").strip())
        if not valid or data.get("total") != p["price"] * data["quantity"] + c["shipping"]:
            current["events"].append({"type": "server-refused", "data": data})
            self.respond({"error": "Invalid order"}, "application/json")
            return
        order = {**data, "id": "ORDER-" + str(len(current["orders"]) + 1).zfill(3)}
        current["orders"].append(order)
        self.respond(order, "application/json")

    def respond(self, body, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write((json.dumps(body) if content_type == "application/json" else body).encode())


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("BH_E2E_COMPLEX_PORT", "32024"))), Handler).serve_forever()
