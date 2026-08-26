export type DocumentHeading = {
	id: string;
	text: string;
	level: number;
	line: number;
};

export type HeadingPosition = {
	id: string;
	top: number;
};

function headingText(markdown: string): string {
	return markdown
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, "")
		.replace(/[`*_~]/g, "")
		.replace(/\\([\\`*{}[\]()#+.!_>~-])/g, "$1")
		.trim();
}

export function slugifyHeading(text: string): string {
	return (
		text
			.toLowerCase()
			.replace(/[^\p{L}\p{N}\s_-]/gu, "")
			.trim()
			.replace(/\s+/g, "-")
			.replace(/-+$/g, "") || "section"
	);
}

export function extractHeadings(markdown: string): DocumentHeading[] {
	const headings: DocumentHeading[] = [];
	const lines = markdown.split(/\r?\n/);
	const slugCounts = new Map<string, number>();
	let fence: { marker: string; length: number } | undefined;

	const addHeading = (rawText: string, level: number, line: number) => {
		const text = headingText(rawText);
		const baseId = slugifyHeading(text);
		const count = slugCounts.get(baseId) ?? 0;
		slugCounts.set(baseId, count + 1);
		headings.push({
			id: count === 0 ? baseId : `${baseId}-${count}`,
			text: text || "Untitled section",
			level,
			line,
		});
	};

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (line === undefined) continue;

		const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
		if (fenceMatch?.[1]) {
			const marker = fenceMatch[1][0];
			const isClosingFence = /^[ \t]*$/.test(
				line.slice(fenceMatch[0].length),
			);
			if (!marker) continue;
			if (!fence) {
				fence = { marker, length: fenceMatch[1].length };
			} else if (
				marker === fence.marker &&
				fenceMatch[1].length >= fence.length &&
				isClosingFence
			) {
				fence = undefined;
			}
			continue;
		}
		if (fence) continue;

		const atxMatch = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/);
		if (atxMatch?.[1]) {
			const rawText = (atxMatch[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "");
			addHeading(rawText, atxMatch[1].length, index + 1);
			continue;
		}

		const underline = lines[index + 1];
		const setextMatch = underline?.match(/^ {0,3}(=+|-+)[ \t]*$/);
		if (line.trim() && setextMatch?.[1]) {
			addHeading(line.trim(), setextMatch[1][0] === "=" ? 1 : 2, index + 1);
			index++;
		}
	}

	return headings;
}

export function findActiveHeadingId(
	headings: HeadingPosition[],
	scrollTop: number,
	maxScroll: number,
	threshold = 32,
): string {
	const first = headings[0];
	if (!first) return "";

	let activeId = first.id;
	const position = scrollTop + threshold;
	for (const heading of headings) {
		if (position < Math.min(heading.top, maxScroll)) break;
		activeId = heading.id;
	}

	return activeId;
}
