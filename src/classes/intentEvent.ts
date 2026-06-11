export default class IntentEvent extends Event {
	data: Record<string, unknown> | string;
	constructor(type: string, options: Record<string, unknown>) {
		super(type, options);
		this.data = options.data as Record<string, unknown> | string;
	}
}
