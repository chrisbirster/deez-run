from pathlib import Path
import re
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "src/hosted_web.zig")
text = path.read_text()

import_old = '''const std = @import("std");
const httpz = @import("httpz");'''
import_new = '''const std = @import("std");
const bongo = @import("bongo");
const httpz = @import("httpz");'''
if text.count(import_old) != 1:
    raise SystemExit("expected hosted web std/httpz imports exactly once")
text = text.replace(import_old, import_new, 1)

csp_old = "const content_security_policy = \"default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'\";"
csp_new = """const content_security_policy = \"default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'\";
const study_content_security_policy = \"default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'\";"""

csp_count = text.count(csp_old)
if csp_count != 1:
    raise SystemExit(f"expected exactly one hosted CSP declaration, found {csp_count}")
text = text.replace(csp_old, csp_new, 1)

response_old = '''const DeckResponse = struct {
    id: []const u8,
    name: []const u8,
    note_count: usize,
    card_count: usize,
    due_count: usize,
};'''
response_new = response_old + '''

const DeckCounts = struct {
    note_count: usize,
    card_count: usize,
    due_count: usize,
};'''
if text.count(response_old) != 1:
    raise SystemExit("expected DeckResponse declaration exactly once")
text = text.replace(response_old, response_new, 1)

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
text = text.replace(old, new, 1)

marker = '''fn decks(self: *Handler, req: *httpz.Request, res: *httpz.Response) !void {'''
if text.count(marker) != 1:
    raise SystemExit("expected hosted decks handler exactly once")

helpers = r'''fn summaryI64(document: []const u8, field: []const u8) !i64 {
    const value = (try bongo.bson.Reader.get(document, field)) orelse return error.MissingField;
    return switch (value) {
        .int32 => |number| number,
        .int64 => |number| number,
        else => error.InvalidField,
    };
}

// The hosted deck list is latency-sensitive and must not reconstruct every
// note/card or walk review history. Mongo already stores deck_id/due_at_ms on
// cards and generated-card note ids separately, so compute the three summary
// counts with two cursor scans instead of thousands of per-card queries.
fn fastDeckCounts(self: *Handler, allocator: std.mem.Allocator, deck_id: u64) !DeckCounts {
    return switch (self.store.*) {
        .mongodb => |*mongo| blk: {
            const database = mongo.client.databaseName();
            const deck_id_i64: i64 = @intCast(deck_id);
            const now_ms = nowMs(self.io);

            var cards = try mongo.client.find(
                database,
                "cards",
                .{ .deck_id = deck_id_i64 },
                .{},
            );
            defer cards.deinit();

            var card_ids: std.ArrayList(i64) = .empty;
            defer card_ids.deinit(allocator);
            var card_count: usize = 0;
            var due_count: usize = 0;
            while (try cards.next()) |document| {
                const card_id = try summaryI64(document, "_id");
                try card_ids.append(allocator, card_id);
                card_count += 1;
                if (try summaryI64(document, "due_at_ms") <= now_ms) due_count += 1;
            }

            var note_ids: std.ArrayList(i64) = .empty;
            defer note_ids.deinit(allocator);
            if (card_ids.items.len != 0) {
                var generated = try mongo.client.find(database, "generated_cards", .{}, .{});
                defer generated.deinit();
                while (try generated.next()) |document| {
                    const card_id = try summaryI64(document, "_id");
                    if (std.mem.indexOfScalar(i64, card_ids.items, card_id) == null) continue;
                    const note_id = try summaryI64(document, "note_id");
                    if (std.mem.indexOfScalar(i64, note_ids.items, note_id) == null) {
                        try note_ids.append(allocator, note_id);
                    }
                }
            }

            break :blk .{
                .note_count = note_ids.items.len,
                .card_count = card_count,
                .due_count = due_count,
            };
        },
        .sqlite => blk: {
            const deck_stats = try self.store.stats(nowMs(self.io), deck_id);
            const notes = try storage.ContentStore.init(self.store).notesForDeck(allocator, deck_id);
            break :blk .{
                .note_count = notes.len,
                .card_count = deck_stats.card_count,
                .due_count = deck_stats.due_count,
            };
        },
    };
}

'''
text = text.replace(marker, helpers + marker, 1)

slow_counts_pattern = re.compile(
    r'(?m)^(?P<indent>[ \t]*)const deck_stats = try self\.store\.stats\(nowMs\(self\.io\), deck_id\);\n'
    r'(?P=indent)const notes = try storage\.ContentStore\.init\(self\.store\)\.notesForDeck\(res\.arena, deck_id\);$'
)
slow_matches = list(slow_counts_pattern.finditer(text))
if len(slow_matches) != 2:
    raise SystemExit(f"expected two slow hosted deck summary blocks, found {len(slow_matches)}")
text = slow_counts_pattern.sub(
    lambda match: f'{match.group("indent")}const counts = try fastDeckCounts(self, res.arena, deck_id);',
    text,
)

# Only DeckResponse construction uses owned.name immediately before the three
# summary fields. The SQLite fallback inside fastDeckCounts has the same field
# names but must remain based on deck_stats/notes.
summary_fields_pattern = re.compile(
    r'(?m)^(?P<indent>[ \t]*)\.name = owned\.name,\n'
    r'(?P=indent)\.note_count = notes\.len,\n'
    r'(?P=indent)\.card_count = deck_stats\.card_count,\n'
    r'(?P=indent)\.due_count = deck_stats\.due_count,$'
)
summary_field_matches = list(summary_fields_pattern.finditer(text))
if len(summary_field_matches) != 2:
    raise SystemExit(f"expected two owned deck summary field groups, found {len(summary_field_matches)}")
text = summary_fields_pattern.sub(
    lambda match: (
        f'{match.group("indent")}.name = owned.name,\n'
        f'{match.group("indent")}.note_count = counts.note_count,\n'
        f'{match.group("indent")}.card_count = counts.card_count,\n'
        f'{match.group("indent")}.due_count = counts.due_count,'
    ),
    text,
)

path.write_text(text)
print(f"patched {path}")
