import { getBrowserHistory } from "./history";
import { buildHomePage } from "./home";

export function getBrowserHomeDocument(): string {
	return buildHomePage(getBrowserHistory());
}
