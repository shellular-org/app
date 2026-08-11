import {
	Dialog,
	DialogBackdrop,
	DialogPanel,
	DialogTitle,
} from "@headlessui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import "./AppDialog.scss";

type DialogKind = "alert" | "confirm" | "prompt" | "select" | "select-text";

export interface AppDialogOption {
	value: string;
	label: string;
}

export interface AppDialogSelectTextValue {
	selectedValue: string;
	textValue: string;
}

type DialogValue =
	| boolean
	| string
	| AppDialogSelectTextValue
	| null
	| undefined;

type DialogRequest = {
	id: number;
	kind: DialogKind;
	message: string;
	title?: string;
	defaultValue?: string;
	textDefaultValue?: string;
	selectLabel?: string;
	textLabel?: string;
	options?: AppDialogOption[];
	resolve: (value: DialogValue) => void;
};

type DialogOptions = {
	message: string;
	title?: string;
	defaultValue?: string;
	textDefaultValue?: string;
	selectLabel?: string;
	textLabel?: string;
	options?: AppDialogOption[];
};

let requestId = 0;
let submitDialog: ((request: DialogRequest) => void) | null = null;
const pendingRequests: DialogRequest[] = [];

export function openAppDialog(
	kind: "alert",
	options: DialogOptions,
): Promise<void>;
export function openAppDialog(
	kind: "confirm",
	options: DialogOptions,
): Promise<boolean>;
export function openAppDialog(
	kind: "prompt",
	options: DialogOptions,
): Promise<string | null>;
export function openAppDialog(
	kind: "select",
	options: DialogOptions,
): Promise<string | null>;
export function openAppDialog(
	kind: "select-text",
	options: DialogOptions,
): Promise<AppDialogSelectTextValue | null>;
export function openAppDialog(kind: DialogKind, options: DialogOptions) {
	return new Promise((resolve) => {
		if (!submitDialog) {
			pendingRequests.push({
				id: ++requestId,
				kind,
				message: options.message,
				title: options.title,
				defaultValue: options.defaultValue,
				textDefaultValue: options.textDefaultValue,
				selectLabel: options.selectLabel,
				textLabel: options.textLabel,
				options: options.options,
				resolve,
			});
			return;
		}

		submitDialog({
			id: ++requestId,
			kind,
			message: options.message,
			title: options.title,
			defaultValue: options.defaultValue,
			textDefaultValue: options.textDefaultValue,
			selectLabel: options.selectLabel,
			textLabel: options.textLabel,
			options: options.options,
			resolve,
		});
	});
}

export default function AppDialogHost() {
	const [queue, setQueue] = useState<DialogRequest[]>([]);
	const current = queue[0];

	useEffect(() => {
		submitDialog = (request) => setQueue((prev) => [...prev, request]);
		if (pendingRequests.length) {
			setQueue((prev) => [...prev, ...pendingRequests.splice(0)]);
		}
		return () => {
			submitDialog = null;
		};
	}, []);

	const close = (value: DialogValue) => {
		if (!current) return;
		current.resolve(value);
		setQueue((prev) => prev.slice(1));
	};

	return current ? (
		<DialogSurface key={current.id} request={current} close={close} />
	) : null;
}

function DialogSurface({
	request,
	close,
}: {
	request: DialogRequest;
	close: (value: DialogValue) => void;
}) {
	const [value, setValue] = useState(request.defaultValue ?? "");
	const [textValue, setTextValue] = useState(request.textDefaultValue ?? "");
	const inputRef = useRef<HTMLInputElement>(null);
	const selectRef = useRef<HTMLSelectElement>(null);
	const cancelRef = useRef<HTMLButtonElement>(null);
	const okRef = useRef<HTMLButtonElement>(null);

	const title = useMemo(() => {
		if (request.title) return request.title;
		if (request.kind === "confirm") return "Confirm action";
		if (request.kind === "prompt") return "Input required";
		if (request.kind === "select" || request.kind === "select-text") {
			return "Choose an option";
		}
		return "Notice";
	}, [request.kind, request.title]);

	useEffect(() => {
		if (
			request.kind === "prompt" ||
			request.kind === "select" ||
			request.kind === "select-text"
		) {
			if (request.kind === "prompt") {
				inputRef.current?.focus();
				inputRef.current?.select();
			} else {
				selectRef.current?.focus();
			}
			return;
		}
		if (request.kind === "confirm") {
			cancelRef.current?.focus();
			return;
		}
		okRef.current?.focus();
	}, [request.kind]);

	const closeAsCancel = () =>
		close(request.kind === "alert" ? undefined : null);

	const submit = () => {
		if (request.kind === "confirm") {
			close(true);
			return;
		}
		if (request.kind === "select-text") {
			close({ selectedValue: value, textValue });
			return;
		}
		if (request.kind === "prompt" || request.kind === "select") {
			close(value);
			return;
		}
		close(undefined);
	};

	return (
		<Dialog
			open
			onClose={closeAsCancel}
			className="app-dialog-root fixed inset-0 z-10000"
			role={request.kind === "alert" ? "alertdialog" : "dialog"}
		>
			<DialogBackdrop className="app-dialog-backdrop fixed inset-0" />
			<div className="app-dialog-wrap fixed inset-0 z-1 flex items-center justify-center">
				<DialogPanel className="app-dialog grid w-full max-w-[420px] grid-cols-[42px_minmax(0,1fr)] gap-3">
					<div
						className="app-dialog__icon flex h-[42px] w-[42px] items-center justify-center"
						aria-hidden="true"
					>
						<span
							className={
								request.kind === "confirm"
									? "icon-alert-triangle"
									: request.kind === "prompt"
										? "icon-edit-3"
										: "icon-info"
							}
						/>
					</div>
					<div className="app-dialog__body min-w-0">
						<DialogTitle>{title}</DialogTitle>
						<p>{request.message}</p>
					</div>
					{request.kind === "prompt" && (
						<form
							className="app-dialog-form"
							onSubmit={(event) => {
								event.preventDefault();
								submit();
							}}
						>
							<input
								ref={inputRef}
								type="text"
								value={value}
								onChange={(event) => setValue(event.target.value)}
								autoCapitalize="none"
								autoCorrect="off"
							/>
						</form>
					)}
					{request.kind === "select" && (
						<form
							className="app-dialog-form"
							onSubmit={(event) => {
								event.preventDefault();
								submit();
							}}
						>
							<select
								ref={selectRef}
								value={value}
								onChange={(event) => setValue(event.target.value)}
							>
								<option value="" disabled>
									Select…
								</option>
								{request.options?.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</form>
					)}
					{request.kind === "select-text" && (
						<form
							className="app-dialog-form app-dialog-form--stacked"
							onSubmit={(event) => {
								event.preventDefault();
								submit();
							}}
						>
							<label>
								<span>{request.selectLabel ?? "Option"}</span>
								<select
									ref={selectRef}
									value={value}
									onChange={(event) => setValue(event.target.value)}
								>
									<option value="" disabled>
										Select…
									</option>
									{request.options?.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</label>
							<label>
								<span>{request.textLabel ?? "Value"}</span>
								<input
									type="text"
									value={textValue}
									onChange={(event) => setTextValue(event.target.value)}
									autoCapitalize="none"
									autoCorrect="off"
								/>
							</label>
						</form>
					)}
					<div className="app-dialog__actions col-span-full flex justify-end gap-2">
						{request.kind !== "alert" && (
							<button
								ref={cancelRef}
								type="button"
								className="app-dialog__button app-dialog__button--ghost haptic-trigger"
								onClick={() => close(null)}
							>
								Cancel
							</button>
						)}
						<button
							ref={okRef}
							type="button"
							className="app-dialog__button haptic-trigger"
							disabled={
								(request.kind === "select" && !value) ||
								(request.kind === "select-text" &&
									(!value || !textValue.trim()))
							}
							onClick={submit}
						>
							{request.kind === "confirm" ? "Confirm" : "OK"}
						</button>
					</div>
				</DialogPanel>
			</div>
		</Dialog>
	);
}
