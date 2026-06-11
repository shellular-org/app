import browser from "./browser";
import device from "./device";
import dialog from "./dialog";
import file from "./file";
import native from "./native";
import notification from "./notification";
import scanner from "./scanner";

export default {
	FileHandler: file,
	Native: native,
	Device: device,
	Dialog: dialog,
	Scanner: scanner,
	Notification: notification,
	Browser: browser,
};
