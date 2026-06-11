import toast from "lib/toast";

export default {
	Native: {
		showToast(
			success: (data: unknown) => void,
			error: (error: Error) => void,
			args: Array<unknown>,
		) {
			const msg = args?.[0];
			if (typeof msg === "string") {
				toast(msg);
				success?.(undefined);
			} else {
				error?.(new Error("message required"));
			}
		},
	},
};
