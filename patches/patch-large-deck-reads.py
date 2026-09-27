from pathlib import Path
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
hosted_path = root / "src/hosted_web.zig"
text = hosted_path.read_text()

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)

create_note_marker = 'fn createNote(self: *Handler, req: *httpz.Request, res: *httpz.Response) !void {'
deck_notes_start = text.index('fn deckNotes(self: *Handler, req: *httpz.Request, res: *httpz.Response) !void {')
create_note_start = text.index(create_note_marker, deck_notes_start)
old_deck_notes = text[deck_notes_start:create_note_start]

helpers_and_deck_notes = r'''fn largeReadString(document: []const u8, field: []const u8) ![]const u8 {
    const value = (try bongo.bson.Reader.get(document, field)) orelse return error.MissingField;
    return switch (value) {
        .string => |text| text,
        else => error.InvalidField,
    };
}

fn largeReadOptionalI64(document: []const u8, field: []const u8) !?i64 {
    const value = (try bongo.bson.Reader.get(document, field)) orelse return null;
    return switch (value) {
        .int32 => |number| number,
        .int64 => |number| number,
        .null_value => null,
        else => error.InvalidField,
    };
}

fn mongoActiveCardIds(self: *Handler, allocator: std.mem.Allocator, deck_id: u64) !std.AutoHashMap(i64, void) {
    var retired = std.AutoHashMap(i64, void).init(allocator);
    defer retired.deinit();
    const mongo = switch (self.store.*) {
        .mongodb => |*value| value,
        .sqlite => unreachable,
    };
    const database = mongo.client.databaseName();

    var retired_cursor = try mongo.client.find(database, "retired_cards", .{}, .{});
    defer retired_cursor.deinit();
    while (try retired_cursor.next()) |document| {
        try retired.put(try summaryI64(document, "_id"), {});
    }

    var active = std.AutoHashMap(i64, void).init(allocator);
    errdefer active.deinit();
    var cards = try mongo.client.find(
        database,
        "cards",
        .{ .deck_id = @as(i64, @intCast(deck_id)) },
        .{},
    );
    defer cards.deinit();
    while (try cards.next()) |document| {
        const card_id = try summaryI64(document, "_id");
        if (!retired.contains(card_id)) try active.put(card_id, {});
    }
    return active;
}

fn mongoDeckNoteSummaries(self: *Handler, allocator: std.mem.Allocator, deck_id: u64) ![]NoteSummaryResponse {
    const mongo = switch (self.store.*) {
        .mongodb => |*value| value,
        .sqlite => unreachable,
    };
    const database = mongo.client.databaseName();
    var card_ids = try mongoActiveCardIds(self, allocator, deck_id);
    defer card_ids.deinit();

    var note_counts = std.AutoHashMap(i64, usize).init(allocator);
    defer note_counts.deinit();
    var generated = try mongo.client.find(database, "generated_cards", .{}, .{});
    defer generated.deinit();
    while (try generated.next()) |document| {
        const card_id = try summaryI64(document, "_id");
        if (!card_ids.contains(card_id)) continue;
        const note_id = try summaryI64(document, "note_id");
        const entry = try note_counts.getOrPut(note_id);
        if (!entry.found_existing) entry.value_ptr.* = 0;
        entry.value_ptr.* += 1;
    }

    var result: std.ArrayList(NoteSummaryResponse) = .empty;
    errdefer result.deinit(allocator);
    var notes = try mongo.client.find(database, "notes", .{}, .{});
    defer notes.deinit();
    while (try notes.next()) |document| {
        const note_id = try summaryI64(document, "_id");
        const card_count = note_counts.get(note_id) orelse continue;
        const fields_json = try largeReadString(document, "fields_json");
        var fields = try std.json.parseFromSlice([]content.FieldValue, allocator, fields_json, .{});
        defer fields.deinit();
        const preview = if (fields.value.len == 0) "" else try allocator.dupe(u8, fields.value[0].value);
        try result.append(allocator, .{
            .id = try idText(allocator, @intCast(note_id)),
            .deck_id = try idText(allocator, deck_id),
            .note_type = try noteTypeSlug(@intCast(try summaryI64(document, "note_type_id"))),
            .preview = preview,
            .card_count = card_count,
            .updated_at_ms = try summaryI64(document, "updated_at_ms"),
        });
    }

    std.mem.sort(NoteSummaryResponse, result.items, {}, struct {
        fn lessThan(_: void, left: NoteSummaryResponse, right: NoteSummaryResponse) bool {
            if (left.updated_at_ms == right.updated_at_ms) return std.mem.lessThan(u8, left.id, right.id);
            return left.updated_at_ms > right.updated_at_ms;
        }
    }.lessThan);
    return result.toOwnedSlice(allocator);
}

fn deckNotes(self: *Handler, req: *httpz.Request, res: *httpz.Response) !void {
    const user = (try requireUser(self, req, res)) orelse return;
    const deck_id = parseRouteId(req, res, "id") orelse return;
    if (!try requireOwnedDeck(self, user.id, deck_id, res)) return;

    switch (self.store.*) {
        .mongodb => {
            // The legacy ContentStore path performed one generated-card lookup
            // per card plus one note lookup per distinct note. Large decks could
            // therefore require thousands of Mongo round trips while holding the
            // hosted storage lock. Scan each collection once instead.
            const result = try mongoDeckNoteSummaries(self, res.arena, deck_id);
            try res.json(result, .{});
        },
        .sqlite => {
            const notes = try storage.ContentStore.init(self.store).notesForDeck(res.arena, deck_id);
            const result = try res.arena.alloc(NoteSummaryResponse, notes.len);
            for (notes, 0..) |entry, index| {
                result[index] = .{
                    .id = try idText(res.arena, entry.note.id),
                    .deck_id = try idText(res.arena, deck_id),
                    .note_type = try noteTypeSlug(entry.note.note_type_id),
                    .preview = if (entry.note.fields.len == 0) "" else entry.note.fields[0].value,
                    .card_count = entry.card_count,
                    .updated_at_ms = entry.note.updated_at_ms,
                };
            }
            try res.json(result, .{});
        },
    }
}

'''
text = text[:deck_notes_start] + helpers_and_deck_notes + text[create_note_start:]

snapshot_start = text.index('fn deckSnapshot(self: *Handler, req: *httpz.Request, res: *httpz.Response) !void {')
reset_start = text.index('fn resetDeckScheduling(self: *Handler, req: *httpz.Request, res: *httpz.Response) !void {', snapshot_start)
old_snapshot = text[snapshot_start:reset_start]

new_snapshot = r'''fn deckSnapshot(self: *Handler, req: *httpz.Request, res: *httpz.Response) !void {
    const user = (try requireUser(self, req, res)) orelse return;
    const deck_id = parseRouteId(req, res, "id") orelse return;
    if (!try requireOwnedDeck(self, user.id, deck_id, res)) return;

    const owned = (try self.store.getDeck(res.arena, deck_id)) orelse {
        try jsonError(res, 404, "deck_not_found", "Deck not found");
        return;
    };

    switch (self.store.*) {
        .mongodb => |*mongo| {
            // Build a large-deck snapshot with collection scans instead of the
            // old per-card cardSource/getSchedulerState N+1 query pattern.
            const database = mongo.client.databaseName();
            var retired = std.AutoHashMap(i64, void).init(res.arena);
            defer retired.deinit();
            var retired_cursor = try mongo.client.find(database, "retired_cards", .{}, .{});
            defer retired_cursor.deinit();
            while (try retired_cursor.next()) |document| {
                try retired.put(try summaryI64(document, "_id"), {});
            }

            var cards: std.ArrayList(SnapshotCardResponse) = .empty;
            var card_index = std.AutoHashMap(i64, usize).init(res.arena);
            defer card_index.deinit();
            var due_count: usize = 0;
            const now_ms = nowMs(self.io);
            var source_cards = try mongo.client.find(
                database,
                "cards",
                .{ .deck_id = @as(i64, @intCast(deck_id)) },
                .{ .sort = .{ ._id = @as(i32, 1) } },
            );
            defer source_cards.deinit();
            while (try source_cards.next()) |document| {
                const card_id = try summaryI64(document, "_id");
                if (retired.contains(card_id)) continue;
                const top_due = try summaryI64(document, "due_at_ms");
                if (top_due <= now_ms) due_count += 1;

                var due_at_ms: ?i64 = null;
                var last_reviewed: ?i64 = null;
                if (try bongo.bson.Reader.get(document, "scheduler_state")) |value| {
                    if (value == .document) {
                        due_at_ms = try largeReadOptionalI64(value.document, "due_at_ms");
                        last_reviewed = try largeReadOptionalI64(value.document, "last_reviewed_at_ms");
                    }
                }
                const index = cards.items.len;
                try cards.append(res.arena, .{
                    .id = try idText(res.arena, @intCast(card_id)),
                    .deck_id = try idText(res.arena, deck_id),
                    .front = try res.arena.dupe(u8, try largeReadString(document, "question")),
                    .note_id = null,
                    .due_at_ms = due_at_ms,
                    .last_reviewed_at_ms = last_reviewed,
                });
                try card_index.put(card_id, index);
            }

            var note_counts = std.AutoHashMap(i64, usize).init(res.arena);
            defer note_counts.deinit();
            var generated = try mongo.client.find(database, "generated_cards", .{}, .{});
            defer generated.deinit();
            while (try generated.next()) |document| {
                const card_id = try summaryI64(document, "_id");
                const index = card_index.get(card_id) orelse continue;
                const note_id = try summaryI64(document, "note_id");
                cards.items[index].note_id = try idText(res.arena, @intCast(note_id));
                const count = try note_counts.getOrPut(note_id);
                if (!count.found_existing) count.value_ptr.* = 0;
                count.value_ptr.* += 1;
            }

            var notes: std.ArrayList(NoteResponse) = .empty;
            var source_notes = try mongo.client.find(database, "notes", .{}, .{});
            defer source_notes.deinit();
            while (try source_notes.next()) |document| {
                const note_id = try summaryI64(document, "_id");
                if (!note_counts.contains(note_id)) continue;

                const fields_json = try largeReadString(document, "fields_json");
                var parsed_fields = try std.json.parseFromSlice([]content.FieldValue, res.arena, fields_json, .{});
                defer parsed_fields.deinit();
                const fields = try res.arena.alloc([]const u8, parsed_fields.value.len);
                for (parsed_fields.value, 0..) |field, field_index| {
                    fields[field_index] = try res.arena.dupe(u8, field.value);
                }

                const tags_json = try largeReadString(document, "tags_json");
                var parsed_tags = try std.json.parseFromSlice([]const []const u8, res.arena, tags_json, .{});
                defer parsed_tags.deinit();
                const tags = try res.arena.alloc([]const u8, parsed_tags.value.len);
                for (parsed_tags.value, 0..) |tag, tag_index| tags[tag_index] = try res.arena.dupe(u8, tag);

                try notes.append(res.arena, .{
                    .id = try idText(res.arena, @intCast(note_id)),
                    .deck_id = try idText(res.arena, deck_id),
                    .note_type = try noteTypeSlug(@intCast(try summaryI64(document, "note_type_id"))),
                    .fields = fields,
                    .tags = tags,
                    .created_at_ms = try summaryI64(document, "created_at_ms"),
                    .updated_at_ms = try summaryI64(document, "updated_at_ms"),
                });
            }

            const deck_value = DeckResponse{
                .id = try idText(res.arena, deck_id),
                .name = owned.name,
                .note_count = notes.items.len,
                .card_count = cards.items.len,
                .due_count = due_count,
            };
            try res.json(.{ .deck = deck_value, .notes = notes.items, .cards = cards.items }, .{ .emit_null_optional_fields = false });
        },
        .sqlite => {
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
        },
    }
}

'''
text = text[:snapshot_start] + new_snapshot + text[reset_start:]

hosted_path.write_text(text)
print("patched Mongo large-deck note and snapshot reads to bounded collection scans")
