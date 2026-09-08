/**
 * Turns data/blog/*.md into shared/blog.ts.
 *
 *   npm run blog:build
 *   npx tsx scripts/build-blog.ts
 *
 * The source is the five posts published on top-rated.team, transcribed at the
 * slugs those pages actually answer on. Two of the slugs look truncated. They
 * are not: they are the live URLs, and rewriting them would 404 the traffic
 * this file exists to keep.
 *
 * Generated rather than written because a post edited by hand stops matching
 * the page it was published at. Frontmatter is the record: slug, title, date,
 * description, sourceUrl and headings. The body is the rest of the file.
 */
import fs from "node:fs";
import path from "node:path";

const SOURCE = "data/blog";
const OUT = "shared/blog.ts";

interface BlogPost {
  slug: string;
  title: string;
  date: string;
  description: string | null;
  sourceUrl: string;
  headings: string[];
  body: string;
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const start = value[0];
    const end = value[value.length - 1];
    if ((start === '"' && end === '"') || (start === "'" && end === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function parseScalar(raw: string): string | null | string[] {
  const value = raw.trim();
  if (value === "null") return null;
  if (value === "[]") return [];
  return unquote(value);
}

function parseYaml(yaml: string, file: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const field = line.match(/^([A-Za-z][A-Za-z0-9]*)\s*:\s*(.*)$/);
    if (!field) {
      throw new Error(`${file}: cannot read frontmatter line: ${line}`);
    }
    const key = field[1];
    const rest = field[2];
    if (rest === "") {
      const items: string[] = [];
      i += 1;
      while (i < lines.length) {
        const item = lines[i].match(/^\s+-\s+(.*)$/);
        if (!item) break;
        items.push(unquote(item[1].trim()));
        i += 1;
      }
      out[key] = items;
      continue;
    }
    out[key] = parseScalar(rest);
    i += 1;
  }
  return out;
}

function asString(value: unknown, field: string, file: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${file}: ${field} must be a non-empty string`);
  }
  return value;
}

function asNullableString(value: unknown, field: string, file: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`${file}: ${field} must be a string or null`);
  }
  return value;
}

function asStringList(value: unknown, field: string, file: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${file}: ${field} must be a list of strings`);
  }
  return value;
}

function splitDocument(raw: string, file: string): { yaml: string; body: string } {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    throw new Error(`${file}: missing opening frontmatter`);
  }
  const rest = raw.replace(/^---\r?\n/, "");
  const close = rest.search(/\r?\n---\r?\n/);
  if (close === -1) {
    throw new Error(`${file}: frontmatter is not closed`);
  }
  return {
    yaml: rest.slice(0, close),
    body: rest.slice(close).replace(/^\r?\n---\r?\n/, ""),
  };
}

function readPost(file: string): BlogPost {
  const raw = fs.readFileSync(path.join(SOURCE, file), "utf8");
  const { yaml, body } = splitDocument(raw, file);
  const fields = parseYaml(yaml, file);
  return {
    slug: asString(fields.slug, "slug", file),
    title: asString(fields.title, "title", file),
    date: asString(fields.date, "date", file),
    description: asNullableString(fields.description, "description", file),
    sourceUrl: asString(fields.sourceUrl, "sourceUrl", file),
    headings: asStringList(fields.headings ?? [], "headings", file),
    body,
  };
}

const files = fs.readdirSync(SOURCE).filter((name) => name.endsWith(".md")).sort();
if (files.length === 0) {
  throw new Error(`${SOURCE} has no markdown files`);
}

const posts = files.map(readPost).sort((a, b) => {
  const byDate = Date.parse(b.date) - Date.parse(a.date);
  if (byDate !== 0) return byDate;
  return a.slug.localeCompare(b.slug);
});

const seen = new Set<string>();
for (const post of posts) {
  if (seen.has(post.slug)) {
    throw new Error(`duplicate slug: ${post.slug}`);
  }
  seen.add(post.slug);
}

const header = `/**
 * GENERATED — do not edit. Run \`npx tsx scripts/build-blog.ts\`.
 *
 * The five posts published on top-rated.team, as data, at the slugs those
 * pages actually answer on. Two of the slugs look truncated. They are not:
 * they are the live URLs, and a post edited by hand here would stop matching
 * the page it was published at.
 *
 * Frontmatter is the record: slug, title, date, description, sourceUrl and
 * headings. The body is the markdown that follows it.
 */

export interface BlogPost {
  slug: string;
  title: string;
  /** ISO date as written in the source. */
  date: string;
  description: string | null;
  sourceUrl: string;
  headings: string[];
  body: string;
}

export const POSTS: BlogPost[] = ${JSON.stringify(posts, null, 2)};

export const POST_BY_SLUG: Record<string, BlogPost> = Object.fromEntries(
  POSTS.map((post) => [post.slug, post]),
);
`;

fs.writeFileSync(OUT, header);
console.log(`${OUT} — ${posts.length} posts, newest first`);
for (const post of posts) {
  console.log(`  ${post.date.slice(0, 10)}  /blog/${post.slug}`);
}
