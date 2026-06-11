import "./Loader.scss";
import Mascot from "./Mascot";

export default function Loader({
	size = 48,
	mascot = size >= 32,
}: {
	size?: number;
	mascot?: boolean;
}) {
	if (mascot) {
		return <Mascot state="loading" size={size} label="Loading" tone="inline" />;
	}

	return (
		<span className="loader-component" style={{ width: size, height: size }}>
			<span className="loader-icon" aria-hidden="true" />
		</span>
	);
}
