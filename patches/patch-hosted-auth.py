from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "src/hosted_auth.zig")
text = path.read_text()

old = '''        const user_id = try requiredString(session.bytes, "user_id");
        const user = (try self.findUserById(allocator, user_id)) orelse return error.InvalidSession;
        const refreshed_at_ms = (try optionalI64(session.bytes, "cookie_refreshed_at_ms")) orelse last_seen_at_ms;
'''

new = '''        const session_user_id = try requiredString(session.bytes, "user_id");
        var user = (try self.findUserById(allocator, session_user_id)) orelse return error.InvalidSession;

        // Email is the verified account identity. Older deployments could leave
        // more than one user document for the same verified address, which in
        // turn partitions deck ownership by user id. Always resolve through the
        // canonical auth_emails owner, then union deck ownership from every
        // historical user document with that same email. This makes either an
        // old or a new browser capable of repairing the account on its next
        // authenticated request.
        if (try self.findUserByEmail(allocator, user.email)) |canonical| {
            var duplicates = try self.mongo.client.find(
                self.database(),
                "auth_users",
                .{ .email = canonical.email },
                .{},
            );
            defer duplicates.deinit();
            while (try duplicates.next()) |document| {
                const duplicate_user_id = try requiredString(document, "_id");
                if (std.mem.eql(u8, duplicate_user_id, canonical.id)) continue;

                const legacy_decks = try self.ownedDeckIds(allocator, duplicate_user_id);
                for (legacy_decks) |deck_id| {
                    try self.assignDeck(canonical.id, deck_id, now_ms);
                }
                allocator.free(legacy_decks);
            }

            if (!std.mem.eql(u8, canonical.id, user.id)) {
                var migrated = try self.mongo.client.updateOne(
                    self.database(),
                    "auth_sessions",
                    .{ ._id = token_hash[0..] },
                    q.set(.{ .user_id = canonical.id }),
                    false,
                );
                migrated.deinit();
            }
            user = canonical;
        }

        const refreshed_at_ms = (try optionalI64(session.bytes, "cookie_refreshed_at_ms")) orelse last_seen_at_ms;
'''

count = text.count(old)
if count != 1:
    raise SystemExit(f"expected exactly one hosted session-user resolution block, found {count}")

path.write_text(text.replace(old, new, 1))
print(f"patched {path}")
