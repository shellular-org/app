import native from "bridge/native";

/**
 * Handle external links
 */
export default function externalLinks(e: MouseEvent) {
	const { target } = e;
	if (!(target instanceof HTMLAnchorElement)) {
		return;
	}

	e.preventDefault();
	e.stopPropagation();
	const { href } = target;
	native.openInBrowser(href);
}
