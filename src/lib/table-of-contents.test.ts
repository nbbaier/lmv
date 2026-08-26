import { describe, expect, test } from "bun:test";
import {
	extractHeadings,
	findActiveHeadingId,
	slugifyHeading,
} from "./table-of-contents";

describe("extractHeadings", () => {
	test("extracts ATX and setext headings with stable unique ids", () => {
		const headings = extractHeadings(`
# Overview
## **Details**
Overview
--------
## Overview
`);

		expect(headings).toEqual([
			{ id: "overview", text: "Overview", level: 1, line: 2 },
			{ id: "details", text: "Details", level: 2, line: 3 },
			{ id: "overview-1", text: "Overview", level: 2, line: 4 },
			{ id: "overview-2", text: "Overview", level: 2, line: 6 },
		]);
	});

	test("extracts setext headings from CRLF markdown", () => {
		expect(extractHeadings("Windows heading\r\n===============\r\n")).toEqual([
			{ id: "windows-heading", text: "Windows heading", level: 1, line: 1 },
		]);
	});

	test("ignores heading-like text in fenced code", () => {
		expect(
			extractHeadings("# Visible\n```md\n# Hidden\n```\n## Also visible"),
		).toEqual([
			{ id: "visible", text: "Visible", level: 1, line: 1 },
			{ id: "also-visible", text: "Also visible", level: 2, line: 5 },
		]);
	});

	test("creates a usable id for punctuation-only headings", () => {
		expect(slugifyHeading("✨")).toBe("section");
		expect(extractHeadings("# ✨\n## ✨").map(({ id }) => id)).toEqual([
			"section",
			"section-1",
		]);
	});
});

describe("findActiveHeadingId", () => {
	const headings = [
		{ id: "intro", top: 120 },
		{ id: "details", top: 480 },
		{ id: "closing", top: 950 },
	];

	test("tracks the last heading above the scroll threshold", () => {
		expect(findActiveHeadingId(headings, 0, 800)).toBe("intro");
		expect(findActiveHeadingId(headings, 448, 800)).toBe("details");
	});

	test("activates a trailing heading clamped to the maximum scroll", () => {
		expect(findActiveHeadingId(headings, 800, 800)).toBe("closing");
	});
});
