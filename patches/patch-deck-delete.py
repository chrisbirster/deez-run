from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "src/hosted_web.zig")
text = path.read_text()
old = '''fn deleteDeck(self: *Handler, req: *httpz.Request, res: *httpz.Response) !void {
    const user = (try requireUser(self, req, res)) orelse return;
    const deck_id = parseRouteId(req, res, "id") orelse return;
    if (!try requireOwnedDeck(self, user.id, deck_id, res)) return;
    try self.store.deleteDeck(deck_id);
    res.status = 204;
}
'''
new = '''fn deleteDeck(self: *Handler, req: *httpz.Request, res: *httpz.Response) !void {
    const user = (try requireUser(self, req, res)) orelse return;
    const deck_id = parseRouteId(req, res, "id") orelse return;
    if (!try requireOwnedDeck(self, user.id, deck_id, res)) return;

    // The hosted UI requires an explicit confirmation before this request.
    // Remove scheduler/review history first so Store.deleteDeck can safely
    // remove a studied deck instead of failing with ReviewHistoryExists.
    const cards = try self.store.allCards(res.arena, deck_id);
    for (cards) |entry| {
        try self.store.deleteReviews(entry.id);
        try self.store.clearSchedulerState(entry.id);
    }
    try self.store.deleteDeck(deck_id);
    res.status = 204;
}
'''
if text.count(old) != 1:
    raise SystemExit(f"expected hosted deleteDeck exactly once, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
print(f"patched {path}")
