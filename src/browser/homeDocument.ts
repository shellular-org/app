import { getBrowserHistory } from "./history";
import { buildHomePage } from "./home";

export function getBrowserHomeDocument(hostId?: string): string {
	return buildHomePage(hostId ? getBrowserHistory(hostId) : []);
}
