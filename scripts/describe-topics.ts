/**
 * Write the one-line description for every topic that has none.
 *
 *   pnpm topics:describe                                   what it would do
 *   pnpm topics:describe --apply                           do it
 *   pnpm topics:describe --apply --as owner@example.com
 *
 * 48 of the 59 live topics had no description, so their home page tiles showed
 * a name and nothing under it beside tiles that had a sentence. The tiles are
 * the busiest twelve, and that twelve shifts as materials are filed — so this
 * covers every topic, not just the ones on the home page today.
 *
 * **Fills gaps; never overwrites.** A topic that already has a description is
 * skipped and reported. Changing one that exists is done in the admin panel.
 *
 * Run `pnpm embed --topics` afterwards: a topic's vector is built from its name
 * and this sentence, and 46 one-word vectors were the weak half of topic
 * suggestions (ARCHITECTURE.md §13, 2026-09-17).
 *
 * Deliberately absent: `in-this-issue`. It holds no published material and reads
 * like a magazine heading that was filed as a subject, so it is a candidate for
 * merging or deleting rather than for a description.
 */

import { eq } from "drizzle-orm"
import { db } from "../src/db"
import { user } from "../src/db/schema"
import {
  type DescribeEntry,
  describeCategories,
  planDescriptions,
} from "../src/server/categories/describe"

/** In the voice of the eleven written by hand: one plain sentence, no sermon. */
const DESCRIPTIONS: DescribeEntry[] = [
  { slug: "salvation", blurb: "What God has done to bring us home." },
  { slug: "evangelism", blurb: "Carrying good news to people who have not yet heard it." },
  { slug: "pain", blurb: "Honest counsel for hurt that does not pass quickly." },
  { slug: "blessing", blurb: "Receiving God's goodness, and knowing where it comes from." },
  { slug: "testimony", blurb: "Ordinary people telling what God has done for them." },
  { slug: "deliverance", blurb: "Freedom from what once held you fast." },
  { slug: "joy", blurb: "A gladness the world did not give and cannot take." },
  { slug: "surrender", blurb: "Letting go of the reins, and finding it is freedom." },
  { slug: "thanksgiving", blurb: "Gratitude as a habit, not a mood." },
  { slug: "truth", blurb: "What still stands when opinions shift." },
  { slug: "consecration", blurb: "Setting a life apart for God, wholly and on purpose." },
  { slug: "forgiveness", blurb: "Receiving mercy, and learning to extend it." },
  { slug: "giving", blurb: "Open hands, and the freedom that follows." },
  { slug: "revival", blurb: "When God moves again among His people." },
  { slug: "healing", blurb: "Trusting God for the body, the mind and the heart." },
  { slug: "service", blurb: "Faith put to work for someone else." },
  { slug: "christian-living", blurb: "Ordinary days lived with intention." },
  { slug: "eternity", blurb: "What lasts when everything else has passed." },
  { slug: "miracles", blurb: "Accounts of God at work beyond explanation." },
  { slug: "excellence", blurb: "Doing ordinary work as if for God." },
  { slug: "grace", blurb: "Favour none of us earned, and all of us need." },
  { slug: "growth", blurb: "Maturing in faith, one season at a time." },
  { slug: "holy-spirit", blurb: "God's presence and power in the believer's life." },
  { slug: "leadership", blurb: "Leading others the way Christ led." },
  { slug: "life", blurb: "Wisdom for the whole of it, not only Sundays." },
  { slug: "mentorship", blurb: "Faith handed on from one life to the next." },
  { slug: "obedience", blurb: "Doing what God says, even before it makes sense." },
  { slug: "prophecy", blurb: "What Scripture says of what is still to come." },
  { slug: "provision", blurb: "Trusting God for what tomorrow needs." },
  { slug: "repentance", blurb: "Turning around, and the welcome that waits." },
  { slug: "scripture", blurb: "Reading the Bible so that it reads you." },
  { slug: "stewardship", blurb: "Caring well for what has been entrusted to us." },
  { slug: "contentment", blurb: "Enough, and the peace of knowing it." },
  { slug: "discipline", blurb: "The small, repeated habits that shape a life." },
  { slug: "encouragement", blurb: "Words for the weary, and for those who carry them." },
  { slug: "faithfulness", blurb: "Staying the course when no one is watching." },
  { slug: "fasting", blurb: "Setting food aside to seek God more closely." },
  { slug: "justice", blurb: "Doing right by others, as God does right by us." },
  { slug: "law", blurb: "God's commands, and the life they protect." },
  { slug: "marriage", blurb: "Building a home on lasting foundations." },
  { slug: "our-history", blurb: "The story of the church and the people who carried it." },
  { slug: "perseverance", blurb: "Keeping on when stopping would be easier." },
  { slug: "promise", blurb: "What God has said, and why it can be trusted." },
  { slug: "restoration", blurb: "What was broken, made whole again." },
  { slug: "sermon-highlights", blurb: "Key passages from teaching given in the church." },
  { slug: "standard", blurb: "Living by the measure Scripture sets." },
  { slug: "worship", blurb: "Honouring God with the whole of life." },
]

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const asIndex = args.indexOf("--as")
const actingAs = asIndex >= 0 ? args[asIndex + 1] : undefined

function report(label: string, rows: { slug: string; blurb?: string }[]) {
  if (!rows.length) return
  console.log(`\n${label} (${rows.length})`)
  for (const r of rows) console.log(`  ${r.slug.padEnd(20)} ${r.blurb ?? ""}`)
}

async function main() {
  const plan = await planDescriptions(DESCRIPTIONS)

  report(
    "would write",
    plan.filter((p) => p.outcome === "write"),
  )
  report(
    "already described, left alone",
    plan.filter((p) => p.outcome === "already-described"),
  )
  report(
    "merged into another topic, skipped",
    plan.filter((p) => p.outcome === "merged"),
  )
  report(
    "no such topic",
    plan.filter((p) => p.outcome === "not-found"),
  )

  if (!apply) {
    console.log("\nNothing changed. Re-run with --apply to do it.")
    return
  }

  /** A script has no session, so the acting Owner is named — or inferred when there is one. */
  const owners = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(eq(user.role, "owner"))

  const actor = actingAs
    ? owners.find((o) => o.email.toLowerCase() === actingAs.toLowerCase())
    : owners.length === 1
      ? owners[0]
      : undefined

  if (!actor) {
    console.error(
      actingAs
        ? `\n${actingAs} is not an Owner.`
        : `\nThere are ${owners.length} Owners. Say which one is doing this:\n` +
            owners.map((o) => `  --as ${o.email}`).join("\n"),
    )
    process.exit(1)
  }

  console.log(`\nacting as ${actor.name ?? actor.email} <${actor.email}>`)
  const done = await describeCategories({ entries: DESCRIPTIONS, actorId: actor.id })
  const written = done.filter((d) => d.outcome === "write").length
  console.log(`\nWrote ${written} description(s), one audit entry each.`)
  console.log("Now run `pnpm embed --topics` so suggestions use them.")
}

main()
  .catch((e) => {
    console.error("failed:", e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .then(() => process.exit(0))
