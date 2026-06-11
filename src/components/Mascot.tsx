import "./Mascot.scss";
import { type CSSProperties, type ReactElement, useId } from "react";

export const MASCOT_STATES = [
	"idle",
	"loading",
	"greeting",
	"thinking",
	"permission",
	"success",
	"error",
	"sleep",
	"rolling",
] as const;

export type MascotState = (typeof MASCOT_STATES)[number];
export type MascotTone = "default" | "inline";

export interface MascotArtProps {
	state: MascotState;
	titleId?: string;
}

export interface MascotArt {
	id: string;
	label: string;
	render: (props: MascotArtProps) => ReactElement;
}

export interface MascotProps {
	state?: MascotState;
	size?: number;
	art?: keyof typeof MASCOT_ARTS;
	tone?: MascotTone;
	label?: string;
	className?: string;
}

const P = {
	bodyMain: "#c8ab82",
	bodyLight: "#eadbc0",
	bodyDark: "#8b6b49",
	shellDark: "#2e2118",
	shellMain: "#473426",
	shellHi: "#917359",
	screenBg: "#09100f",
	screenGlow: "rgba(158, 213, 143, 0.08)",
	textGreen: "#9ed58f",
	success: "#9ed58f",
	danger: "#d97467",
	eyeWhite: "#f8f3ea",
	eyePupil: "#281b13",
	eyeShine: "#ffffff",
	clawMain: "#b99971",
	clawDark: "#7a5d3a",
	legColor: "#a47b51",
	thought: "rgba(234, 219, 192, 0.32)",
	shadow: "rgba(0, 0, 0, 0.30)",
};

const LOADER_DOTS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

function MonoText({
	x,
	y,
	children,
	fill,
	size,
}: {
	x: number;
	y: number;
	children: string;
	fill: string;
	size: number;
}) {
	return (
		<text
			x={x}
			y={y}
			fill={fill}
			fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
			fontSize={size}
			fontWeight="800"
			textAnchor="middle"
			dominantBaseline="middle"
		>
			{children}
		</text>
	);
}

function Eye({
	cx,
	cy,
	ox,
	oy,
}: {
	cx: number;
	cy: number;
	ox: number;
	oy: number;
}) {
	return (
		<g className="mascot-eye">
			<circle cx={cx} cy={cy} r="5.5" fill={P.eyeWhite} />
			<circle cx={cx + ox} cy={cy + oy} r="2.5" fill={P.eyePupil} />
			<circle cx={cx + ox + 1.1} cy={cy + oy - 1.1} r="0.9" fill={P.eyeShine} />
		</g>
	);
}

function Face({ state }: { state: MascotState }) {
	if (state === "success" || state === "greeting" || state === "permission") {
		return (
			<path
				d="M27 45 Q32 49 37 45"
				stroke={P.bodyDark}
				strokeWidth="1.6"
				fill="none"
				strokeLinecap="round"
			/>
		);
	}

	if (state === "error") {
		return (
			<path
				d="M27 48 Q32 44 37 48"
				stroke={P.bodyDark}
				strokeWidth="1.6"
				fill="none"
				strokeLinecap="round"
			/>
		);
	}

	if (state === "thinking") {
		return (
			<path
				d="M28 46 L31 45 L34 46"
				stroke={P.bodyDark}
				strokeWidth="1.5"
				fill="none"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		);
	}

	return (
		<path
			d="M28 46 L36 46"
			stroke={P.bodyDark}
			strokeWidth="1.4"
			fill="none"
			strokeLinecap="round"
		/>
	);
}

function ShellScreen({ state }: { state: MascotState }) {
	if (state === "loading") {
		return (
			<>
				<g className="mascot-loader-wheel">
					{LOADER_DOTS.map((dot, i) => {
						const angle = (i / 8) * Math.PI * 2;
						return (
							<circle
								key={dot}
								cx={32 + Math.cos(angle) * 4.8}
								cy={18 + Math.sin(angle) * 4.8}
								r="0.9"
								fill={`rgba(158, 213, 143, ${0.18 + i * 0.09})`}
							/>
						);
					})}
				</g>
				<circle cx="32" cy="18" r="1.4" fill={P.textGreen} />
			</>
		);
	}

	if (state === "thinking") {
		return (
			<>
				<MonoText x={32} y={18} fill={P.bodyLight} size={10}>
					?
				</MonoText>
				<MonoText x={32} y={23} fill={P.textGreen} size={5}>
					...
				</MonoText>
			</>
		);
	}

	if (state === "permission") {
		return (
			<>
				<path
					d="M32 12.8 L38.2 15.8 L37.3 22 Q35.7 25.4 32 27 Q28.3 25.4 26.7 22 L25.8 15.8 Z"
					stroke={P.textGreen}
					strokeWidth="1.9"
					fill="none"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M29.4 19.2 L31.7 21.5 L35.6 16.8"
					stroke={P.textGreen}
					strokeWidth="2.2"
					fill="none"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</>
		);
	}

	if (state === "success") {
		return (
			<path
				d="M27.5 20 L30.7 23.2 L36.8 16.7"
				stroke={P.success}
				strokeWidth="2.3"
				fill="none"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		);
	}

	if (state === "error") {
		return (
			<g stroke={P.danger} strokeWidth="2.2" strokeLinecap="round">
				<path d="M28.5 16.5 L35.5 23.5" />
				<path d="M35.5 16.5 L28.5 23.5" />
			</g>
		);
	}

	if (state === "sleep") {
		return (
			<>
				<MonoText x={30} y={18} fill="rgba(158, 213, 143, .45)" size={6}>
					z
				</MonoText>
				<MonoText x={34} y={16} fill="rgba(158, 213, 143, .25)" size={5}>
					z
				</MonoText>
			</>
		);
	}

	return (
		<>
			<MonoText x={31} y={19} fill={P.textGreen} size={12}>
				&gt;
			</MonoText>
			<rect x="36.5" y="15.3" width="1.8" height="6" fill={P.bodyLight} rx="1">
				<animate
					attributeName="opacity"
					values=".85;.15;.85"
					dur="1s"
					repeatCount="indefinite"
				/>
			</rect>
		</>
	);
}

function RegularThomas({ state }: { state: MascotState }) {
	let px = 0;
	let py = 0;
	if (state === "thinking") {
		px = 1.4;
		py = -0.8;
	}
	if (state === "error") py = 1.2;
	if (state === "greeting" || state === "success" || state === "permission") {
		py = -0.6;
	}

	return (
		<g className="mascot-root">
			<ellipse cx="32" cy="66" rx="17" ry="4" fill={P.shadow} />
			<g>
				{[
					[16, 50],
					[12, 47],
					[48, 50],
					[52, 47],
				].map(([x, y]) => (
					<g key={`${x}-${y}`}>
						<rect x={x} y={y} width="6" height="5" fill={P.legColor} rx="2" />
						<rect
							x={x + 1}
							y={y + 2.5}
							width="4"
							height="1.8"
							fill={P.clawDark}
							rx="1"
						/>
					</g>
				))}
			</g>
			<g>
				<rect x="16" y="33" width="32" height="18" fill={P.bodyMain} rx="9" />
				<rect x="20" y="35" width="14" height="4.5" fill={P.bodyLight} rx="3" />
				<rect x="16" y="44" width="32" height="7" fill={P.bodyDark} rx="4" />
			</g>
			<g className="mascot-shell">
				<rect x="21" y="8" width="22" height="25" fill={P.shellDark} rx="7" />
				<rect x="23" y="10" width="18" height="20" fill={P.shellMain} rx="5" />
				<rect x="23" y="10" width="18" height="3.5" fill={P.shellHi} />
				<rect x="25" y="15" width="14" height="11" fill={P.screenBg} rx="3" />
				<rect x="25" y="15" width="14" height="11" fill={P.screenGlow} rx="3" />
				<rect
					x="25"
					y="22.5"
					width="14"
					height="0.7"
					fill="rgba(158, 213, 143, .12)"
					rx="1"
				/>
				<ShellScreen state={state} />
			</g>
			<g>
				<rect
					x="23"
					y="24"
					width="2.8"
					height="11"
					fill={P.bodyDark}
					rx="1.4"
				/>
				<rect
					x="38.2"
					y="24"
					width="2.8"
					height="11"
					fill={P.bodyDark}
					rx="1.4"
				/>
				<circle cx="24.4" cy="23.4" r="2.6" fill={P.clawMain} />
				<circle cx="39.6" cy="23.4" r="2.6" fill={P.clawMain} />
				<circle cx="24.4" cy="23.4" r="1.2" fill={P.bodyDark} />
				<circle cx="39.6" cy="23.4" r="1.2" fill={P.bodyDark} />
			</g>
			<g>
				<g className="mascot-left-claw">
					<rect x="4" y="37" width="13" height="10" fill={P.clawMain} rx="5" />
					<rect
						x="4"
						y="37"
						width="6.5"
						height="3.8"
						fill={P.bodyLight}
						rx="3"
					/>
					<circle cx="5.4" cy="44.2" r="4" fill={P.clawDark} />
					<circle cx="5.8" cy="50" r="4" fill={P.clawDark} />
				</g>
				<g className="mascot-right-claw">
					<rect x="47" y="37" width="13" height="10" fill={P.clawMain} rx="5" />
					<rect
						x="47"
						y="37"
						width="6.5"
						height="3.8"
						fill={P.bodyLight}
						rx="3"
					/>
					<circle cx="58.6" cy="44.2" r="4" fill={P.clawDark} />
					<circle cx="58.2" cy="50" r="4" fill={P.clawDark} />
				</g>
			</g>
			<g>
				{state === "sleep" ? (
					<>
						<path
							d="M18 38 Q24 40 29 38"
							stroke={P.bodyDark}
							strokeWidth="1.6"
							fill="none"
							strokeLinecap="round"
						/>
						<path
							d="M35 38 Q40 40 46 38"
							stroke={P.bodyDark}
							strokeWidth="1.6"
							fill="none"
							strokeLinecap="round"
						/>
					</>
				) : (
					<>
						<Eye cx={23} cy={38} ox={px} oy={py} />
						<Eye cx={41} cy={38} ox={px} oy={py} />
					</>
				)}
			</g>
			<Face state={state} />
			{state === "thinking" && (
				<g>
					<circle cx="47" cy="22" r="1.1" fill={P.thought} />
					<circle cx="50" cy="19" r="1.7" fill={P.thought} />
					<circle cx="55" cy="15" r="3.2" fill="rgba(234, 219, 192, .24)" />
					<MonoText x={55} y={15.5} fill="rgba(234, 219, 192, .72)" size={6}>
						?
					</MonoText>
				</g>
			)}
			{state === "permission" && (
				<>
					<g className="mascot-speech-bubble">
						<rect
							x="4"
							y="11"
							width="16"
							height="9"
							fill={P.bodyLight}
							rx="2"
						/>
						<path
							d="M16 20 L19 23 L18 19"
							stroke={P.bodyLight}
							strokeWidth="1.4"
							fill={P.bodyLight}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<MonoText x={12} y={16.5} fill={P.eyePupil} size={4.4}>
							Allow?
						</MonoText>
					</g>
					{(
						[
							[19, 24],
							[18, 27],
							[48, 29],
							[51, 32],
						] satisfies Array<[number, number]>
					).map(([x, y], index) => (
						<g
							key={`${x}-${y}`}
							className="mascot-ask-sparkle"
							style={{ animationDelay: `${index * 0.18}s` }}
						>
							<MonoText x={x} y={y} fill={P.bodyLight} size={4.5}>
								+
							</MonoText>
						</g>
					))}
					<path
						d="M8 36 Q6 34 5.8 31"
						stroke={P.bodyLight}
						strokeWidth="1.3"
						fill="none"
						strokeLinecap="round"
					/>
					<path
						d="M10 36 Q8 34 8 31"
						stroke={P.bodyLight}
						strokeWidth="1.3"
						fill="none"
						strokeLinecap="round"
					/>
				</>
			)}
			{state === "success" &&
				(
					[
						[18, 17, P.success],
						[25, 12, P.bodyLight],
						[32, 10, P.danger],
						[39, 12, "#95bfd5"],
						[46, 17, P.success],
					] satisfies Array<[number, number, string]>
				).map(([x, y, color], index) => (
					<rect
						key={`${x}-${y}`}
						className="mascot-confetti"
						x={x}
						y={y}
						width="2.3"
						height="2.3"
						fill={color}
						rx="0.4"
						style={{ animationDelay: `${index * 0.1}s` }}
					/>
				))}
			{state === "sleep" &&
				["0s", ".55s", "1.1s"].map((delay, i) => (
					<MonoText
						key={delay}
						x={48 + i * 3}
						y={22 - i * 4}
						fill={`rgba(234, 219, 192, ${0.56 - i * 0.16})`}
						size={5 - i * 0.5}
					>
						z
					</MonoText>
				))}
		</g>
	);
}

function RollingThomas() {
	return (
		<g className="mascot-root">
			<ellipse cx="32" cy="66" rx="17" ry="4" fill={P.shadow} />
			<ellipse cx="32" cy="63" rx="10" ry="2.4" fill="rgba(0, 0, 0, .22)" />
			<g className="mascot-rolling-ball">
				<circle cx="32" cy="55" r="9" fill="#0d1118" />
				<circle
					cx="32"
					cy="55"
					r="6.2"
					fill="none"
					stroke="rgba(214, 194, 161, .2)"
				/>
				<MonoText x={32} y={56} fill={P.bodyLight} size={12}>
					&gt;
				</MonoText>
			</g>
			<g transform="rotate(-22 32 42)">
				{[
					[17, 49],
					[13, 46],
					[47, 49],
					[51, 46],
				].map(([x, y]) => (
					<g key={`${x}-${y}`}>
						<rect x={x} y={y} width="5" height="4" fill={P.legColor} rx="2" />
						<rect
							x={x + 0.5}
							y={y + 2.2}
							width="4"
							height="1.6"
							fill={P.clawDark}
							rx="1"
						/>
					</g>
				))}
				<rect x="18" y="33" width="28" height="17" fill={P.bodyMain} rx="8" />
				<rect x="22" y="35" width="12" height="4" fill={P.bodyLight} rx="3" />
				<rect x="18" y="44" width="28" height="6" fill={P.bodyDark} rx="4" />
				<g className="mascot-shell">
					<rect x="23" y="9" width="18" height="24" fill={P.shellDark} rx="6" />
					<rect
						x="25"
						y="11"
						width="14"
						height="19"
						fill={P.shellMain}
						rx="4"
					/>
					<rect x="25" y="11" width="14" height="3" fill={P.shellHi} />
					<rect x="27" y="16" width="10" height="10" fill={P.screenBg} rx="3" />
					<rect
						x="27"
						y="22"
						width="10"
						height=".7"
						fill="rgba(158, 213, 143, .12)"
						rx="1"
					/>
					<MonoText x={32} y={21} fill="rgba(234, 219, 192, .24)" size={8}>
						&gt;
					</MonoText>
				</g>
				<g>
					<rect
						x="23"
						y="26"
						width="2.5"
						height="10"
						fill={P.bodyDark}
						rx="1.5"
					/>
					<rect
						x="38.5"
						y="26"
						width="2.5"
						height="10"
						fill={P.bodyDark}
						rx="1.5"
					/>
					<circle cx="24.25" cy="25.5" r="2.3" fill={P.clawMain} />
					<circle cx="39.75" cy="25.5" r="2.3" fill={P.clawMain} />
					<circle cx="24.25" cy="25.5" r="1.15" fill={P.bodyDark} />
					<circle cx="39.75" cy="25.5" r="1.15" fill={P.bodyDark} />
				</g>
				<g>
					<g className="mascot-eye">
						<circle cx="24" cy="37" r="5.4" fill={P.eyeWhite} />
						<circle cx="23.3" cy="38.4" r="2.5" fill={P.eyePupil} />
						<circle cx="24.2" cy="37.4" r=".9" fill={P.eyeShine} />
					</g>
					<g className="mascot-eye">
						<circle cx="40" cy="37" r="5.4" fill={P.eyeWhite} />
						<circle cx="39.3" cy="38.4" r="2.5" fill={P.eyePupil} />
						<circle cx="40.2" cy="37.4" r=".9" fill={P.eyeShine} />
					</g>
				</g>
				<g className="mascot-push-left">
					<rect
						x="21"
						y="39"
						width="2.4"
						height="8"
						fill={P.clawMain}
						rx="1.2"
					/>
					<rect x="17" y="46" width="7" height="4" fill={P.clawMain} rx="2" />
					<rect
						x="17"
						y="46"
						width="3.5"
						height="1.7"
						fill={P.bodyLight}
						rx="1"
					/>
					<circle cx="16.6" cy="48" r="1.8" fill={P.clawDark} />
					<circle cx="17.4" cy="50.2" r="1.8" fill={P.clawDark} />
				</g>
				<g className="mascot-push-right">
					<rect
						x="40.6"
						y="39"
						width="2.4"
						height="8"
						fill={P.clawMain}
						rx="1.2"
					/>
					<rect x="40" y="46" width="7" height="4" fill={P.clawMain} rx="2" />
					<rect
						x="40"
						y="46"
						width="3.5"
						height="1.7"
						fill={P.bodyLight}
						rx="1"
					/>
					<circle cx="47.4" cy="48" r="1.8" fill={P.clawDark} />
					<circle cx="46.6" cy="50.2" r="1.8" fill={P.clawDark} />
				</g>
				<path
					d="M28 46 L30 45 L32 46 L34 45 L36 46"
					stroke={P.bodyDark}
					strokeWidth="1.2"
					fill="none"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</g>
		</g>
	);
}

function ThomasArt({ state, titleId }: MascotArtProps) {
	return (
		<svg
			viewBox="0 0 64 72"
			role={titleId ? "img" : undefined}
			aria-labelledby={titleId}
			aria-hidden={titleId ? undefined : true}
		>
			<title id={titleId}>Thomas mascot {state}</title>
			{state === "rolling" ? (
				<RollingThomas />
			) : (
				<RegularThomas state={state} />
			)}
		</svg>
	);
}

export const MASCOT_ARTS = {
	thomas: {
		id: "thomas",
		label: "Thomas",
		render: ThomasArt,
	},
} satisfies Record<string, MascotArt>;

export const DEFAULT_MASCOT_ART: keyof typeof MASCOT_ARTS = "thomas";

export default function Mascot({
	state = "idle",
	size = 96,
	art = DEFAULT_MASCOT_ART,
	tone = "default",
	label,
	className,
}: MascotProps) {
	const selectedArt = MASCOT_ARTS[art] ?? MASCOT_ARTS[DEFAULT_MASCOT_ART];
	const generatedId = useId();
	const titleId = label ? `mascot-title-${generatedId}` : undefined;
	const style = { "--mascot-size": `${size}px` } as CSSProperties;
	const names = ["mascot", `mascot--${tone}`, `is-${state}`, className]
		.filter(Boolean)
		.join(" ");

	return (
		<span
			className={names}
			style={style}
			aria-hidden={label ? undefined : true}
		>
			{selectedArt.render({ state, titleId })}
		</span>
	);
}
