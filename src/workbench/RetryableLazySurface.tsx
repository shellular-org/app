import EmptyState from "components/EmptyState";
import {
	Component,
	type ComponentType,
	type ErrorInfo,
	lazy,
	type ReactNode,
	Suspense,
	useMemo,
	useState,
} from "react";

export type LazySurfaceLoader = () => Promise<{
	default: ComponentType<Record<string, unknown>>;
}>;

const CHUNK_RETRY_DELAY_MS = 250;

export default function RetryableLazySurface({
	loader,
	title,
	componentProps,
}: {
	loader: LazySurfaceLoader;
	title: string;
	componentProps?: Record<string, unknown>;
}) {
	const [attempt, setAttempt] = useState(0);
	const LazySurface = useMemo(() => {
		void attempt;
		return lazy(() => loadLazySurfaceWithRetry(loader));
	}, [attempt, loader]);

	return (
		<LazySurfaceErrorBoundary
			key={attempt}
			title={title}
			onRetry={() => setAttempt((current) => current + 1)}
		>
			<Suspense
				fallback={<EmptyState mascot="loading" message={`Loading ${title}…`} />}
			>
				<LazySurface {...componentProps} />
			</Suspense>
		</LazySurfaceErrorBoundary>
	);
}

export async function loadLazySurfaceWithRetry<T>(
	loader: () => Promise<T>,
	retryDelayMs = CHUNK_RETRY_DELAY_MS,
): Promise<T> {
	try {
		return await loader();
	} catch (error) {
		if (!isChunkLoadError(error)) throw error;
		await delay(retryDelayMs);
		return loader();
	}
}

export function isChunkLoadError(error: unknown): boolean {
	const name = error instanceof Error ? error.name : "";
	const message = error instanceof Error ? error.message : String(error);
	return /ChunkLoadError|Loading chunk .+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
		`${name}: ${message}`,
	);
}

class LazySurfaceErrorBoundary extends Component<
	{
		children: ReactNode;
		title: string;
		onRetry: () => void;
	},
	{ error: Error | null }
> {
	state = { error: null as Error | null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error(`Unable to load ${this.props.title}`, error, info);
	}

	render() {
		if (!this.state.error) return this.props.children;
		return (
			<EmptyState
				mascot="sleep"
				message={`Unable to load ${this.props.title}`}
				description="The page could not be loaded. Your other tabs are unaffected."
				action={
					<button type="button" onClick={this.props.onRetry}>
						<span className="icon-refresh-cw" aria-hidden="true" />
						Retry
					</button>
				}
			/>
		);
	}
}

function delay(duration: number) {
	return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
}
