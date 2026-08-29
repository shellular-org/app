export interface HorizontalWheelEvent {
	deltaX: number;
	deltaY: number;
	preventDefault(): void;
	currentTarget: {
		scrollLeft: number;
		scrollWidth: number;
		clientWidth: number;
	};
}

export function redirectVerticalWheelToHorizontal(
	event: HorizontalWheelEvent,
): boolean {
	if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return false;
	const target = event.currentTarget;
	const maximum = target.scrollWidth - target.clientWidth;
	if (maximum <= 0) return false;
	const next = Math.min(maximum, Math.max(0, target.scrollLeft + event.deltaY));
	if (next === target.scrollLeft) return false;
	target.scrollLeft = next;
	event.preventDefault();
	return true;
}
