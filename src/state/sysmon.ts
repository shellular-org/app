import { MsgType, type SysmonResultMsg } from "@shellular/protocol";

import { sendRequest } from "./connection";

export type SysmonData = NonNullable<SysmonResultMsg["data"]>;

export async function fetchSysmon(): Promise<SysmonData> {
	const res = await sendRequest<SysmonResultMsg>({
		type: MsgType.SYSMON_GET,
	});
	if (res.error) {
		throw new Error(res.error);
	}
	if (!res.data) {
		throw new Error("No data received");
	}
	return res.data;
}
