export default class Rgb {
	r = 0;
	g = 0;
	b = 0;
	a = 1;

	constructor(r: number, g: number, b: number, a: number = 1) {
		this.r = r;
		this.g = g;
		this.b = b;
		this.a = a;
	}

	/**
	 * Get the color as a string
	 */
	toString(alpha?: boolean): string {
		const rgb = () => `rgb(${this.r}, ${this.g}, ${this.b})`;
		const rgba = () => `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
		if (alpha === undefined) {
			return this.a === 1 ? rgb() : rgba();
		}
		return alpha ? rgba() : rgb();
	}
}
