from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "src/hosted_web.zig")
text = path.read_text()

old = '''        self.store_mutex.lockUncancelable(self.io);\n        defer self.store_mutex.unlock(self.io);\n        try action(self, req, res);\n'''

new = '''        // Public read-only routes do not touch the store and must remain\n        // available even if a storage-backed request is blocked. In\n        // particular, Fly health checks and SPA/static asset requests should\n        // never queue behind MongoDB work held under the store mutex.\n        const bypass_store_lock = req.method == .GET and (\n            !std.mem.startsWith(u8, req.url.path, "/api/") or\n            std.mem.eql(u8, req.url.path, "/api/v1/health") or\n            std.mem.eql(u8, req.url.path, "/api/v1/version") or\n            std.mem.eql(u8, req.url.path, "/api/v1/capabilities")\n        );\n        if (bypass_store_lock) {\n            try action(self, req, res);\n            return;\n        }\n\n        self.store_mutex.lockUncancelable(self.io);\n        defer self.store_mutex.unlock(self.io);\n        try action(self, req, res);\n'''

count = text.count(old)
if count != 1:
    raise SystemExit(f"expected exactly one hosted store-lock block, found {count}")

path.write_text(text.replace(old, new, 1))
print(f"patched {path}")
