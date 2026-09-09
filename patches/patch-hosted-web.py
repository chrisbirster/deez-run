from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "src/hosted_web.zig")
text = path.read_text()

csp_old = "const content_security_policy = \"default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'\";"
csp_new = """const content_security_policy = \"default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'\";
const study_content_security_policy = \"default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'\";"""

csp_count = text.count(csp_old)
if csp_count != 1:
    raise SystemExit(f"expected exactly one hosted CSP declaration, found {csp_count}")
text = text.replace(csp_old, csp_new, 1)

header_call_old = "        applySecurityHeaders(res);\n"
header_call_new = "        applySecurityHeaders(req, res);\n"
header_call_count = text.count(header_call_old)
if header_call_count != 2:
    raise SystemExit(f"expected exactly two security-header calls, found {header_call_count}")
text = text.replace(header_call_old, header_call_new)

headers_old = '''fn applySecurityHeaders(res: *httpz.Response) void {\n    res.header("Content-Security-Policy", content_security_policy);\n    res.header("Cross-Origin-Opener-Policy", "same-origin");\n    res.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");\n    res.header("Referrer-Policy", "no-referrer");\n    res.header("X-Content-Type-Options", "nosniff");\n    res.header("X-Frame-Options", "DENY");\n}\n'''
headers_new = '''fn isStudyDocumentPath(path_text: []const u8) bool {\n    const prefix = "/app/decks/";\n    const suffix = "/study";\n    if (!std.mem.startsWith(u8, path_text, prefix) or !std.mem.endsWith(u8, path_text, suffix)) return false;\n    if (path_text.len <= prefix.len + suffix.len) return false;\n    const deck_id = path_text[prefix.len .. path_text.len - suffix.len];\n    return deck_id.len > 0 and std.mem.indexOfScalar(u8, deck_id, '/') == null;\n}\n\nfn applySecurityHeaders(req: *httpz.Request, res: *httpz.Response) void {\n    const policy = if (req.method == .GET and isStudyDocumentPath(req.url.path))\n        study_content_security_policy\n    else\n        content_security_policy;\n    res.header("Content-Security-Policy", policy);\n    res.header("Cross-Origin-Opener-Policy", "same-origin");\n    res.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");\n    res.header("Referrer-Policy", "no-referrer");\n    res.header("X-Content-Type-Options", "nosniff");\n    res.header("X-Frame-Options", "DENY");\n}\n'''

headers_count = text.count(headers_old)
if headers_count != 1:
    raise SystemExit(f"expected exactly one security-header function, found {headers_count}")
text = text.replace(headers_old, headers_new, 1)

old = '''        self.store_mutex.lockUncancelable(self.io);\n        defer self.store_mutex.unlock(self.io);\n        try action(self, req, res);\n'''

new = '''        // Routes that do not use deck/card storage must remain available even\n        // if a storage-backed request is blocked. Hosted auth has its own\n        // MongoDB client, so sign-in/session routes can safely bypass the\n        // storage mutex alongside health checks and SPA/static requests.\n        const bypass_store_lock =\n            std.mem.startsWith(u8, req.url.path, "/api/v1/auth/") or\n            (req.method == .GET and (\n                !std.mem.startsWith(u8, req.url.path, "/api/") or\n                std.mem.eql(u8, req.url.path, "/api/v1/health") or\n                std.mem.eql(u8, req.url.path, "/api/v1/version") or\n                std.mem.eql(u8, req.url.path, "/api/v1/capabilities")\n            ));\n        if (bypass_store_lock) {\n            try action(self, req, res);\n            return;\n        }\n\n        self.store_mutex.lockUncancelable(self.io);\n        defer self.store_mutex.unlock(self.io);\n        try action(self, req, res);\n'''

count = text.count(old)
if count != 1:
    raise SystemExit(f"expected exactly one hosted store-lock block, found {count}")

path.write_text(text.replace(old, new, 1))
print(f"patched {path}")
