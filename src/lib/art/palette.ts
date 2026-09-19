import { hash, pick, rng } from "./seed"

/**
 * The colour and imagery of every material cover.
 *
 * The source of truth is the pair of books the home page was designed around —
 * the fan in the hero and the Latest Addition — and this system exists so the
 * other six hundred covers belong to the same publication:
 *
 *   one Higherway system   paper-toned covers, the real logo, a Title Case
 *                          serif title, a gold rule, the topic in spaced
 *                          capitals, a drawn landscape across the lower half
 *   a family per topic     one restrained colour family and two kinds of scene,
 *                          so everything filed under Faith reads as one shelf
 *   one cover per material its own shade within the family, its own scene,
 *                          sun and hills, so no two covers are copies
 *
 * Colours come only from the brief's list — cream, beige, sage, olive, forest,
 * earth, charcoal and gold. Every family keeps one deep edition, a forest-dark
 * cover set in paper type like "A Life of Prayer" in the hero, so a shelf has
 * light and dark books side by side without ever leaving its family.
 *
 * Derived from the topic's and the material's own names, so a cover holds still
 * for ever and a new topic is given a family with nothing to configure.
 *
 * Pure by design (CLAUDE.md).
 */

/** The landscapes a cover can carry. A topic uses two of them. */
export const SCENES = ["valley", "river", "peak", "dusk", "lake", "moon", "field", "hills"] as const
export type Scene = (typeof SCENES)[number]

/** One colouring of a cover, from the sky at its head to the ground at its foot. */
export type Swatch = {
  /** `light` covers are set in ink, `deep` covers in paper. */
  tone: "light" | "deep"
  /** Head of the cover, the middle, and the warm light at the horizon. */
  sky: [string, string, string]
  /** The sun or moon, and the glow around it. */
  sun: string
  glow: string
  /** Hills from farthest to nearest; the last is the ground the foot sits on. */
  hills: [string, string, string, string]
  /** Water catching the light, and a field in low sun. */
  water: string
  field: string
}

export const FAMILIES = ["sage", "olive", "forest", "earth", "stone", "wheat", "mist"] as const
export type Family = (typeof FAMILIES)[number]

/**
 * Four editions per family. The first light edition of `sage` is the Latest
 * Addition cover's own colouring, so the family the system grew from is in it.
 */
const SWATCHES: Record<Family, [Swatch, Swatch, Swatch, Swatch]> = {
  sage: [
    {
      tone: "light",
      sky: ["#C8CBBC", "#DAD5C1", "#EFCF9F"],
      sun: "#FBEBC8",
      glow: "#FFF3D8",
      hills: ["#AAA68F", "#8B8D77", "#5B6752", "#2E3A2D"],
      water: "#F4E1B5",
      field: "#8C7A45",
    },
    {
      tone: "light",
      sky: ["#D2D5C6", "#E3E0CF", "#ECDAB6"],
      sun: "#FAEFD2",
      glow: "#FFF6E0",
      hills: ["#B4B8A3", "#939A84", "#65735D", "#33402F"],
      water: "#F1E5C6",
      field: "#8F8452",
    },
    {
      tone: "light",
      sky: ["#D8D3BB", "#E6DCBD", "#ECCE9B"],
      sun: "#FAE9C3",
      glow: "#FFF1D2",
      hills: ["#B2AC87", "#8E8A63", "#646645", "#383A26"],
      water: "#F2DFB0",
      field: "#94803F",
    },
    {
      tone: "deep",
      sky: ["#26332A", "#2E3B31", "#6B6647"],
      sun: "#F4E2B4",
      glow: "#E9C98A",
      hills: ["#4B5B49", "#3A4A3B", "#2A382D", "#1A251E"],
      water: "#C9B98A",
      field: "#6F6538",
    },
  ],
  olive: [
    {
      tone: "light",
      sky: ["#D7D2B9", "#E6DCBE", "#EFD09B"],
      sun: "#FAE8BE",
      glow: "#FFF0CF",
      hills: ["#B3AA81", "#968E62", "#6D6944", "#3C3B26"],
      water: "#F3DDAA",
      field: "#9A843F",
    },
    {
      tone: "light",
      sky: ["#DFDAC5", "#EBE2C8", "#F0D6A5"],
      sun: "#FBEDC9",
      glow: "#FFF4D9",
      hills: ["#BFB691", "#9F9570", "#75704E", "#43402B"],
      water: "#F4E2B8",
      field: "#9C8A4B",
    },
    {
      tone: "light",
      sky: ["#D9D6C0", "#E7E0C4", "#EDD3A0"],
      sun: "#FAEAC4",
      glow: "#FFF2D4",
      hills: ["#ADAB86", "#908F67", "#676A45", "#363A25"],
      water: "#F1DFB0",
      field: "#8A7F3E",
    },
    {
      tone: "deep",
      sky: ["#2B2D20", "#383928", "#76673F"],
      sun: "#F2DDA8",
      glow: "#E3C27F",
      hills: ["#5A5838", "#474628", "#34341F", "#212214"],
      water: "#C4B07A",
      field: "#6E6232",
    },
  ],
  forest: [
    {
      tone: "deep",
      sky: ["#243128", "#2C3A30", "#6E6545"],
      sun: "#F4E2B4",
      glow: "#E9C98A",
      hills: ["#3F5040", "#324234", "#243227", "#18221B"],
      water: "#C7B888",
      field: "#6A6236",
    },
    {
      tone: "deep",
      sky: ["#1F2B24", "#28362C", "#5D5E44"],
      sun: "#F1E1B8",
      glow: "#DEC58E",
      hills: ["#46584A", "#35463A", "#27352B", "#172019"],
      water: "#BFB58E",
      field: "#655F38",
    },
    {
      tone: "light",
      sky: ["#CAD0C0", "#DAD9C7", "#E8D4AD"],
      sun: "#F8ECCD",
      glow: "#FFF4DC",
      hills: ["#9DA893", "#7A8672", "#4C5B49", "#26332A"],
      water: "#EFE2BF",
      field: "#827A45",
    },
    {
      tone: "light",
      sky: ["#D5D0BF", "#E2DBC7", "#EBD6AF"],
      sun: "#F9EDCD",
      glow: "#FFF4DC",
      hills: ["#A8A891", "#848A73", "#55634E", "#2A372C"],
      water: "#F0E2BD",
      field: "#867B45",
    },
  ],
  earth: [
    {
      tone: "light",
      sky: ["#DCD3C2", "#E8DCC6", "#EDC89F"],
      sun: "#FAE6C4",
      glow: "#FFF0D6",
      hills: ["#BBA78D", "#9B846A", "#725E49", "#3D3125"],
      water: "#F2DCB5",
      field: "#957246",
    },
    {
      tone: "light",
      sky: ["#E1D9CA", "#ECE1CE", "#EED2AD"],
      sun: "#FBEACD",
      glow: "#FFF3DE",
      hills: ["#C5B59D", "#A59077", "#7A6651", "#44372A"],
      water: "#F3E0BF",
      field: "#9A7B4E",
    },
    {
      tone: "light",
      sky: ["#D4D2C2", "#E2DBC5", "#E9CA9D"],
      sun: "#F9E7C3",
      glow: "#FFF1D5",
      hills: ["#AAA48B", "#8D7F66", "#655944", "#393125"],
      water: "#F0DDB2",
      field: "#8C7445",
    },
    {
      tone: "deep",
      sky: ["#2D2A22", "#39342A", "#7A6246"],
      sun: "#F1DAB0",
      glow: "#DDB985",
      hills: ["#5B4E3D", "#493E30", "#352C22", "#211C16"],
      water: "#C4AA80",
      field: "#6E5835",
    },
  ],
  stone: [
    {
      tone: "light",
      sky: ["#D3D4CE", "#E1DFD6", "#E6D9BF"],
      sun: "#F7EFDA",
      glow: "#FFF7E6",
      hills: ["#AFB0A7", "#8D8F87", "#61645D", "#32352F"],
      water: "#EDE5CF",
      field: "#827C5C",
    },
    {
      tone: "light",
      sky: ["#DBDBD4", "#E7E4DB", "#E9DEC7"],
      sun: "#F8F1DE",
      glow: "#FFF8E9",
      hills: ["#BBBCB3", "#999B92", "#6D7068", "#3A3D36"],
      water: "#EFE8D5",
      field: "#888264",
    },
    {
      tone: "light",
      sky: ["#CCD0CA", "#DDDED5", "#E5D9C0"],
      sun: "#F6EEDA",
      glow: "#FFF7E6",
      hills: ["#A4AAA2", "#848B83", "#5A6159", "#2C312B"],
      water: "#EBE4CF",
      field: "#7E7B5C",
    },
    {
      tone: "deep",
      sky: ["#252926", "#2F342E", "#69634F"],
      sun: "#EDE3C8",
      glow: "#D8C79A",
      hills: ["#4A5049", "#3A3F39", "#2A2E29", "#191C19"],
      water: "#B9B294",
      field: "#5F5A42",
    },
  ],
  wheat: [
    {
      tone: "light",
      sky: ["#E2DBC4", "#EDE2C3", "#F1D49E"],
      sun: "#FCEBC1",
      glow: "#FFF2D0",
      hills: ["#C8BB8D", "#AD9D6A", "#897949", "#494026"],
      water: "#F5E0AE",
      field: "#B0985A",
    },
    {
      tone: "light",
      sky: ["#E5DFCB", "#EFE6CA", "#F2DAA9"],
      sun: "#FCEFCF",
      glow: "#FFF5DC",
      hills: ["#CEC39A", "#B3A676", "#8D8153", "#4D442B"],
      water: "#F6E5BB",
      field: "#AE9A5E",
    },
    {
      tone: "light",
      sky: ["#D8D7C3", "#E6E0C5", "#EED39F"],
      sun: "#FBEAC2",
      glow: "#FFF2D2",
      hills: ["#B8B58E", "#99976F", "#6F6F47", "#3A3B25"],
      water: "#F3DEAB",
      field: "#A38E4F",
    },
    {
      tone: "deep",
      sky: ["#2D2C1F", "#3A3726", "#8A7442"],
      sun: "#F6E0A6",
      glow: "#E6C47C",
      hills: ["#5D5535", "#4A4328", "#36311E", "#222013"],
      water: "#CDB47A",
      field: "#7B6733",
    },
  ],
  mist: [
    {
      tone: "light",
      sky: ["#CED2C9", "#DEDFD4", "#ECDBBC"],
      sun: "#F8EFD8",
      glow: "#FFF7E6",
      hills: ["#B6BBAF", "#99A093", "#6E796A", "#394438"],
      water: "#EEE6CE",
      field: "#858159",
    },
    {
      tone: "light",
      sky: ["#D7DAD1", "#E5E5DB", "#EEDFC3"],
      sun: "#F9F1DC",
      glow: "#FFF8E9",
      hills: ["#C1C5B9", "#A4AA9D", "#798373", "#404B3F"],
      water: "#F0E8D3",
      field: "#8A865E",
    },
    {
      tone: "light",
      sky: ["#C8CEC7", "#D9DCD3", "#E7D8BD"],
      sun: "#F7EED8",
      glow: "#FFF6E4",
      hills: ["#A8B0A7", "#8A948A", "#616D62", "#2F3931"],
      water: "#ECE4CD",
      field: "#7F7C58",
    },
    {
      tone: "deep",
      sky: ["#212A26", "#2B3530", "#5F6150"],
      sun: "#EEE4C6",
      glow: "#D6C699",
      hills: ["#46514A", "#37423B", "#28322C", "#18201B"],
      water: "#B7B393",
      field: "#5E5B41",
    },
  ],
}

/**
 * The busiest shelves, placed by hand so their families suit them. Every other
 * topic is placed by its name, so a new one needs no entry here.
 */
const TOPIC_LOOKS: Record<string, { family: Family; scenes: [Scene, Scene] }> = {
  faith: { family: "sage", scenes: ["valley", "river"] },
  holiness: { family: "wheat", scenes: ["peak", "field"] },
  prayer: { family: "forest", scenes: ["dusk", "moon"] },
  peace: { family: "mist", scenes: ["lake", "valley"] },
  love: { family: "earth", scenes: ["dusk", "hills"] },
  heaven: { family: "stone", scenes: ["peak", "moon"] },
  salvation: { family: "olive", scenes: ["river", "valley"] },
  evangelism: { family: "wheat", scenes: ["field", "hills"] },
  pain: { family: "stone", scenes: ["hills", "lake"] },
  victory: { family: "olive", scenes: ["peak", "dusk"] },
  warfare: { family: "forest", scenes: ["peak", "hills"] },
  blessing: { family: "wheat", scenes: ["valley", "field"] },
  gospel: { family: "earth", scenes: ["valley", "river"] },
  identity: { family: "mist", scenes: ["peak", "hills"] },
  purpose: { family: "sage", scenes: ["peak", "valley"] },
  surrender: { family: "sage", scenes: ["river", "lake"] },
  testimony: { family: "earth", scenes: ["field", "valley"] },
  joy: { family: "wheat", scenes: ["hills", "valley"] },
  truth: { family: "stone", scenes: ["peak", "valley"] },
  deliverance: { family: "olive", scenes: ["river", "dusk"] },
}

export type TopicLook = { family: Family; scenes: [Scene, Scene] }

/** A topic's family and its two scenes. Stable for ever for a given name. */
export function topicLook(topicId: string): TopicLook {
  const known = TOPIC_LOOKS[topicId]
  if (known) return known
  const h = hash(topicId)
  const first = pick(SCENES, h >>> 5)
  const rest = SCENES.filter((s) => s !== first)
  return { family: pick(FAMILIES, h), scenes: [first, pick(rest, h >>> 11)] }
}

export type Look = {
  family: Family
  scene: Scene
  swatch: Swatch
}

/**
 * Everything needed to draw one material's cover.
 *
 * On a topic's shelf a material wears that topic's family; away from one it
 * wears its first topic's. A material with no topic yet has no shelf to match,
 * so it takes a family and scene of its own from its name rather than every
 * stray sharing one look.
 */
export function lookFor(seedKey: string, topicId: string): Look {
  const r = rng(hash(`${seedKey}::${topicId}`))
  const { family, scenes } =
    topicId === "uncategorised"
      ? { family: pick(FAMILIES, hash(`${seedKey}-family`)), scenes: strayScenes(seedKey) }
      : topicLook(topicId)

  return {
    family,
    scene: scenes[Math.floor(r() * 2)],
    swatch: SWATCHES[family][Math.floor(r() * 4)],
  }
}

function strayScenes(seedKey: string): [Scene, Scene] {
  const h = hash(`${seedKey}-scene`)
  const first = pick(SCENES, h)
  return [first, first]
}

/** Every edition of every family — for tests, and for anyone auditing the palette. */
export function allSwatches(): Swatch[] {
  return FAMILIES.flatMap((f) => SWATCHES[f])
}
