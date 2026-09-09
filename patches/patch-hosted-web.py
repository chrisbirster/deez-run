from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "src/hosted_web.zig")
text = path.read_text()

csp_old = "const content_security_policy = \"default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'\";"
csp_new = "const content_security_policy = \"default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'\";"

csp_count = text.count(csp_old)
if csp_count != 1:
    raise SystemExit(f"expected exactly one hosted CSP declaration, found {csp_count}")
text = text.replace(csp_old, csp_new, 1)

old = '''        self.store_mutex.lockUncancelable(self.io);\n        defer self.store_mutex.unlock(self.io);\n        try action(self, req, res);\n'''

new = '''        // Routes that do not use deck/card storage must remain available even\n        // if a storage-backed request is blocked. Hosted auth has its own\n        // MongoDB client, so sign-in/session routes can safely bypass the\n        // storage mutex alongside health checks and SPA/static requests.\n        const bypass_store_lock =\n            std.mem.startsWith(u8, req.url.path, "/api/v1/auth/") or\n            (req.method == .GET and (\n                !std.mem.startsWith(u8, req.url.path, "/api/") or\n                std.mem.eql(u8, req.url.path, "/api/v1/health") or\n                std.mem.eql(u8, req.url.path, "/api/v1/version") or\n                std.mem.eql(u8, req.url.path, "/api/v1/capabilities")\n            ));\n        if (bypass_store_lock) {\n            try action(self, req, res);\n            return;\n        }\n\n        self.store_mutex.lockUncancelable(self.io);\n        defer self.store_mutex.unlock(self.io);\n        try action(self, req, res);\n'''

count = text.count(old)
if count != 1:
    raise SystemExit(f"expected exactly one hosted store-lock block, found {count}")

path.write_text(text.replace(old, new, 1))
print(f"patched {path}")
