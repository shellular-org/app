let styleInjected = false;
let stack: HTMLDivElement | null = null;
const DEFAULT_TIMEOUT = 2000;

function injectStyles() {
	if (styleInjected) return;
	styleInjected = true;
	const style = document.createElement("style");
	style.id = "shellular-toast-styles";
	style.textContent = `
		.shellular-toast-stack {
			position: fixed;
			left: 50%;
			transform: translateX(-50%);
			bottom: calc(var(--keyboard-height, 0px) + var(--sab, 0px) + 24px);
			display: flex;
			flex-direction: column-reverse;
			align-items: center;
			gap: 10px;
			width: max-content;
			max-width: min(calc(100vw - 32px), 420px);
			z-index: 9999;
			pointer-events: none;
		}
		.shellular-toast {
			display: flex;
			align-items: center;
			gap: 8px;
			max-width: 100%;
			padding: 10px 18px;
			border-radius: 10px;
			background: var(--popup-background);
			border: 1px solid var(--popup-border-color);
			color: var(--primary-text);
			font-size: 13px;
			font-weight: 500;
			text-align: left;
			/* A toast carries host names, file paths and raw CLI errors, so it has
			   to be allowed to wrap. It used to be nowrap with no max-width, which
			   clipped anything wider than the screen at BOTH ends, because the
			   element is centred. */
			overflow-wrap: anywhere;
			box-shadow: 0 8px 32px var(--shadow-color);
			pointer-events: none;
			animation: shellularToastIn 180ms ease-out both;
		}
		.shellular-toast.shellular-toast-out {
			animation: shellularToastOut 150ms ease-in both;
		}
		.shellular-toast .icon-check {
			flex-shrink: 0;
			font-size: 14px;
			color: var(--success);
		}
		@keyframes shellularToastIn {
			from {
				opacity: 0;
				transform: translateY(8px) scale(0.95);
			}
			to {
				opacity: 1;
				transform: translateY(0) scale(1);
			}
		}
		@keyframes shellularToastOut {
			from {
				opacity: 1;
				transform: translateY(0) scale(1);
			}
			to {
				opacity: 0;
				transform: translateY(8px) scale(0.95);
			}
		}
	`;
	document.head.appendChild(style);
}

function getStack(): HTMLDivElement {
	if (stack?.isConnected) return stack;
	stack = document.createElement("div");
	stack.className = "shellular-toast-stack";
	document.body.appendChild(stack);
	return stack;
}

export default function toast(msg: string, timeoutMs?: number): void {
	injectStyles();

	const el = document.createElement("div");
	el.className = "shellular-toast";
	const icon = document.createElement("span");
	icon.className = "icon-check";
	icon.setAttribute("aria-hidden", "true");
	el.append(icon, document.createTextNode(msg));

	// Stacking is the container's job. Doing it with a per-toast offset needed a
	// fixed toast height, which is what forced the single line in the first
	// place, and its index counter also let a new toast land on the slot of one
	// that was still animating out.
	getStack().appendChild(el);

	const duration = timeoutMs ?? DEFAULT_TIMEOUT;

	setTimeout(() => {
		el.classList.add("shellular-toast-out");
		el.addEventListener("animationend", () => {
			el.remove();
			if (stack && !stack.childElementCount) {
				stack.remove();
				stack = null;
			}
		});
	}, duration);
}
