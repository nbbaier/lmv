import { ChevronDown, ChevronRight, List } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "./button";
import { cn } from "../lib/utils";

type Heading = {
	id: string;
	text: string;
	level: number;
};

function extractHeadings(markdown: string): Heading[] {
	const headings: Heading[] = [];
	const lines = markdown.split("\n");

	for (const line of lines) {
		const match = line.match(/^(#{1,6})\s+(.+)$/);
		if (match) {
			const level = match[1].length;
			const text = match[2].trim();
			const id = text
				.toLowerCase()
				.replace(/[^\w\s-]/g, "")
				.replace(/\s+/g, "-");
			headings.push({ id, text, level });
		}
	}

	return headings;
}

export function TableOfContents({ markdown }: { markdown: string }) {
	const [isOpen, setIsOpen] = useState(true);
	const [activeId, setActiveId] = useState<string>("");

	const headings = useMemo(() => extractHeadings(markdown), [markdown]);

	useEffect(() => {
		if (headings.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActiveId(entry.target.id);
					}
				}
			},
			{
				rootMargin: "-80px 0px -80% 0px",
			},
		);

		const elements = headings
			.map((h) => document.getElementById(h.id))
			.filter((el): el is HTMLElement => el !== null);

		for (const el of elements) {
			observer.observe(el);
		}

		return () => observer.disconnect();
	}, [headings]);

	if (headings.length === 0) return null;

	const handleClick = (id: string) => {
		const element = document.getElementById(id);
		if (element) {
			const y = element.getBoundingClientRect().top + window.scrollY - 80;
			window.scrollTo({ top: y, behavior: "smooth" });
		}
	};

	return (
		<nav className="mb-8 border border-border rounded-lg bg-muted/30">
			<Button
				variant="ghost"
				onClick={() => setIsOpen(!isOpen)}
				className="w-full justify-between p-4 hover:bg-muted"
			>
				<div className="flex items-center gap-2">
					<List className="h-4 w-4" />
					<span className="font-semibold">Table of Contents</span>
				</div>
				{isOpen ? (
					<ChevronDown className="h-4 w-4" />
				) : (
					<ChevronRight className="h-4 w-4" />
				)}
			</Button>

			{isOpen && (
				<div className="px-4 pb-4">
					<ul className="space-y-1">
						{headings.map((heading) => (
							<li key={heading.id}>
								<button
									type="button"
									onClick={() => handleClick(heading.id)}
									className={cn(
										"w-full text-left text-sm py-1 px-2 rounded hover:bg-muted transition-colors",
										activeId === heading.id &&
											"bg-muted font-medium text-foreground",
										activeId !== heading.id && "text-muted-foreground",
									)}
									style={{
										paddingLeft: `${(heading.level - 1) * 0.75 + 0.5}rem`,
									}}
								>
									{heading.text}
								</button>
							</li>
						))}
					</ul>
				</div>
			)}
		</nav>
	);
}
