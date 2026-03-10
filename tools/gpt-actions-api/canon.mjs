import { readFile } from "node:fs/promises";
import path from "node:path";

const CHARACTER_FILES = [
  "major-characters.md",
  "characters-A-to-D.md",
  "characters-E-to-J.md",
  "characters-K-to-O.md",
  "characters-P-to-T.md",
  "characters-U-to-Z.md",
];

const HOUSE_FILES = ["houses-part1.md", "houses-part2.md"];

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitSections(content) {
  const lines = content.split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (current) {
        sections.push(current);
      }

      current = {
        heading: line.slice(4).trim(),
        lines: [],
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    sections.push(current);
  }

  return sections;
}

function sectionMatches(sectionHeading, query) {
  const normalizedHeading = normalize(sectionHeading);
  const normalizedQuery = normalize(query);

  return (
    normalizedHeading === normalizedQuery ||
    normalizedHeading.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedHeading)
  );
}

function summarizeSection(section) {
  const facts = section.lines.filter((line) => line.trim().length > 0).slice(0, 5);
  return {
    summary: [section.heading, ...facts.slice(0, 2)].join(" | "),
    facts,
  };
}

function candidateFilesFor(queryType) {
  switch (queryType) {
    case "character":
      return CHARACTER_FILES;
    case "house":
      return HOUSE_FILES;
    default:
      return [...CHARACTER_FILES, ...HOUSE_FILES];
  }
}

function inferResultType(filename, requestedType) {
  if (requestedType && requestedType !== "unknown") {
    return requestedType;
  }

  return filename.startsWith("houses-") ? "house" : "character";
}

export async function lookupCanonEntry({ canonRoot, query, queryType = "unknown" }) {
  for (const filename of candidateFilesFor(queryType)) {
    const fullPath = path.join(canonRoot, filename);
    const content = await readFile(fullPath, "utf8");
    const sections = splitSections(content);

    for (const section of sections) {
      if (!sectionMatches(section.heading, query)) {
        continue;
      }

      const { summary, facts } = summarizeSection(section);

      return {
        query,
        result_type: inferResultType(filename, queryType),
        summary,
        facts,
        uncertainties: [],
        sources: [filename],
      };
    }
  }

  return {
    query,
    result_type: queryType === "unknown" ? "unknown" : queryType,
    summary: `No local canon match found for ${query}.`,
    facts: [],
    uncertainties: [`No local canon match found for ${query}.`],
    sources: [],
  };
}
