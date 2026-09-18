# Status

Living record of where Higherway v2 stands. Update it in the same change as the work.

**Updated:** 2026-09-17, late
**Now:** v2 is live in production. The ingestion pipeline is connected end to end
for the first time, and Drive sync is built but switched off. Start at
**Resume here**.
**Branch:** work on `v2` and open a PR into `main`. Vercel builds `main`.

---

## Resume here

Read this first when coming back. Everything below it is history and reasoning.

### Where it stopped

- **Production runs `main`**, built by Vercel. v2 was merged in PR #5 (`f5624b2`).
- **`v2` is well ahead of `main` now** — A, B, C and D below, plus the earlier
  docs commits. `git log main..v2` lists them. The working tree is clean and the
  full gate passes: lint, typecheck, 282 tests, build.
- **Nothing here has been deployed.** Everything below was verified on this
  machine against the live database and the real bucket; the Trigger tasks have
  not run on a deployed worker.

### Check these first — only the owner can

1. **Deploy the Trigger tasks, and watch the first run.** There are four now,
   chained: `process-material` → `read-material` → `enrich-material`, plus
   `sync-drive`. The one thing a deploy has to prove is that the three new
   externals load — `@huggingface/transformers`, `onnxruntime-node` and
   `tesseract.js`. A missing external **builds cleanly and fails at runtime**,
   which is the trap `trigger.config.ts` has always named for `mupdf` and
   `sharp`.
2. **Add a photographed PDF in production, end to end.** This is now the check
   that proves the whole pipeline: it should arrive, render, be *read by
   tesseract on the server*, be embedded, be scanned against the archive, and
   land in review with topic suggestions on its page. Before today it would have
   arrived with no searchable text at all.
3. **Is CI green?** The build prerenders from the database, so it needs the
   repository secret `DATABASE_URL`.
4. **Two Owner decisions are waiting**, both recorded below rather than assumed:
   the Google service account for Drive sync (Viewer on the folder, nothing
   more), and whether to write one-line descriptions for the 46 topics that have
   none — that is the cheapest improvement available to topic suggestions.

### Two bugs found by the owner on 2026-09-17, both fixed

1. **The topic picker could not be opened in the add drawer.** The drawer is a
   `<dialog>` opened with `showModal()`, which puts it in the browser's **top
   layer**; the combobox popup portalled to `<body>`, which renders *underneath*
   the top layer — invisible and inert to clicks. It is not a `z-index` problem
   and no `z-index` would have fixed it: the top layer sits outside that system
   entirely. The popup now portals into the nearest `<dialog>`, found from the
   trigger rather than passed in, so no call site has to know whether it happens
   to be inside a drawer.

2. **"The connection failed" on every upload — and it was never a code bug.**
   The **bucket has no CORS policy**. A browser PUT carrying
   `Content-Type: application/pdf` is not a simple request, so a preflight
   `OPTIONS` goes first, and a bucket with no rules answers it **403**. The PUT
   is never sent and the page can only report a failed connection.

   Which means **uploading from a browser has never worked**, from the day it was
   written — consistent with this file recording that the admin area had never
   been clicked. `pnpm r2:cors` writes the rules and is documented in the
   RUNBOOK. Reading was never affected: page images and downloads come from the
   custom domain as plain GETs with no preflight, which is why the public site
   has always been fine.

   **Needs an R2 token with bucket-settings permission.** An "Object Read & Write"
   token gets `AccessDenied` — the existing one does — so either issue an Admin
   Read & Write token or set the same rules in the Cloudflare dashboard.

### Also asked for on 2026-09-17, and done

- [x] **Authors are picked, not retyped.** `AuthorSelect` offers every name
      already in use with a count, and adds a new one inline when none matches.
      It matters more than convenience: the library filters authors by **exact**
      match — a chip click must not make "Rev. Darrel Lee" also collect "Darrel
      Lee Jr" — so "Rev Darrel Lee" and "Rev. Darrel Lee" would be two authors
      with half the materials each and neither findable from the other.

      Unlike a topic, anyone may add one and nothing confirms: an author is text
      on one material, not a shared entity with a public URL, so getting it wrong
      costs an edit. Clearing is a first-class action, because most of this
      archive is unattributed, and it stores `null` rather than `""`.

      On the add page **and** the edit drawer, from `adminAuthors()` — which
      counts unpublished materials too, unlike the public `authorList`. An editor
      needs to see a name used yesterday on something still in review, or they
      will type it again and spell it differently.
- [x] **Adding is a page; editing stays a drawer.** The owner's call and the
      right one. A drawer was right when adding took one file and four fields; a
      queue of up to sixty with uploads in flight is a different thing. It cannot
      be dismissed while it works, it has no address, and being a modal `<dialog>`
      it sits in the browser's top layer — which is what broke the topic picker
      inside it. Editing really is one material and a handful of fields, so it
      stays where it is.

      `AddMaterialDrawer` is deleted. `/admin/materials` links to
      `/admin/materials/new`, which already rendered the same form. Leaving
      mid-upload now asks, because a page cannot refuse the back button the way a
      drawer refused Escape.

**A regression caught by running it, worth recording.** The first version of the
dialog fix returned `null` when there was no dialog, and **Base UI reads an
explicit `container={null}` as "nowhere", not "the default"**. The popup mounted
into nothing: `aria-expanded` flipped to true, no listbox rendered, and the
control looked dead — in exactly the way it looks when it is hidden *under* a
dialog. So the fix for the picker inside the drawer broke every picker outside
one, including the material page, and the two failures are indistinguishable by
eye. It returns `undefined` now. Verified in a browser both ways round.

- [x] **Vision falls back rather than failing or overspending.** Asked for
      directly. Its free tier is 1,000 pages a month against this archive's ~35,
      so it should never be reached — but "should never" is not a plan, and being
      wrong means either a surprise bill or a page stored with no text.

      A quota refusal (429, or 403 for a disabled API or missing billing account,
      or a 200 carrying a quota message) falls through to tesseract for that page
      and the run continues. An **ordinary** failure does not: a dropped
      connection or a corrupt file surfaces and is retried, because silently
      downgrading every page over one timeout would leave the archive read at
      90–95% with nothing recording why. `OcrQuotaError` is its own type so that
      distinction is narrow rather than a message match, and four tests cover it,
      including the case that must *not* fall back.

      **The stronger protection is not in this codebase**: a hard quota limit on
      the Cloud Vision API in the Google Cloud console. Google enforcing it cannot
      be bypassed by a bug here. Both are in the RUNBOOK.

### A third bug the owner found, and the design flaw behind it

**Two uploads said "Uploaded" and then vanished completely.** Measured rather
than guessed: both files are in `r2://staging/` (950,841 bytes each — the same
file twice), and **no material row was created for either**. So the CORS fix
worked and the PUT succeeded; what never happened is the Trigger run.

The immediate cause is that no worker is running these tasks yet. The reason it
was *invisible* is a design flaw worth naming:

**The material row was created inside the background task.** So until a worker
picked the run up, the material did not exist — not as a draft, not as a
placeholder, nothing. There was no screen that could have shown it, because
there was nothing to show. The form's "it is being read now" was a claim about
work that had not started and might never start.

`materialStatus` has always declared `staged` as "in `r2://staging/`, nothing
else done yet" — **stage 1 of the pipeline was designed and never built.** It is
built now:

- `stageMaterial` creates the row the moment the bytes land, as `staged`, with
  its topics and an audit entry. The task **adopts** that row rather than
  inserting a second one.
- A duplicate or an unreadable file now marks the row **`rejected` with the
  reason in the trail**, which the materials list already surfaces in its "Last
  change" column. Re-uploading a file the archive holds says so on its own row;
  before, it said nothing anywhere.
- A new **In progress** filter shows `staged`, `processing` and `rejected`
  together — the states that previously had no way to be seen at all.
- It lives in `server/materials/stage.ts`, not in `services/uploads.ts`, because
  a `"use server"` module's exports are browser-callable actions and Drive sync
  needs the same function.

**Left over from the incident:** two orphaned objects in `r2://staging/` with no
row pointing at them, from before this change. Harmless, ~1.9 MB, and nothing
cleans staging up yet.

### Ranked search — done 2026-09-18

The library matched with `ilike '%term%'` and sorted by date. "prayer" returned
**345 of 566** materials with a material *about* prayer sorting below one that
mentions it once, purely because it was older. A result set that is 61% of the
archive in no particular order is not a search.

Four retrievals fused by **reciprocal rank** — chunk full text, title/author/
summary full text, fuzzy titles, topic names — with the old substring match kept
as a fifth. RRF rather than adding scores: `ts_rank` and trigram `similarity` are
different quantities on different scales, and summing them lets whichever runs
larger win.

Measured on the live archive, before → after:

| Query | Before | After | Top result now |
|---|---|---|---|
| "prayer" | 345, unranked | 346, ranked | *excerpts on Prayer* |
| "trusting God through illness" | **0** | 10 | *Walking with God through the Valley* |
| "the anchor that holds" | 1 | 31 | *The Anchor that holds* |
| "anchour" (typo) | 0 | 2 | *The Anchor that holds* |
| "camp meeting" | 116 | 118 | *Annual Camp meetings* |

**Three things that were not obvious, each found by measuring:**

1. **`word_similarity`, not `similarity`, for matching — and the reverse for
   ranking.** `similarity()` compares against the *whole* title, so "anchour"
   against "The Anchor that holds" scores far under threshold and finds nothing.
   But `word_similarity` returns 1.0 for *any* title containing the word, so
   ranking by it puts every title holding "prayer" in one arbitrary-ordered tie —
   it surfaced "Surrender: a vital part of effective prayer" above "excerpts on
   Prayer". Match on one, rank on the other.
2. **The substring list had to stay, and had to become conditional.** Full text
   stems, so "holines" and "holiness" are different words while
   `ilike '%holines%'` matched inside it and found 83. Dropping it took that to
   3. But it is also by far the slowest list — 579 ms of "god"'s cost against
   432 ms for chunk full text and 102 ms for titles — so it runs as a second
   query only when the first found fewer than 15 results, which is exactly when
   a fragment is the likely explanation.
3. **The stored `tsv` column.** ARCHITECTURE §5 has always listed it on
   `material_chunks` and it was never created, so the GIN index made the *match*
   fast and left `ts_rank` rebuilding a vector for every hit: "god" took **2.5
   seconds**. Generated column, migration `0004`, and it dropped to 744 ms; with
   the conditional substring, **343 ms**.

Searching now defaults to **Best match**, offered only while there is a query —
there is nothing for an unsearched library to be relevant to. A result found in
the text says which page it was found on.

**Meaning is the one method still missing.** 4,569 vectors and the HNSW index are
there, but comparing against them needs the *query* embedded, and that is 33 MB
of ONNX inside a public page request. It needs a decision, not code: a free
embedding API for the query, or accepting a cold start. Recorded rather than
papered over.

**A trap closed while doing it.** Ten e2e tests "failed" and were asserting
against a completely different app — Playwright's `reuseExistingServer` reuses
whatever answers on the port, and another project was on 3000. The port is
overridable now (`E2E_PORT=3005 pnpm test:e2e`). The genuinely broken test was
targeting the search box by placeholder, which had changed when author filtering
shipped; there are three search inputs on the page now, so it targets `#q`.
**14 passing.**

### Invitations are sent — done 2026-09-18

`hasEmail` had sat in `src/lib/env.ts` since Phase 1 with **no reader anywhere**,
`resend` was not a dependency, and every invitation was copied out by hand.

- `lib/email/invite.ts` builds the email and is pure — subject, HTML and text
  from a link, a name, a role and an expiry. 8 tests, including that a display
  name containing markup is escaped and that a link's `&` is escaped in the HTML
  while staying literal in the text part.
- `server/email/send.ts` is the Resend client, and it **never throws**. An email
  that fails must not undo the thing it was announcing: the invitation is already
  created, the token is already valid, and the link still works. It reports
  `sent: false` with a reason, and the panel says so.
- It sends **after** the transaction commits. Inside it, a blip at a third party
  would destroy a good invitation; before it, we would email a link to a row that
  might not be written.
- The link is still shown either way — it is the fallback when delivery fails,
  and it is how an invitation gets handed over in person, which for a church
  office is the normal case. The panel is gold when the link is the only route
  and quiet when the email went; shouting in both cases trained people to ignore
  it exactly when it mattered.

**Verified by sending a real one** through `mavilletech.com` to the owner's
address, not by trusting the wiring.

**Hand-written HTML, not React Email**, which ARCHITECTURE §3 names. There is one
email; `@react-email/components` is a large dependency for sixty lines of table
markup. Revisit when there is a second and a third.

**And the audit gap is closed.** Accepting an invitation was three unaudited
statements on the read handle — the moment a person gains access to the archive,
with no entry in the trail at all. It is one transaction now and writes
`invitation.accept`, with the new account as the actor, which is honest: there is
no session yet, and the person who accepted is who acted.

### An archived material explains itself — done 2026-09-18

Both facts were recorded and **neither was shown anywhere**. The reason is
collected in the archive dialog precisely so it exists — "a reason collected
afterwards is one nobody writes" — and went straight into the trail and out of
sight. `duplicate_of_id` pointed at a material nobody could follow.

There is a banner on the material's page now: the reason, the twin as a link,
whether that twin is itself still live, and who decided it, when.

**Measuring it found a second gap.** Of 83 archived materials, exactly **one**
had a reason. The duplicate review writes `duplicate.merge` against the *pair*,
so the other 82 had nothing at all in their own history about the largest thing
that ever happened to them — you had to know that duplicate pairs exist to find
out why a material was gone.

Fixed in both directions: a merge now also writes `material.archive` against the
archived material, and `whyArchived` falls back to reading the pair's entry by
the id it recorded, so all 83 explain themselves — *"A duplicate of 'Questions
and answers Vol 2', which was kept instead"*, with the person and the date.

`hasSuggestions` is deleted, with a comment in its place recording that it gated
a Cloudflare Workers AI client that was never written, so it is not reinvented.

### Acting on a selection — done 2026-09-18

**314 published materials have no topic.** Filing them one at a time is a page
load, a picker and a round trip each: the archive's main outstanding job, turned
by the interface into a thousand small errands.

Checkboxes on the list, a bar when anything is selected, and three actions —
file under a topic, publish, take out of the library. Filing is Editor work;
publishing and archiving stay Admin, exactly as they are on a single material.

**Three rules, and they are what make bulk safe rather than merely fast:**

1. **One audit entry per material**, as if each had been done by hand. A single
   "filed 40 materials" entry records the *operation* and not the *changes*, and
   the trail's job is to answer "why is this material here" one material at a
   time. This project learned that the hard way: `mergeCategory` moved 42
   materials with one UPDATE, recorded how many moved but not which, and was
   recoverable only because the v1 spreadsheet still existed.
2. **One transaction.** Either the selection is done or none of it is.
3. **Skipping is not failing.** One archived material in a selection of forty
   does not stop the other thirty-nine; the result says how many changed and how
   many were left alone.

Archiving asks for its reason *before* it will run — a reason collected
afterwards is one nobody writes, and over forty materials that matters more, not
less. It is capped at 100 per action, which covers "everything on this page" with
room to spare and refuses anything that could only come from a crafted request.

**Driven in a browser**, which turned up a real one: the bar is sticky and the
table header is not, so once the bar is up the header's "select all" checkbox
sits underneath it. Selecting all now lives in the bar as well.

### Removing an account — done 2026-09-18

`user.delete` had been in the `AuditAction` union since Phase 3, **labelled in two
places, and written by nothing**: the action was named and the function it
describes was never built. Asked for by the owner, who wanted to remove
`edehjaycee@gmail.com`.

**What was actually there was not an account.** Measured before touching
anything: that address has **no user row at all** — the three accounts are
`netojaycee@`, `danmaiye@` and `akindepraise5@` — but it did have **one open
invitation** as Owner, created 2026-09-17, and three settled ones. So the thing
to remove was a live invitation, which is a link in somebody's inbox that creates
an account.

Removal therefore does both, and the pairing is the point rather than tidiness:
deleting an account while leaving an open invitation for the same address means
the account can simply be recreated from the link. Settled invitations are left
alone — they are history.

**The audit trail keeps everything.** The foreign keys were already right and are
relied on rather than reimplemented: `audit_log.actor_id` and both invitation
references are `SET NULL`, sessions and credentials `CASCADE`. So every entry
survives without its actor, and the final `user.delete` entry carries the email,
name and role, because once the row is gone that is the only record it existed.
The last Owner is refused, as with demoting and suspending.

Two doors, one function (`server/users/remove.ts`): `pnpm account:delete` for the
command line, and a Trash control on the People page behind a typed-email
confirmation. A script that diverges from the button is two behaviours.

**Applied and checked**: the open invitation is withdrawn, and the `user.delete`
entry reads `{"hadAccount": false, "invitationsWithdrawn": 1}` against John
Chinonso Edeh.

### Watching work finish, and finding what was read badly — done 2026-09-18

**Adding a material ended in silence.** It said "it is being read now" and that
was the last anyone heard; the material appeared on some later refresh, or did
not, and nothing said which. Rows exist from the moment the bytes land now, so
there is something to watch — this is the part that watches it.

It polls **only while something is in flight**, and stops on its own. The earlier
decision not to poll the sync page still stands: a page that reloads itself on a
timer is a page nobody can read. The difference is that this condition is
specific and self-clearing. It backs off from 3 to 30 seconds, and after five
minutes stops entirely and says why — at that point "wait longer" is the wrong
advice, because nothing is processing these.

**Building it exposed a flaw in the obvious version.** Counting everything
`staged` or `processing` would have put a spinner on that page **permanently**:
three materials have been staged since the backfill — one whose Drive link 404s,
one Drive served a sign-in page for, one that strayed into the folder — and
nothing will ever process them. That is how a notice becomes wallpaper. In flight
means recent (within the hour); the three stuck ones live in the **In progress**
filter, where they can actually be dealt with.

**And the flagging half of "quality scoring and flagging" is built.**
`lib/text/quality` has scored every page since Phase 1 and `ocr:status` counted
the bad ones, but nothing ever *showed* them. There is a **Read badly** filter
now — 5 materials, 6 pages — and a count on each material's page.

It is deliberately separate from **Awaiting text**, and the distinction matters: a
page with no text can be helped by running a recogniser, while a page read at 0.3
has already been through one and needs a person to look at the image. Putting
them together would send someone to do something that cannot work. The reader's
own per-page marker used a hardcoded `0.55`; it uses `USABLE_THRESHOLD` now, so
there is one number.

### Public submissions — done 2026-09-18

`/submit`, and it is **switched off until a Turnstile key pair exists**. Every
other flag in `lib/env.ts` degrades to a worse-but-working state; this one
cannot, because the degraded state is an unauthenticated write to the bucket. So
the page is a short explanation and a link to the library, not a disabled form —
verified: with no keys there is no file input on the page at all, and no footer
link to it.

**Short, because the owner said why:** anyone who arrives wanting to contribute
is doing us a favour, and every field is a chance to decide it is not worth the
time. Files, then two fields that both say *optional*. The title is inferred from
the filename; topic, author and year go unasked, because the review queue already
exists to catch what is missing.

**This is the only unauthenticated door in the project**, and what bounds it:

- Turnstile is verified **before a single presigned URL is issued**, and a
  failure to check — no secret, verifier unreachable — **refuses rather than
  passes**. The dangerous failure is an environment variable dropped in a deploy
  leaving the bucket open until somebody notices. Checked against Cloudflare's
  own test keys: always-pass returns ok, always-fail returns a refusal, and no
  secret at all returns a refusal rather than waving it through.
- A token is **single use**, so one solved challenge buys one submission. It is
  spent when the capability is granted, not afterwards.
- **Ten files, not sixty.** An admin batching fifty scans is a known person doing
  a known job; a stranger is not.
- `stagingKey` asserts a uuid, so the only files that can be adopted are ones
  this server issued a URL for.
- Nothing publishes. `actorId` is **null** — a submission genuinely has no
  account behind it, and writing one of ours in would be a false record of who
  acted. Who sent it, if they said, is in the audit payload.

**A second one, found the moment the owner added real keys.** The widget failed
with Turnstile error **110200 — domain not allowed**, because a site key is bound
to hostnames and `localhost` was not one of them. That is an ordinary first-deploy
mistake, and the form's response to it was *nothing*: Send disabled for ever with
no explanation. It is not only a misconfigured key that does this — a privacy
extension blocking `challenges.cloudflare.com`, or a strict network, look
identical, and none of them are the visitor's fault. The form now says the check
could not load and points at the about page instead of presenting a dead button.

**To use it on a development machine**, add `localhost` to the widget's allowed
hostnames in the Cloudflare Turnstile dashboard. Cloudflare's own always-pass
test key (`1x00000000000000000000AA`) works anywhere, which is what the browser
checks here used.

**A real bug found by driving it**, and the kind that fails silently for the
people least likely to try twice: the widget was rendered in an effect on mount,
so it only appeared when the Turnstile script happened to be loaded already —
from cache, or on a fast connection. On a cold load `window.turnstile` was
undefined, the effect returned, and nothing ran it again: no widget, no token,
and a Send button that could never be enabled. It waits for the script now.

### Destroying a material — done 2026-09-18

The only thing in the project that truly deletes archive content, and the one
CLAUDE.md reserves for an Owner as a separate, deliberate act.

**Two decisions, not one.** It refuses anything that is not already archived.
Archiving asks why and is reversible; this is the second step and is not. A
single button taking a live material to nothing would put an irreversible act
one click from a typo fix. The title must be typed, and that is **re-checked on
the server** — a confirmation that lives only in the browser is a suggestion.

**Order, and the reason this entry already gave:** the row and its audit entry go
first in one transaction, then the R2 objects. A failure deleting objects leaves
orphaned bytes, which are litter and findable — every key is listed in the audit
entry. The other order risks a row whose file is gone, which is a material that
exists, lists and cannot be opened. Bytes nobody references beat a record that
lies.

**Something the cascades do not cover.** `duplicate_of_id` has no foreign key —
83 archived materials point at 77 others — so destroying a material that
something is recorded as a duplicate *of* would leave the survivor's page saying
"kept instead:" followed by nothing. Those pointers are cleared in the same
transaction.

**Every refusal exercised against the real archive**, destroying nothing: a live
material is refused, a wrong title is refused, an unknown id is refused, and the
row count was unchanged afterwards.

### A deploy trap closed before it bit — 2026-09-18

`lib/env`'s schema **required** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and
`NEXT_PUBLIC_SITE_URL` at module scope, and the Trigger tasks import that module
— `read-material` through `server/ocr`, `sync-drive` directly. The Trigger
indexer imports every task file with **no environment at all**, so the next
deploy would have failed with "There was an error importing task files", naming
neither the variable nor the file. RUNBOOK already records that exact trap from a
previous occurrence; this was the same one reached by a different road.

**Simulated rather than reasoned about**: importing the four task files with only
`DATABASE_URL` and `R2_BUCKET` set threw on two of them. The three are checked
where they are used now — `lib/auth.ts`, the sitemap, the seed — and after the
change all four import cleanly, while the app still refuses with
*"BETTER_AUTH_SECRET is not set. The app cannot start without it."* Nothing was
weakened; the check moved to where the value is needed.

**`docs/RUNBOOK.md` now has a table of which variable goes to Vercel, to
Trigger.dev and to GitHub Actions**, because they are three different sets and a
variable in the wrong place fails without naming itself.

### The sync button, pressed for real — 2026-09-18

The owner pressed **Check the folder** and nothing came back. Three separate
faults, found by asking Trigger rather than by reasoning:

1. **The `sync_runs` row was created inside the task**, so until a worker picked
   the run up there was no row at all — the history stayed empty and the page
   said "scanning the folder" for ever. Exactly the mistake already fixed for
   materials, in a second place. It is written when the button is pressed now,
   and the task adopts it.
2. **The one-at-a-time guard therefore never worked.** It reads `sync_runs`, and
   with no row to find, two presses both went through and queued two runs.
3. **The page could not say what was happening**, because a run queued with no
   worker looks identical to one working hard. It asks Trigger for the run's
   status now and says which — *"waiting in the queue, nothing has picked it up,
   which means no worker is deployed"* is the single most useful sentence that
   page can produce. Clearing is offered immediately for a run Trigger reports as
   queued or already finished, rather than after an hour: those are facts, and
   making someone wait to act on a fact is the interface being stubborn.

**And a correction to what I told the owner.** I said no worker had ever run.
Wrong: both runs *did* execute, and failed in nine seconds with *"Drive is not
configured"* — a local `trigger.dev dev` worker whose process had started before
the Google credentials were added. Restarting it fixed that, and the evidence I
had used (an upload from the previous day with no pages) predated the worker
existing at all.

**Verified by running one.** A real dry run through the real worker:
`COMPLETED`, `{inFolder: 796, imported: 0, skipped: 796, dryRun: true}`, and the
`sync_runs` row closed with those counts.

### Next, in the order worth taking them

1. ~~**Invitation email.**~~ **Done** — see *Invitations are sent* below.
2. ~~**Search relevance.**~~ **Done** — see *Ranked search* below. Meaning is the
   one method of the four still missing, and it needs a decision rather than
   code: embedding the *query* means loading a 33 MB model inside a public page
   request.
3. ~~**Audit the invitation flow.**~~ **Done** — accepting is one transaction now
   and writes `invitation.accept`.
4. ~~**Show why a material was archived, and what it duplicates.**~~ **Done** —
   see below.
5. ~~**Delete `hasSuggestions`.**~~ **Done** — gone, with a note in its place
   saying why, so it is not reinvented.
6. ~~**Public submissions**~~ **Done** — see below. Needs a Turnstile key pair to
   switch on.
7. ~~**Bulk actions on the materials table.**~~ **Done** — see below.

---

## Where things stand

Measured against the live database on 2026-09-16, late — not remembered. Several of
these moved during that same evening: 17 duplicate pairs were merged between 20:11 and
20:39, which is what took published from 624 to 607.

| | |
|---|---|
| Production | v2 on `main`, built by Vercel. Trigger.dev deploys on every push to `main` |
| Docs | All in `docs/`, entered through `CLAUDE.md` at the repo root: `ONBOARDING`, `ARCHITECTURE`, `STATUS`, `RUNBOOK`, plus a `README` |
| Materials | 651 rows · 611 live · **607 published** · 4 staged · 40 archived |
| Filing | **340** published materials have no topic |
| Authors | 2 published materials are credited |
| Text | 2,228 of 2,228 pages read (100%) |
| Duplicates | **64 pending** · 17 merged · 2 dismissed |
| Topics | 69, of which only 12 have sub-text |
| Accounts | 3, all Owner · none suspended · no open invitations |
| Embeddings | 0 chunks — stage 5 is not connected |
| Decided | R2 is the truth, sync is manual and one-way, OCR is free (see `ARCHITECTURE.md` §13) |

---

## Needed from the owner

Free accounts — dummy values sit in `.env.example` until these arrive. None of them
block the start of the work.

- [x] Neon database — live, migrated
- [x] Cloudflare R2 bucket + credentials — live, receiving files
- [x] Resend API key
- [x] Owner email for the seeded account
- [x] Trigger.dev — keys set
- [ ] PostHog
- [x] Google service account, with **read** access to the Drive folder — created
      and loaded. **The Drive API is still disabled on the project**, which
      presents as a 403 with a valid key
- [x] Drive folder ID — `1Cx9XJ-8lsnvjBxpK59HnYfp_dZZUpb9D` (needed at Phase 6; the
      migration itself works off the public links)
- [x] R2 bucket `higherway`, served from `cdn-higherway.mavilletech.com`
- [ ] Email address for the first Owner account
- [ ] Sender address for invites (a verified `mavilletech.com` address)
- [x] Turnstile site and secret keys — set, and refusing a junk token. Add
      `localhost` (no port) to the widget's hostnames to use `/submit` locally
- [ ] Cloudflare account ID + Workers AI token — only for title and summary
      suggestions, which are unbuilt. Topic suggestions need no credentials
- [x] Decide on Google Cloud Vision — **decided yes**, key created. **Billing is
      not enabled on the project**, so every call returns
      `PERMISSION_DENIED: This API method requires billing to be enabled`. The
      1,000 pages a month stay free; the card is a condition of using the API.
      Until then tesseract reads instead — observed doing exactly that, which is
      the fallback proving itself rather than a theory

**Domain — resolved.** `mavilletech.com` is on Cloudflare and verified in Resend, so
invite emails deliver and R2 can have a custom domain from the start. The project's own
domain comes later and costs only a DNS change plus a few environment variables. The
public site stays on the Vercel URL until then, deliberately — see `ARCHITECTURE.md` §3.

---

## Phases

### Phase 0 — Foundation
- [x] `ARCHITECTURE.md`, `CLAUDE.md`, `STATUS.md`
- [x] Next.js 16.3 + React 19 + TypeScript strict + Tailwind 4, pnpm, on branch `v2`
- [x] Design tokens carried over from v1 (paper, ink, forest, gold), Newsreader +
      Instrument Sans wired through `next/font` to the token variables
- [x] `docs/legacy/index.html` — v1 kept for reference
- [x] `.env.example` with every key, including the R2 bucket and Drive folder
- [x] Biome, Vitest, Playwright configured — `lint`, `typecheck`, `test`, `build` green
- [x] shadcn/ui initialised, with its semantic tokens mapped onto the Higherway palette
- [x] CI workflow: lint, typecheck, test, build on every push

Notes for whoever picks this up:

- `create-next-app` generates its own `AGENTS.md` and a `CLAUDE.md` that points at it.
  That has been reversed — `CLAUDE.md` holds the content, `AGENTS.md` points to it.
- Biome needs `css.parser.tailwindDirectives` for Tailwind 4's `@theme`, and the
  reduced-motion block in `globals.css` carries a documented suppression for
  `noImportantStyles`: it must outrank component styles, which is the point of it.
- **`shadcn init` fights the design system.** It adds Geist bound to `--font-sans`
  (replacing Instrument Sans) and leaves `--background` as white oklch (replacing paper).
  Both were undone, and shadcn's tokens now point at the palette, so a generated
  component is on-brand immediately. If anyone re-runs `init`, check `layout.tsx` and
  the `:root` / `@theme inline` blocks in `globals.css` afterwards.

### Phase 1 — Data and storage
- [x] Drizzle schema (`ARCHITECTURE.md` §5) — 8 tables, migrations generated.
      `0000_extensions` creates `vector` and `pg_trgm`; `0001` builds the tables
      against them. Partial unique indexes keep slug and checksum unique among
      **live** rows only, so archiving a duplicate needs no renaming.
- [x] Pure primitives in `src/lib`, with tests (landed early — they need no
      credentials, and the pipeline is built on them):
      - `dedupe/title` — normalising and comparing titles
      - `dedupe/score` — combining signals into a verdict that explains itself
      - `text/similarity` — shingle overlap, survives OCR noise; containment
        catches an article reprinted inside a booklet
      - `text/quality` — scores an OCR read, feeding the re-read queue
      - `text/chunk` — chunking for embeddings, keeping page numbers
- [x] R2 storage keys (`lib/r2/keys`, pure and tested) and the client
      (`server/r2/client` — it reads the environment and the network, so it sits
      in `server/`, not `lib/`). Presigned uploads go browser → R2 directly,
      because Vercel caps request bodies at 4.5 MB and 8.6% of this archive is
      over 10 MB.
- [x] `lib/sheet/csv` — the v1 CSV parser carried over, with column mapping and
      placeholder-topic handling, tested against the real header row
- [x] `lib/slug` — stable URLs, with numbering for the titles that genuinely
      repeat (one appears three times)
- [x] `scripts/import-sheet.ts` — seeds records and categories. Idempotent:
      matches on Drive file id, so re-running imports only what is new.
      **Run 2026-09-16**: 651 materials and 69 categories imported, 327 category
      links across 284 materials, 367 left Uncategorised. Filename titles cleaned
      (`2018-07-Classics-The-Essence-of-True-Christianity` → "The Essence of True
      Christianity"), and the title appearing three times got three distinct URLs.
- [x] `lib/pdf` — renders pages to WebP and pulls out embedded text. **Verified
      on real archive files**: a born-digital sample gave 13,256 characters of
      text and needs no OCR at all; a phone-photo sample gave none, as expected.
      220–273 KB per page, ~0.4–0.6s to render one.
- [x] `scripts/backfill.ts` — Drive → R2, renders pages, takes embedded text,
      publishes. Resumable: what is already in R2 is skipped, so an interrupted
      run continues rather than restarting. **Written but never run** — needs
      `DATABASE_URL` and the four `R2_*` values.
- [x] Local embeddings (`server/embed`, `bge-small-en-v1.5`) and the pure
      comparison helpers (`lib/vector`). **Verified**: 384 dimensions,
      normalised, ~1 ms per document after a one-time 43-second model download.
      Runs entirely on our own machine — no API, no quota, nothing sent anywhere.

101 tests passing. Nothing in Phase 1 has been executed against a real database
or bucket yet — that waits on `DATABASE_URL` and the four `R2_*` values.

Auth tables are deliberately **not** hand-written: Better Auth generates them in
Phase 3. `audit_log.actor_id` therefore has no foreign key yet; it is added in
that phase's migration.

### Phase 2 — Public site on the new data
- [x] Home, library, topic pages and about — all server-rendered from Neon
- [x] Covers ported to `lib/art/`, server-rendered SVG, unit tested for
      determinism: the same material must draw the same cover in a year, or
      people stop recognising it. Gradient ids are scoped per material, because
      two covers sharing one on a grid makes the second adopt the first's colours
- [x] Material page `/m/[slug]` with the in-browser reader — page images from R2,
      no PDF library shipped to the browser
- [x] Pagination: numbered pages with gaps, a range line, and a real URL for
      every state. v1 used infinite scroll with no addressable pages, which
      search engines could not follow. The window logic is pure and tested
- [x] Downloads save as the material's title, via `Content-Disposition` on the
      object — a cross-origin download ignores HTML's `download` attribute
- [x] Sitemap and robots, built from the database, and guarded so a production
      build without `NEXT_PUBLIC_SITE_URL` fails loudly rather than publishing
      localhost URLs for Google to crawl
- [x] Social images via `next/og`, reusing the cover artwork so a shared link
      looks like the material rather than a generic banner
- [x] Share panel on the material page. It shows what the other person will
      receive — title, topic, the plain link — before anything is sent, and every
      option hands off to the reader's own app; nothing is sent from the page and
      no tracking parameters are added. The link comes from
      `window.location.href`, so moving to the real domain needs no change here
- [x] v1's hero rail restored ("A brighter tomorrow always"), hidden below 900px
      exactly as v1 hid it. The nav's active underline was already carried over
- [x] One logo everywhere. The cover **plate** — the card on the home page,
      library and topic shelves — was laying the arc *beside* the word while
      every other surface put it above. Same lockup now in both variants
- [x] The sign-in page's logo links home, so someone who lands there by accident
      is not stuck editing the URL to leave
- [x] Redirects from the old `#/` links. This has to be a small inline script:
      a hash fragment is never sent to the server, so no redirect rule,
      middleware or rewrite can see it. It is the only client JavaScript on the
      public site, and it maps v1's `?cat=` to v2's `?topic=`
- [x] **Search no longer breaks on a line ending.** A reader searching
      "I had been brought up in a good home" got **nothing**, while "I had been
      brought up in a good" found it — which reads like a length limit and is
      not one. The page is stored one line per printed line (`readingOrder`
      ends with `.join("\n")`), so what is actually in the column is
      `"brought up in a good\nhome where "`. The search was
      `ilike '%…%'`, a literal substring match, and that substring genuinely
      does not exist: a newline sits where the reader typed a space.

      It hit every phrase long enough to wrap — which is every phrase anyone
      copies out of an article. Both sides now collapse whitespace, so a phrase
      is findable across whatever line break it happens to fall on, and
      `material_pages_text_trgm_idx` (migration `0003`) indexes the identical
      expression so it stays an index lookup rather than a scan of all 2,228
      pages. Verified against the running site: the full phrase returns the
      same 2 materials as the short one, where it returned 0.

      Worth noting for whoever adds hybrid search: this is the class of bug
      full-text search removes by construction, because a tsvector holds tokens
      and never sees the whitespace between them.
- [x] Hybrid search — full text, fuzzy titles, topic names and substring, fused
      by reciprocal rank. Meaning is the fifth and is not connected (see below)

**Decided 2026-09-16:** the v1 archive publishes straight from the backfill, with
no review queue. These materials were already published in print and on the v1
site for years; holding them for approval would re-decide something the church
already decided. New uploads through the admin panel still go through review.

Verified against the running site: every route returns 200, both nonsense slugs
404, and the filters compose — 142 materials, 18 for "faith", 6 under Prayer,
4 for both together.

**The backfill has finished, and it did not finish cleanly.** 624 of 651 materials
are published with their file in R2 (1.95 GB). **27 are still `staged`**, and the
process exited 0 regardless — per-material failures were caught and counted rather
than raised, so the exit code says nothing about them.

Every one is accounted for, by hashing the bytes rather than reading the log:

| | |
|---|---|
| 24 | byte-identical to a material already live — `materials_sha256_live_idx` refusing a file the archive already holds |
| 1 | `5 keys for successful building` — Drive returns 404 |
| 1 | `Youths Without Blemish` — Drive served a sign-in page, not a PDF |
| 1 | `marks standard handbook for mechanical engineers` — never uploaded, and looks like it strayed into the Drive folder |

The 24 are the unique index doing its job, surfaced as a crash instead of a
decision. Nearly all match a live material with the *same title*, so the v1
spreadsheet lists the same Drive file twice. One does not: **"The Foundation of
Faith Rev. Darrel Lee" is byte-identical to "Document from Daniel Olorunmaiye"** —
one file under two titles, which is a human judgement, not a merge.

**Resolved 2026-09-16** by `pnpm resolve:stuck --apply`. 23 were archived against
the material they copy, each with a reason and a named actor, and their 73 MB of
unreferenced bytes removed — 86 objects. One was held back by the script's own
rule, because it is byte-identical to a material under a *different* title and
naming it is a judgement, not a script's decision. Three were left alone: they
have no file in R2 at all.

Checked afterwards rather than trusted: 23 archived rows each carry a
`duplicateOfId` and a `material.archive` entry, no archived material still owns
page rows, and **every surviving twin still has its file** — the one part of
that operation which could not have been undone.

The archive now stands at 628 live materials, 1.95 GB.

A lesson worth keeping: the run was started as `pnpm backfill | tail -40`, so all
but the last 40 lines of the record were thrown away. 7 of the 27 could not be
explained from the log at all and had to be reconstructed from R2. Long jobs
should be redirected to a file, never piped through `tail`.

Still to do, now unblocked:

- [x] `pnpm ocr:local --force` — **done**. 1,162 pages re-read in 2,177s
  (1.87s a page), none failed, so the corrected reading order is in the stored
  text and not only in the algorithm. Confirmed by reading a page back out of
  the database rather than re-running the recogniser over it. The archive now
  holds 2,223 pages of text out of 2,228: 1,162 read by Vision at an average
  quality of 0.979, and 1,066 taken straight from the PDFs.
- [x] `pnpm fix:names` — **done**: 624 objects renamed, none failed, so a
  download now saves under the material's title rather than `original.pdf`.
- [x] **De-hyphenation carried into the stored text** — done, and it took three
  `--force` re-reads. The first attempt **hung after roughly 491 of 1,162 pages** —
  alive at 0% CPU, no sockets, no error — because the R2 client had no
  timeouts and an `await` could never settle. Fixed at the client, so the same
  silence cannot strand a Trigger task. Resumable by design: `--force` re-reads
  Vision's own pages, so the restart only repeats work already done.

  Two traps when judging progress, both of which cost me an hour:

  - `material_pages` has no `updated_at`, so `created_at` stays at the
    backfill's timestamp however often the text is rewritten. It is not a
    progress signal.
  - **Do not count pages that end a line with a hyphen.** Of 671 such pages,
    only **291 are joinable**; the other 380 cannot ever be fixed, because the
    word runs onto the *next page* or the line below it is a folio line —
    "18 Higher Way", "Scanned by CamScanner". That counter sat at exactly 671
    for an hour while the run worked perfectly, and I read its stillness as a
    fault three separate times.

    The measure that can actually reach zero is
    `text ~ '[[:alnum:]]-\n[a-z]'` — a trailing hyphen with a continuation
    line beneath it.
  - And **do not invent an ordering**. `ocr-local.ts` selects its queue with no
    `ORDER BY`, so Postgres returns rows in unspecified order. I built a
    `row_number() over (order by p.id)` "walk position" on top of that, declared
    the run had passed 153 dirty pages, and called it conclusive. It was
    nothing of the kind. The follow-up "damage is accelerating" was the same
    error compounded: counting `dirty AND pos <= done` while `done` rises
    widens the window over a fixed set, so the number climbs whether or not
    anything is wrong.

    Only order-independent totals mean anything here. By that measure the run
    was working the whole time: vision pages with a joinable split went 259 →
    232 while I was busy proving it broken.

  A **third** re-read was needed because the second one damaged the text. The
  list of prefixes held to be part of a word — `KEEPS_HYPHEN` — included `re`,
  `pre`, `co` and `ex`, so every ordinary word broken across a line at one of
  them kept its hyphen and had the two halves merged: 105 pages were left
  holding "re-ceived", "pre-sence", "ex-perience". Those four came out; only
  `self`, `anti` and `cross` remain, where the hyphen really does belong to the
  word. **1,162 pages re-read at 1.39s each, none failed.**

  Verified afterwards rather than assumed, because the obvious measure lies
  here: a count of `(re|pre|co|ex)-` pages cannot reach zero, since those
  letters begin real hyphenated words. 40 pages still match, and **all 19
  distinct hits are genuine English** — 13 `co-workers`, 8 `co-worker`, then
  `re-anchor`, `co-exist`, `co-operation`, `pre-teenage`, `ex-drunkards`,
  `re-consecrated` and the rest, one page each, summing to exactly 40. Not one
  broken word survives. **The stored text is final.**

- [x] **The archive is fully read: 2,228 of 2,228 pages have text (100%)** —
  1,066 taken straight from the PDFs, 1,162 read by Vision, 7 scoring below 0.5
  and worth a human look. Nothing is waiting for a recogniser.

  `pnpm ocr:status` reports this from anywhere, read-only, in a second. It
  exists because the only way to learn what was outstanding used to be to *run*
  `ocr:local`, which needs a Mac and twenty minutes. It separates three problems
  that all present as "no text": waiting for a recogniser, having no page image
  (a rendering failure, which no recogniser can help), and having no pages at
  all (ingest never finished).

  A caveat on the number, since this session was full of measurements that
  flattered themselves: `ocr:local`'s own footer printed "still waiting 5" when
  the third re-read ended. Those 5 no longer exist by direct query, and the
  arithmetic leaves no room for them — 1,162 + 1,066 is exactly 2,228. I have
  not explained where they went, only confirmed they are not there now.

- [ ] **2 live materials still have no pages at all** (was 3), both `staged`,
  both from the backfill and both already understood, from:
  `5 keys for successful building`
  (Drive returns 404), `Youths Without Blemish` (Drive served a sign-in page,
  not a PDF) and `marks standard handbook for mechanical engineers` (never
  uploaded, and appears to have strayed into the Drive folder). `resolve:stuck`
  deliberately left them alone — each needs a person to supply the file or
  remove the row, which is a judgement, not a script's decision.

- [x] **De-hyphenation never reached embedded text** — fixed. It lived inside
  `readingOrder`, and text taken from a PDF's own text layer bypasses that path
  entirely; `--force` excludes `text_layer` by design, so no amount of
  re-reading could ever have repaired those pages. `joinHyphenatedLines` and
  `dehyphenate` now live in their own pure module, `src/lib/text/dehyphenate.ts`,
  applied to both paths and testable without column geometry. `pnpm fix:hyphens`
  applies it to text already stored, which needs no recogniser at all.
  Archive-wide there is now **1 joinable split left**, down from 32.
- [x] `pnpm scan:duplicates` — **done**, and re-run once more after the third
  re-read, since changed text moves every shingle and containment score. 628
  materials compared, 625 with usable text, **83 pairs pending: 47 likely, 36
  possible**. The final pass raised 0 and withdrew 0 — it re-scored all 83
  against the settled text and found nothing new, which is the result that says
  the text and the scan now agree. Nothing was decided automatically, which is
  the point of it.

  These are a different class from the 23 the backfill left stuck. Those were
  byte-identical files — the same Drive file listed twice in the v1 sheet, caught
  by a checksum. These are the same teaching scanned or photographed on separate
  occasions, so no checksum could see them: "The anchor that holds" against "The
  Anchor that holds", "The cord of Salvation" against "The Cord Of Salvation",
  "Who's Right for Me" against "Who is right for me?". Waiting for a person at
  `/admin/duplicates`.

  Reading the weakest pairs found a systematic false positive worth fixing:
  **series**. "Questions and answers Vol 1" against "Vol 2" scored 0.510 purely
  on sharing three words of four, with no content evidence at all — and the
  trailing number is exactly what makes them different materials. Two titles
  alike in everything but a trailing number now score 0 on the title signal.
  Re-scored against the live pairs rather than argued in the abstract: 82 of 87
  unchanged, 4 dropped, every one a series. "Our Conscience is a Witness"
  against "…Witness1" survived, because 5 pages inside 48 is a containment
  finding and does not depend on the title.

  **Not** fixed, because it is a judgement rather than a rule: a shared series
  *prefix*, such as "Exploring the word Holiness" against "Exploring the word".
- **`TRIGGER_PROJECT_REF` is still missing** — only `TRIGGER_SECRET_KEY` is set,
  so `hasJobs` is false and adding a material is switched off. Deliberately: the
  file would upload and then sit in staging with nothing to process it.

### Phase 3 — Auth and admin shell
- [x] Better Auth, sign-up disabled, seeded Owner. Confirmed working from a real
      browser, not just by script
- [x] Invites: single-use hashed token, accept page, Copy-invite-link panel
      shown once. **This was marked done while it did not work, and was only
      fixed on 2026-09-16 after launch.** Recorded plainly because the
      checkbox is what hid it.

      **No invited person could ever join.** The two halves were written
      against different shapes: `db:seed` creates the Owner's *user row* and an
      invitation together, so accepting only attached a password to an account
      already there. Inviting from the admin panel created *only* the
      invitation and refused if an account existed. Accepting then looked for
      an account, found none, and failed with "That invitation no longer
      matches an account" — every time, for everyone. Measured: every
      admin-created invitation had no user row, and the database held exactly
      one account, the seeded Owner. It was the only account that ever could
      get in, which is why it looked like it worked.

      Accepting now creates the account when missing, with exactly the fields
      the seed uses — the one shape already proven to sign in. Verified by
      running that insert against the real schema inside a transaction, with a
      real invitation's role, then forcing a rollback: every constraint held, a
      duplicate submit was harmless, and nothing persisted.

      A second bug sat in front of it: the invite page said "This link has
      expired" for any failure. Of the six most recent invitations it showed
      that for five, and none had expired — four had been withdrawn when a
      newer link was sent, one already used. It now says which.

      **Email is not wired up**, despite the old wording here. `resend` is not
      a dependency and nothing sends; `RESEND_API_KEY` is read into `hasEmail`
      and never used. Admins copy the link by hand.

      Neither the account creation nor the acceptance writes an audit entry,
      which CLAUDE.md requires of every mutation. That gap predates this fix and
      runs through the whole accept flow; it is noted rather than silently
      widened.
- [x] Roles: Owner ⊃ Admin ⊃ Editor. Only an Owner invites an Owner or Admin;
      the last Owner cannot be demoted or suspended
- [x] Audit log written inside every mutation — **this forced a second database
      handle**. Neon's HTTP driver has no transaction support at all, so
      mutations use a pooled WebSocket connection (`src/db/tx.ts`) where a real
      transaction works. Proved by probe: rollback leaves neither the change nor
      its audit entry
- [x] Admin layout, overview, materials list and detail, categories, People,
      Activity
- [x] Route guards in `src/proxy.ts` — verified both directions. No admin or
      sign-in link appears anywhere on the public site
- [x] Confirmation dialog for destructive actions, requiring the category's name
      to be typed where materials would move or be unfiled
- [x] Account menu: initials in the top-right with profile and sign-out under
      them, where every dashboard keeps it. It replaced a bare email and a flat
      sign-out link sitting side by side, which read as two unrelated pieces of
      furniture
- [x] `/admin/profile` — your own name and password. Gated at `requireSession`
      rather than higher: every role may edit their own account, while acting on
      someone else's stays in People. The name matters because it is what the
      audit trail and the materials table print against every change that person
      makes. A password change revokes other sessions, since it is usually a
      response to the password being seen by someone who should not have it

**Learned the hard way.** Category merge shipped behind a `<select>` that fired
on change, with no confirmation. A stray click moved 42 materials out of Faith.
It was reversible only because the v1 spreadsheet still records the original
filing — `mergeCategory` moves rows with an UPDATE, so afterwards a moved row is
indistinguishable from one that was always on the target, and the audit entry
records how many moved but not which. A category created after the import would
have been unrecoverable. `scripts/undo-merge.ts` performs the reconstruction;
the dialog is what stops it being needed again.

### Phase 4 — Managing materials
- [x] Categories: a search-or-create picker on the material page. It creates a
      topic inline when nothing matches, because sending an editor to Categories
      and back is how a material stays unfiled — and 367 of 651 are unfiled. It
      offers to create only when no topic matches exactly, so a near-duplicate
      is seen first. CRUD and merge shipped in Phase 3
- [x] Per-material history and contributor list, and a last-change column on the
      materials table: what changed, who changed it, when. Read from the audit
      trail rather than a column on the material — the trail is already written
      inside the same transaction as every change, so a `lastEditedBy` column
      would be a second record of the same fact, free to drift from it
- [x] Filing built for the backlog rather than for one material at a time: the
      cover and picker are sticky, so the pages scroll past while the picker
      stays put — deciding where something belongs means looking at it, not at
      its title. Each filed topic names who filed it and when, straight from
      `assignedBy` and `createdAt` on the join row, no new column. A **Next
      unfiled** link goes to the next one without a detour through the list
- [x] Material editor UI — title, author and summary, the public-text switch,
      and publish / take-out-of-the-library / restore. The services existed and
      audited every change; nothing called them, so a title imported from a
      filename could not be fixed without a database client. Correcting details
      is Editor work, moderating is Admin, and archiving asks for its reason in
      the dialog itself — a reason collected afterwards is one nobody writes
- [x] Bulk actions on the materials table — file, publish, take out, done
      2026-09-18
- [x] Adding in bulk — a queue, per-file fields, three at a time. See
      *Requested 2026-09-17* B
- [x] Upload (presigned) and import by URL, with the safety checks in §6. The
      file goes browser → R2 directly and never through the app, because Vercel
      refuses bodies over 4.5 MB and 8.6% of this archive is over 10 MB. A
      pasted link is checked as typed *and* after DNS resolves it, since a
      public-looking hostname can still point at a private address; redirects
      are refused outright, because a redirect lands somewhere the checks never
      saw. `lib/import/url-guard` is pure and tested — including the IPv4
      written as decimal, hex and octal that a dotted-quad check waves through
- [x] Reading a material while filing it: any page opens full size in a native
      `<dialog>`, with arrow keys and on-screen controls through the rest. The
      OCR text is deliberately not shipped to it — at ~3 KB a page a 48-page
      booklet would put 150 KB into the payload for a panel most visits never
      open
- [x] The trail says *which* topic and in which direction. Filing and unfiling
      were writing the same `material.categorise` action, so nothing could tell
      them apart and both read as "Topics changed"; unfiling is now
      `material.uncategorise` and entries read "Added to Faith" / "Removed from
      Faith", drawn from the payload rather than a new column. Filing no longer
      records the title, which made every entry look like a title edit
- [x] **Adding materials from the dashboard** — by file or by link, from a
      drawer over the materials list. Both doors lead to the same pipeline, so
      an uploaded material is indistinguishable from a backfilled one.
      `/admin/materials/new` still renders the same form, so existing links keep
      working. **Runtime-gated**: without `TRIGGER_SECRET_KEY` *and*
      `TRIGGER_PROJECT_REF` the form says so rather than accepting a file it
      would leave sitting unprocessed in staging.

      The drawer will not close while an upload is in flight, Escape included.
      The browser PUTs straight to R2 and only then hands off to the job, so a
      drawer dismissed halfway would strand a file in staging with nobody aware
      of it.
- [x] Topics chosen **while** adding, not afterwards. Filing being a separate
      later step is how 367 of the 651 imported materials ended up with none.
      They travel with the file into the background task, so the material is
      filed in the same transaction that creates it, one audit entry per topic.
      Empty stays a real answer: "Uncategorised" is the absence of rows, not a
      category
- [x] **Destroying a material** — built 2026-09-18, exactly as this entry
      specified: Owner-only, typed-title confirmation, and the R2 objects
      removed with the row. See *Destroying a material* below

### Phase 5 — Reading and duplicates
- [x] OCR interface (`lib/ocr/`); tesseract.js and Google Cloud Vision on the
      worker (`server/ocr/`, `trigger/read-material.ts`)
- [x] `scripts/ocr-local.ts` — macOS Vision, plus the re-read queue
- [x] **Reading order on multi-column pages** (`src/lib/text/columns.ts`). Vision
      returns lines in raster order, straight across the page, so a two-column
      spread came back with the columns woven together — the reason the stored
      text read "orn into a Muslim family, I was trained / Not wanting to keep
      the joy of the Lord to myself". `vision-ocr.swift` now emits each line's
      bounding box and a pure module rebuilds the order. Its own comment used to
      claim Vision "keeps the reading order right on two-column pages"; the
      archive's output disproved that.

      It took six attempts, and every wrong turn came from reasoning about the
      geometry instead of measuring it:
      - The gutter must be measured **once for the whole page**. Per band, a
        couple of wide lines close it and the page collapses to one column.
      - A gutter is identified by the **depth** of the drop, not its width.
        Coverage falls from 42 lines to 6 across a single 0.5% slice, because
        OCR boxes overshoot into the gap from both sides. Demanding a wide gap
        rejected a gutter that was plainly there.
      - A line counts as spanning when it **crosses** the gutter, not when it is
        wider than some guessed fraction — and the margin must be generous, or a
        byline set into the gap fragments the opening paragraph.
      - Vision occasionally merges one line across the gutter. Height cannot
        find it (1.17× median, *below* body lines at 1.34×); span can, because
        it alone covers the full text block. It is cut at the gutter rather than
        breaking the page, which would make the article read first column,
        second column, then first column again.

      Known residual: a drop cap Vision never emits stays lost, so a paragraph
      can still begin "orn into". Re-read Vision's own pages with
      `pnpm ocr:local --force` — which deliberately excludes the 1,071 pages
      whose text came from the PDF itself, since that text is exact and free.
- [x] Quality scoring **and flagging** — `lib/text/quality` scores every page from
      every engine, and there is a **Read badly** filter and a count on each
      material. 5 materials, 6 pages, below the usable threshold
- [x] Duplicate engine: fingerprint, title, shingles, **and meaning** — the last
      of these was accepted by `scoreDuplicate` and supplied by nothing
- [x] Duplicate review page — `/admin/duplicates`, and it has been used: the
      whole queue of 83 was worked through
- [x] Suggestions: categories, on the free path, 56% on the top three — measured
      against 253 hand-filed materials. Titles and summaries are still unbuilt

**Stage 5 of the pipeline was never wired in.** `ARCHITECTURE.md` §7 lists
"5. Embed" between rendering and publishing, and every part of it is built and
unit-tested — but `src/server/embed/` has **zero importers in the repo**.
Nothing writes a vector: not `scripts/backfill.ts`, not `src/server/ingest.ts`,
not `src/trigger/process-material.ts`, not any service. So
`material_chunks.embedding` and `categories.embedding` are both empty, and
`src/lib/text/chunk.ts` has no non-test callers either.

Two consequences that look like separate gaps but are the same one:

- `scoreDuplicate` accepts a `meaning` signal (`lib/dedupe/score.ts`), and the
  scan never passes it — it silently defaults to 0. Every duplicate finding so
  far rests on titles and shingles alone.
- Library search is `ilike` over title, summary, author and page text
  (`server/materials/library.ts`). The comment there promising meaning-based
  search is waiting on the same vectors.

Also worth knowing: `hasSuggestions` in `src/lib/env.ts` gates a Cloudflare
Workers AI feature that **does not exist** — the flag is read nowhere, there is
no Workers AI client, and `src/lib/ai/` (described in `ARCHITECTURE.md`) has
never been created.

The free path needs no credentials and reuses what is already written. The
inputs are in the database now that `material_pages.text` is 100% populated, so
it is read → chunk → embed → insert: no re-render, no re-OCR, no R2 traffic.

1. Seed 69 `categories.embedding` values from name + blurb. Seconds.
2. `scripts/embed.ts` over the archive, storing a document-level chunk
   (`pageNumber: null`) as well as page chunks — the document vector is what a
   suggestion compares against. Minutes at ~1 ms a document. Resumable by
   skipping materials that already have chunks.
3. `nearest(doc, categories, 3)` from `lib/vector`, or `order by embedding <=> $1
   limit 3`. About 15 lines.
4. Accept/reject on the material editor; on accept write `material_categories`
   with `suggested` and `assignedBy`, matching the existing audit pattern.

**Do not trust it before looking at it.** The model was only ever judged on the
three synthetic snippets in Open questions below, where it ranked a generic
faith text *above* one explicitly about illness. Eyeball the top 3 on 20–30 real
materials first.

### Phase 6 — Sync
- [x] Drive reader (read-only, service account) — `src/server/drive/client.ts`
- [x] Sync button, run history — `/admin/sync`, Owner only. No progress bar: a
      run takes minutes and a page that reloads itself is one nobody can read the
      history on, so refreshing is a button that says so
- [x] Held-back handling: an archived material is never brought back, and a file
      changed in Drive since import is flagged rather than re-imported
- [ ] Run it against the real folder — needs the service account

### Requested 2026-09-17

Asked for directly, in the owner's words. The order is A → B → C → D, chosen
because the sync button in D is a button on top of four pipeline stages that were
never connected — pulling fifty photographed PDFs in through today's pipeline
would give fifty materials with no searchable text, no duplicate check beyond a
byte-for-byte match, and no topic. That is the 340-unfiled problem again, faster.

**A — done.**

- [x] **Admin tables scroll on a phone.** Every one of them sat in
      `overflow-hidden`, which does not shorten a wide table, it *clips* it: the
      right-hand columns were unreachable. The materials table went further and
      hid Topics, Pages, Text and Last change at `sm:`/`md:`/`lg:`, so on a phone
      the data did not exist rather than sitting off-screen. `TableScroll` now
      scrolls them horizontally with the first column pinned — a table you scroll
      sideways is only useful if you can still see which row you are on.

      Categories is deliberately not pinned: its first cell turns into the rename
      form, and a pinned form floating over the scrolling columns reads as a
      rendering fault.
- [x] **The share picture uses the real logo.** Three surfaces drew three
      different marks. `m/[slug]/opengraph-image.tsx` was not drawing the logo at
      all — a gold dash beside "HIGHERWAY" in uppercase sans. The other two had
      an arc over the word, but a deeper curve than the real one and set in
      whatever face the renderer defaulted to.

      All three now come from `src/server/og/brand.tsx`, which takes the arc
      straight from `components/public/logo.tsx` and sets the word in Newsreader.
      **Checked against a screenshot of the real logo rather than reasoned
      about**, which caught two errors that looked fine in isolation:

      - The SVG element was sized to the path's span, 53.4 units, ignoring that
        the 4-unit stroke overhangs it by 2 on each side. The whole arc was
        squeezed into that width: 0.263 of the word where the real mark is 0.290.
      - The gap has to be measured, not derived. In `logo.tsx` the arc and word
        share one coordinate space; here the word is a text node carrying its
        ascender as empty space the arc must clear. Left alone the arc landed
        *on* the capitals. It is 0.296 of the font size, and the rendered result
        is within a pixel of the real logo on both measures.

      Two things fell out of doing it: Satori was being given one font, so it set
      the topic label and strapline in the serif too — both faces are loaded now,
      sans first. And the scrim that keeps a title readable over a pale cover
      used `inset: 0`, **which Satori does not implement**: the div collapsed to
      nothing and the gradient had never drawn at all.

      The fonts are 155 KB of TTF in `assets/`, read off disk rather than
      fetched. `next.config.ts` traces them into the function bundle, because the
      material route is dynamic and the path is built at runtime.
- [x] **The topic picker is a select you can search, not a search that
      selects.** It was a bare input whose menu appeared only once you had typed:
      69 topics, none visible, no way to browse. Filing the backlog is the one
      job the material page exists for and it was asking people to remember shelf
      names. `TopicSelect` (Base UI's combobox, already a dependency) opens to
      the full list with counts, filters as you type, ticks what is already
      filed, and keeps the Owner-only inline create.

      **Clicked, not assumed** — driven in a mobile browser against a throwaway
      page: opening, filtering, arrow-and-Enter selection, deselection and
      creating all work, with nothing in the console. The one admin control with
      a measured mobile path.

**B — done.**

- [x] **Several materials at once.** The form took exactly one file and one set
      of fields, so a folder of forty scans was forty passes through it. It is a
      queue now: pick any number, each row keeps its own title, author and
      topics, and they go up three at a time with progress on each.

      **Per-file, not per-batch** — the owner's correction, and it decided the
      design. The obvious version has one author and one set of topics for the
      whole batch, and a folder of scans routinely holds several authors. *Apply
      to all* is a shortcut for when a batch does share one, and it **fills rows
      left empty and never overwrites an answered one**, so it cannot undo the
      thing it sits above.

      **No new route, and no fields made optional.** The drawer is already a
      full-height sheet the width of the viewport on a phone — a page in
      everything but the URL — and the queue scrolls inside it; a second surface
      would have been two places to keep in step. And nothing needed to become
      optional to make a batch bearable: the title is the only required field and
      it is *inferred* from the filename, which is where most of this archive's
      titles came from in the first place. Author and topics were already
      optional.

      A batch is not a new mechanism on the server, because the bytes already
      bypass the app: N presigned PUTs and N independent tasks. What it needed
      was `startUploads(n)` issuing the whole batch's tickets in one call — fifty
      round trips doing fifty identical session checks is a visible pause before
      anything appears to move — plus a queue, per-file progress and a per-row
      retry. One bad file must not abandon the forty-nine behind it.

      Two things that are not obvious and are written down in the code:
      `fetch` **cannot report upload progress**, so the PUT is an
      `XMLHttpRequest`; on a phone a 13 MB photograph is thirty seconds of a
      control that looks frozen, and a frozen control is one people press again.
      And the concurrency is 3 rather than 50 deliberately: fifty parallel PUTs
      over one phone's uplink do not finish sooner in total, they just make all
      fifty look stalled at once.

      **Measured in a mobile browser**, not assumed. Titles derived from
      filenames (`Higher Way (1).pdf` → "Higher Way"); *apply to all* filling
      empty rows while leaving an answered one alone; a one-character title
      disabling Send; removing a row; and separately the upload loop itself
      against a stubbed R2 — peak concurrency exactly 3, the one refused file
      failing alone while the other six succeeded, the content type arriving as
      `application/pdf`. No console errors in either run.

      Links take a list too, one per line, through the same queue.

      `lib/upload/batch.ts` holds the pure parts with 11 tests — including
      `titleFromUrl`, which was a slightly different copy of the same guess
      inside `importFromUrl`.

**C — done. All four stages, 4 to 7, are connected.**

- [x] **Stage 5, embeddings.** `src/server/embed/store.ts` and `pnpm embed`.
      The whole archive is embedded: **542 materials, 4,569 chunks**, about 2 s
      each, twenty minutes end to end. Local model, no API, no account, nothing
      sent anywhere. Each material gets a chunk per page-sized piece plus one
      document vector, which is what a suggestion and a duplicate's meaning
      signal compare against.

      Idempotent by *replacement*, not by append — re-embedding after the text
      changes has to remove the old chunks, or vectors of text that no longer
      exists sit in the same index as the text that replaced it.
- [x] **Stage 6, the duplicate scan, on every upload.** `scanMaterial` compares
      one material against the rest: 566 comparisons rather than the script's
      160,000. Ingest previously had only the SHA-256 equality check, which
      catches the same file twice and nothing else — and the pairs that matter
      here are the same teaching photographed on two occasions, where no two
      bytes agree.

      **It passes the meaning signal, which nothing ever has.** `scoreDuplicate`
      has always accepted an `embedding` argument and the script has never
      supplied one, so it silently defaulted to 0 — every duplicate finding in
      this archive so far rests on titles and shingles alone.

      It deliberately does **not** withdraw pending pairs it did not find, which
      the whole-archive script does. That script has looked at every pair; this
      one has looked at a single material and knows nothing about the pairs
      between two others. Withdrawing on that basis would delete other
      materials' findings on every upload.
- [x] **Stage 7, topic suggestions** — and this one had to be measured twice,
      because the obvious design does not work.

      Comparing a material against `categories.embedding`, which is the column's
      whole purpose, is right **45%** of the time on the top three. The failure
      is systematic: 46 of the 58 live topics have no sub-text, so each vector is
      one generic word, and "Faith" and "Prayer" sit near the middle of
      everything a church publication says. They won nearly every comparison.

      The replacement asks a better question — not *which topic name is this text
      like* but *what are the 15 most similar materials already filed under*. On
      its own it is **more precise and much shyer**: it declines on a third of
      materials and is right 58% of the time when it answers, 74% above a 0.4
      share.

      Swept against all 253 hand-filed materials rather than argued about:

      | | right, top 3 | offered on |
      |---|---|---|
      | topic name only | 45% | 253/253 |
      | neighbours only, ≥0.2 | 38% | 164/253 |
      | **merged** | **56%** | 253/253 |

      So it is both: the neighbours' answer first, the remaining slots filled
      from the names, and a "likely" badge above 0.4. **Verified on the shipped
      function, not on the query the sweep used** — 141/253 (56%), badge right
      48/68 (71%).

      Many of the misses are near-synonyms: "Overcoming obstacles" filed under
      Victory, offered Warfare; "I heard from Heaven" filed under Heaven,
      offered Truth. The archive has 19 topics used exactly once, and narrow
      single-use topics are what it loses. Good as a prompt, nowhere near good
      enough to file on its own, which is why it is worded as a question and
      never applied automatically.

      **The cheapest available improvement to all of this is a one-line
      description for the 46 topics that have none.** Every name vector is
      currently a single word.
- [x] **Stage 4, server-side OCR — the largest hole, closed.** A photographed
      PDF added from the dashboard had *no* searchable text until someone ran
      `pnpm ocr:local` on a Mac. For an archive whose purpose is being findable,
      a material nobody can search for is barely in it.

      `lib/ocr/` exists now as ARCHITECTURE.md §7 describes: a pure interface
      plus the junk filter, with the engines in `server/ocr/` because all of them
      reach a network, a filesystem or a wasm runtime.

      - **Google Cloud Vision** when `GOOGLE_CLOUD_VISION_KEY` is set, over REST
        — no new dependency, since the official client pulls in the whole Google
        auth stack for what is one `fetch`. `hasCloudOcr` has sat in
        `src/lib/env.ts` since Phase 1 with no reader; this is its first.
      - **tesseract.js otherwise, always**, so the archive is searchable with no
        credentials of any kind, which CLAUDE.md requires. New dependency, free;
        its only install script is a donation banner and is declined in
        `pnpm-workspace.yaml`.

      `read-material` reads the page *images* out of R2 rather than re-rendering
      the PDF, then hands to `enrich-material`. The order is a real dependency,
      not a preference: embedding text that has not been recognised yet stores a
      vector of nothing, and the duplicate scan would then compare two vectors of
      nothing and find them identical.

      **Two things found by running it on real pages rather than trusting it:**

      - **tesseract returned nothing at all, three pages in a row.** It was
        recognising fine — 3,500 characters of text sat in `data.text` — but its
        result object has **no `imageWidth` or `imageHeight`**, so normalising
        the boxes divided by `undefined` and every one was dropped. A page that
        recognises perfectly and stores as empty is the worst shape of bug this
        pipeline can have, because it is indistinguishable from a page that
        genuinely has no text. `material_pages` already holds the dimensions
        from rendering, so the caller passes them.
      - With that fixed, measured against pages macOS Vision had already read:
        **3,493 / 3,749 / 5,409 characters at quality 0.71 / 0.99 / 0.96**, in
        3.8–6.4 s a page. Comparable in volume to Vision, which is the right
        result — Vision remains the better engine and this is the one that works
        without a Mac or a card on file.

      The junk filter is deliberately conservative: it removes a token only if it
      is three characters or more, has a letter, has no vowel (**`y` counts**) and
      is not all-uppercase. `KJV`, `NKJV`, `RSV`, `NLT` and `LXX` are the Bible
      versions this archive cites constantly and not one has a vowel. Deleting a
      real word is far worse than keeping an invented one — a reader who searches
      for a phrase and gets nothing concludes the archive does not hold it, which
      is a bug this project has already shipped once.

      **Not yet proved in a deployed worker.** It is exercised against real
      archive pages on this machine. What a Trigger deploy still has to show is
      that tesseract's wasm and its ~10 MB language file load there — the three
      externals in `trigger.config.ts` are the known trap, and a missing one
      builds cleanly and fails at runtime.

**Measured against the live database on 2026-09-17**, and several of these have
moved a long way since the table above was written — most of all the duplicate
queue, which is **empty**:

| | then (09-16) | now (09-17) |
|---|---|---|
| Live materials | 611 | **569** (82 archived, was 40) |
| Published | 607 | 566 |
| Unfiled | 340 | **314** |
| Duplicate pairs | 83 pending | **0 pending** · 59 merged · 24 dismissed |
| Topics | 69 | **58 live** (9 merged, 2 gone) |
| Embedded | 0 chunks | **4,569 chunks across 542 materials** |
| Pages with text | 2,228 | 2,223 of 2,228; every live material with pages has text |
| Materials with no pages | 3 | **2** |

**D — built, and switched off until the service account arrives.**

- [x] **Read-only Drive client** (`src/server/drive/client.ts`). No new
      dependency: `googleapis` is a very large package for what is two HTTP
      calls and an RS256 signature `node:crypto` already does. The one rule this
      project is built around is enforced three ways rather than intended — the
      scope requested is `drive.readonly`, so a token minted from it *cannot*
      write; every request is a GET; and there is no function here that could
      express a write.

      Paged, because `files.list` returns 100 at a time and the folder holds 651
      — asking once would see the first hundred and report the rest as absent,
      which reads as "nothing new". `trashed = false`, because re-importing
      something the church deleted is exactly what a read-only inbox must not do.
- [x] **`sync-drive` task.** It ingests nothing itself: each new file is staged
      in R2 and handed to `process-material`, so a file from Drive walks the
      identical pipeline as one uploaded from the dashboard — rendered, read,
      embedded, scanned, waiting for a person. That is what the single-entrance
      pipeline was for.

      Three decisions worth keeping:

      - **An archived material is never brought back.** 82 rows here are archived
        and every one is a decision someone made; a sync that undid them would
        turn a decision into a recurring chore.
      - **A file edited in Drive is held back, not re-imported.** Drive changes
        `md5Checksum` on an edit and keeps the id, so the two are distinguishable.
        Silently replacing a published material's bytes is not a sync, it is an
        edit nobody asked for.
      - **Nothing publishes automatically**, though §6 stage 8 allows it for
        Drive-sourced files. That was written when Drive *was* the v1 archive —
        material already in print for years. A folder someone drops a file into
        now is not that.
- [x] **`sync_runs` finally has a writer** — who, when, and what happened to each
      file, including the reason. A run that dies still closes its own row, or it
      reads as "still going" for ever and blocks the next press.
- [x] **`/admin/sync`, Owner only.** Two buttons: *Check the folder* is a dry run
      that imports nothing, *Pull in what is new* does it. Being able to see the
      answer before committing is the difference between a button people press
      and one they avoid. One run at a time — two over the same folder would both
      see the same file as new and stage it twice, which is how the backfill left
      27 materials stuck — with an Owner-only way to clear a run that never
      reported.

      Owner because sync adds material to a public archive without anyone having
      read it, over a whole folder at once: a larger blast radius than merging a
      topic, which is already Owner-only.
- [x] **Read against the real folder, 2026-09-18.** The service account is
      created, shared as Viewer, and listing works: **796 PDFs, 2.37 GB, every
      one reporting a checksum.**

      **148 of them are new** — not in the archive at all. 567 are already here,
      81 are archived here and would not be brought back, and 0 have changed in
      Drive since import. So the folder has grown by 148 since the v1 import, and
      the sync button is what collects them.

      The service account has **Viewer and nothing more** — if it is ever given
      Editor, the only thing between this project and a write to Drive becomes
      the code rather than the permission.
- [ ] **Do not press it until a worker is running.** Nothing has processed
      anything yet: the material uploaded on 09-17 still has `page_count: null`
      and `ocr_engine: none`. A sync now would stage 148 files with nothing to
      read them — the failure already met with two, multiplied by seventy-four.
      **Bring in five, to start** exists for exactly this: five either produces
      five finished materials or proves the pipeline is not running, and both
      answers beat 148 rows in limbo.

**Written and unused, measured 2026-09-17:** `hasDrive`, `hasCloudOcr` and
`hasSuggestions` in `src/lib/env.ts` had no readers anywhere, and `sync_runs` had
no writer. `hasCloudOcr` gets one in stage 4 and `hasDrive` in D. **`hasSuggestions`
should be deleted**: it gates a Cloudflare Workers AI client that has never
existed, and suggestions now work with no credentials at all, so there is nothing
left for it to gate.

### Requested before launch (2026-09-16)

Asked for directly, in the owner's words, and not yet built:

- [x] **A dedicated "Create category" button** — done. It sits beside the
      search box on `/admin/categories` and opens a small form taking a name
      *and a blurb*, which the search-or-create button cannot. The inline
      button is kept: it is the right flow when you are already hunting for a
      topic, and the wrong one when the job you came to do is "add a topic".
- [x] **Category management gated to Owner** — done, all four operations.
      `createCategory` and `renameCategory` were `requireSession` (any Editor);
      `mergeCategory` and `deleteCategory` were Admin. All are now
      `requireRole("owner")`, and there was no Owner gate anywhere in the
      codebase before this.

      Rename mattered more than it looks: the slug follows the name, so an
      Editor could change a public URL and break every link already shared.
      Merge is the one that moved 42 materials out of Faith by accident.

      **Filing is untouched** — Editors and Admins still file into topics that
      exist. What changed is that `assignCategory` no longer *creates* one as a
      side-effect: it checks the role and returns a message rather than calling
      `requireRole`, which redirects, because being thrown to the admin home
      mid-file with no explanation is a worse answer than being told why. The
      picker hides the create option to match, and its empty state now
      distinguishes "already filed there" from "no such topic, and only an
      Owner can add one" — it previously claimed the former for both.
- [x] **Author, treated as a first-class field** — done. The edit screen always
      had the input; the real gap was underneath it. **`ingestPdf` had no
      `author` parameter at all**, so nothing between a form and the materials
      row could carry one — an author added at upload time was not merely
      unasked, it was unstorable. It now threads the add form → both upload
      services → the task payload → ingest.

      Empty is stored as `null`, never `""`. An empty string passes every "is
      it set?" check, renders as a blank byline, and would split the author
      list into "unattributed" and "attributed to nothing".

      Browsing is a row of author chips on the library, built from
      `authorList()` — deliberately only the credited few, since most of the
      archive is unattributed and a directory of mostly-nothing is noise.
      Clicking the active author clears it, so the row is its own escape. The
      filter is an **exact** match, unlike `q`: it comes from a chip, so
      "Rev. Darrel Lee" must not also collect "Darrel Lee Jr". `author` is
      preserved across every topic, sort and pagination link — dropping it on a
      topic click is the obvious bug here and it is tested by hand.

      The author on a card is deliberately **not** a link: the whole card is
      already an anchor, and an anchor inside an anchor is invalid HTML.
- [x] **Search in the navbar, on every page** — done. A plain GET form to
      `/library`, the same contract the library's own box already uses, so it
      needs no JavaScript, no new route, and every result has a shareable URL.
      On a phone it sits inside the menu rather than being dropped, and the
      Explore Library button moves to `lg:` so the two do not collide.

      Search now also matches **topic names**, which the box has claimed since
      it was written ("Search materials or topics") without it being true.

      **Measured, and honest about it: that clause currently changes nothing.**
      Across six topic words it matched 15, 13, 10, 10, 5 and 10 materials —
      and in every case *every one of them was already matched* by the page
      text. Materials found by topic name alone: **0, for all six.** It is kept
      because a newly published upload has no OCR text until someone runs
      `ocr:local`, and for that material the topic name is the only thing to
      match on — but it earns its place on that argument, not on a measurement.

### Phase 7 — Launch

**Blocking — `main` cannot point at v2 until these are done:**

- [ ] **Trigger.dev tasks deployed.** The `dev` worker runs tasks on one machine
      only. Without a deploy, a material added in production uploads to R2,
      queues a run, and is never processed — and the form will look as though it
      worked.

      **Now automated**: `.github/workflows/deploy-trigger.yml` runs on every
      push to `main`. It needs one repository secret, `TRIGGER_ACCESS_TOKEN` —
      a personal access token from the Trigger.dev dashboard, *not*
      `TRIGGER_SECRET_KEY`, which can trigger runs but cannot deploy.

      Deliberately no `paths:` filter. A task bundles far more than
      `src/trigger/` — `ingest.ts`, `lib/pdf`, `lib/text`, the R2 client — and a
      filter that misses one transitive file fails silently, leaving an old
      worker with no error anywhere. A redundant deploy costs a minute; a missed
      one costs a stale worker nobody notices.

      The first deploy still has to be run by hand, because the token has to
      exist before a workflow can use it.
- [ ] Every environment variable set on Vercel, including `TRIGGER_SECRET_KEY`,
      `TRIGGER_PROJECT_REF` and `NEXT_PUBLIC_SITE_URL`. The last one is guarded:
      a production build without it fails loudly rather than publishing
      localhost URLs for Google to crawl.
- [ ] R2 serving from `cdn-higherway.mavilletech.com`. Every page image and
      every download comes from it.
- [ ] **Exercise the admin area in a browser.** None of it has been clicked —
      not the add drawer, the topic picker, the pencil editor, the account menu,
      the reader, or the duplicate review. It typechecks and its queries are
      verified against the real database, which is not the same thing.
- [ ] **One of the three end-to-end flows is covered; two are not.**
      `tests/e2e/reading.spec.ts` covers the public journey — home → library,
      search keeping its state in the URL, a material opening with its page
      images, a proper 404, robots and sitemap, and `/admin/materials` bouncing
      to sign-in — **14 passing** across desktop Chromium and mobile WebKit.
      They assert on structure and behaviour, never on a particular material
      being present, so filing and duplicate resolution cannot break them.
      Still unwritten, because both need a seeded session: invite → set
      password → sign in, and upload → duplicate flagged → review.

      `pnpm test:e2e` needs `pnpm exec playwright install` once per machine —
      and `install chromium` alone leaves the mobile project failing on a
      missing WebKit, which reads like a test failure and is not one.

**Functional gap worth deciding on before launch:**

- [x] **A new upload gets no OCR** — fixed 2026-09-17. `read-material` reads it
      with Google Cloud Vision when a key is set and tesseract.js otherwise. See
      *Requested 2026-09-17* C.
- [x] **Nothing tells the admin when processing finishes** — fixed 2026-09-18.
      See *Watching work finish* below.
- [x] Hybrid search — done 2026-09-18. The library ranks now

**Then:**

- [ ] Analytics: Vercel, PostHog, Search Console
- [ ] Performance budget, accessibility pass
- [x] Verified sending domain for invitations — `mavilletech.com`, confirmed by
      sending a real one on 2026-09-18
- [x] Duplicate pairs reviewed — **the queue is empty**: 0 pending, 59 merged,
      24 dismissed, measured 2026-09-17
- [ ] **314 materials still unfiled** (was 367). Topic suggestions now appear on
      every unfiled material's page, right 56% of the time on the top three
- [ ] Cut `main` over from v1

`pnpm build` passes: 80 static pages, every route resolving, proxy middleware
building.

### After launch
- [ ] **Public submissions `/submit`** with Turnstile (the schema already
      supports it). Two design constraints, recorded from the owner because they
      decide whether the page works at all rather than being polish:

      **Short enough that interest survives it.** Anyone who arrives wanting to
      contribute is doing us a favour, and every field is a chance for them to
      decide it is not worth the time. Ask for the file and almost nothing else
      — a title we can correct later beats a form nobody finishes. Everything we
      would like to know (topic, author, year) either gets inferred, gets filled
      in by an editor during review, or goes unasked. The review queue already
      exists to catch what is missing, so the form does not have to.

      **Batch, the way Google Drive does it.** Select forty or fifty files at
      once, one action, done — not one file, one form, repeated fifty times. The
      pieces are already in place: uploads are presigned and go browser → R2
      directly, so a batch is N parallel PUTs with no server in the path and no
      4.5 MB body limit to worry about. What is missing is a queue in the UI
      with per-file progress, retry for the one that fails, and one
      `ingest` job per file rather than per submission.

      Worth thinking through before building: a batch of fifty photographed
      PDFs is fifty materials with no OCR (server-side OCR is still unbuilt),
      and duplicate detection is exactly what stops a well-meaning batch
      re-adding things the archive already holds.
- [ ] Optional AI suggestions, if the free ones fall short
- [ ] Text-to-audio, as raised in early planning

---

## Open questions

- **Search matches far too much, and ranks none of it.** Measured against the
  live archive: "prayer" returns **371 of 624 materials**, "heaven" 352,
  "salvation" 287. Any occurrence anywhere in a document's full text counts, and
  every hit is weighted the same, so a material *about* prayer sorts no higher
  than one that mentions it once on page 3. Sorting is by date or title only —
  there is no relevance order at all.

  This is not new and nothing above caused it; it simply was not measured until
  now. It is the strongest practical argument for the hybrid search in Phase 5:
  Postgres full-text gives `ts_rank` almost for free, and the embeddings would
  put "trusting God through illness" above a passing mention. Worth deciding
  before launch whether a 59%-of-the-archive result set is acceptable in the
  meantime.
- Domain name and timing — decides when invite emails and R2's public domain go live.
- Whether paid work is involved in building this, which decides Vercel Hobby vs Pro
  (`ARCHITECTURE.md` §3).
- Whether the free category suggestions are good enough, or the ~$5–10 language-model
  pass is worth switching on.
- How badly skewed and curved-spine photographs score once the whole archive has been
  read — only 8 pages were sampled.
- **Whether the embedding model is good enough for meaning-based search.** On three
  short synthetic snippets, the query "trusting God during sickness" ranked an
  unrelated text lowest (0.626) but separated the two related ones by only 0.018 —
  and put a generic faith text (0.747) above one explicitly about illness (0.729).
  Too little evidence to judge either way. Re-test against real material text once
  the backfill has run. If it disappoints, search still has full text and fuzzy
  titles to lean on, and a larger model is a schema change away (`vector(384)`).

---

## Log

**2026-09-16** — v1 read in full and measured: 651 materials, mixed born-digital PDFs,
CamScanner scans and phone photos. OCR bake-off run on real files: macOS Vision 0.73 s
per page at ~97–99%, tesseract.js 2.73 s at ~90–95% with scrambled columns. Free-tier
limits verified across the stack. Architecture decided and documented.

**2026-09-16 (later)** — The archive measured rather than assumed. 648 of 651 files
probed: **2.04 GB total**, mean 3.2 MB, median 2.11 MB. 25 sampled for page count:
**1.68 pages per document**, median 2, max 4 — so **~1,100 pages in the whole archive**,
a seventh of the working assumption. A large file means a high-resolution photograph,
not a long document (13.6 MB for 2 pages). Consequences: full-archive OCR is **13
minutes** on a Mac, R2 lands at **2.33 GB of 10 GB free**, and new uploads generate ~35
pages a month against Google Cloud Vision's 1,000-page free allowance.

Free-model research settled the AI question: **Cloudflare Workers AI** for titles,
summaries and categories — 10,000 neurons/day covers the backlog in about a day, and
their terms forbid training on our content. Gemini and Mistral free tiers rejected:
both train on free-tier content. Free vision-language models rejected for OCR: none is
an OCR engine and none is benchmarked on pages like ours.

**2026-09-16 (admin surfaces)** — Category assignment, per-material history, the share
panel, `/admin/profile` and v1's hero rail. Three mistakes worth recording, because all
three compiled and two would have gone unnoticed:

- `ACTION_LABEL` was typed `Record<string, string>`, so it happily held five audit
  actions that do not exist and omitted nine that do. It is typed to the `AuditAction`
  union now, which makes adding a case a compile error in that file.
- `setTextPublic` revalidated `/m/<id>`. The public route is keyed by slug, so it was
  invalidating a path that cannot exist.
- `contributors` declared `max(created_at)` as `sql<Date>`. A raw `sql<>` fragment has
  no column mapper, so it arrives as a string — caught by running the query against
  real data rather than trusting the type. Nothing reads the field yet; it would have
  thrown the first time anything called `.toISOString()` on it.

The share panel and hero rail were verified in a browser. The admin surfaces were not:
they need a sign-in, and the one in the tab was a password-manager entry for an
unrelated account. Their queries were exercised directly against Neon instead.
