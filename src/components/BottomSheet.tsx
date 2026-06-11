import {
	Dialog,
	DialogBackdrop,
	DialogPanel,
	DialogTitle,
} from "@headlessui/react";
import type React from "react";

type BottomSheetProps = {
	open: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
};

export default function BottomSheet({
	open,
	onClose,
	title,
	children,
}: BottomSheetProps) {
	return (
		<Dialog open={open} onClose={onClose} className="fixed inset-0 z-10000">
			<DialogBackdrop
				transition
				className="fixed inset-0 transition duration-200 ease-out data-closed:opacity-0"
				style={{
					background: "rgba(0, 0, 0, 0.46)",
					backdropFilter: "blur(6px)",
					WebkitBackdropFilter: "blur(3px)",
				}}
			/>
			<div className="fixed inset-0 z-1 flex items-end justify-center">
				<DialogPanel
					transition
					className="w-full max-h-[85vh] overflow-y-auto rounded-t-[26px] bg-(--popup-background) border border-(--popup-border-color) shadow-[0_-18px_50px_var(--shadow-color)] px-5 pt-3 pb-[calc(20px+var(--sab,0px)+var(--keyboard-height,0px))] transition duration-300 ease-out data-closed:translate-y-6 data-closed:opacity-0"
				>
					<div className="mx-auto mb-5 h-1 w-11 rounded-full bg-(--surface-strong) opacity-70" />
					<header className="mb-4">
						<DialogTitle className="text-[18px] leading-6 font-semibold text-(--primary-text)">
							{title}
						</DialogTitle>
					</header>
					{children}
				</DialogPanel>
			</div>
		</Dialog>
	);
}
