# Wolof-first coaching messages

## What will change
- Add one fixed bilingual template module for every coaching label, theme, topic, action, limit, empty, continuation, and unavailable message.
- Make `COACH` and `COACH MORE` return Wolof by default; add `COACH EN` and `COACH MORE EN` for equivalent English output.
- Add the required Wolof machine-translation warning plus the English warning to every Wolof coaching message.
- Update champion help and the assistant coaching tool so Wolof is the default and English is available on request.
- Preserve the current 24-hour cache, real-data-only behavior, counts, message cap, and one-message command behavior.

## Translation and verification
- Use Lovable AI once during implementation to translate the fixed English templates into plain Latin-script Wolof.
- Back-translate each Wolof template once, compare placeholders and meaning, and mark any drift beside that constant.
- Store only the reviewed fixed text in source; runtime rendering will perform placeholder substitution without an AI call.

## Technical details
- Refactor the pure formatter to accept `wo | en`, deriving action sentences from stored counts/themes rather than persisted English action prose.
- Keep first-page and `COACH MORE` pagination deterministic, with Wolof under 1500 characters and English under 1400.
- Add tests ensuring every template exists in both languages, placeholders and digits match, all theme/topic variants render, limits hold, both languages preserve identical numbers, and rendering performs no AI call.
- Run the TypeScript check and all tests. Testing will not send WhatsApp messages.

## Assumption
- `COACH MORE EN` returns the English continuation directly, while the assistant chooses English coaching when the champion explicitly asks for English.
