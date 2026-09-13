from pathlib import Path
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
hosted_path = root / "src/hosted_web.zig"
store_path = root / "src/storage/store.zig"
sqlite_path = root / "src/storage/sqlite.zig"
mongo_path = root / "src/storage/mongodb.zig"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


hosted = hosted_path.read_text()
hosted = replace_once(
    hosted,
    'const storage = @import("storage/root.zig");\n',
    'const storage = @import("storage/root.zig");\nconst study_mod = @import("study.zig");\n',
    "hosted study import",
)

note_response = '''const NoteResponse = struct {
    id: []const u8,
    deck_id: []const u8,
    note_type: []const u8,
    fields: []const []const u8,
    tags: []const []const u8,
    created_at_ms: i64,
    updated_at_ms: i64,
};'''
snapshot_types = note_response + '''

const SnapshotCardResponse = struct {
    id: []const u8,
    deck_id: []const u8,
    front: []const u8,
    note_id: ?[]const u8 = null,
    due_at_ms: ?i64 = null,
    last_reviewed_at_ms: ?i64 = null,
};'''
hosted = replace_once(hosted, note_response, snapshot_types, "snapshot response type")

routes_old = '''    router.get("/api/v1/decks/:id/cards", deckCards, .{});
    router.get("/api/v1/decks/:id/study/next", studyNext, .{});'''
routes_new = '''    router.get("/api/v1/decks/:id/cards", deckCards, .{});
    router.get("/api/v1/decks/:id/snapshot", deckSnapshot, .{});
    router.post("/api/v1/decks/:id/scheduling/reset", resetDeckScheduling, .{});
    router.get("/api/v1/decks/:id/study/next", studyNext, .{});'''
hosted = replace_once(hosted, routes_old, routes_new, "deck reliability routes")
hosted = replace_once(
    hosted,
    '    router.post("/api/v1/cards/:id/reviews", studyReview, .{});\n',
    '    router.post("/api/v1/cards/:id/reviews", studyReview, .{});\n    router.delete("/api/v1/cards/:id/reviews/last", undoLastReview, .{});\n',
    "undo review route",
)

marker = '''fn studyNext(self: *Handler, req: *httpz.Request, res: *httpz.Response) !void {
    const user = (try requireUser(self, req, res)) orelse return;
    const deck_id = parseRouteId(req, res, "id") orelse return;
    if (!try requireOwnedDeck(self, user.id, deck_id, res)) return;
    try web_study.next(self.store, self.io, req, res);
}
'''
insert = r'''fn deckSnapshot(self: *Handler, req: *httpz.Request, res: *httpz.Response) !void {
    const user = (try requireUser(self, req, res)) orelse return;
    const deck_id = parseRouteId(req, res, "id") orelse return;
    if (!try requireOwnedDeck(self, user.id, deck_id, res)) return;

    const owned = (try self.store.getDeck(res.arena, deck_id)) orelse {
        try jsonError(res, 404, "deck_not_found", "Deck not found");
        return;
    };
    const counts = try fastDeckCounts(self, res.arena, deck_id);
    const deck_value = DeckResponse{
        .id = try idText(res.arena, deck_id),
        .name = owned.name,
        .note_count = counts.note_count,
        .card_count = counts.card_count,
        .due_count = counts.due_count,
    };

    const content_store = storage.ContentStore.init(self.store);
    const source_notes = try content_store.notesForDeck(res.arena, deck_id);
    const notes = try res.arena.alloc(NoteResponse, source_notes.len);
    for (source_notes, 0..) |entry, index| {
        const fields = try res.arena.alloc([]const u8, entry.note.fields.len);
        for (entry.note.fields, 0..) |field, field_index| fields[field_index] = field.value;
        var parsed_tags = std.json.parseFromSlice([]const []const u8, res.arena, entry.note.tags_json, .{}) catch {
            try jsonError(res, 500, "invalid_note_tags", "Stored note tags are invalid");
            return;
        };
        defer parsed_tags.deinit();
        notes[index] = .{
            .id = try idText(res.arena, entry.note.id),
            .deck_id = try idText(res.arena, deck_id),
            .note_type = try noteTypeSlug(entry.note.note_type_id),
            .fields = fields,
            .tags = parsed_tags.value,
            .created_at_ms = entry.note.created_at_ms,
            .updated_at_ms = entry.note.updated_at_ms,
        };
    }

    const source_cards = try self.store.cards(res.arena, deck_id);
    const cards = try res.arena.alloc(SnapshotCardResponse, source_cards.len);
    for (source_cards, 0..) |entry, index| {
        const source = try content_store.cardSource(res.arena, entry.id);
        const state = try self.store.getSchedulerState(entry.id);
        cards[index] = .{
            .id = try idText(res.arena, entry.id),
            .deck_id = try idText(res.arena, deck_id),
            .front = entry.question,
            .note_id = if (source) |value| try idText(res.arena, value.note_id) else null,
            .due_at_ms = if (state) |value| value.due_at_ms else null,
            .last_reviewed_at_ms = if (state) |value| value.last_reviewed_at_ms else null,
        };
    }

    try res.json(.{ .deck = deck_value, .notes = notes, .cards = cards }, .{ .emit_null_optional_fields = false });
}

fn resetDeckScheduling(self: *Handler, req: *httpz.Request, res: *httpz.Response) !void {
    const user = (try requireUser(self, req, res)) orelse return;
    const deck_id = parseRouteId(req, res, "id") orelse return;
    if (!try requireOwnedDeck(self, user.id, deck_id, res)) return;

    const cards = try self.store.allCards(res.arena, deck_id);
    for (cards) |entry| {
        try self.store.deleteReviews(entry.id);
        try self.store.clearSchedulerState(entry.id);
    }
    try deckResponse(self, deck_id, res);
}

''' + marker
hosted = replace_once(hosted, marker, insert, "snapshot/reset handlers")

review_marker = '''fn studyReview(self: *Handler, req: *httpz.Request, res: *httpz.Response) !void {
    if (!try requireOwnedCard(self, req, res)) return;
    try web_study.review(self.store, self.io, req, res);
}
'''
review_insert = review_marker + r'''
fn undoLastReview(self: *Handler, req: *httpz.Request, res: *httpz.Response) !void {
    if (!try requireOwnedCard(self, req, res)) return;
    const card_id = parseRouteId(req, res, "id") orelse return;
    if (!try self.store.deleteLastReview(card_id)) {
        try jsonError(res, 409, "no_review_to_undo", "This card has no review to undo");
        return;
    }
    _ = try study_mod.Study.init(self.store).rebuildCardState(res.arena, card_id, nowMs(self.io));
    res.status = 204;
}
'''
hosted = replace_once(hosted, review_marker, review_insert, "undo handler")
hosted_path.write_text(hosted)

store = store_path.read_text()
store_marker = '''    pub fn loadHistory(
        self: *Store,
        allocator: Allocator,
        card_id: card_mod.CardId,
    ) ![]fsrs.HistoryEntry {
        return switch (self.*) {
            .sqlite => |db| db.loadHistory(allocator, card_id),
            .mongodb => |*store| store.loadHistory(allocator, card_id),
        };
    }
'''
store_insert = store_marker + '''
    pub fn deleteLastReview(self: *Store, card_id: card_mod.CardId) !bool {
        return switch (self.*) {
            .sqlite => |db| db.deleteLastReview(card_id),
            .mongodb => |*store| store.deleteLastReview(card_id),
        };
    }

    pub fn deleteReviews(self: *Store, card_id: card_mod.CardId) !void {
        switch (self.*) {
            .sqlite => |db| try db.deleteReviews(card_id),
            .mongodb => |*store| try store.deleteReviews(card_id),
        }
    }
'''
store = replace_once(store, store_marker, store_insert, "store review mutation methods")
store_path.write_text(store)

sqlite = sqlite_path.read_text()
sqlite_marker = '''    pub fn loadHistory(self: *Db, allocator: std.mem.Allocator, card_id: card_mod.CardId) ![]fsrs.HistoryEntry {
        const stmt = try self.prepare("SELECT rating, reviewed_at_ms FROM reviews WHERE card_id = ?1 ORDER BY reviewed_at_ms, id;");
        defer _ = c.sqlite3_finalize(stmt);
        try bindId(stmt, 1, card_id);

        var history: std.ArrayList(fsrs.HistoryEntry) = .empty;
        errdefer history.deinit(allocator);

        while (true) {
            switch (c.sqlite3_step(stmt)) {
                c.SQLITE_ROW => {
                    const rating_value: u8 = @intCast(c.sqlite3_column_int(stmt, 0));
                    try history.append(allocator, .{
                        .rating = try fsrs.Rating.fromValue(rating_value),
                        .reviewed_at_ms = c.sqlite3_column_int64(stmt, 1),
                    });
                },
                c.SQLITE_DONE => break,
                else => return error.SqliteStepFailed,
            }
        }

        return history.toOwnedSlice(allocator);
    }
'''
sqlite_insert = sqlite_marker + '''
    pub fn deleteLastReview(self: *Db, card_id: card_mod.CardId) !bool {
        const stmt = try self.prepare("DELETE FROM reviews WHERE id = (SELECT id FROM reviews WHERE card_id = ?1 ORDER BY reviewed_at_ms DESC, id DESC LIMIT 1);");
        defer _ = c.sqlite3_finalize(stmt);
        try bindId(stmt, 1, card_id);
        try stepDone(stmt);
        return c.sqlite3_changes(self.handle) > 0;
    }

    pub fn deleteReviews(self: *Db, card_id: card_mod.CardId) !void {
        const stmt = try self.prepare("DELETE FROM reviews WHERE card_id = ?1;");
        defer _ = c.sqlite3_finalize(stmt);
        try bindId(stmt, 1, card_id);
        try stepDone(stmt);
    }
'''
sqlite = replace_once(sqlite, sqlite_marker, sqlite_insert, "sqlite review mutation methods")
sqlite_path.write_text(sqlite)

mongo = mongo_path.read_text()
mongo_marker = '''    pub fn loadHistory(
        self: *Store,
        allocator: Allocator,
        card_id: card_mod.CardId,
    ) ![]fsrs.HistoryEntry {
        var cursor = try self.client.find(
            self.database(),
            "reviews",
            .{ .card_id = try idAsI64(card_id) },
            .{ .sort = .{ .reviewed_at_ms = @as(i32, 1), ._id = @as(i32, 1) } },
        );
        defer cursor.deinit();
        var history: std.ArrayList(fsrs.HistoryEntry) = .empty;
        errdefer history.deinit(allocator);
        while (try cursor.next()) |document| {
            const rating_value: u8 = @intCast(try requiredI64(document, "rating"));
            try history.append(allocator, .{
                .rating = try fsrs.Rating.fromValue(rating_value),
                .reviewed_at_ms = try requiredI64(document, "reviewed_at_ms"),
            });
        }
        return history.toOwnedSlice(allocator);
    }
'''
mongo_insert = mongo_marker + '''
    pub fn deleteLastReview(self: *Store, card_id: card_mod.CardId) !bool {
        var cursor = try self.client.find(
            self.database(),
            "reviews",
            .{ .card_id = try idAsI64(card_id) },
            .{ .sort = .{ .reviewed_at_ms = @as(i32, -1), ._id = @as(i32, -1) }, .limit = 1 },
        );
        defer cursor.deinit();
        const document = (try cursor.next()) orelse return false;
        _ = try self.client.deleteOne(self.database(), "reviews", .{ ._id = try requiredI64(document, "_id") });
        return true;
    }

    pub fn deleteReviews(self: *Store, card_id: card_mod.CardId) !void {
        var cursor = try self.client.find(
            self.database(),
            "reviews",
            .{ .card_id = try idAsI64(card_id) },
            .{ .sort = .{ ._id = @as(i32, 1) } },
        );
        defer cursor.deinit();
        while (try cursor.next()) |document| {
            _ = try self.client.deleteOne(self.database(), "reviews", .{ ._id = try requiredI64(document, "_id") });
        }
    }
'''
mongo = replace_once(mongo, mongo_marker, mongo_insert, "mongo review mutation methods")
mongo_path.write_text(mongo)

print("patched hosted snapshot, scheduling reset, and review undo support")
