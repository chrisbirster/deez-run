from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "src/storage/store.zig")
text = path.read_text()

import_old = '''const std = @import("std");
const card_mod = @import("../card.zig");'''
import_new = '''const std = @import("std");
const bongo = @import("bongo");
const card_mod = @import("../card.zig");'''
if text.count(import_old) != 1:
    raise SystemExit("expected store std/card imports exactly once")
text = text.replace(import_old, import_new, 1)

old = '''    fn activeDueCardsFromOwned(
        self: *Store,
        allocator: Allocator,
        owned: []catalog_mod.OwnedDueCard,
        limit: usize,
    ) ![]catalog_mod.OwnedDueCard {
        var active: std.ArrayList(catalog_mod.OwnedDueCard) = .empty;
        errdefer {
            for (active.items) |card| card.deinit(allocator);
            active.deinit(allocator);
        }

        var index: usize = 0;
        errdefer {
            for (owned[index..]) |card| card.deinit(allocator);
            allocator.free(owned);
        }
        while (index < owned.len) {
            const card = owned[index];
            if (try self.isCardRetired(card.id)) {
                card.deinit(allocator);
            } else if (active.items.len < limit) {
                active.append(allocator, card) catch |err| {
                    card.deinit(allocator);
                    return err;
                };
            } else {
                card.deinit(allocator);
            }
            index += 1;
        }
        allocator.free(owned);
        return active.toOwnedSlice(allocator);
    }
'''

new = '''    fn bsonCardId(document: []const u8) !card_mod.CardId {
        const value = (try bongo.bson.Reader.get(document, "_id")) orelse return error.MissingField;
        const signed: i64 = switch (value) {
            .int32 => |number| number,
            .int64 => |number| number,
            else => return error.InvalidField,
        };
        return std.math.cast(card_mod.CardId, signed) orelse error.InvalidField;
    }

    fn activeDueCardsFromOwned(
        self: *Store,
        allocator: Allocator,
        owned: []catalog_mod.OwnedDueCard,
        limit: usize,
    ) ![]catalog_mod.OwnedDueCard {
        var active: std.ArrayList(catalog_mod.OwnedDueCard) = .empty;
        errdefer {
            for (active.items) |card| card.deinit(allocator);
            active.deinit(allocator);
        }

        // Mongo retirement state lives in a separate collection. The old path
        // called findOne(retired_cards) once per due card, so a 2,000-card deck
        // needed ~2,000 network round trips before Study could choose card #1.
        // Snapshot the retirement IDs once for this queue build and do the
        // membership test in memory. SQLite keeps its existing indexed lookup.
        var mongo_retired: ?std.AutoHashMap(card_mod.CardId, void) = null;
        defer if (mongo_retired) |*retired| retired.deinit();
        switch (self.*) {
            .sqlite => {},
            .mongodb => |*mongo| {
                var retired = std.AutoHashMap(card_mod.CardId, void).init(allocator);
                errdefer retired.deinit();
                var cursor = try mongo.client.find(
                    mongo.client.databaseName(),
                    "retired_cards",
                    .{},
                    .{},
                );
                defer cursor.deinit();
                while (try cursor.next()) |document| {
                    try retired.put(try bsonCardId(document), {});
                }
                mongo_retired = retired;
            },
        }

        var index: usize = 0;
        errdefer {
            for (owned[index..]) |card| card.deinit(allocator);
            allocator.free(owned);
        }
        while (index < owned.len) {
            const card = owned[index];
            const retired = if (mongo_retired) |*ids|
                ids.contains(card.id)
            else
                try self.isCardRetired(card.id);
            if (retired) {
                card.deinit(allocator);
            } else if (active.items.len < limit) {
                active.append(allocator, card) catch |err| {
                    card.deinit(allocator);
                    return err;
                };
            } else {
                card.deinit(allocator);
            }
            index += 1;
        }
        allocator.free(owned);
        return active.toOwnedSlice(allocator);
    }
'''

if text.count(old) != 1:
    raise SystemExit("expected active due-card filter exactly once")
text = text.replace(old, new, 1)

path.write_text(text)
print(f"patched {path}")
