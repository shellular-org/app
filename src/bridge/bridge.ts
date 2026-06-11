/**
 * Returns a function that can be used to interact with a bridge service.
 *
 * @param service - The name of the Bridge service.
 * @returns A function that takes an action and optional arguments, and returns a Promise.
 */
export default function bridge(
	service: string,
): (action: string, args?: unknown[]) => Promise<unknown> {
	return (action: string, args: unknown[] = []) =>
		new Promise((resolve, reject) => {
			Bridge.exec(
				resolve,
				(error: unknown) => {
					reject(
						new Error(
							`${service}/${action}: ${error}\n${JSON.stringify(args)}`,
						),
					);
				},
				service,
				action,
				args,
			);
		});
}
