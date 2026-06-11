let styleInjected = false;
let toastCount = 0;
const GAP = 10;
const TOAST_HEIGHT = 40;
const DEFAULT_TIMEOUT = 2000;

function injectStyles() {
	if (styleInjected) return;
	styleInjected = true;
	const style = document.createElement("style");
	style.id = "shellular-toast-styles";
	style.textContent = `
		.shellular-toast {
			position: fixed;
			bottom: 24px;
			left: 50%;
			transform: translateX(-50%);
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 10px 18px;
			border-radius: 10px;
			background: var(--popup-background);
			border: 1px solid var(--popup-border-color);
			color: var(--primary-text);
			font-size: 13px;
			font-weight: 500;
			white-space: nowrap;
			box-shadow: 0 8px 32px var(--shadow-color);
			z-index: 9999;
			pointer-events: none;
			animation: shellularToastIn 180ms ease-out both;
		}
		.shellular-toast.shellular-toast-out {
			animation: shellularToastOut 150ms ease-in both;
		}
		.shellular-toast .icon-check {
			font-size: 14px;
			color: var(--success);
		}
		@keyframes shellularToastIn {
			from {
				opacity: 0;
				transform: translateX(-50%) translateY(8px) scale(0.95);
			}
			to {
				opacity: 1;
				transform: translateX(-50%) translateY(0) scale(1);
			}
		}
		@keyframes shellularToastOut {
			from {
				opacity: 1;
				transform: translateX(-50%) translateY(0) scale(1);
			}
			to {
				opacity: 0;
				transform: translateX(-50%) translateY(8px) scale(0.95);
			}
		}
	`;
	document.head.appendChild(style);
}

export default function toast(msg: string, timeoutMs?: number): void {
	injectStyles();

	const el = document.createElement("div");
	el.className = "shellular-toast";
	el.innerHTML = `<span class="icon-check" aria-hidden="true"></span>${msg}`;

	const index = toastCount++;

	el.style.bottom = `${24 + index * (TOAST_HEIGHT + GAP)}px`;
	document.body.appendChild(el);

	const duration = timeoutMs ?? DEFAULT_TIMEOUT;

	setTimeout(() => {
		el.classList.add("shellular-toast-out");
		el.addEventListener("animationend", () => {
			el.remove();
			toastCount--;
		});
	}, duration);
}
