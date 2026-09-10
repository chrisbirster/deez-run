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
        // a long-lived session pointing at a non-canonical user document while
        // a later magic-link login resolved through auth_emails to a different
        // user id for the same address. Before serving any authenticated route,
        // converge that session onto the canonical email owner and union the
        // old user's deck ownership into it. This preserves data from both
        // historical identities instead of making two devices look like two
        // separate accounts.
        if (try self.findUserByEmail(allocator, user.email)) |canonical| {
            if (!std.mem.eql(u8, canonical.id, user.id)) {
                const legacy_decks = try self.ownedDeckIds(allocator, user.id);
                defer allocator.free(legacy_decks);
                for (legacy_decks) |deck_id| {
                    try self.assignDeck(canonical.id, deck_id, now_ms);
                }

                var migrated = try self.mongo.client.updateOne(
                    self.database(),
                    "auth_sessions",
                    .{ ._id = token_hash[0..] },
                    q.set(.{ .user_id = canonical.id }),
                    false,
                );
                migrated.deinit();
                user = canonical;
            }
        }

        const refreshed_at_ms = (try optionalI64(session.bytes, "cookie_refreshed_at_ms")) orelse last_seen_at_ms;
'''

count = text.count(old)
if count != 1:
    raise SystemExit(f"expected exactly one hosted session-user resolution block, found {count}")

path.write_text(text.replace(old, new, 1))
print(f"patched {path}")
