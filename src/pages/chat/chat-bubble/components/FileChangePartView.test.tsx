import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("App", () => ({ pushPage: vi.fn() }));

import { getWorkbenchSnapshot, resetWorkbench } from "workbench/store";
import { ChatDiffContext } from "../ChatDiffContext";
import FileChangePartView from "./FileChangePartView";

describe("desktop chat file changes", () => {
	beforeEach(() => {
		vi.stubEnv("IS_DESKTOP_UI", "true");
		resetWorkbench();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllEnvs();
	});

	it("opens a stable transient inline comparison with workspace context", () => {
		render(
			<ChatDiffContext.Provider
				value={{ messageKey: "message-7", workspacePath: "/repo" }}
			>
				<FileChangePartView
					part={
						{
							type: "file_change",
							kind: "update",
							path: "src/app.ts",
							id: "part-2",
							diff: { old: "old", new: "new" },
						} as never
					}
				/>
			</ChatDiffContext.Provider>,
		);
		fireEvent.click(screen.getByRole("button", { name: /app\.ts/i }));

		expect(getWorkbenchSnapshot().surfaces[0]).toMatchObject({
			id: "agent-diff:message-7:part-2:src/app.ts",
			restorable: false,
			comparison: {
				kind: "inline",
				workspacePath: "/repo",
				sourceId: "message-7:part-2",
				oldText: "old",
				newText: "new",
			},
		});
	});
});
