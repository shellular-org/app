import themes from "themes";

export default function ConnectingIcon({ size = 300 }: { size?: number }) {
	const accent = themes.current?.accent ?? "#3399ff";
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 300 300"
			role="img"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>{"WiFi connecting animation"}</title>
			<style>
				{
					"\n    .wifi-el { transform-box: fill-box; transform-origin: center; }\n    #dot_ts  { animation: pop 0.45s cubic-bezier(0.34,1.56,0.64,1) 0.1s both, pulse 2s ease-in-out 2.7s infinite; }\n    #arc1_ts { animation: pop 0.45s cubic-bezier(0.34,1.56,0.64,1) 0.4s both, pulse 2s ease-in-out 2.4s infinite; }\n    #arc2_ts { animation: pop 0.45s cubic-bezier(0.34,1.56,0.64,1) 0.7s both, pulse 2s ease-in-out 2.1s infinite; }\n    #arc3_ts { animation: pop 0.45s cubic-bezier(0.34,1.56,0.64,1) 1.0s both, pulse 2s ease-in-out 1.8s infinite; }\n    @keyframes pop {\n      0%   { opacity: 0; transform: scale(0.3); }\n      100% { opacity: 1; transform: scale(1); }\n    }\n    @keyframes pulse {\n      0%, 100% { opacity: 1; }\n      50%       { opacity: 0.25; }\n    }\n  "
				}
			</style>
			<g id="dot_ts" className="wifi-el">
				<circle cx={150} cy={220} r={14} fill={accent} />
			</g>
			<g id="arc1_ts" className="wifi-el">
				<path
					d="M 111,184 a 55,55 0 0 1 78,0"
					fill="none"
					stroke={accent}
					strokeWidth={20}
					strokeLinecap="round"
				/>
			</g>
			<g id="arc2_ts" className="wifi-el">
				<path
					d="M 77,150 a 100,100 0 0 1 146,0"
					fill="none"
					stroke={accent}
					strokeWidth={20}
					strokeLinecap="round"
				/>
			</g>
			<g id="arc3_ts" className="wifi-el">
				<path
					d="M 43,116 a 145,145 0 0 1 214,0"
					fill="none"
					stroke={accent}
					strokeWidth={20}
					strokeLinecap="round"
				/>
			</g>
		</svg>
	);
}
