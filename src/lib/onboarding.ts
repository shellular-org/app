export const ONBOARDING_KEY = "shellular:onboarding-complete";

interface ResolveOnboardingVisibilityOptions {
	isMacos: boolean;
	readCompletion: () => Promise<boolean | null>;
}

export async function resolveOnboardingVisibility({
	isMacos,
	readCompletion,
}: ResolveOnboardingVisibilityOptions): Promise<boolean> {
	if (isMacos) return false;
	return !(await readCompletion());
}
