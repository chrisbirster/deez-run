from pathlib import Path
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
study_path = root / "src/study.zig"
web_path = root / "src/web_study.zig"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


study = study_path.read_text()
study = replace_once(
    study,
    '''pub const SessionOptions = struct {
    /// Null preserves the historical unlimited-new-card behavior.
    new_limit: ?usize = null,
    review_order: ReviewOrder = .due,
    /// A seed explicitly enables shuffling. Null keeps deterministic ordering.
    shuffle_seed: ?u64 = null,
};''',
    '''pub const SessionOptions = struct {
    /// Null preserves the historical unlimited-new-card behavior.
    new_limit: ?usize = null,
    review_order: ReviewOrder = .due,
    /// A seed explicitly enables shuffling. Null keeps deterministic ordering.
    shuffle_seed: ?u64 = null,
    /// Cards excluded for this session only (for example, browser-side bury).
    excluded_card_ids: []const card_mod.CardId = &.{},
};''',
    "session options exclusion",
)
study = replace_once(
    study,
    '''    fn canIntroduceNew(self: Session) bool {
        const limit = self.options.new_limit orelse return true;
        return self.new_seen < limit;
    }
''',
    '''    fn isExcluded(self: Session, card_id: card_mod.CardId) bool {
        return std.mem.indexOfScalar(card_mod.CardId, self.options.excluded_card_ids, card_id) != null;
    }

    fn canIntroduceNew(self: Session) bool {
        const limit = self.options.new_limit orelse return true;
        return self.new_seen < limit;
    }
''',
    "session exclusion helper",
)
study = replace_once(
    study,
    '''        for (due) |card| {
            if (card.due_at_ms == null and !self.canIntroduceNew()) {''',
    '''        for (due) |card| {
            if (self.isExcluded(card.id)) {
                card.deinit(allocator);
                continue;
            }
            if (card.due_at_ms == null and !self.canIntroduceNew()) {''',
    "session exclusion filter",
)
study_path.write_text(study)

web = web_path.read_text()
web = replace_once(
    web,
    '''    var options: study_mod.SessionOptions = .{};
    var new_seen: usize = 0;
''',
    '''    var options: study_mod.SessionOptions = .{};
    var new_seen: usize = 0;
    var excluded_card_ids: std.ArrayList(u64) = .empty;
    defer excluded_card_ids.deinit(res.arena);
''',
    "web exclusion storage",
)
web = replace_once(
    web,
    '''    if (query.get("shuffle_seed")) |text| {
        options.shuffle_seed = std.fmt.parseInt(u64, text, 10) catch {
            try jsonError(res, 400, "invalid_shuffle_seed", "shuffle_seed must be an unsigned integer");
            return;
        };
    }

    var session = study_mod.Session.init(study_mod.Study.init(store), deck_id, options);''',
    '''    if (query.get("shuffle_seed")) |text| {
        options.shuffle_seed = std.fmt.parseInt(u64, text, 10) catch {
            try jsonError(res, 400, "invalid_shuffle_seed", "shuffle_seed must be an unsigned integer");
            return;
        };
    }
    if (query.get("exclude_card_ids")) |text| {
        var parts = std.mem.splitScalar(u8, text, ',');
        while (parts.next()) |part| {
            if (part.len == 0) continue;
            if (excluded_card_ids.items.len >= 2_000) {
                try jsonError(res, 400, "too_many_excluded_cards", "exclude_card_ids supports at most 2000 card IDs");
                return;
            }
            const card_id = std.fmt.parseInt(u64, part, 10) catch {
                try jsonError(res, 400, "invalid_excluded_card", "exclude_card_ids must be comma-separated unsigned integers");
                return;
            };
            try excluded_card_ids.append(res.arena, card_id);
        }
        options.excluded_card_ids = excluded_card_ids.items;
    }

    var session = study_mod.Session.init(study_mod.Study.init(store), deck_id, options);''',
    "web exclusion query",
)
web_path.write_text(web)
print("patched Study session exclusions")
