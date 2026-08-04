// THE SETUP FORM'S HALF OF THE CONFIG: read four fields out of the file, put
// four fields back into it, without disturbing anything else in there.
//
// WHY THIS EXISTS. /setup used to be a reading assignment: prose, two full AI
// prompts printed inline, and a hand-edit-the-JSON path offered as an equal
// option. The owner's words on meeting it for the first time were that it looked
// like a chore list. The fix inverts the page: DO the setup, do not explain it.
// So the first thing on the page is now a form with working defaults, and this
// module is what makes Save mean something.
//
// FOUR RULES THIS FILE HOLDS.
//
//   EDIT, NEVER REGENERATE. The user's file is parsed, four keys are replaced,
//   and the rest is written back exactly as it was found, including every
//   $comment key (they are ordinary JSON keys, so a round trip keeps them). A
//   form that rewrites the whole file from what the form knows about would
//   silently delete the sections the form does not cover, which is every
//   interesting thing in there.
//
//   THE FORM CANNOT NAME A NEW BINARY. `adapters.default` may only be set to an
//   agent the config ALREADY declares. That is the security line: an adapter
//   entry carries `bin`, and a form that could write a new one would be a route
//   through which a local page picks a program the hub later runs. Choosing
//   between tools you already configured is a preference; adding one is a config
//   edit, and it stays a config edit.
//
//   BROKEN IS NOT EMPTY. A file that will not parse yields a problem and a null
//   value set, never a form full of blank defaults. Blank defaults plus a Save
//   button is a machine for destroying a config someone spent an evening on.
//
//   NO ABSOLUTE PATHS, NO PROCESS ASSUMPTIONS. The hub root arrives as an
//   argument, exactly as in src/lib/setup.ts, so this module is testable under
//   plain `node --test` and says nothing about where it is running.
//
// NOTE FOR EDITORS: nothing here imports src/lib/config.ts at runtime. Node's
// native type stripping does not resolve an extensionless import, so a value
// import of "./config" would take the whole test file down with it. The same
// constraint shaped src/lib/setup.ts, and its header says so too.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/** The user's own config. Written by this module, gitignored, never shipped. */
export const CONFIG_FILE = "hub.config.json";
/** The tracked file every default is documented in. It is the BASE a first save
 * starts from, which is exactly what the manual instructions have always said to
 * do by hand: copy the example, then edit it. */
export const CONFIG_EXAMPLE_FILE = "hub.config.example.json";

/** A hub name has to fit in the topbar next to the nav. This is not a
 * correctness limit, it is a layout one, and the message says which. */
const NAME_MAX = 60;

/** The four things the form owns. Everything else on the page is still a step
 * you do with your own AI tool or by hand. */
export interface SetupValues {
  /** hub.name: what the topbar shows. */
  name: string;
  /** dataDir, exactly as written in the file: a relative name, a ~ path or an
   * absolute one. Kept raw so a save round-trips what the user wrote instead of
   * quietly baking an absolute path into a config that said "data". */
  dataDir: string;
  /** bind.port. */
  port: number;
  /** adapters.default: the key of one of the agents below, or null for none. */
  agent: string | null;
}

/** One AI tool the config already declares, offered in the picker. */
export interface AgentChoice {
  key: string;
  label: string;
  /** Built to spec, never exercised against a real install. The picker says so. */
  untested: boolean;
}

export interface SetupRead {
  /** Which file the values came from. Named in the UI, because "your settings"
   * meaning a file you have never seen is how a config becomes frightening. */
  file: string;
  /** True when the user has their own hub.config.json. False means these are the
   * shipped example's values and the first save will create the file. */
  own: boolean;
  /** null when the file could not be read or parsed. */
  values: SetupValues | null;
  agents: AgentChoice[];
  /** null when everything was readable. Otherwise plain words about what is
   * wrong, and saving is refused until it is fixed. */
  problem: string | null;
}

/** What a save did, or why it did nothing. */
export interface SetupWrite {
  ok: boolean;
  /** Plain language, for the human and for the ledger row. */
  message: string;
  /** The file that was written, relative to the hub root. */
  file: string;
}

// ---------------------------------------------------------------- reading

/** Keys starting with $ are inline comments in the JSON, the same convention
 * src/lib/config.ts uses. They are never a tool, and they are never touched. */
function isComment(key: string): boolean {
  return key.startsWith("$");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** A section, or an empty one. A missing section is never an error here for the
 * same reason it is not one in the loader: every knob has a documented default. */
function section(root: Record<string, unknown>, key: string): Record<string, unknown> {
  return asRecord(root[key]) ?? {};
}

function readString(raw: Record<string, unknown>, key: string, fallback: string): string {
  const value = raw[key];
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

/** Every agent the config declares, in file order. */
function readAgents(root: Record<string, unknown>): AgentChoice[] {
  const agents = section(section(root, "adapters"), "agents");
  const choices: AgentChoice[] = [];
  for (const key of Object.keys(agents)) {
    if (isComment(key)) continue;
    const entry = asRecord(agents[key]);
    if (entry === null) continue;
    choices.push({
      key,
      label: readString(entry, "label", key),
      untested: entry["untested"] === true,
    });
  }
  return choices;
}

/** Parse one config file's text into the form's four fields.
 *
 * @param text the file contents
 * @param fallbacks the values to show for keys the file does not set. They come
 *   from the caller rather than from constants here, because the documented
 *   defaults live in exactly one place (src/lib/config.ts) and a second copy in
 *   this file would be free to disagree with it.
 */
export function parseSetupValues(
  text: string,
  fallbacks: SetupValues,
): { values: SetupValues | null; agents: AgentChoice[]; problem: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { values: null, agents: [], problem: `it is not valid JSON (${detail})` };
  }
  const root = asRecord(parsed);
  if (root === null) {
    return { values: null, agents: [], problem: "the whole file has to be one JSON object, in { }" };
  }

  const agents = readAgents(root);
  const adapters = section(root, "adapters");
  const chosen = adapters["default"];
  const port = section(root, "bind")["port"];

  return {
    values: {
      name: readString(section(root, "hub"), "name", fallbacks.name),
      dataDir: readString(root, "dataDir", fallbacks.dataDir),
      port: typeof port === "number" && Number.isInteger(port) ? port : fallbacks.port,
      // An adapters.default naming an agent that is not declared is a config
      // error the loader already refuses in plainer words than a form could. The
      // picker shows "none yet" rather than inventing an option for it.
      agent: typeof chosen === "string" && agents.some((a) => a.key === chosen) ? chosen : null,
    },
    agents,
    problem: null,
  };
}

/** Read the config the form should show: the user's own file if they have one,
 * otherwise the shipped example, which is what a first save starts from.
 *
 * @param hubRoot the directory holding the config files (the caller passes
 *   process.cwd(); this module never assumes it).
 * @param fallbacks the documented defaults, from the caller. See parseSetupValues.
 */
export function readSetupValues(hubRoot: string, fallbacks: SetupValues): SetupRead {
  for (const file of [CONFIG_FILE, CONFIG_EXAMPLE_FILE]) {
    let text: string;
    try {
      // turbopackIgnore: a runtime read, not a static import. Same as src/lib/config.ts.
      text = readFileSync(path.join(/*turbopackIgnore: true*/ hubRoot, file), "utf8");
    } catch {
      continue;
    }
    const parsed = parseSetupValues(text, fallbacks);
    return { file, own: file === CONFIG_FILE, ...parsed };
  }
  // Neither file is here. That is a broken install rather than a fresh one: the
  // example is tracked, so a clone always has it. Saying so beats offering a
  // form that would write a config from nothing.
  return {
    file: CONFIG_EXAMPLE_FILE,
    own: false,
    values: null,
    agents: [],
    problem: `there is no ${CONFIG_FILE} and no ${CONFIG_EXAMPLE_FILE} in this install, so there is nothing to edit. A git pull puts the example back.`,
  };
}

// ---------------------------------------------------------------- writing

/** Check one submitted value set against the agents the config declares.
 *
 * @returns null when it is fine, else one plain sentence naming the field. The
 *   vocabulary follows the config loader's: say the exact place, and say what
 *   was expected there.
 */
export function checkSetupValues(values: SetupValues, agents: AgentChoice[]): string | null {
  const name = values.name.trim();
  if (name === "") return "A hub name cannot be empty. It is what the topbar shows.";
  if (name.length > NAME_MAX) {
    return `A hub name has to be ${NAME_MAX} characters or fewer, so it fits in the topbar next to the nav.`;
  }

  const dataDir = values.dataDir.trim();
  if (dataDir === "") {
    return "A data folder cannot be empty. A plain name like data is resolved against the hub folder.";
  }
  // A null byte cannot be in a path, and it arrives from nowhere legitimate.
  if (dataDir.includes("\0") || name.includes("\0")) return "That is not a value a path or a name can hold.";

  if (!Number.isInteger(values.port) || values.port < 1 || values.port > 65535) {
    // No number is quoted here on purpose: the shipped default lives in exactly
    // one place and a friendly mention of it in a message is a second copy.
    return "A port is a whole number between 1 and 65535.";
  }

  if (values.agent !== null && !agents.some((a) => a.key === values.agent)) {
    const have = agents.map((a) => a.key).join(", ");
    return `This form can only pick between the AI tools your config already declares (${have === "" ? "you have none yet" : have}). Adding a new one means adding an "adapters.agents" entry, which is the config step below.`;
  }
  return null;
}

/** Put the four fields back into a config file's text, leaving everything else
 * exactly as it was.
 *
 * @param sourceText the file to edit, which on a first save is the example
 * @returns the new file text, or a problem naming what is wrong
 */
export function applySetupValues(
  sourceText: string,
  values: SetupValues,
): { text: string | null; problem: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceText);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { text: null, problem: `the config file is not valid JSON (${detail}), so nothing was changed` };
  }
  const root = asRecord(parsed);
  if (root === null) {
    return { text: null, problem: "the config file has to be one JSON object, so nothing was changed" };
  }

  const agents = readAgents(root);
  const refusal = checkSetupValues(values, agents);
  if (refusal !== null) return { text: null, problem: refusal };

  // Spread rather than replace, so a section keeps its $comment keys and every
  // other key in it. Object spread preserves insertion order, which is what
  // keeps a $comment sitting above the key it describes.
  root["hub"] = { ...section(root, "hub"), name: values.name.trim() };
  root["dataDir"] = values.dataDir.trim();
  root["bind"] = { ...section(root, "bind"), port: values.port };
  root["adapters"] = { ...section(root, "adapters"), default: values.agent };

  return { text: `${JSON.stringify(root, null, 2)}\n`, problem: null };
}

/** Write the four fields to hub.config.json, creating it from the example on a
 * first save.
 *
 * The write goes to a temporary file in the same directory and is renamed over
 * the target, so an interrupted save cannot leave a half-written config behind.
 * A truncated hub.config.json is the one failure that would stop the hub from
 * starting, which is a bad thing for a settings form to be able to cause.
 */
export function writeSetupValues(hubRoot: string, values: SetupValues): SetupWrite {
  // The submitted values stand in as the fallbacks: this call is here to find
  // WHICH file to edit and whether it parses, and every field it would fill in
  // from a fallback is about to be overwritten anyway.
  const read = readSetupValues(hubRoot, values);
  if (read.problem !== null) {
    return { ok: false, message: `${read.file}: ${read.problem}`, file: read.file };
  }

  let sourceText: string;
  try {
    // turbopackIgnore: a runtime read, not a static import.
    sourceText = readFileSync(path.join(/*turbopackIgnore: true*/ hubRoot, read.file), "utf8");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `${read.file} could not be read (${detail})`, file: read.file };
  }

  const applied = applySetupValues(sourceText, values);
  if (applied.text === null) {
    return { ok: false, message: applied.problem ?? "the config could not be written", file: read.file };
  }

  const target = path.join(hubRoot, CONFIG_FILE);
  const temp = `${target}.saving`;
  try {
    writeFileSync(temp, applied.text, "utf8");
    renameSync(temp, target);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `${CONFIG_FILE} could not be written (${detail})`, file: CONFIG_FILE };
  }

  return {
    ok: true,
    message: read.own
      ? `saved your hub name, data folder, port and AI tool to ${CONFIG_FILE}`
      : `created ${CONFIG_FILE} from ${CONFIG_EXAMPLE_FILE} with your hub name, data folder, port and AI tool`,
    file: CONFIG_FILE,
  };
}
