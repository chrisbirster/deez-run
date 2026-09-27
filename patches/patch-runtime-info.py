from pathlib import Path
import json
import os
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "src/hosted_web.zig")
text = path.read_text()
run_revision = os.environ.get("DEEZ_RUN_REVISION", "unknown")
core_revision = os.environ.get("DEEZ_CORE_REVISION", "unknown")

def zig_string(value: str) -> str:
    return json.dumps(value)

route = '    router.get("/api/v1/version", versionInfo, .{});\n'
if route not in text:
    raise SystemExit("version route not found")
text = text.replace(route, route + '    router.get("/api/v1/info", info, .{});\n', 1)

version = '''fn versionInfo(_: *Handler, _: *httpz.Request, res: *httpz.Response) !void {
    try res.json(.{ .version = build_options.version, .api_version = "v1" }, .{});
}
'''
if version not in text:
    raise SystemExit("version handler not found")
info = version + f'''
fn info(_: *Handler, _: *httpz.Request, res: *httpz.Response) !void {{
    try res.json(.{{
        .status = "ok",
        .service = "deez.run",
        .version = build_options.version,
        .api_version = "v1",
        .deez_run_revision = {zig_string(run_revision)},
        .deez_core_revision = {zig_string(core_revision)},
    }}, .{{}});
}}
'''
text = text.replace(version, info, 1)

bypass = 'std.mem.eql(u8, req.url.path, "/api/v1/capabilities")'
if text.count(bypass) != 1:
    raise SystemExit(f"public bypass capability marker count={text.count(bypass)}")
text = text.replace(
    bypass,
    'std.mem.eql(u8, req.url.path, "/api/v1/info") or\n                std.mem.eql(u8, req.url.path, "/api/v1/capabilities")',
    1,
)

path.write_text(text)
print(f"patched /api/v1/info with deez-run={run_revision} deez-core={core_revision}")
