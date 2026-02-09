import { ChevronDown, ChevronRight, FileCode2 } from "lucide-react";
import { useState } from "react";
import type { Frontmatter } from "../lib/frontmatter";
import { cn } from "../lib/utils";

function formatValue(value: unknown): React.ReactNode {
	if (value == null) {
		return <span className="text-muted-foreground italic">null</span>;
	}

	if (typeof value === "boolean") {
		return (
			<span
				className={cn(
					"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
					value
						? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
						: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
				)}
			>
				{String(value)}
			</span>
		);
	}

	if (value instanceof Date) {
		return (
			<time className="text-foreground" dateTime={value.toISOString()}>
				{value.toLocaleDateString(undefined, {
					year: "numeric",
					month: "long",
					day: "numeric",
				})}
			</time>
		);
	}

	if (typeof value === "number") {
		return <span className="text-foreground font-mono text-xs">{value}</span>;
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return <span className="text-muted-foreground italic">empty</span>;
		}

		const allPrimitive = value.every(
			(v) => typeof v === "string" || typeof v === "number",
		);
		if (allPrimitive) {
			return (
				<div className="flex flex-wrap gap-1.5">
					{value.map((item, i) => (
						<span
							key={`${i}-${item}`}
							className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-inset ring-border"
						>
							{String(item)}
						</span>
					))}
				</div>
			);
		}

		return (
			<ul className="mt-1 space-y-1 text-sm">
				{value.map((item, i) => (
					<li key={`${i}-${String(item)}`} className="flex items-start gap-1">
						<span className="text-muted-foreground mt-0.5">-</span>
						<span>{formatValue(item)}</span>
					</li>
				))}
			</ul>
		);
	}

	if (typeof value === "object") {
		return (
			<dl className="mt-1 space-y-1 pl-3 border-l-2 border-border">
				{Object.entries(value as Record<string, unknown>).map(([k, v]) => (
					<div key={k} className="flex flex-col gap-0.5">
						<dt className="text-xs font-medium text-muted-foreground">{k}</dt>
						<dd className="text-sm">{formatValue(v)}</dd>
					</div>
				))}
			</dl>
		);
	}

	return <span className="text-foreground">{String(value)}</span>;
}

function formatKey(key: string): string {
	return key
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function FrontmatterDisplay({
	frontmatter,
}: {
	frontmatter: Frontmatter;
}) {
	const [collapsed, setCollapsed] = useState(false);
	const entries = Object.entries(frontmatter);

	if (entries.length === 0) return null;

	return (
		<div className="mb-6 rounded-lg border border-border bg-muted/30 overflow-hidden">
			<button
				type="button"
				className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
				onClick={() => setCollapsed((c) => !c)}
			>
				{collapsed ? (
					<ChevronRight className="h-4 w-4" />
				) : (
					<ChevronDown className="h-4 w-4" />
				)}
				<FileCode2 className="h-4 w-4" />
				<span>Frontmatter</span>
				<span className="text-xs text-muted-foreground/60 ml-auto">
					{entries.length} {entries.length === 1 ? "field" : "fields"}
				</span>
			</button>

			{!collapsed && (
				<div className="px-4 pb-4">
					<dl className="grid gap-3 sm:grid-cols-[auto_1fr] sm:gap-x-6 sm:gap-y-2.5">
						{entries.map(([key, value]) => (
							<div
								key={key}
								className="sm:contents flex flex-col gap-0.5"
							>
								<dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-0.5">
									{formatKey(key)}
								</dt>
								<dd className="text-sm">{formatValue(value)}</dd>
							</div>
						))}
					</dl>
				</div>
			)}
		</div>
	);
}
