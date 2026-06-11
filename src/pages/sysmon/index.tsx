import "./style.scss";
import {
	CategoryScale,
	Chart as ChartJS,
	type ChartOptions,
	Filler,
	LinearScale,
	LineElement,
	PointElement,
	Tooltip,
	type TooltipItem,
} from "chart.js";
import EmptyState from "components/EmptyState";
import Page from "components/Page";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import { useShellular } from "state";
import { getHostInfo } from "state/connection";
import { fetchSysmon, type SysmonData } from "state/sysmon";

ChartJS.register(
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	Filler,
	Tooltip,
);

const POLL_MS = 5000;
const MAX_HISTORY = 36;

type UsageState = "normal" | "warn" | "danger";

function formatBytes(bytes: number): string {
	if (bytes >= 1_099_511_627_776) {
		return `${(bytes / 1_099_511_627_776).toFixed(1)} TB`;
	}
	if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
	return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86_400);
	const hours = Math.floor((seconds % 86_400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${Math.max(minutes, 1)}m`;
}

function formatRecordedAt(timestamp: number): string {
	const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
	if (diffSeconds < 8) return "Just now";
	if (diffSeconds < 60) return `${diffSeconds}s ago`;
	const minutes = Math.floor(diffSeconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	return `${Math.floor(minutes / 60)}h ago`;
}

function usageState(pct: number): UsageState {
	if (pct >= 90) return "danger";
	if (pct >= 75) return "warn";
	return "normal";
}

function usageLabel(pct: number): string {
	if (pct >= 90) return "Very high";
	if (pct >= 75) return "High";
	if (pct >= 45) return "Moderate";
	return "Light";
}

function storageLabel(pct: number): string {
	if (pct >= 90) return "Almost full";
	if (pct >= 75) return "Running low";
	if (pct >= 50) return "Healthy";
	return "Plenty free";
}

function cleanCpuModel(model: string): string {
	return model
		.replace(/\s+/g, " ")
		.replace(/\((R|TM)\)/g, "")
		.replace(/\bCPU\b/gi, "")
		.trim();
}

function pushHistory(prev: number[], next: number): number[] {
	return [...prev.slice(-(MAX_HISTORY - 1)), next];
}

function colorWithAlpha(color: string, alpha: number): string {
	const trimmed = color.trim();
	if (trimmed.startsWith("#")) {
		const hex = trimmed.slice(1);
		const normalized =
			hex.length === 3
				? hex
						.split("")
						.map((char) => char + char)
						.join("")
				: hex;
		const r = parseInt(normalized.slice(0, 2), 16);
		const g = parseInt(normalized.slice(2, 4), 16);
		const b = parseInt(normalized.slice(4, 6), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	const rgb = trimmed.match(/rgba?\(([^)]+)\)/);
	if (rgb) {
		const [r, g, b] = rgb[1].split(",").map((part) => part.trim());
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	return trimmed;
}

function useChartColors() {
	const [colors, setColors] = useState({
		cpu: "#0095ff",
		cpuFill: "rgba(0, 149, 255, 0.18)",
		memory: "#d6c2a1",
		memoryFill: "rgba(214, 194, 161, 0.16)",
	});

	useEffect(() => {
		const styles = getComputedStyle(document.documentElement);
		const info = styles.getPropertyValue("--info").trim() || "#0095ff";
		const accent = styles.getPropertyValue("--accent").trim() || "#d6c2a1";
		setColors({
			cpu: info,
			cpuFill: colorWithAlpha(info, 0.18),
			memory: accent,
			memoryFill: colorWithAlpha(accent, 0.16),
		});
	}, []);

	return colors;
}

function Meter({ value, state }: { value: number; state: UsageState }) {
	return (
		<div className="sysmon-meter">
			<div className="sysmon-meter-track">
				<div
					className={`sysmon-meter-fill is-${state}`}
					style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
				/>
			</div>
		</div>
	);
}

function HostMetric({
	icon,
	label,
	value,
	detail,
	state,
}: {
	icon: string;
	label: string;
	value: string;
	detail: string;
	state?: UsageState;
}) {
	return (
		<div className="sysmon-host-metric">
			<div className="sysmon-host-metric-head">
				<span
					className={`${icon} sysmon-host-metric-icon`}
					aria-hidden="true"
				/>
				<span className="sysmon-label">{label}</span>
			</div>
			<span
				className={`sysmon-host-metric-value${state ? ` is-${state}` : ""}`}
			>
				{value}
			</span>
			<span className="sysmon-host-metric-detail">{detail}</span>
		</div>
	);
}

function Panel({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="sysmon-panel">
			<div className="sysmon-panel-header">
				<p className="sysmon-panel-title">{title}</p>
				{subtitle && <p className="sysmon-panel-subtitle">{subtitle}</p>}
			</div>
			{children}
		</section>
	);
}

function TrendChart({
	values,
	color,
	fill,
}: {
	values: number[];
	color: string;
	fill: string;
}) {
	const chartData = useMemo(
		() => ({
			labels: values.map((_, index) => String(index + 1)),
			datasets: [
				{
					data: values,
					borderColor: color,
					backgroundColor: fill,
					borderWidth: 2,
					pointRadius: 0,
					tension: 0.34,
					fill: true,
				},
			],
		}),
		[values, color, fill],
	);

	const chartOptions = useMemo<ChartOptions<"line">>(
		() => ({
			responsive: true,
			maintainAspectRatio: false,
			animation: false as const,
			plugins: {
				legend: { display: false },
				tooltip: {
					displayColors: false,
					callbacks: {
						label: (ctx: TooltipItem<"line">) =>
							`${(ctx.parsed.y ?? 0).toFixed(1)}%`,
					},
				},
			},
			scales: {
				x: {
					display: false,
					grid: { display: false },
				},
				y: {
					min: 0,
					max: 100,
					border: { display: false },
					ticks: {
						display: false,
						stepSize: 25,
					},
					grid: {
						color: "rgba(128,128,128,0.12)",
						drawTicks: false,
					},
				},
			},
		}),
		[],
	);

	return (
		<div className="sysmon-chart">
			<Line data={chartData} options={chartOptions} />
		</div>
	);
}

export default function SysmonPage() {
	const hostInfo = getHostInfo();
	const { batteryInfo } = useShellular();
	const chartColors = useChartColors();
	const [data, setData] = useState<SysmonData | null>(null);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [cpuHistory, setCpuHistory] = useState<number[]>([]);
	const [memoryHistory, setMemoryHistory] = useState<number[]>([]);

	const poll = useEffectEvent(async (showLoader = false) => {
		if (showLoader && !data) setLoading(true);
		try {
			const result = await fetchSysmon();
			setData(result);
			setError("");
			setCpuHistory((prev) => pushHistory(prev, result.cpu.usage));
			setMemoryHistory((prev) => pushHistory(prev, result.memory.usage));
		} catch (err) {
			setError((err as Error).message ?? "Request failed");
		} finally {
			if (showLoader) setLoading(false);
		}
	});

	useEffect(() => {
		void poll(true);
		const timer = setInterval(() => {
			void poll(false);
		}, POLL_MS);
		return () => clearInterval(timer);
	}, []);

	const rightSlot = (
		<button
			type="button"
			className="sysmon-refresh-btn"
			disabled={loading}
			onClick={() => void poll(true)}
			aria-label="Refresh system metrics"
		>
			<span className="icon-refresh-cw" />
		</button>
	);

	if (loading && !data) {
		return (
			<Page
				title="System Monitor"
				className="sysmon-page"
				rightSlot={rightSlot}
			>
				<EmptyState message="Loading system metrics..." mascot="loading" />
			</Page>
		);
	}

	if (!data) {
		return (
			<Page
				title="System Monitor"
				className="sysmon-page"
				rightSlot={rightSlot}
			>
				<EmptyState
					message={error || "Unable to load system metrics"}
					mascot="error"
				/>
			</Page>
		);
	}

	const mainDisk = data.storage[0];
	const cpuState = usageState(data.cpu.usage);
	const memoryState = usageState(data.memory.usage);
	const storageState = usageState(mainDisk?.usage ?? 0);
	const cpuSeries = cpuHistory.length > 1 ? cpuHistory : [data.cpu.usage];
	const memorySeries =
		memoryHistory.length > 1 ? memoryHistory : [data.memory.usage];

	return (
		<Page title="System Monitor" className="sysmon-page" rightSlot={rightSlot}>
			<section className="sysmon-host-card">
				<div className="sysmon-host-top">
					<div className="sysmon-host-main">
						<div className="sysmon-host-icon">
							<span className="icon-monitor" aria-hidden="true" />
						</div>
						<div className="sysmon-host-copy">
							<p className="sysmon-host-title">
								{hostInfo?.hostname || "Connected machine"}
							</p>
							<p className="sysmon-host-meta">
								{hostInfo?.username ? `${hostInfo.username}@` : ""}
								{hostInfo?.hostname || "remote host"}
								{hostInfo?.platform ? ` · ${hostInfo.platform}` : ""}
							</p>
						</div>
					</div>
					<div className="sysmon-host-badges">
						<span className="sysmon-host-badge">
							<span className="icon-clock" aria-hidden="true" />
							{formatRecordedAt(data.recordedAt)}
						</span>
						{batteryInfo && (
							<span className="sysmon-host-badge">
								<span
									className={
										batteryInfo.charging
											? "icon-battery-charging"
											: "icon-battery"
									}
									aria-hidden="true"
								/>
								{batteryInfo.percentage}%
							</span>
						)}
					</div>
				</div>

				<div className="sysmon-host-metrics">
					<HostMetric
						icon="icon-cpu"
						label="CPU"
						value={`${data.cpu.usage.toFixed(1)}%`}
						detail={usageLabel(data.cpu.usage)}
						state={cpuState}
					/>
					<HostMetric
						icon="icon-hard-drive"
						label="Memory"
						value={`${data.memory.usage.toFixed(1)}%`}
						detail={`${formatBytes(data.memory.available)} available`}
						state={memoryState}
					/>
					<HostMetric
						icon="icon-database"
						label="Storage"
						value={mainDisk ? `${mainDisk.usage.toFixed(1)}%` : "N/A"}
						detail={mainDisk ? storageLabel(mainDisk.usage) : "Unavailable"}
						state={mainDisk ? storageState : undefined}
					/>
					<HostMetric
						icon="icon-activity"
						label="Uptime"
						value={formatUptime(data.uptime)}
						detail="Since reboot"
					/>
				</div>
			</section>

			{error && (
				<p className="sysmon-stale-note">
					Showing last successful reading. {error}
				</p>
			)}

			<div className="sysmon-chart-grid">
				<Panel
					title="CPU load"
					subtitle={cleanCpuModel(data.cpu.model) || "Processor"}
				>
					<div className="sysmon-panel-metric">
						<span className={`sysmon-panel-value is-${cpuState}`}>
							{data.cpu.usage.toFixed(1)}%
						</span>
						<span className="sysmon-panel-note">{data.cpu.cores} cores</span>
					</div>
					<TrendChart
						values={cpuSeries}
						color={chartColors.cpu}
						fill={chartColors.cpuFill}
					/>
				</Panel>

				<Panel
					title="Memory"
					subtitle={`${formatBytes(data.memory.used)} of ${formatBytes(
						data.memory.total,
					)} used`}
				>
					<div className="sysmon-panel-metric">
						<span className={`sysmon-panel-value is-${memoryState}`}>
							{data.memory.usage.toFixed(1)}%
						</span>
						<span className="sysmon-panel-note">
							{formatBytes(data.memory.free)} free
						</span>
					</div>
					<TrendChart
						values={memorySeries}
						color={chartColors.memory}
						fill={chartColors.memoryFill}
					/>
				</Panel>
			</div>

			<Panel
				title="Storage"
				subtitle="Relevant volumes on the connected machine"
			>
				{data.storage.length === 0 ? (
					<p className="sysmon-empty-inline">
						Storage details are unavailable.
					</p>
				) : (
					<div className="sysmon-storage-list">
						{data.storage.map((disk) => {
							const state = usageState(disk.usage);
							return (
								<div key={disk.mount} className="sysmon-storage-item">
									<div className="sysmon-storage-top">
										<div className="sysmon-storage-copy">
											<p className="sysmon-storage-title">{disk.label}</p>
											<p className="sysmon-storage-mount">{disk.mount}</p>
										</div>
										<span className={`sysmon-storage-pct is-${state}`}>
											{disk.usage.toFixed(1)}%
										</span>
									</div>
									<Meter value={disk.usage} state={state} />
									<div className="sysmon-storage-meta">
										<span>
											{formatBytes(disk.used)} used of {formatBytes(disk.total)}
										</span>
										<span>{formatBytes(disk.free)} free</span>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</Panel>
		</Page>
	);
}
