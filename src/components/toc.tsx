import { ChevronDown, List } from "lucide-react";
import {
	type MouseEvent,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type DocumentHeading,
	findActiveHeadingId,
} from "../lib/table-of-contents";
import { cn } from "../lib/utils";

type TableOfContentsProps = {
	headings: DocumentHeading[];
	scrollContainerRef: RefObject<HTMLElement | null>;
};

type TocLinksProps = {
	headings: DocumentHeading[];
	activeId: string;
	onNavigate: (event: MouseEvent<HTMLAnchorElement>, id: string) => void;
	activeLinkRef?: RefObject<HTMLAnchorElement | null>;
};

function TocLinks({
	headings,
	activeId,
	onNavigate,
	activeLinkRef,
}: TocLinksProps) {
	const minLevel = useMemo(
		() => Math.min(...headings.map(({ level }) => level)),
		[headings],
	);

	return (
		<ul className="document-toc-list">
			{headings.map((heading) => {
				const isActive = activeId === heading.id;
				const depth = Math.min(4, Math.max(0, heading.level - minLevel));
				return (
					<li key={heading.id} data-depth={depth}>
						<a
							ref={isActive ? activeLinkRef : undefined}
							href={`#${encodeURIComponent(heading.id)}`}
							onClick={(event) => onNavigate(event, heading.id)}
							aria-current={isActive ? "location" : undefined}
							title={heading.text}
							className={cn("document-toc-link", isActive && "is-active")}
						>
							{heading.text}
						</a>
					</li>
				);
			})}
		</ul>
	);
}

export function TableOfContents({
	headings,
	scrollContainerRef,
}: TableOfContentsProps) {
	const [activeId, setActiveId] = useState(headings[0]?.id ?? "");
	const [compactOpen, setCompactOpen] = useState(false);
	const [pendingCompactTarget, setPendingCompactTarget] = useState<string>();
	const railRef = useRef<HTMLElement | null>(null);
	const activeRailLinkRef = useRef<HTMLAnchorElement | null>(null);

	useEffect(() => {
		setActiveId(headings[0]?.id ?? "");
		setCompactOpen(false);
		setPendingCompactTarget(undefined);
	}, [headings]);

	useEffect(() => {
		const scroller = scrollContainerRef.current;
		if (!scroller || headings.length === 0) return;

		let animationFrame = 0;
		const update = () => {
			animationFrame = 0;
			const scrollerTop = scroller.getBoundingClientRect().top;
			const positions = headings.flatMap(({ id }) => {
				const element = document.getElementById(id);
				if (!element || !scroller.contains(element)) return [];
				return [
					{
						id,
						top:
							scroller.scrollTop +
							element.getBoundingClientRect().top -
							scrollerTop,
					},
				];
			});
			setActiveId(
				findActiveHeadingId(
					positions,
					scroller.scrollTop,
					Math.max(0, scroller.scrollHeight - scroller.clientHeight),
				),
			);
		};
		const requestUpdate = () => {
			if (animationFrame) return;
			animationFrame = requestAnimationFrame(update);
		};

		scroller.addEventListener("scroll", requestUpdate, { passive: true });
		const resizeObserver = new ResizeObserver(requestUpdate);
		resizeObserver.observe(scroller);
		const content = scroller.querySelector(".markdown-content");
		if (content) resizeObserver.observe(content);
		requestUpdate();

		return () => {
			scroller.removeEventListener("scroll", requestUpdate);
			resizeObserver.disconnect();
			if (animationFrame) cancelAnimationFrame(animationFrame);
		};
	}, [headings, scrollContainerRef]);

	useEffect(() => {
		const rail = railRef.current;
		const link = activeRailLinkRef.current;
		if (!rail || !link) return;
		const railBounds = rail.getBoundingClientRect();
		const linkBounds = link.getBoundingClientRect();
		if (linkBounds.top < railBounds.top || linkBounds.bottom > railBounds.bottom) {
			const reducedMotion = window.matchMedia(
				"(prefers-reduced-motion: reduce)",
			).matches;
			rail.scrollTo({
				top:
					rail.scrollTop +
					linkBounds.top -
					railBounds.top -
					rail.clientHeight / 3,
				behavior: reducedMotion ? "auto" : "smooth",
			});
		}
	}, [activeId]);

	const scrollToHeading = useCallback(
		(id: string, focus: boolean) => {
			const scroller = scrollContainerRef.current;
			const element = document.getElementById(id);
			if (!scroller || !element || !scroller.contains(element)) return;

			const top = Math.max(
				0,
				scroller.scrollTop +
					element.getBoundingClientRect().top -
					scroller.getBoundingClientRect().top -
					24,
			);
			const reducedMotion = window.matchMedia(
				"(prefers-reduced-motion: reduce)",
			).matches;
			scroller.scrollTo({
				top,
				behavior: reducedMotion ? "auto" : "smooth",
			});
			window.history.replaceState(null, "", `#${encodeURIComponent(id)}`);
			setActiveId(id);
			if (focus) element.focus({ preventScroll: true });
		},
		[scrollContainerRef],
	);

	useEffect(() => {
		if (compactOpen || !pendingCompactTarget) return;
		scrollToHeading(pendingCompactTarget, true);
		setPendingCompactTarget(undefined);
	}, [compactOpen, pendingCompactTarget, scrollToHeading]);

	useEffect(() => {
		let hash = window.location.hash.slice(1);
		try {
			hash = decodeURIComponent(hash);
		} catch {
			return;
		}
		if (!headings.some(({ id }) => id === hash)) return;
		const animationFrame = requestAnimationFrame(() =>
			scrollToHeading(hash, false),
		);
		return () => cancelAnimationFrame(animationFrame);
	}, [headings, scrollToHeading]);

	if (headings.length === 0) return null;

	const handleNavigate = (
		event: MouseEvent<HTMLAnchorElement>,
		id: string,
	) => {
		event.preventDefault();
		scrollToHeading(id, true);
	};

	return (
		<>
			<details
				className="document-toc-compact group"
				open={compactOpen}
				onToggle={(event) => setCompactOpen(event.currentTarget.open)}
			>
				<summary className="document-toc-summary">
					<List aria-hidden="true" />
					<span>On this page</span>
					<span className="ml-auto text-[11px] font-normal text-muted-foreground">
						{headings.length}
					</span>
					<ChevronDown
						aria-hidden="true"
						className="transition-transform group-open:rotate-180"
					/>
				</summary>
				<nav aria-label="Table of contents" className="document-toc-compact-nav">
					<TocLinks
						headings={headings}
						activeId={activeId}
						onNavigate={(event, id) => {
							event.preventDefault();
							setPendingCompactTarget(id);
							setCompactOpen(false);
						}}
					/>
				</nav>
			</details>

			<nav
				ref={railRef}
				className="document-rail"
				aria-labelledby="document-rail-title"
			>
				<p id="document-rail-title" className="document-rail-title">
					On this page
				</p>
				<TocLinks
					headings={headings}
					activeId={activeId}
					onNavigate={handleNavigate}
					activeLinkRef={activeRailLinkRef}
				/>
			</nav>
		</>
	);
}
