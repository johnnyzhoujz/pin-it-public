import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

export function renderMarkdown(content = "", options = {}) {
  const imageMarkup = renderImageOnlyMarkdown(content, options.clipboardFormats);
  if (imageMarkup) {
    return imageMarkup;
  }

  return markdown.render(normalizeRenderableMarkdown(displayContent(content, options.clipboardFormats)) || "_No content saved._");
}

function displayContent(content = "", clipboardFormats = {}) {
  const cleanContent = content.trim();
  const html = typeof clipboardFormats?.html === "string" ? clipboardFormats.html.trim() : "";

  if (html && shouldRenderHtmlTableSource(cleanContent, html)) {
    return firstTableHtml(html) || html;
  }

  return cleanContent;
}

function normalizeRenderableMarkdown(content = "") {
  return normalizeTsvTable(normalizeLooseTwoColumnTable(convertHtmlTables(content)));
}

function renderImageOnlyMarkdown(content = "", clipboardFormats = {}) {
  const imageDataUrl =
    typeof clipboardFormats?.imageDataUrl === "string" && clipboardFormats.imageDataUrl.startsWith("data:image/")
      ? clipboardFormats.imageDataUrl
      : "";
  const cleanContent = content.trim();

  if (!imageDataUrl || !cleanContent) {
    return "";
  }

  const imagePattern = /^!\[([^\]]*)\]\((data:image\/[^)]+)\)$/;
  const match = cleanContent.match(imagePattern);
  if (!match || match[2] !== imageDataUrl) {
    return "";
  }

  return `<p><img src="${escapeHtmlAttribute(imageDataUrl)}" alt="${escapeHtmlAttribute(match[1] || "Clipboard image")}"></p>\n`;
}

function shouldRenderHtmlTableSource(content = "", html = "") {
  if (!/<table\b/i.test(html) || markdownTableLike(content) || content.includes("\t")) {
    return false;
  }

  const htmlCells = tableCellsFromHtml(html);
  const contentCells = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return htmlCells.length >= 4 && contentCells.length >= 4 && sameOrderedCells(contentCells, htmlCells);
}

function convertHtmlTables(content = "") {
  return content.replace(/<table\b[\s\S]*?<\/table>/gi, (tableHtml) => {
    const markdownTable = tableMarkdownFromHtml(tableHtml);
    return markdownTable || tableHtml;
  });
}

function firstTableHtml(html = "") {
  return html.match(/<table\b[\s\S]*?<\/table>/i)?.[0] || "";
}

function tableMarkdownFromHtml(html = "") {
  const rows = tableRowsFromHtml(html);

  if (!rows.length) {
    return "";
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array(columnCount - row.length).fill("")]);
  const [header, ...body] = normalized;
  const divider = Array(columnCount).fill("---");
  return [header, divider, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function tableRowsFromHtml(html = "") {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) =>
      [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cellMatch) =>
        cleanHtmlCell(cellMatch[1])
      )
    )
    .filter((row) => row.length);
}

function tableCellsFromHtml(html = "") {
  return tableRowsFromHtml(html).flat().map(normalizeCellText).filter(Boolean);
}

function markdownTableLike(content = "") {
  return /^\s*\|.+\|\s*$/m.test(content) && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/m.test(content);
}

function sameOrderedCells(contentCells, htmlCells) {
  if (contentCells.length !== htmlCells.length) {
    return false;
  }

  return contentCells.every((cell, index) => normalizeCellText(cell) === htmlCells[index]);
}

function normalizeLooseTwoColumnTable(content = "") {
  if (markdownTableLike(content) || content.includes("\t") || !/\S[^\n]*\n\s*\n\S/.test(content)) {
    return content;
  }

  const cells = content
    .split(/\n\s*\n/)
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length < 6 || cells.length % 2 !== 0) {
    return content;
  }

  const [firstHeader, secondHeader, ...bodyCells] = cells;
  if (!looksLikeTableHeader(firstHeader) || !looksLikeTableHeader(secondHeader)) {
    return content;
  }

  const rows = [];
  for (let index = 0; index < bodyCells.length; index += 2) {
    const firstCell = bodyCells[index];
    const secondCell = bodyCells[index + 1];
    if (!looksLikeLooseTableLabel(firstCell) || !secondCell) {
      return content;
    }
    rows.push([firstCell, secondCell]);
  }

  return [
    `| ${escapeMarkdownTableCell(firstHeader)} | ${escapeMarkdownTableCell(secondHeader)} |`,
    "| --- | --- |",
    ...rows.map(([firstCell, secondCell]) => `| ${escapeMarkdownTableCell(firstCell)} | ${escapeMarkdownTableCell(secondCell)} |`)
  ].join("\n");
}

function looksLikeTableHeader(value = "") {
  const cleanValue = normalizeCellText(value);
  return cleanValue.length > 0 && cleanValue.length <= 36 && !/[.!?;:]$/.test(cleanValue);
}

function looksLikeLooseTableLabel(value = "") {
  const cleanValue = normalizeCellText(value);
  return cleanValue.length > 0 && cleanValue.length <= 80 && !/[.!?;:]$/.test(cleanValue);
}

function escapeMarkdownTableCell(value = "") {
  return normalizeCellText(value).replaceAll("|", "\\|");
}

function escapeHtmlAttribute(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeTsvTable(content = "") {
  const lines = content.split(/\r?\n/);
  const nonEmpty = lines.filter((line) => line.trim());

  if (nonEmpty.length < 2 || !nonEmpty.every((line) => line.includes("\t"))) {
    return content;
  }

  const rows = nonEmpty.map((line) => line.split("\t").map((cell) => cell.trim().replaceAll("|", "\\|")));
  const columnCount = Math.max(...rows.map((row) => row.length));

  if (columnCount < 2) {
    return content;
  }

  const normalized = rows.map((row) => [...row, ...Array(columnCount - row.length).fill("")]);
  const [header, ...body] = normalized;
  const divider = Array(columnCount).fill("---");
  return [header, divider, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function cleanHtmlCell(value = "") {
  return unescapeHtml(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .replaceAll("|", "\\|")
    .trim();
}

function normalizeCellText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function unescapeHtml(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
