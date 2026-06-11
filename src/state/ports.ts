import {
	MsgType,
	type PortsKillResultMsg,
	type PortsListResultMsg,
} from "@shellular/protocol";

import { sendRequest } from "./connection";

export interface PortEntry {
	port: number;
	pid: number;
	process: string;
	address: string;
}

export async function fetchPorts(): Promise<PortEntry[]> {
	const res = await sendRequest<PortsListResultMsg>({
		type: MsgType.PORTS_LIST,
	});
	if (res.error) throw new Error(res.error);
	if (!res.data) throw new Error("No data received");
	return res.data.ports;
}

export async function killPort(
	port: number,
): Promise<{ port: number; pid?: number }> {
	const res = await sendRequest<PortsKillResultMsg>({
		type: MsgType.PORTS_KILL,
		data: { port },
	});
	if (res.error) throw new Error(res.error);
	if (!res.data) throw new Error("No data received");

	return {
		port: res.data.port,
		...(res.data.pid == null ? {} : { pid: res.data.pid }),
	};
}
